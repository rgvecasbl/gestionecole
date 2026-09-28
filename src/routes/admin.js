const router = require('express').Router();
const db = require('../db');
const { asyncH } = require('../helpers');
const { authentifier, role } = require('../auth');

router.use(authentifier, role('super_admin'));

const STATUTS = ['approuve', 'refuse', 'en_attente'];

router.get('/ecoles', asyncH(async (req, res) => {
  const { rows } = await db.query(
    `SELECT e.*, d.nom_complet AS directeur, d.date_naissance AS directeur_naissance, d.lieu_naissance AS directeur_lieu
     FROM ecoles e LEFT JOIN directeurs d ON d.ecole_id = e.id
     WHERE ($1::text IS NULL OR e.statut = $1) ORDER BY e.cree_le DESC`, [req.query.statut || null]);
  res.json(rows);
}));

// Approuver / refuser une école (le compte du directeur suit le même statut)
router.patch('/ecoles/:id', asyncH(async (req, res) => {
  const { statut } = req.body;
  if (!STATUTS.includes(statut)) return res.status(400).json({ erreur: 'Statut invalide.' });
  const ok = await db.transaction(async (client) => {
    const r = await client.query('UPDATE ecoles SET statut = $1 WHERE id = $2 RETURNING id', [statut, req.params.id]);
    if (!r.rowCount) return false;
    await client.query(`UPDATE utilisateurs SET statut = $1 WHERE ecole_id = $2 AND role = 'direction'`, [statut, req.params.id]);
    return true;
  });
  ok ? res.json({ message: 'Statut mis à jour.' }) : res.status(404).json({ erreur: 'École introuvable.' });
}));

module.exports = router;
