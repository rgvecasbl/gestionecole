const router = require('express').Router();
const db = require('../db');
const { asyncH, manquants } = require('../helpers');
const { authentifier, role } = require('../auth');

router.use(authentifier, role('direction'));

const DECISIONS = ['approuve', 'refuse'];

// Inscriptions à traiter (enseignants, élèves, parents de l'école)
router.get('/inscriptions', asyncH(async (req, res) => {
  const { rows } = await db.query(
    `SELECT u.id, u.role, u.email, u.telephone, u.statut,
            COALESCE(en.nom_complet, el.nom_complet, p.nom_complet) AS nom_complet
     FROM utilisateurs u
     LEFT JOIN enseignants en ON en.utilisateur_id = u.id
     LEFT JOIN eleves el ON el.utilisateur_id = u.id
     LEFT JOIN parents p ON p.utilisateur_id = u.id
     WHERE u.ecole_id = $1 AND u.role IN ('enseignant', 'eleve', 'parent') AND u.statut = $2
     ORDER BY u.cree_le`, [req.user.ecole_id, req.query.statut || 'en_attente']);
  res.json(rows);
}));

router.patch('/utilisateurs/:id', asyncH(async (req, res) => {
  if (!DECISIONS.includes(req.body.statut)) return res.status(400).json({ erreur: 'Statut invalide.' });
  const r = await db.query(
    `UPDATE utilisateurs SET statut = $1
     WHERE id = $2 AND ecole_id = $3 AND role IN ('enseignant', 'eleve', 'parent')`,
    [req.body.statut, req.params.id, req.user.ecole_id]);
  r.rowCount ? res.json({ message: 'Statut mis à jour.' }) : res.status(404).json({ erreur: 'Utilisateur introuvable.' });
}));

// Validation des liens parent-élève
router.get('/liens', asyncH(async (req, res) => {
  const { rows } = await db.query(
    `SELECT l.parent_id, l.eleve_id, l.statut, p.nom_complet AS parent, e.nom_complet AS eleve
     FROM liens_parent_eleve l
     JOIN parents p ON p.id = l.parent_id JOIN eleves e ON e.id = l.eleve_id
     WHERE p.ecole_id = $1 AND l.statut = $2`, [req.user.ecole_id, req.query.statut || 'en_attente']);
  res.json(rows);
}));

router.patch('/liens/:parentId/:eleveId', asyncH(async (req, res) => {
  if (!DECISIONS.includes(req.body.statut)) return res.status(400).json({ erreur: 'Statut invalide.' });
  const r = await db.query(
    `UPDATE liens_parent_eleve l SET statut = $1 FROM parents p
     WHERE l.parent_id = $2 AND l.eleve_id = $3 AND p.id = l.parent_id AND p.ecole_id = $4`,
    [req.body.statut, req.params.parentId, req.params.eleveId, req.user.ecole_id]);
  r.rowCount ? res.json({ message: 'Lien mis à jour.' }) : res.status(404).json({ erreur: 'Lien introuvable.' });
}));

// Élèves approuvés de l'école (pour rattacher un bulletin)
router.get('/eleves', asyncH(async (req, res) => {
  const { rows } = await db.query(
    `SELECT el.id, el.nom_complet, c.intitule AS classe
     FROM eleves el
     JOIN utilisateurs u ON u.id = el.utilisateur_id AND u.statut = 'approuve'
     JOIN classes c ON c.id = el.classe_id
     WHERE el.ecole_id = $1 ORDER BY el.nom_complet`, [req.user.ecole_id]);
  res.json(rows);
}));

// Classes de l'école
router.get('/classes', asyncH(async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, niveau, intitule FROM classes WHERE ecole_id = $1 ORDER BY niveau, intitule', [req.user.ecole_id]);
  res.json(rows);
}));

router.post('/classes', asyncH(async (req, res) => {
  if (manquants(req.body, ['niveau', 'intitule']).length || req.body.niveau < 1 || req.body.niveau > 6)
    return res.status(400).json({ erreur: 'niveau (1 à 6) et intitule requis.' });
  const { rows } = await db.query(
    'INSERT INTO classes (ecole_id, niveau, intitule) VALUES ($1, $2, $3) RETURNING id',
    [req.user.ecole_id, req.body.niveau, req.body.intitule]);
  res.status(201).json(rows[0]);
}));

module.exports = router;
