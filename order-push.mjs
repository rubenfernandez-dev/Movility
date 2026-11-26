import { ECDH, randomUUID } from 'node:crypto';
import { generateVAPIDKeys, setVapidDetails, sendNotification } from 'web-push';
import { escapeHtml } from './views.mjs';
import { adminHtml, adminText } from './admin-language.mjs';

const hosts = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com', 'wns2-par02p.notify.windows.com']);
const days = 30 * 86400;
const seconds = () => Math.floor(Date.now() / 1000);
const allowedKind = new Set(['shipped', 'delivered']);

export function pushConfig(env) {
  const mode = env.MOVILITY_PUSH_MODE || 'off';
  if (mode === 'off') return null;
  if (!['simulated', 'web-push'].includes(mode)) throw new Error('Unknown MOVILITY_PUSH_MODE.');
  const publicKey = env.MOVILITY_PUSH_PUBLIC_KEY;
  const privateKey = env.MOVILITY_PUSH_PRIVATE_KEY;
  if (mode === 'simulated') {
    if (!publicKey && !privateKey) return { mode, publicKey: generateVAPIDKeys().publicKey };
    if (!publicKey || !privateKey) throw new Error('Simulated push needs both VAPID keys or neither.');
    setVapidDetails(env.MOVILITY_PUSH_SUBJECT || 'mailto:qa@example.invalid', publicKey, privateKey);
    return { mode, publicKey };
  }
  if (!publicKey || !privateKey || !env.MOVILITY_PUSH_SUBJECT) throw new Error('Web Push requires a VAPID key pair and contact.');
  setVapidDetails(env.MOVILITY_PUSH_SUBJECT, publicKey, privateKey);
  return { mode, publicKey };
}

