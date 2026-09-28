require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/db');

(async () => {
  const [email, mdp] = process.argv.slice(2);
  if (!email || !mdp || mdp.length < 8) {
    console.error('Usage : npm run creer-admin -- <email> <mot_de_passe (8 caractères min.)>');
    process.exit(1);
  }
  await db.query(
    `INSERT INTO utilisateurs (email, mot_de_passe, role, statut) VALUES ($1, $2, 'super_admin', 'approuve')`,
    [email, await bcrypt.hash(mdp, 12)]
  );
  console.log('Super admin créé.');
  await db.pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
