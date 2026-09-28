const router = require('express').Router();
const db = require('../db');
const { asyncH, classesDe } = require('../helpers');
const { authentifier, role } = require('../auth');

router.use(authentifier);

// Super admin -> directions ; Direction -> enseignants / parents / élèves de son école
router.post('/', role('super_admin', 'direction'), asyncH(async (req, res) => {
  const { titre, contenu, cibles, classe_id } = req.body;
  if (!titre || !contenu || !Array.isArray(cibles) || !cibles.length)
    return res.status(400).json({ erreur: 'titre, contenu et cibles sont requis.' });

  const admin = req.user.role === 'super_admin';
  const permises = admin ? ['direction'] : ['enseignant', 'parent', 'eleve'];
  if (!cibles.every((c) => permises.includes(c)))
    return res.status(400).json({ erreur: `Cibles autorisées : ${permises.join(', ')}` });

  if (!admin && classe_id) {
    const c = await db.query('SELECT 1 FROM classes WHERE id = $1 AND ecole_id = $2', [classe_id, req.user.ecole_id]);
    if (!c.rowCount) return res.status(400).json({ erreur: 'Classe invalide.' });
  }
  const { rows } = await db.query(
    `INSERT INTO circulaires (auteur_id, ecole_id, titre, contenu, cibles, classe_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [req.user.id, admin ? null : req.user.ecole_id, titre, contenu, cibles, admin ? null : classe_id || null]);
  res.status(201).json(rows[0]);
}));

// Circulaires visibles selon le rôle (et la classe pour enseignants / élèves / parents)
router.get('/', asyncH(async (req, res) => {
  const u = req.user;
  const classes = await classesDe(u);
  const { rows } = await db.query(
    `SELECT c.id, c.titre, c.contenu, c.cibles, c.classe_id, c.ecole_id, c.cree_le
     FROM circulaires c
     WHERE $1::text = 'super_admin'
        OR c.auteur_id = $4
        OR ($1::text = 'direction' AND (c.ecole_id = $2 OR (c.ecole_id IS NULL AND 'direction' = ANY(c.cibles))))
        OR ($1::text IN ('enseignant', 'eleve', 'parent') AND c.ecole_id = $2 AND $1::text = ANY(c.cibles)
            AND (c.classe_id IS NULL OR c.classe_id = ANY($3::bigint[])))
     ORDER BY c.cree_le DESC LIMIT 100`,
    [u.role, u.ecole_id, classes, u.id]);
  res.json(rows);
}));

module.exports = router;
