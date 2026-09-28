const db = require('./db');

const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const manquants = (body, champs) =>
  champs.filter((c) => body[c] === undefined || body[c] === null || String(body[c]).trim() === '');

// Classes d'un utilisateur (enseignant, élève, ou enfants approuvés d'un parent)
async function classesDe(u) {
  let sql;
  if (u.role === 'enseignant') sql = 'SELECT classe_id FROM enseignants WHERE utilisateur_id = $1';
  else if (u.role === 'eleve') sql = 'SELECT classe_id FROM eleves WHERE utilisateur_id = $1';
  else if (u.role === 'parent')
    sql = `SELECT e.classe_id FROM parents p
           JOIN liens_parent_eleve l ON l.parent_id = p.id AND l.statut = 'approuve'
           JOIN eleves e ON e.id = l.eleve_id WHERE p.utilisateur_id = $1`;
  else return [];
  const { rows } = await db.query(sql, [u.id]);
  return rows.map((r) => r.classe_id).filter(Boolean);
}

// Élèves concernés : l'élève lui-même, ou les enfants approuvés d'un parent
async function elevesDe(u) {
  let sql;
  if (u.role === 'eleve') sql = 'SELECT id FROM eleves WHERE utilisateur_id = $1';
  else if (u.role === 'parent')
    sql = `SELECT l.eleve_id AS id FROM parents p
           JOIN liens_parent_eleve l ON l.parent_id = p.id AND l.statut = 'approuve'
           WHERE p.utilisateur_id = $1`;
  else return [];
  const { rows } = await db.query(sql, [u.id]);
  return rows.map((r) => r.id);
}

module.exports = { asyncH, manquants, classesDe, elevesDe };
