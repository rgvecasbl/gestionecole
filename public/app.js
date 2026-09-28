'use strict';
const app = document.getElementById('app');
const ROLES = { super_admin: 'Espace Super admin', direction: 'Espace Direction', enseignant: 'Espace Enseignant', eleve: 'Espace Élève', parent: 'Espace Parent' };
const LIB = { enseignant: 'enseignant', eleve: 'élève', parent: 'parent' };
const NIVEAUX = ["Diplôme d'État (D6)", 'Graduat', 'Licence', 'Autre'];
const ONGLETS = [['ecole', 'École'], ['enseignant', 'Enseignant'], ['eleve', 'Élève'], ['parent', 'Parent']];
// [nom, libellé, type, facultatif] ; les noms en @ sont des listes déroulantes
const FORMS = {
  ecole: [['nom_ecole', "Nom de l'école"], ['n_enregistrement', "N° d'enregistrement"], ['date_creation', 'Date de création', 'date'], ['arrete', 'Arrêté'],
    ['nombre_classes', 'Nombre de classes', 'number'], ['province', 'Province', 'text', true], ['nom_directeur', 'Nom complet du directeur'],
    ['date_naissance', 'Date de naissance du directeur', 'date'], ['lieu_naissance', 'Lieu de naissance du directeur'],
    ['contact', 'E-mail ou téléphone'], ['mot_de_passe', 'Mot de passe', 'password']],
  enseignant: [['@ecole_id'], ['@classe_id'], ['nom_complet', 'Nom complet'], ['date_naissance', 'Date de naissance', 'date'], ['lieu_naissance', 'Lieu de naissance'],
    ['telephone', 'Numéro de téléphone', 'tel'], ['email', 'E-mail', 'email'], ['@niveau_etudes'], ['mot_de_passe', 'Mot de passe', 'password']],
  eleve: [['@ecole_id'], ['@classe_id'], ['nom_complet', 'Nom complet'], ['date_naissance', 'Date de naissance', 'date'], ['lieu_naissance', 'Lieu de naissance'],
    ['contact', 'E-mail ou téléphone'], ['mot_de_passe', 'Mot de passe', 'password']],
  parent: [['@ecole_id'], ['@eleve_id'], ['nom_complet', 'Votre nom complet'], ['contact', 'E-mail ou téléphone'], ['mot_de_passe', 'Mot de passe', 'password']],
};

