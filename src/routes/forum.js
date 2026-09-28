const router = require('express').Router();
const db = require('../db');
const { asyncH } = require('../helpers');
const { authentifier, role } = require('../auth');

router.use(authentifier);

// Forum de l'école (tous ses membres) ; forum général réservé au Super admin et aux directions
async function sujetAccessible(u, id) {
  const { rows } = await db.query(
    `SELECT * FROM forum_sujets s
     WHERE s.id = $1 AND ($2::text = 'super_admin' OR s.ecole_id = $3 OR (s.ecole_id IS NULL AND $2::text = 'direction'))`,
    [id, u.role, u.ecole_id]);
  return rows[0] || null;
}

router.get('/sujets', asyncH(async (req, res) => {
  const { rows } = await db.query(
    `SELECT s.id, s.titre, s.ecole_id, s.cree_le,
            (SELECT count(*) FROM forum_messages m WHERE m.sujet_id = s.id AND NOT m.masque)::int AS nb_messages
     FROM forum_sujets s
     WHERE $1::text = 'super_admin' OR s.ecole_id = $2 OR (s.ecole_id IS NULL AND $1::text = 'direction')
     ORDER BY s.cree_le DESC LIMIT 100`, [req.user.role, req.user.ecole_id]);
  res.json(rows);
}));

router.post('/sujets', asyncH(async (req, res) => {
  const { titre, contenu, general } = req.body;
  if (!titre || !contenu) return res.status(400).json({ erreur: 'titre et contenu requis.' });
  const u = req.user;
  const ecoleId = u.role === 'super_admin' || general === true ? null : u.ecole_id;
  if (ecoleId === null && !['super_admin', 'direction'].includes(u.role))
    return res.status(403).json({ erreur: 'Accès refusé.' });

  const id = await db.transaction(async (client) => {
    const s = await client.query(
      'INSERT INTO forum_sujets (ecole_id, auteur_id, titre) VALUES ($1, $2, $3) RETURNING id', [ecoleId, u.id, titre]);
    await client.query('INSERT INTO forum_messages (sujet_id, auteur_id, contenu) VALUES ($1, $2, $3)',
      [s.rows[0].id, u.id, contenu]);
    return s.rows[0].id;
  });
  res.status(201).json({ id });
}));

router.get('/sujets/:id/messages', asyncH(async (req, res) => {
  if (!(await sujetAccessible(req.user, req.params.id))) return res.status(404).json({ erreur: 'Sujet introuvable.' });
  const { rows } = await db.query(
    `SELECT m.id, m.auteur_id, u.role AS auteur_role,
            COALESCE(d.nom_complet, en.nom_complet, el.nom_complet, p.nom_complet, 'Super admin') AS auteur_nom,
            m.contenu, m.masque, m.cree_le
     FROM forum_messages m JOIN utilisateurs u ON u.id = m.auteur_id
     LEFT JOIN directeurs d ON d.utilisateur_id = u.id
     LEFT JOIN enseignants en ON en.utilisateur_id = u.id
     LEFT JOIN eleves el ON el.utilisateur_id = u.id
     LEFT JOIN parents p ON p.utilisateur_id = u.id
     WHERE m.sujet_id = $1 AND (NOT m.masque OR $2::text IN ('direction', 'super_admin'))
     ORDER BY m.cree_le`, [req.params.id, req.user.role]);
  res.json(rows);
}));

router.post('/sujets/:id/messages', asyncH(async (req, res) => {
  if (!req.body.contenu) return res.status(400).json({ erreur: 'contenu requis.' });
  if (!(await sujetAccessible(req.user, req.params.id))) return res.status(404).json({ erreur: 'Sujet introuvable.' });
  const { rows } = await db.query(
    'INSERT INTO forum_messages (sujet_id, auteur_id, contenu) VALUES ($1, $2, $3) RETURNING id',
    [req.params.id, req.user.id, req.body.contenu]);
  res.status(201).json(rows[0]);
}));

// Modération : masquer / réafficher un message
router.patch('/messages/:id', role('direction', 'super_admin'), asyncH(async (req, res) => {
  const r = await db.query(
    `UPDATE forum_messages m SET masque = $1 FROM forum_sujets s
     WHERE m.id = $2 AND s.id = m.sujet_id AND ($3::text = 'super_admin' OR s.ecole_id = $4)`,
    [req.body.masque === true, req.params.id, req.user.role, req.user.ecole_id]);
  r.rowCount ? res.json({ message: 'Message mis à jour.' }) : res.status(404).json({ erreur: 'Message introuvable.' });
}));

module.exports = router;
