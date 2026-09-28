# API - Logiciel de gestion des écoles (RDC)

1. `npm install`
2. Créer la base PostgreSQL puis : `psql -d gestion_ecoles -f schema.sql`
3. Copier `.env.example` en `.env` et l'adapter
4. Créer le Super admin : `npm run creer-admin -- admin@exemple.cd MotDePasse123`
5. Lancer : `npm start`

Authentification : en-tête `Authorization: Bearer <jeton>` (jeton reçu à la connexion).

## Interface web

L'API sert aussi l'interface (dossier `public/`) : ouvrir http://localhost:3000

Premier parcours de test :
1. Se connecter avec le Super admin créé à l'étape 4.
2. Inscrire une école (Créer un compte > École), puis l'approuver depuis l'espace Super admin.
3. Se connecter comme directeur, créer les classes, puis inscrire enseignants, élèves et parents et les approuver.
4. Le parent choisit son enfant dans la liste ; la direction confirme le lien.

Bibliothèque : la direction téléverse des PDF (10 Mo maximum). Ils sont enregistrés dans le dossier `fichiers/`
(ou `DOSSIER_FICHIERS` dans `.env`), hors du dossier public, et ne sont téléchargeables que par les personnes autorisées.
Ce dossier doit être sauvegardé avec la base de données.

Base déjà créée avec l'ancienne version ? Exécuter une fois : `psql -d gestion_ecoles -f migration_televersement.sql`
puis `npm install` (nouvelle dépendance : multer).