export function setupPush(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), endpoint TEXT NOT NULL,
      public_key TEXT NOT NULL, auth TEXT NOT NULL, locale TEXT NOT NULL,
      mode TEXT NOT NULL, expires_at INTEGER NOT NULL, UNIQUE(order_id, endpoint)
    );
    CREATE TABLE IF NOT EXISTS push_jobs (
      id INTEGER PRIMARY KEY, subscription_id INTEGER NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
      kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
      next_at INTEGER NOT NULL, lease TEXT, lease_until INTEGER, UNIQUE(subscription_id, kind)
    );
    CREATE INDEX IF NOT EXISTS push_jobs_due ON push_jobs(status, next_at);
  `);
  if (!db.prepare('PRAGMA table_info(push_subscriptions)').all().some(column => column.name === 'disabled_at')) {
    db.exec('ALTER TABLE push_subscriptions ADD COLUMN disabled_at INTEGER');
  }
  if (!db.prepare('PRAGMA table_info(push_jobs)').all().some(column => column.name === 'path')) {
    db.exec('ALTER TABLE push_jobs ADD COLUMN path TEXT');
  }
}

function endpointUrl(value) {
  if (typeof value !== 'string' || value.length > 1024) return null;
  let url;
  try { url = new URL(value); } catch { return null; }
  const known = hosts.has(url.hostname) || /^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname) ||
    /^[a-z0-9-]+\.push\.apple\.com$/.test(url.hostname);
  if (!known || url.protocol !== 'https:' || url.port || url.username || url.password || url.hash ||
      url.pathname === '/' || value !== url.href) return null;
  return url.href;
}

function base64url(value, bytes) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value) || value.length > 90) return null;
  const decoded = Buffer.from(value, 'base64url');
  return decoded.length === bytes && decoded.toString('base64url') === value ? decoded : null;
}

export function pushSubscription(input) {
  const endpoint = endpointUrl(input?.endpoint);
  const publicKey = base64url(input?.keys?.p256dh, 65);
  const auth = base64url(input?.keys?.auth, 16);
  if (!endpoint || !publicKey || !auth || publicKey[0] !== 4) return null;
  try { ECDH.convertKey(publicKey, 'prime256v1'); } catch { return null; }
  return { endpoint, publicKey: input.keys.p256dh, auth: input.keys.auth };
}

export function pushState(db, id, endpoint, mode, now = seconds()) {
  const valid = endpointUrl(endpoint);
  return Boolean(valid && db.prepare(`SELECT 1 FROM push_subscriptions
    WHERE order_id = ? AND endpoint = ? AND mode = ? AND expires_at > ?`).get(id, valid, mode, now));
}

export function addPushSubscription(db, id, subscription, locale, mode, now = seconds()) {
  db.prepare('DELETE FROM push_subscriptions WHERE order_id = ? AND endpoint = ? AND mode <> ?').run(id, subscription.endpoint, mode);
  db.prepare(`INSERT INTO push_subscriptions (order_id, endpoint, public_key, auth, locale, mode, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(order_id, endpoint) DO UPDATE
    SET public_key = excluded.public_key, auth = excluded.auth, locale = excluded.locale, expires_at = excluded.expires_at`)
    .run(id, subscription.endpoint, subscription.publicKey, subscription.auth, locale, mode, now + days);
}

export function purgePush(db, now = seconds()) {
  const due = db.prepare('SELECT id FROM push_subscriptions WHERE disabled_at IS NULL AND expires_at <= ?').all(now);
  for (const { id } of due) deactivate(db, id, now);
  db.prepare('DELETE FROM push_subscriptions WHERE disabled_at <= ?').run(now - days);
}

function deactivate(db, id, now) {
  db.prepare(`UPDATE push_jobs SET status = 'canceled', lease = NULL, lease_until = NULL
    WHERE subscription_id = ? AND status IN ('queued', 'sending')`).run(id);
  db.prepare(`UPDATE push_subscriptions SET endpoint = ?, public_key = '', auth = '', disabled_at = ?, expires_at = ?
    WHERE id = ? AND disabled_at IS NULL`).run('inactive:' + randomUUID(), now, now, id);
}

export function removePushSubscription(db, id, endpoint, now = seconds()) {
  const valid = endpointUrl(endpoint);
  const subscription = valid && db.prepare('SELECT id FROM push_subscriptions WHERE order_id = ? AND endpoint = ?').get(id, valid);
  if (subscription) deactivate(db, subscription.id, now);
}

export function queuePush(db, orderId, kind, path, now = seconds()) {
  if (!allowedKind.has(kind)) return;
  db.prepare(`INSERT OR IGNORE INTO push_jobs (subscription_id, kind, next_at, path)
    SELECT id, ?, ?, ? FROM push_subscriptions WHERE order_id = ? AND disabled_at IS NULL AND expires_at > ?`).run(kind, now, path || null, orderId, now);
}

const copy = {
  'de-CH': {
    title: 'Hinweise zum Versand', description: 'Erhalte einen kurzen Hinweis, wenn die Bestellung versendet oder zugestellt wird.',
    on: 'Hinweise aktivieren', off: 'Hinweise deaktivieren', enabled: 'Hinweise für diese Bestellung sind aktiviert.',
    disabled: 'Hinweise für diese Bestellung sind deaktiviert.', blocked: 'Der Browser erlaubt keine Benachrichtigungen.',
    unavailable: 'Dieser Browser unterstützt hier keine Push-Benachrichtigungen.', failed: 'Die Änderung konnte nicht gespeichert werden.',
    demo: 'Testmodus. Das Abonnieren ist möglich; der Versand wird simuliert.',
    shipped: 'Deine Bestellung wurde versendet.', delivered: 'Deine Bestellung wurde zugestellt.',
  },
  'fr-CH': {
    title: 'Notifications de livraison', description: 'Recevez un bref avis à l’expédition et à la livraison de votre commande.',
    on: 'Activer les notifications', off: 'Désactiver les notifications', enabled: 'Les notifications de cette commande sont activées.',
    disabled: 'Les notifications de cette commande sont désactivées.', blocked: 'Le navigateur n’autorise pas les notifications.',
    unavailable: 'Ce navigateur ne prend pas en charge les notifications push ici.', failed: 'La modification n’a pas pu être enregistrée.',
    demo: 'Mode de test. L’abonnement est possible, avec un envoi simulé.',
    shipped: 'Votre commande a été expédiée.', delivered: 'Votre commande a été livrée.',
  },
};

export function pushPayload(job) {
  return { title: 'Mobility', body: copy[job.locale][job.kind], path: job.path,
    tag: 'movility-' + job.order_id + '-' + job.kind };
}

export function pushControls(locale, order, config, maySubscribe) {
  if (!config) return '';
  const l = copy[locale];
  const attributes = ['enabled', 'disabled', 'blocked', 'unavailable', 'failed']
    .map(key => `data-${key}="${escapeHtml(l[key])}"`).join(' ');
  return `<section class="order-push" data-push="/${locale}/orders/${order.id}/push" data-key="${config.publicKey}" ${attributes}>
    <h2>${l.title}</h2><p>${l.description}</p>${config.mode === 'simulated' ? `<p>${l.demo}</p>` : ''}
    <div class="product-actions">${maySubscribe ? `<button class="secondary" type="button" data-subscribe disabled>${l.on}</button>` : ''}
      <button class="secondary" type="button" data-unsubscribe disabled>${l.off}</button></div>
    <p role="status" data-push-status></p><script src="/assets/order-push.js" defer></script></section>`;
}

export function makePushSender(config) {
  if (config.mode === 'simulated') return async () => {};
  return async job => {
    if (!endpointUrl(job.endpoint)) throw Object.assign(new Error('Unsupported push endpoint'), { statusCode: 410 });
    if (!/^\/(?:de-CH|fr-CH)\/shipment\/[A-Za-z0-9_-]{43}$/.test(job.path || '')) {
      throw Object.assign(new Error('Missing tracking path'), { statusCode: 400 });
    }
    await sendNotification({ endpoint: job.endpoint, keys: { p256dh: job.public_key, auth: job.auth } },
      JSON.stringify(pushPayload(job)), { TTL: 3600, timeout: 12000, urgency: 'normal' });
  };
}

export async function deliverPush(db, transaction, config, sender = makePushSender(config), clock = seconds) {
  for (let i = 0; i < 10; i++) {
    const job = transaction(() => {
      const now = clock();
      purgePush(db, now);
      db.prepare(`UPDATE push_jobs SET status = CASE WHEN attempts >= 3 THEN 'failed' ELSE 'queued' END,
        lease = NULL, lease_until = NULL WHERE status = 'sending' AND lease_until <= ?`).run(now);
      const next = db.prepare(`SELECT jobs.*, sub.order_id, sub.locale, sub.endpoint, sub.public_key, sub.auth, sub.mode
        FROM push_jobs AS jobs JOIN push_subscriptions AS sub ON jobs.subscription_id = sub.id
        WHERE jobs.status = 'queued' AND jobs.next_at <= ? AND sub.disabled_at IS NULL AND sub.mode = ? ORDER BY jobs.id LIMIT 1`).get(now, config.mode);
      if (!next) return null;
      const lease = randomUUID();
      db.prepare("UPDATE push_jobs SET status = 'sending', lease = ?, lease_until = ?, attempts = attempts + 1 WHERE id = ?")
        .run(lease, now + 60, next.id);
      return { ...next, lease };
    });
    if (!job) return;
    let outcome = 'sent';
    try { await sender(job); }
    catch (error) {
      const code = error?.statusCode;
      outcome = [404, 410].includes(code) ? 'expired'
        : (job.attempts < 2 && (!code || code === 429 || code >= 500)) ? 'queued' : 'failed';
    }
    transaction(() => {
      const active = db.prepare("SELECT 1 FROM push_jobs WHERE id = ? AND lease = ? AND status = 'sending'").get(job.id, job.lease);
      if (!active) return;
      if (outcome === 'expired') {
        db.prepare("UPDATE push_jobs SET status = 'failed', lease = NULL, lease_until = NULL WHERE id = ?").run(job.id);
        const matches = db.prepare('SELECT id FROM push_subscriptions WHERE endpoint = ? AND mode = ?').all(job.endpoint, job.mode);
        for (const { id } of matches) deactivate(db, id, clock());
      } else {
        db.prepare('UPDATE push_jobs SET status = ?, next_at = ?, lease = NULL, lease_until = NULL WHERE id = ?')
          .run(outcome, clock() + 60, job.id);
      }
    });
  }
}

export function pushAdmin(db, config, filterId) {
  const jobs = db.prepare(`SELECT jobs.kind, jobs.status, jobs.attempts, sub.order_id, sub.mode
    FROM push_jobs AS jobs JOIN push_subscriptions AS sub ON sub.id = jobs.subscription_id
    WHERE (? = '' OR sub.order_id = ?) ORDER BY jobs.id DESC LIMIT 100`).all(filterId, filterId);
  const labels = { queued: 'Pendiente', sending: 'Procesando', sent: 'Aceptado por el servicio',
    failed: 'Fallido', canceled: 'Cancelado' };
  return adminHtml`<a href="/admin">Volver a administración</a><h1 class="page-title">Avisos push</h1>
    ${!config ? adminHtml`<p>Los avisos push están desactivados.</p>` : ''}
    ${filterId ? adminHtml`<p><a href="/admin/push">Ver todos los avisos push</a></p>` : ''}
    <p>La aceptación del servicio no confirma que el aviso se haya mostrado en el dispositivo.</p>
    ${jobs.length ? adminHtml`<div class="inventory-table"><table><thead><tr><th scope="col">Pedido</th>
      <th scope="col">Evento</th><th scope="col">Estado</th><th scope="col">Intentos</th></tr></thead>
      <tbody>${jobs.map(job => adminHtml`<tr><th scope="row"><a href="/admin/orders/${job.order_id}">${job.order_id}</a></th>
        <td>${adminText(job.kind === 'shipped' ? 'Expedición' : 'Entrega')}</td>
        <td>${adminText(job.status === 'sent' && job.mode === 'simulated' ? 'Aceptado en simulación' : labels[job.status])}</td>
        <td>${job.attempts}</td></tr>`).join('')}</tbody></table></div>`
      : adminHtml`<p>No hay avisos push para mostrar.</p>`}`;
}
