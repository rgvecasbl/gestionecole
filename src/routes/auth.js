const router = require('express').Router();
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { asyncH, manquants } = require('../helpers');
const { creerSession, authentifier } = require('../auth');

const limiteur = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });

function verifierCompte(b, champs) {
  const m = manquants(b, [...champs, 'mot_de_passe']);
  if (m.length) return `Champs manquants : ${m.join(', ')}`;
  if (!b.email && !b.telephone) return 'Un e-mail ou un numéro de téléphone est requis.';
  if (String(b.mot_de_passe).length < 8) return 'Le mot de passe doit contenir au moins 8 caractères.';
  return null;
}

async function creerUtilisateur(client, b, role, ecoleId) {
  const mdp = await bcrypt.hash(b.mot_de_passe, 12);
  const { rows } = await client.query(
    `INSERT INTO utilisateurs (email, telephone, mot_de_passe, role, ecole_id)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [b.email || null, b.telephone || null, mdp, role, ecoleId]);
  return rows[0].id;
}

async function classeDeEcole(classeId, ecoleId) {
  const { rows } = await db.query('SELECT 1 FROM classes WHERE id = $1 AND ecole_id = $2', [classeId, ecoleId]);
  return rows.length > 0;
}

async function ecoleApprouvee(ecoleId) {
  const { rows } = await db.query(`SELECT 1 FROM ecoles WHERE id = $1 AND statut = 'approuve'`, [ecoleId]);
  return rows.length > 0;
}

const reponseInscription = (res) =>
  res.status(201).json({ message: 'Inscription enregistrée. Elle doit être approuvée avant votre première connexion.' });

// --- Inscription d'une école + directeur (approuvée par le Super admin)
router.post('/inscription/ecole', limiteur, asyncH(async (req, res) => {
  const b = req.body;
  const err = verifierCompte(b, ['nom_ecole', 'n_enregistrement', 'date_creation', 'arrete', 'nombre_classes',
    'nom_directeur', 'date_naissance', 'lieu_naissance']);
  if (err) return res.status(400).json({ erreur: err });

  await db.transaction(async (client) => {
    const e = await client.query(
      `INSERT INTO ecoles (nom, n_enregistrement, date_creation, arrete, nombre_classes, province, sous_division)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [b.nom_ecole, b.n_enregistrement, b.date_creation, b.arrete, b.nombre_classes, b.province || null, b.sous_division || null]);
    const ecoleId = e.rows[0].id;
    const userId = await creerUtilisateur(client, b, 'direction', ecoleId);
    await client.query(
      `INSERT INTO directeurs (utilisateur_id, ecole_id, nom_complet, date_naissance, lieu_naissance)
       VALUES ($1, $2, $3, $4, $5)`,
      [userId, ecoleId, b.nom_directeur, b.date_naissance, b.lieu_naissance]);
  });
  reponseInscription(res);
}));

// --- Inscription d'un enseignant (approuvée par la direction)
router.post('/inscription/enseignant', limiteur, asyncH(async (req, res) => {
  const b = req.body;
  const err = verifierCompte(b, ['ecole_id', 'classe_id', 'nom_complet', 'date_naissance', 'lieu_naissance',
    'telephone', 'email', 'niveau_etudes']);
  if (err) return res.status(400).json({ erreur: err });
  if (!(await ecoleApprouvee(b.ecole_id)) || !(await classeDeEcole(b.classe_id, b.ecole_id)))
    return res.status(400).json({ erreur: 'École ou classe invalide.' });

  await db.transaction(async (client) => {
    const userId = await creerUtilisateur(client, b, 'enseignant', b.ecole_id);
    await client.query(
      `INSERT INTO enseignants (utilisateur_id, ecole_id, classe_id, nom_complet, date_naissance, lieu_naissance, telephone, email, niveau_etudes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [userId, b.ecole_id, b.classe_id, b.nom_complet, b.date_naissance, b.lieu_naissance, b.telephone, b.email, b.niveau_etudes]);
  });
  reponseInscription(res);
}));

// --- Inscription d'un élève (approuvée par la direction)
router.post('/inscription/eleve', limiteur, asyncH(async (req, res) => {
  const b = req.body;
  const err = verifierCompte(b, ['ecole_id', 'classe_id', 'nom_complet', 'date_naissance', 'lieu_naissance']);
  if (err) return res.status(400).json({ erreur: err });
  if (!(await ecoleApprouvee(b.ecole_id)) || !(await classeDeEcole(b.classe_id, b.ecole_id)))
    return res.status(400).json({ erreur: 'École ou classe invalide.' });

  await db.transaction(async (client) => {
    const userId = await creerUtilisateur(client, b, 'eleve', b.ecole_id);
    await client.query(
      `INSERT INTO eleves (utilisateur_id, ecole_id, classe_id, nom_complet, date_naissance, lieu_naissance)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [userId, b.ecole_id, b.classe_id, b.nom_complet, b.date_naissance, b.lieu_naissance]);
  });
  reponseInscription(res);
}));

