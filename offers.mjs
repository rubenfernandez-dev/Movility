import { adminHtml } from './admin-language.mjs';
import { createHash, randomBytes } from 'node:crypto';
import { escapeHtml } from './views.mjs';

const version = 'offers-v1';
const token = () => randomBytes(24).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const validToken = value => /^[A-Za-z0-9_-]{32}$/.test(value);
const now = () => Math.floor(Date.now() / 1000);

const languages = {
  'de-CH': { title: 'Angebote und Neuigkeiten', email: 'E-Mail-Adresse',
    consent: 'Ich möchte Angebote und Neuigkeiten von Movility per E-Mail erhalten.',
    request: 'Anmeldung anfordern', verify: 'Anmeldung bestätigen', code: 'Bestätigungscode',
    unsubscribe: 'Abmelden', unsubCode: 'Abmeldecode', requested: 'Der Bestätigungscode liegt im simulierten Postfach.',
    active: 'Die Anmeldung wurde bestätigt.', off: 'Du bist von Angeboten abgemeldet.', error: 'Die Angaben konnten nicht bestätigt werden.' },
  'fr-CH': { title: 'Offres et nouveautés', email: 'Adresse e-mail',
    consent: 'J’accepte de recevoir les offres et nouveautés de Movility par e-mail.',
    request: 'Demander l’inscription', verify: 'Confirmer l’inscription', code: 'Code de confirmation',
    unsubscribe: 'Se désinscrire', unsubCode: 'Code de désinscription', requested: 'Le code est disponible dans la boîte simulée.',
    active: 'Votre inscription a été confirmée.', off: 'Vous êtes désinscrit des offres.', error: 'Les informations n’ont pas pu être confirmées.' },
};

export function setupOffers(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS offer_subscriptions (
    email TEXT PRIMARY KEY, locale TEXT NOT NULL, source TEXT NOT NULL, version TEXT NOT NULL,
    state TEXT NOT NULL CHECK(state IN ('pending','active','revoked')),
    challenge_hash TEXT UNIQUE, challenge_preview TEXT, challenge_expires INTEGER,
    unsubscribe_hash TEXT UNIQUE, unsubscribe_preview TEXT
  );
  CREATE TABLE IF NOT EXISTS offer_consent_events (
    id INTEGER PRIMARY KEY, email TEXT NOT NULL, action TEXT NOT NULL,
    locale TEXT NOT NULL, source TEXT NOT NULL, version TEXT NOT NULL, occurred_at INTEGER NOT NULL
  );`);
}

const subscription = (db, email) => db.prepare('SELECT * FROM offer_subscriptions WHERE email = ?').get(email);
function record(db, row, action) {
  db.prepare('INSERT INTO offer_consent_events (email, action, locale, source, version, occurred_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(row.email, action, row.locale, row.source, row.version, now());
}

export function requestOffers(db, email, locale, fromAccount) {
  const previous = subscription(db, email);
  if (previous?.state === 'active' || (previous?.state === 'pending' && previous.challenge_expires > now())) return;
  const challenge = token();
  db.prepare(`INSERT INTO offer_subscriptions (email, locale, source, version, state, challenge_hash, challenge_preview, challenge_expires)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?) ON CONFLICT(email) DO UPDATE SET locale=excluded.locale, source=excluded.source,
    version=excluded.version, state='pending', challenge_hash=excluded.challenge_hash, challenge_preview=excluded.challenge_preview,
    challenge_expires=excluded.challenge_expires, unsubscribe_hash=NULL, unsubscribe_preview=NULL`)
    .run(email, locale, fromAccount ? 'account' : 'guest', version, hash(challenge), challenge, now() + 900);
  record(db, subscription(db, email), 'requested');
}

export function confirmOffers(db, email, code) {
  if (!validToken(code)) return false;
  const unsubscribe = token();
  const updated = db.prepare(`UPDATE offer_subscriptions SET state='active', challenge_hash=NULL, challenge_preview=NULL,
    challenge_expires=NULL, unsubscribe_hash=?, unsubscribe_preview=?
    WHERE email=? AND state='pending' AND challenge_hash=? AND challenge_expires>?`)
    .run(hash(unsubscribe), unsubscribe, email, hash(code), now());
  if (updated.changes) record(db, subscription(db, email), 'confirmed');
  return Boolean(updated.changes);
}

export function stopOffers(db, email, code) {
  const row = email ? subscription(db, email) : validToken(code)
    ? db.prepare('SELECT * FROM offer_subscriptions WHERE unsubscribe_hash = ?').get(hash(code)) : null;
  if (!row) return false;
  if (row.state === 'revoked') return true;
  db.prepare(`UPDATE offer_subscriptions SET state='revoked', challenge_hash=NULL, challenge_preview=NULL,
    challenge_expires=NULL, unsubscribe_hash=NULL, unsubscribe_preview=NULL WHERE email=?`).run(row.email);
  record(db, row, 'revoked');
  return true;
}

export function offersPage(locale, email, status) {
  const l = languages[locale];
  const path = '/' + locale + '/offers';
  const emailField = `<label>${l.email}<input type="email" name="email" value="${escapeHtml(email || '')}" required maxlength="254" ${email ? 'readonly' : ''}></label>`;
  return `<h1 class="page-title">${l.title}</h1>
    ${['requested', 'active', 'off', 'error'].includes(status) ? `<p role="status">${l[status]}</p>` : ''}
    <form class="confirmation" method="post" action="${path}">${emailField}
      <label><input type="checkbox" name="consent" value="yes" required> ${l.consent}</label>
      <button name="action" value="request">${l.request}</button></form>
    <form class="confirmation" method="post" action="${path}">${emailField}
      <label>${l.code}<input name="code" maxlength="32" required></label>
      <button name="action" value="confirm">${l.verify}</button></form>
    <form class="confirmation" method="post" action="${path}">
      ${email ? '' : `<label>${l.unsubCode}<input name="code" maxlength="32" required></label>`}
      <button class="secondary" name="action" value="stop">${l.unsubscribe}</button></form>`;
}

export function offerMailbox(db) {
  const rows = db.prepare(`SELECT email, state, locale, challenge_preview, unsubscribe_preview FROM offer_subscriptions
    WHERE state='active' OR (state='pending' AND challenge_expires>?) ORDER BY rowid DESC LIMIT 30`).all(now());
  return adminHtml`<h1>Buzón de ofertas de prueba</h1><p>Preproducción. Los códigos solo se muestran en este buzón.</p>
    <ul>${rows.map(row => adminHtml`<li>${escapeHtml(row.email)} · ${row.locale} ·
      ${row.state === 'active' ? 'Baja' : 'Confirmación'} · <code>${escapeHtml(row.unsubscribe_preview || row.challenge_preview)}</code></li>`).join('')}</ul>
    <p><a href="/admin">Volver al panel</a></p>`;
}