let jeton = sessionStorage.getItem('jeton');
let moi = null, vue = 'connexion', onglet = 'ecole', forumOuvert = null, forumTitre = '', notice = null;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const date = (s) => new Date(s).toLocaleDateString('fr-FR');
const sansVide = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== ''));
const urlSure = (u) => (/^https?:\/\//i.test(u) ? u : '#');

function sortir() { jeton = null; moi = null; forumOuvert = null; vue = 'connexion'; sessionStorage.removeItem('jeton'); }

async function api(chemin, methode = 'GET', corps) {
  const r = await fetch('/api' + chemin, {
    method: methode,
    headers: { ...(corps instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...(jeton ? { Authorization: 'Bearer ' + jeton } : {}) },
    body: !corps ? undefined : corps instanceof FormData ? corps : JSON.stringify(corps),
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && jeton) { sortir(); throw new Error(d.erreur || 'Session expirée. Reconnectez-vous.'); }
  if (!r.ok) throw new Error(d.erreur || 'Une erreur est survenue. Réessayez.');
  return d;
}

// ---------- Composants ----------
const champ = (n, l, t = 'text', opt = false, ex = '') => `<label>${l}<input name="${n}" type="${t}" ${opt ? '' : 'required'} ${ex}></label>`;
const zone = (n, l) => `<label>${l}<textarea name="${n}" rows="3" required></textarea></label>`;
const liste = (n, l, opts, { vide = 'Choisir…', opt = false } = {}) =>
  `<label>${l}<select name="${n}" ${opt ? '' : 'required'}><option value="">${vide}</option>${opts.map(([v, t]) => `<option value="${esc(v)}">${esc(t)}</option>`).join('')}</select></label>`;
const ligne = (t, m, act = '') => `<div class="ligne"><b>${esc(t)}</b><span>${esc(m)}</span>${act ? `<div class="actions">${act}</div>` : ''}</div>`;
const bouton = (a, txt, data = {}, cls = 'btn mini') =>
  `<button type="button" class="${cls}" data-a="${a}" ${Object.entries(data).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>${txt}</button>`;
const decider = (a, id, extra = {}) => bouton(a, 'Approuver', { id, s: 'approuve', ...extra }) + bouton(a, 'Refuser', { id, s: 'refuse', ...extra }, 'btn mini sec');
const section = (t, c) => `<h2>${t}</h2>${c}`;
const vide = (t) => `<p class="sous">${t}</p>`;
const replie = (titre, contenu) => `<details><summary>${titre}</summary>${contenu}</details>`;

// ---------- Écrans publics ----------
function vueConnexion() {
  return `<h1>Se connecter</h1><p class="sous">Logiciel de gestion des écoles</p>
  <form data-f="connexion">${champ('identifiant', 'E-mail ou téléphone', 'text', false, 'autocomplete="username"')}
  ${champ('mot_de_passe', 'Mot de passe', 'password', false, 'autocomplete="current-password"')}
  <button class="btn">Se connecter</button></form>
  <p class="sous espace">Pas encore de compte ? ${bouton('go', 'Créer un compte', { v: 'inscription' }, 'lien')}</p>
  <div class="info">Votre compte doit être approuvé avant la première connexion.</div>`;
}

async function vueInscription() {
  const ecoles = (await api('/public/ecoles')).map((e) => [e.id, e.nom]);
  const tabs = ONGLETS.map(([k, t]) => `<button type="button" role="tab" aria-selected="${k === onglet}" data-a="tab" data-t="${k}">${t}</button>`).join('');
  const champs = FORMS[onglet].map(([n, l, t, opt]) => {
    if (n === '@ecole_id') return liste('ecole_id', 'École', ecoles);
    if (n === '@classe_id') return liste('classe_id', 'Classe', [], { vide: "Choisissez d'abord l'école" });
    if (n === '@eleve_id') return liste('eleve_id', 'Votre enfant', [], { vide: "Choisissez d'abord l'école" });
    if (n === '@niveau_etudes') return liste('niveau_etudes', "Niveau d'études", NIVEAUX.map((x) => [x, x]));
    return champ(n, l, t, opt, n === 'mot_de_passe' ? 'minlength="8" autocomplete="new-password"' : '');
  }).join('');
  return `<h1>Créer un compte</h1><p class="sous">Choisissez votre profil.</p>
  <div class="onglets" role="tablist">${tabs}</div>
  <form data-f="inscription">${champs}<button class="btn">Envoyer la demande</button></form>
  <p class="sous espace">Déjà inscrit ? ${bouton('go', 'Se connecter', { v: 'connexion' }, 'lien')}</p>`;
}

// ---------- Espaces connectés ----------
async function sEcoles() {
  const rows = await api('/admin/ecoles?statut=en_attente');
  return section('Écoles à approuver', rows.length
    ? rows.map((e) => ligne(e.nom, `N° ${e.n_enregistrement}, ${e.nombre_classes} classes, arrêté ${e.arrete}. Directeur : ${e.directeur || 'non renseigné'}`, decider('ecole', e.id))).join('')
    : vide('Aucune école en attente.'));
}

async function sInscr() {
  const rows = await api('/direction/inscriptions');
  return section('Inscriptions à approuver', rows.length
    ? rows.map((u) => ligne(`${u.nom_complet}, ${LIB[u.role]}`, u.email || u.telephone || '', decider('util', u.id))).join('')
    : vide('Aucune inscription en attente.'));
}

async function sLiens() {
  const rows = await api('/direction/liens');
  return section('Liens parent-élève à confirmer', rows.length
    ? rows.map((l) => ligne(`${l.parent} demande le lien avec ${l.eleve}`, '', decider('lien', l.parent_id, { e: l.eleve_id }))).join('')
    : vide('Aucun lien en attente.'));
}

async function sClasses() {
  const rows = await api('/direction/classes');
  const form = `<form data-f="classe">${liste('niveau', 'Année', [1, 2, 3, 4, 5, 6].map((n) => [n, `${n}${n === 1 ? 're' : 'e'} année`]))}
    ${champ('intitule', 'Nom de la classe (ex. 3e A)')}<button class="btn">Ajouter la classe</button></form>`;
  return section('Classes', (rows.length ? rows.map((c) => ligne(c.intitule, `${c.niveau}${c.niveau === 1 ? 're' : 'e'} année`)).join('') : vide("Créez d'abord vos classes : enseignants et élèves les choisiront à l'inscription.")) + replie('Ajouter une classe', form));
}

async function sBiblio() {
  const rows = await api('/bibliotheque');
  const dir = moi.role === 'direction';
  let html = rows.length
    ? rows.map((b) => ligne(b.titre, b.type === 'bulletin' ? 'Bulletin' : 'Livre scolaire',
      (b.televerse ? bouton('telecharger', 'Télécharger', { id: b.id, t: b.titre }, 'btn mini sec') : `<a class="btn mini sec" href="${esc(urlSure(b.fichier_url))}" target="_blank" rel="noopener">Ouvrir</a>`) + (dir ? bouton('suppr', 'Supprimer', { id: b.id }, 'btn mini sec') : ''))).join('')
    : vide('Aucun document pour le moment.');
  if (dir) {
    const [classes, eleves] = await Promise.all([api('/direction/classes'), api('/direction/eleves')]);
    html += replie('Ajouter un document', `<form data-f="biblio">
      ${liste('type', 'Type', [['livre', 'Livre scolaire'], ['bulletin', 'Bulletin']])}
      ${champ('titre', 'Titre')}<label>Fichier PDF (10 Mo maximum)<input name="fichier" type="file" accept="application/pdf,.pdf" required></label>
      ${liste('classe_id', 'Classe (livres, facultatif)', classes.map((c) => [c.id, c.intitule]), { opt: true, vide: 'Toutes les classes' })}
      ${liste('eleve_id', 'Élève (obligatoire pour un bulletin)', eleves.map((e) => [e.id, `${e.nom_complet}, ${e.classe}`]), { opt: true, vide: 'Aucun' })}
      <button class="btn">Ajouter au catalogue</button></form>`);
  }
  return section('Bibliothèque', html);
}

async function sCirc() {
  const rows = await api('/circulaires');
  const admin = moi.role === 'super_admin', dir = moi.role === 'direction';
  let html = rows.length ? rows.map((c) => ligne(c.titre, `${date(c.cree_le)}. ${c.contenu}`)).join('') : vide('Aucune circulaire pour le moment.');
  if (admin || dir) {
    let cibles = '<p class="sous">Destinataires : les directions des écoles.</p>', classe = '';
    if (dir) {
      const classes = await api('/direction/classes');
      cibles = `<div class="cases">${[['enseignant', 'Enseignants'], ['parent', 'Parents'], ['eleve', 'Élèves']]
        .map(([v, t]) => `<label><input type="checkbox" name="cibles" value="${v}">${t}</label>`).join('')}</div>`;
      classe = liste('classe_id', 'Une seule classe (facultatif)', classes.map((c) => [c.id, c.intitule]), { opt: true, vide: "Toute l'école" });
    }
    html += replie('Nouvelle circulaire', `<form data-f="circulaire">${champ('titre', 'Titre')}${zone('contenu', 'Message')}${cibles}${classe}<button class="btn">Envoyer la circulaire</button></form>`);
  }
  return section('Circulaires', html);
}

async function sForum() {
  const rows = await api('/forum/sujets');
  let html = rows.length
    ? rows.map((s) => ligne(s.titre, `${s.nb_messages} message(s)${s.ecole_id ? '' : ', forum général'}`, bouton('sujet', 'Ouvrir', { id: s.id, t: s.titre }, 'btn mini sec'))).join('')
    : vide('Aucun sujet pour le moment.');
  const general = moi.role === 'direction' ? '<label class="case"><input type="checkbox" name="general">Forum général des directions</label>' : '';
  html += replie('Nouveau sujet', `<form data-f="sujet">${champ('titre', 'Titre du sujet')}${zone('contenu', 'Premier message')}${general}<button class="btn">Publier</button></form>`);
  return section("Forum d'échange", html);
}

async function vueSujet() {
  const msgs = await api(`/forum/sujets/${forumOuvert}/messages`);
  const modo = ['direction', 'super_admin'].includes(moi.role);
  const lignes = msgs.map((m) => ligne(`${m.auteur_nom}${m.masque ? ' (masqué)' : ''}`, `${date(m.cree_le)}. ${m.contenu}`,
    modo ? bouton('masquer', m.masque ? 'Réafficher' : 'Masquer', { id: m.id, m: m.masque ? '0' : '1' }, 'btn mini sec') : '')).join('');
  return `<h2>${esc(forumTitre)}</h2>${lignes}
  <form data-f="message">${zone('contenu', 'Votre message')}<button class="btn">Répondre</button></form>
  <p>${bouton('retour', 'Retour aux sujets', {}, 'lien')}</p>`;
}

const BLOCS = {
  super_admin: [sEcoles, sCirc, sForum],
  direction: [sInscr, sLiens, sClasses, sBiblio, sCirc, sForum],
  enseignant: [sBiblio, sCirc, sForum],
  eleve: [sBiblio, sCirc, sForum],
  parent: [sBiblio, sCirc, sForum],
};

async function vueTableau() {
  if (!moi) moi = await api('/auth/moi');
  const tete = `<div class="entete"><div><h1>Bonjour, ${esc(moi.nom || 'Super admin')}</h1>
    <p class="sous">${ROLES[moi.role]}${moi.ecole ? ', ' + esc(moi.ecole) : ''}</p></div>${bouton('deconnexion', 'Se déconnecter', {}, 'btn mini sec')}</div>`;
  if (forumOuvert) return tete + (await vueSujet());
  return tete + (await Promise.all(BLOCS[moi.role].map((f) => f()))).join('');
}

// ---------- Affichage ----------
function montrer(texte, ok) {
  const z = document.getElementById('alerte');
  z.hidden = !texte; z.textContent = texte || ''; z.className = ok ? 'ok' : '';
}

async function rendre() {
  try {
    app.innerHTML = jeton ? await vueTableau() : vue === 'inscription' ? await vueInscription() : vueConnexion();
  } catch (e) {
    notice = notice || { t: e.message };
    if (!jeton) app.innerHTML = vueConnexion();
  }
  montrer(notice && notice.t, notice && notice.ok);
  notice = null;
}

// ---------- Actions (boutons) ----------
const ACTIONS = {
  go: (d) => { vue = d.v; },
  tab: (d) => { onglet = d.t; },
  deconnexion: async () => { try { await api('/auth/deconnexion', 'POST'); } catch (e) { /* session déjà fermée */ } sortir(); },
  ecole: (d) => api(`/admin/ecoles/${d.id}`, 'PATCH', { statut: d.s }),
  util: (d) => api(`/direction/utilisateurs/${d.id}`, 'PATCH', { statut: d.s }),
  lien: (d) => api(`/direction/liens/${d.id}/${d.e}`, 'PATCH', { statut: d.s }),
  suppr: (d) => confirm('Supprimer ce document ?') && api(`/bibliotheque/${d.id}`, 'DELETE'),
  sujet: (d) => { forumOuvert = d.id; forumTitre = d.t; },
  retour: () => { forumOuvert = null; },
  telecharger: async (d) => {
    const r = await fetch(`/api/bibliotheque/${d.id}/fichier`, { headers: { Authorization: 'Bearer ' + jeton } });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      if (r.status === 401) sortir();
      throw new Error(e.erreur || 'Téléchargement impossible.');
    }
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = url; a.download = (d.t || 'document') + '.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  },
  masquer: (d) => api(`/forum/messages/${d.id}`, 'PATCH', { masque: d.m === '1' }),
};

document.addEventListener('click', async (e) => {
  const b = e.target.closest('button[data-a]');
  if (!b) return;
  try { await ACTIONS[b.dataset.a](b.dataset); } catch (err) { notice = { t: err.message }; }
  if (b.dataset.a === 'telecharger' && jeton) { montrer(notice && notice.t); notice = null; return; }
  await rendre();
  window.scrollTo(0, 0);
});

// ---------- Formulaires ----------
function lireInscription(d) {
  const o = { ...d };
  if ('contact' in o) { const c = o.contact.trim(); delete o.contact; if (c.includes('@')) o.email = c; else o.telephone = c; }
  if (o.eleve_id) { o.eleve_ids = [o.eleve_id]; delete o.eleve_id; }
  return sansVide(o);
}

const SOUMISSIONS = {
  connexion: async (d) => { const r = await api('/auth/connexion', 'POST', d); jeton = r.jeton; sessionStorage.setItem('jeton', jeton); moi = null; },
  inscription: async (d) => { const r = await api('/auth/inscription/' + onglet, 'POST', lireInscription(d)); notice = { t: r.message, ok: true }; vue = 'connexion'; },
  classe: (d) => api('/direction/classes', 'POST', { niveau: Number(d.niveau), intitule: d.intitule }),
  circulaire: (d, fd) => api('/circulaires', 'POST', sansVide({
    titre: d.titre, contenu: d.contenu, classe_id: d.classe_id,
    cibles: moi.role === 'super_admin' ? ['direction'] : fd.getAll('cibles'),
  })),
  sujet: (d) => api('/forum/sujets', 'POST', { titre: d.titre, contenu: d.contenu, general: d.general === 'on' }),
  message: (d) => api(`/forum/sujets/${forumOuvert}/messages`, 'POST', { contenu: d.contenu }),
  biblio: (d, fd) => {
    const fic = fd.get('fichier');
    if (!fic || !fic.size) throw new Error('Choisissez un fichier PDF.');
    if (fic.size > 10 * 1024 * 1024) throw new Error('Fichier trop volumineux (10 Mo maximum).');
    const envoi = new FormData();
    for (const [k, v] of fd) if (v !== '') envoi.append(k, v);
    return api('/bibliotheque', 'POST', envoi);
  },
};

document.addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target, k = f.dataset.f;
  if (!SOUMISSIONS[k]) return;
  const fd = new FormData(f);
  try {
    await SOUMISSIONS[k](Object.fromEntries(fd), fd);
    if (!notice) notice = { t: 'Enregistré.', ok: true };
    if (k === 'connexion') notice = null;
  } catch (err) { notice = { t: err.message }; }
  await rendre();
  window.scrollTo(0, 0);
});

// Listes dépendantes : classes ou élèves de l'école choisie
document.addEventListener('change', async (e) => {
  if (e.target.name !== 'ecole_id') return;
  const cible = document.querySelector('select[name=classe_id], select[name=eleve_id]');
  if (!cible) return;
  const eleve = cible.name === 'eleve_id';
  cible.innerHTML = '<option value="">Choisir…</option>';
  if (!e.target.value) return;
  try {
    const rows = await api(`/public/ecoles/${e.target.value}/${eleve ? 'eleves' : 'classes'}`);
    cible.innerHTML += rows.map((r) => `<option value="${esc(r.id)}">${esc(eleve ? `${r.nom_complet}, ${r.classe}` : r.intitule)}</option>`).join('');
  } catch (err) { montrer(err.message); }
});

rendre();
