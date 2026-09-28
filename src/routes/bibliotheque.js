const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const db = require('../db');
const { asyncH, classesDe, elevesDe } = require('../helpers');
const { authentifier, role } = require('../auth');

// Les PDF sont stockés hors du dossier public : ils ne sont accessibles que par la route protégée ci-dessous
const DOSSIER = path.resolve(process.env.DOSSIER_FICHIERS || path.join(__dirname, '..', '..', 'fichiers'));
fs.mkdirSync(DOSSIER, { recursive: true });

const televerser = multer({
  storage: multer.diskStorage({
    destination: DOSSIER,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + '.pdf'),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }, // 10 Mo
  fileFilter: (req, file, cb) =>
    file.mimetype === 'application/pdf'
      ? cb(null, true)
      : cb(Object.assign(new Error('Seuls les fichiers PDF sont acceptés.'), { statut: 400 })),
});

const supprimerFichier = (nom) => { if (nom) fs.unlink(path.join(DOSSIER, path.basename(nom)), () => {}); };

async function estPdf(chemin) {
  const f = await fs.promises.open(chemin, 'r');
  try {
    const tampon = Buffer.alloc(5);
    await f.read(tampon, 0, 5, 0);
    return tampon.toString() === '%PDF-';
  } finally {
    await f.close();
  }
}

router.use(authentifier, role('direction', 'enseignant', 'eleve', 'parent'));

// Livres : ceux de sa classe (ou de toute l'école). Bulletins : seulement ceux de l'élève / de ses enfants.
const VISIBLE = `b.ecole_id = $2 AND (
  $1::text = 'direction'
  OR (b.type = 'livre' AND (b.classe_id IS NULL OR b.classe_id = ANY($3::bigint[])))
  OR (b.type = 'bulletin' AND $1::text IN ('eleve', 'parent') AND b.eleve_id = ANY($4::bigint[]))
)`;

// Ajout par la direction : PDF téléversé (ou adresse https), livre (école ou classe) ou bulletin (un élève)
router.post('/', role('direction'), televerser.single('fichier'), asyncH(async (req, res) => {
  const { type, titre, fichier_url, classe_id, eleve_id } = req.body;
  const fichier = req.file ? req.file.filename : null;
  const refuser = (msg) => { supprimerFichier(fichier); return res.status(400).json({ erreur: msg }); };
  try {
    if (!['livre', 'bulletin'].includes(type) || !titre) return refuser('type (livre|bulletin) et titre requis.');
    if (!fichier && !fichier_url) return refuser('Joignez un fichier PDF.');
    if (fichier && !(await estPdf(req.file.path))) return refuser("Ce fichier n'est pas un PDF valide.");
    if (!fichier && !/^https?:\/\//i.test(fichier_url)) return refuser('fichier_url doit commencer par http:// ou https://.');
    if (type === 'bulletin' && !eleve_id) return refuser('eleve_id requis pour un bulletin.');
    if (classe_id && !(await db.query('SELECT 1 FROM classes WHERE id = $1 AND ecole_id = $2', [classe_id, req.user.ecole_id])).rowCount)
      return refuser('Classe invalide.');
    if (eleve_id && !(await db.query('SELECT 1 FROM eleves WHERE id = $1 AND ecole_id = $2', [eleve_id, req.user.ecole_id])).rowCount)
      return refuser('Élève invalide.');

    const { rows } = await db.query(
      `INSERT INTO bibliotheque (ecole_id, type, titre, fichier_url, fichier_chemin, classe_id, eleve_id, ajoute_par)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [req.user.ecole_id, type, titre, fichier ? null : fichier_url, fichier, classe_id || null,
        type === 'bulletin' ? eleve_id : null, req.user.id]);
    res.status(201).json(rows[0]);
  } catch (e) {
    supprimerFichier(fichier);
    throw e;
  }
}));

router.get('/', asyncH(async (req, res) => {
  const u = req.user;
  const [classes, eleves] = await Promise.all([classesDe(u), elevesDe(u)]);
  const { rows } = await db.query(
    `SELECT b.id, b.type, b.titre, b.fichier_url, (b.fichier_chemin IS NOT NULL) AS televerse,
            b.classe_id, b.eleve_id, b.cree_le
     FROM bibliotheque b WHERE ${VISIBLE} ORDER BY b.cree_le DESC`,
    [u.role, u.ecole_id, classes, eleves]);
  res.json(rows);
}));

// Téléchargement protégé : mêmes droits d'accès que la liste
router.get('/:id/fichier', asyncH(async (req, res) => {
  const u = req.user;
  const [classes, eleves] = await Promise.all([classesDe(u), elevesDe(u)]);
  const { rows } = await db.query(
    `SELECT b.titre, b.fichier_chemin FROM bibliotheque b
     WHERE ${VISIBLE} AND b.id = $5 AND b.fichier_chemin IS NOT NULL`,
    [u.role, u.ecole_id, classes, eleves, req.params.id]);
  if (!rows.length) return res.status(404).json({ erreur: 'Document introuvable.' });

  const nom = rows[0].titre.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'document';
  res.set('Cache-Control', 'private, no-store');
  res.download(path.join(DOSSIER, path.basename(rows[0].fichier_chemin)), `${nom}.pdf`, (err) => {
    if (err && !res.headersSent) res.status(404).json({ erreur: 'Fichier introuvable sur le serveur.' });
  });
}));

router.delete('/:id', role('direction'), asyncH(async (req, res) => {
  const r = await db.query(
    'DELETE FROM bibliotheque WHERE id = $1 AND ecole_id = $2 RETURNING fichier_chemin', [req.params.id, req.user.ecole_id]);
  if (!r.rowCount) return res.status(404).json({ erreur: 'Document introuvable.' });
  supprimerFichier(r.rows[0].fichier_chemin);
  res.json({ message: 'Document supprimé.' });
}));

module.exports = router;