// --- Inscription d'un parent : choisit son ou ses enfants dans la liste (lien validé par la direction)
router.post('/inscription/parent', limiteur, asyncH(async (req, res) => {
  const b = req.body;
  const err = verifierCompte(b, ['ecole_id', 'nom_complet']);
  if (err) return res.status(400).json({ erreur: err });
  if (!Array.isArray(b.eleve_ids) || !b.eleve_ids.length)
    return res.status(400).json({ erreur: 'Choisissez au moins un enfant dans la liste.' });
  if (!(await ecoleApprouvee(b.ecole_id))) return res.status(400).json({ erreur: 'École invalide.' });

  const { rows } = await db.query(
    'SELECT id FROM eleves WHERE ecole_id = $1 AND id = ANY($2::bigint[])', [b.ecole_id, b.eleve_ids]);
  if (rows.length !== new Set(b.eleve_ids.map(String)).size)
    return res.status(400).json({ erreur: 'Enfant invalide pour cette école.' });

  await db.transaction(async (client) => {
    const userId = await creerUtilisateur(client, b, 'parent', b.ecole_id);
    const p = await client.query(
      `INSERT INTO parents (utilisateur_id, ecole_id, nom_complet, telephone) VALUES ($1, $2, $3, $4) RETURNING id`,
      [userId, b.ecole_id, b.nom_complet, b.telephone || null]);
    for (const eleveId of rows.map((r) => r.id))
      await client.query('INSERT INTO liens_parent_eleve (parent_id, eleve_id) VALUES ($1, $2)', [p.rows[0].id, eleveId]);
  });
  reponseInscription(res);
}));

// --- Connexion (tous les rôles)
router.post('/connexion', limiteur, asyncH(async (req, res) => {
  const { identifiant, mot_de_passe } = req.body;
  if (!identifiant || !mot_de_passe) return res.status(400).json({ erreur: 'Identifiant et mot de passe requis.' });

  const { rows } = await db.query(
    `SELECT u.id, u.role, u.statut, u.mot_de_passe, e.statut AS ecole_statut
     FROM utilisateurs u LEFT JOIN ecoles e ON e.id = u.ecole_id
     WHERE u.email = $1 OR u.telephone = $1`, [identifiant]);
  const u = rows[0];
  if (!u || !(await bcrypt.compare(mot_de_passe, u.mot_de_passe)))
    return res.status(401).json({ erreur: 'Identifiants incorrects.' });
  if (u.statut !== 'approuve')
    return res.status(403).json({ erreur: u.statut === 'refuse' ? 'Inscription refusée.' : "Inscription en attente d'approbation." });
  if (u.role !== 'super_admin' && u.ecole_statut !== 'approuve')
    return res.status(403).json({ erreur: "L'école n'est pas approuvée." });

  res.json({ jeton: await creerSession(u.id), role: u.role });
}));

// --- Déconnexion (tous les rôles) ; ?partout=true ferme toutes les sessions de l'utilisateur
router.post('/deconnexion', authentifier, asyncH(async (req, res) => {
  if (req.query.partout === 'true')
    await db.query('UPDATE sessions SET revoque_le = now() WHERE utilisateur_id = $1 AND revoque_le IS NULL', [req.user.id]);
  else await db.query('UPDATE sessions SET revoque_le = now() WHERE id = $1', [req.sessionId]);
  res.json({ message: 'Déconnecté.' });
}));

router.get('/moi', authentifier, asyncH(async (req, res) => {
  const { rows } = await db.query(
    `SELECT COALESCE(d.nom_complet, en.nom_complet, el.nom_complet, p.nom_complet) AS nom, e.nom AS ecole
     FROM utilisateurs u
     LEFT JOIN directeurs d ON d.utilisateur_id = u.id
     LEFT JOIN enseignants en ON en.utilisateur_id = u.id
     LEFT JOIN eleves el ON el.utilisateur_id = u.id
     LEFT JOIN parents p ON p.utilisateur_id = u.id
     LEFT JOIN ecoles e ON e.id = u.ecole_id
     WHERE u.id = $1`, [req.user.id]);
  res.json({ ...req.user, nom: rows[0] ? rows[0].nom : null, ecole: rows[0] ? rows[0].ecole : null });
}));

module.exports = router;
