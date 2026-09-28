const { Pool } = require('pg');
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10000,       // ferme les connexions inactives avant la mise en veille de la base gratuite
  connectionTimeoutMillis: 20000, // laisse le temps au réveil de la base
});
pool.on('error', (e) => console.error('Connexion à la base interrompue :', e.message));

async function transaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const resultat = await fn(client);
    await client.query('COMMIT');
    return resultat;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { pool, transaction, query: (texte, params) => pool.query(texte, params) };
