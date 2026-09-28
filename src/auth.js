const crypto = require('crypto');
const db = require('./db');
const { asyncH } = require('./helpers');

const hash = (jeton) => crypto.createHash('sha256').update(jeton).digest('hex');
const DUREE_HEURES = Number(process.env.SESSION_HEURES) || 8;
const INACTIVITE_MIN = Number(process.env.INACTIVITE_MINUTES) || 30;

async function creerSession(utilisateurId) {
  const jeton = crypto.randomBytes(32).toString('hex');
  await db.query(
    `INSERT INTO sessions (utilisateur_id, jeton_hash, expire_le)
     VALUES ($1, $2, now() + make_interval(hours => $3))`,
    [utilisateurId, hash(jeton), DUREE_HEURES]
  );
  return jeton;
}

// Vérifie le jeton, l'expiration, l'inactivité et l'approbation du compte et de l'école
const authentifier = asyncH(async (req, res, next) => {
  const h = req.headers.authorization || '';
  const jeton = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!jeton) return res.status(401).json({ erreur: 'Non connecté.' });

  const { rows } = await db.query(
    `SELECT s.id AS session_id, u.id, u.role, u.ecole_id
     FROM sessions s
     JOIN utilisateurs u ON u.id = s.utilisateur_id
     LEFT JOIN ecoles e ON e.id = u.ecole_id
     WHERE s.jeton_hash = $1 AND s.revoque_le IS NULL AND s.expire_le > now()
       AND s.derniere_activite > now() - make_interval(mins => $2)
       AND u.statut = 'approuve'
       AND (u.role = 'super_admin' OR e.statut = 'approuve')`,
    [hash(jeton), INACTIVITE_MIN]
  );
  if (!rows.length) return res.status(401).json({ erreur: 'Session expirée ou invalide. Reconnectez-vous.' });

  await db.query('UPDATE sessions SET derniere_activite = now() WHERE id = $1', [rows[0].session_id]);
  req.user = { id: rows[0].id, role: rows[0].role, ecole_id: rows[0].ecole_id };
  req.sessionId = rows[0].session_id;
  next();
});

const role = (...autorises) => (req, res, next) =>
  autorises.includes(req.user.role) ? next() : res.status(403).json({ erreur: 'Accès refusé.' });

module.exports = { creerSession, authentifier, role };
