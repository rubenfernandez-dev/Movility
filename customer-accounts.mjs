import { createHash, randomBytes } from 'node:crypto';
import { escapeHtml } from './views.mjs';
import { verifiedGuestOrder, revokeGuestCode } from './guest-proof.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');
const token = () => randomBytes(24).toString('base64url');
const now = () => Math.floor(Date.now() / 1000);
export const accountEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  ? value.toLowerCase() : '';

export function setupAccounts(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS customer_accounts (email TEXT PRIMARY KEY, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS customer_codes (email TEXT PRIMARY KEY, code_hash TEXT NOT NULL, preview TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS customer_sessions (token_hash TEXT PRIMARY KEY, email TEXT NOT NULL REFERENCES customer_accounts(email), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS customer_orders (order_id TEXT PRIMARY KEY REFERENCES orders(id), email TEXT NOT NULL REFERENCES customer_accounts(email));`);
}

export function issueAccountCode(db, email) {
  const code = token();
  db.prepare(`INSERT INTO customer_codes VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE
    SET code_hash=excluded.code_hash, preview=excluded.preview, expires=excluded.expires`).run(email, digest(code), code, now() + 900);
}

export function verifyAccountCode(db, email, code) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(code)) return null;
  if (!db.prepare('DELETE FROM customer_codes WHERE email = ? AND code_hash = ? AND expires > ?').run(email, digest(code), now()).changes) return null;
  db.prepare('INSERT OR IGNORE INTO customer_accounts VALUES (?, ?)').run(email, now());
  const session = token();
  db.prepare('INSERT INTO customer_sessions VALUES (?, ?, ?)').run(digest(session), email, now() + 86400);
  return session;
}

function sessionHash(cookie) {
  const value = cookie?.match(/(?:^|;\s*)movility_customer=([A-Za-z0-9_-]{32})(?:;|$)/)?.[1];
  return value ? digest(value) : '';
}
export const signedInCustomer = (db, cookie) => db.prepare('SELECT email FROM customer_sessions WHERE token_hash = ? AND expires > ?')
  .get(sessionHash(cookie), now())?.email;
export function endCustomerSession(db, cookie) {
  db.prepare('DELETE FROM customer_sessions WHERE token_hash = ?').run(sessionHash(cookie));
}
export const customerCookie = value => `movility_customer=${value}; Path=/; Max-Age=${value ? 86400 : 0}; HttpOnly; SameSite=Strict`;

export function linkGuestOrder(db, email, cookie) {
  const id = verifiedGuestOrder(db, cookie);
  if (!id || accountEmail(db.prepare('SELECT email FROM orders WHERE id = ?').get(id)?.email) !== email) return false;
  const owner = db.prepare('SELECT email FROM customer_orders WHERE order_id = ?').get(id);
  if (owner && owner.email !== email) return false;
  db.prepare('INSERT OR IGNORE INTO customer_orders VALUES (?, ?)').run(id, email);
  revokeGuestCode(db, id);
  return true;
}

export function customerPage(db, locale, email, state = '') {
  const de = locale === 'de-CH';
  const title = de ? 'Mein Konto' : 'Mon compte';
  const path = '/' + locale + '/account';
  const label = de ? 'E-Mail-Adresse' : 'Adresse e-mail';
  const errors = { invalid: de ? 'Die Eingaben konnten nicht bestätigt werden.' : 'Les informations n’ont pas pu être vérifiées.',
    linked: de ? 'Bestellung verknüpft.' : 'Commande associée.',
    requested: de ? 'Der Testcode liegt in der simulierten Mailbox.' : 'Le code de test est disponible dans la boîte simulée.' };
  const feedback = state in errors ? `<p role="status">${errors[state]}</p>` : '';
  if (!email) return `<h1 class="page-title">${title}</h1>${feedback}
    <p>${de ? 'Testzugang mit einem Einmalcode aus der simulierten Mailbox.' : 'Accès de test avec un code à usage unique dans la boîte e-mail simulée.'}</p>
    <form class="confirmation" method="post" action="${path}"><label>${label}<input type="email" name="email" required maxlength="254"></label>
    <button name="action" value="request">${de ? 'Code anfordern' : 'Demander un code'}</button></form>
    <form class="confirmation" method="post" action="${path}"><label>${label}<input type="email" name="email" required maxlength="254"></label>
    <label>${de ? 'Einmalcode' : 'Code à usage unique'}<input name="code" required maxlength="32" autocomplete="one-time-code"></label>
    <button name="action" value="verify">${de ? 'Anmelden' : 'Se connecter'}</button></form>`;
  const orders = db.prepare('SELECT orders.id FROM customer_orders JOIN orders ON orders.id = customer_orders.order_id WHERE customer_orders.email = ? ORDER BY orders.rowid DESC').all(email);
  return `<h1 class="page-title">${title}</h1><p>${escapeHtml(email)}</p>${feedback}
    <h2>${de ? 'Meine Bestellungen' : 'Mes commandes'}</h2>
    ${orders.length ? '<ul>' + orders.map(order => `<li><a href="/${locale}/orders/${order.id}">${order.id}</a></li>`).join('') + '</ul>'
      : `<p>${de ? 'Noch keine verknüpfte Bestellung.' : 'Aucune commande associée.'}</p>`}
    <p><a href="/${locale}/guest-access">${de ? 'Gastbestellung bestätigen' : 'Vérifier une commande invitée'}</a></p>
    <form class="product-actions" method="post" action="${path}">
      <button name="action" value="link">${de ? 'Bestätigte Bestellung verknüpfen' : 'Associer la commande vérifiée'}</button>
      <button class="secondary" name="action" value="logout">${de ? 'Abmelden' : 'Se déconnecter'}</button></form>`;
}

export function accountMailbox(db) {
  const messages = db.prepare('SELECT email, preview FROM customer_codes WHERE expires > ? ORDER BY rowid DESC LIMIT 30').all(now());
  return `<h1>Accesos de prueba de clientes</h1><p>Simulador de correo de preproducción.</p>
    <ul>${messages.map(row => `<li>${escapeHtml(row.email)} · <code>${escapeHtml(row.preview)}</code></li>`).join('')}</ul>
    <p><a href="/admin">Volver al panel</a></p>`;
}
