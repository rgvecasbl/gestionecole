const router = require('express').Router();
const db = require('../db');
const { asyncH } = require('../helpers');

// Listes utilisées par les formulaires d'inscription (menus déroulants)
router.get('/ecoles', asyncH(async (req, res) => {
  const { rows } = await db.query(
    `SELECT id, nom, province FROM ecoles WHERE statut = 'approuve' ORDER BY nom`);
  res.json(rows);
}));

router.get('/ecoles/:id/classes', asyncH(async (req, res) => {
  const { rows } = await db.query(
    'SELECT id, niveau, intitule FROM classes WHERE ecole_id = $1 ORDER BY niveau, intitule', [req.params.id]);
  res.json(rows);
}));

// Liste déroulante des élèves pour l'inscription d'un parent (élèves approuvés uniquement).
// Données minimales exposées : id, nom, classe. Le lien reste validé par la direction.
router.get('/ecoles/:id/eleves', asyncH(async (req, res) => {
  const { rows } = await db.query(
    `SELECT el.id, el.nom_complet, c.intitule AS classe
     FROM eleves el
     JOIN utilisateurs u ON u.id = el.utilisateur_id AND u.statut = 'approuve'
     JOIN classes c ON c.id = el.classe_id
     WHERE el.ecole_id = $1 ORDER BY el.nom_complet`, [req.params.id]);
  res.json(rows);
}));

module.exports = router;
