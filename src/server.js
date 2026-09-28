require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');

const app = express();
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : false }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/sante', (req, res) => res.json({ ok: true }));
app.use('/api/public', require('./routes/public'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/direction', require('./routes/direction'));
app.use('/api/circulaires', require('./routes/circulaires'));
app.use('/api/forum', require('./routes/forum'));
app.use('/api/bibliotheque', require('./routes/bibliotheque'));

app.use((req, res) => res.status(404).json({ erreur: 'Route introuvable.' }));

app.use((err, req, res, next) => {
  if (err.code === '23505')
    return res.status(409).json({ erreur: "Cet enregistrement existe déjà (e-mail, téléphone ou n° d'enregistrement)." });
  if (err.statut) return res.status(err.statut).json({ erreur: err.message });
  if (err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ erreur: 'Fichier trop volumineux (10 Mo maximum).' });
  if (err.code === '22P02' || err.code === '23503' || err.code === '22007')
    return res.status(400).json({ erreur: 'Données invalides.' });
  console.error(err);
  res.status(500).json({ erreur: 'Erreur interne du serveur.' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API démarrée sur le port ${port}`));
