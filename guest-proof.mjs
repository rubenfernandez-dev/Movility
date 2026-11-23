import { adminHtml } from './admin-language.mjs';
import { createHash, randomBytes } from 'node:crypto';
import { escapeHtml } from './views.mjs';

const lifetime = 15 * 60;
const checkoutLifetime = 60 * 60;
const token = () => randomBytes(24).toString('base64url');
const hash = value => createHash('sha256').update(value).digest('hex');
const seconds = () => Math.floor(Date.now() / 1000);

export function setupGuestProof(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS guest_order_proofs (
    order_id TEXT PRIMARY KEY REFERENCES orders(id), challenge_hash TEXT UNIQUE,
    expires_at INTEGER NOT NULL, proof_hash TEXT UNIQUE, proof_expires_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS checkout_order_access (
    order_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, expires_at INTEGER NOT NULL
  );`);
}

const checkoutCookieName = id => 'movility_order_' + id;

export function issueCheckoutAccess(db, id, now = seconds()) {
  const value = token();
  db.prepare('DELETE FROM checkout_order_access WHERE expires_at <= ?').run(now);
  db.prepare('INSERT INTO checkout_order_access VALUES (?, ?, ?)').run(id, hash(value), now + checkoutLifetime);
  return value;
}

export function checkoutAccessCookie(id, value, secure) {
  return `${checkoutCookieName(id)}=${value}; Path=/; Max-Age=${checkoutLifetime}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function hasCheckoutAccess(db, id, cookies, now = seconds()) {
  const name = checkoutCookieName(id) + '=';
  const value = cookies?.split(';').map(part => part.trim()).find(part => part.startsWith(name))?.slice(name.length);
  return /^[A-Za-z0-9_-]{32}$/.test(value || '') && Boolean(db.prepare(
    'SELECT 1 FROM checkout_order_access WHERE order_id = ? AND token_hash = ? AND expires_at > ?'
  ).get(id, hash(value), now));
}

export function revokeCheckoutAccess(db, id) {
  db.prepare('DELETE FROM checkout_order_access WHERE order_id = ?').run(id);
}

export function orderAccessPage(locale, withAccount) {
  const de = locale === 'de-CH';
  return `<h1 class="page-title">${de ? 'Bestellzugriff bestätigen' : 'Vérifier l’accès à la commande'}</h1>
    <p>${de ? 'Bestätige den Zugriff mit deiner Bestell-E-Mail und einem Einmalcode vom Kundendienst.' :
      'Confirmez votre accès avec l’adresse e-mail de la commande et un code à usage unique fourni par le service client.'}</p>
    <p><a class="button" href="/${locale}/guest-access">${de ? 'Einmalcode eingeben' : 'Saisir le code'}</a>
    <a href="/${locale}/contact">${de ? 'Kundendienst kontaktieren' : 'Contacter le service client'}</a>
    ${withAccount ? `<a href="/${locale}/account">${de ? 'Mein Konto' : 'Mon compte'}</a>` : ''}</p>`;
}

export function issueGuestCode(db, id, now = seconds()) {
  const code = token();
  db.prepare(`INSERT INTO guest_order_proofs (order_id, challenge_hash, expires_at)
    VALUES (?, ?, ?) ON CONFLICT(order_id) DO UPDATE SET challenge_hash = excluded.challenge_hash,
    expires_at = excluded.expires_at, proof_hash = NULL, proof_expires_at = NULL`).run(id, hash(code), now + lifetime);
  return code;
}

export function revokeGuestCode(db, id) {
  db.prepare('DELETE FROM guest_order_proofs WHERE order_id = ?').run(id);
}

export function redeemGuestCode(db, code, email, now = seconds()) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(code) || !email || email.length > 254) return null;
  const proof = token();
  const updated = db.prepare(`UPDATE guest_order_proofs SET challenge_hash = NULL, proof_hash = ?, proof_expires_at = ?
    WHERE challenge_hash = ? AND expires_at > ?
    AND lower((SELECT email FROM orders WHERE id = guest_order_proofs.order_id)) = lower(?)
    RETURNING order_id`).get(hash(proof), now + lifetime, hash(code), now, email);
  return updated ? { orderId: updated.order_id, proof } : null;
}

export function verifiedGuestOrder(db, cookie, now = seconds()) {
  const value = cookie?.split(';').map(part => part.trim())
    .find(part => part.startsWith('movility_guest_proof='))?.slice('movility_guest_proof='.length);
  if (!value || !/^[A-Za-z0-9_-]{32}$/.test(value)) return null;
  return db.prepare('SELECT order_id FROM guest_order_proofs WHERE proof_hash = ? AND proof_expires_at > ?')
    .get(hash(value), now)?.order_id;
}

export function guestProofCookie(proof, secure) {
  return `movility_guest_proof=${proof}; Path=/; Max-Age=${lifetime}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function guestAccessPage(locale, error, completed) {
  const de = locale === 'de-CH';
  const heading = de ? 'Gastbestellung bestätigen' : 'Vérifier une commande invitée';
  const failed = de ? 'Code oder E-Mail-Adresse konnte nicht bestätigt werden.' : 'Le code ou l’adresse e-mail n’a pas pu être vérifié.';
  return `<h1 class="page-title">${heading}</h1>${completed
    ? `<p role="status">${de ? 'Der Bestellcode wurde bestätigt.' : 'Le code de commande a été vérifié.'}</p>
      <p><a href="/${locale}/orders/${completed}">${de ? 'Bestellung öffnen' : 'Ouvrir la commande'}</a></p>`
    : `<p>${de ? 'Gib die E-Mail-Adresse der Bestellung und den Einmalcode ein.' : 'Saisissez l’adresse e-mail de la commande et le code à usage unique.'}</p>
      ${error ? `<p role="alert" class="form-error">${failed}</p>` : ''}
      <form class="confirmation" method="post" action="/${locale}/guest-access">
        <label>${de ? 'E-Mail-Adresse' : 'Adresse e-mail'}<input type="email" name="email" maxlength="254" required></label>
        <label>${de ? 'Einmalcode' : 'Code à usage unique'}<input name="code" maxlength="32" required></label>
        <button>${de ? 'Bestätigen' : 'Vérifier'}</button>
      </form>`}`;
}

export function codePage(order, code) {
  return adminHtml`<h1 class="page-title">Código de pedido invitado</h1>
    <p>Caduca en 15 minutos y solo se puede usar una vez. El código se muestra únicamente en esta pantalla.</p>
    <p><code>${escapeHtml(code)}</code></p><p><a href="/${order.locale}/guest-access">Formulario de verificación</a></p>
    <p><a href="/admin#order-${order.id}">Volver al pedido</a></p>`;
}
