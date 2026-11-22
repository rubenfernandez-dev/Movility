import { randomUUID } from 'node:crypto';
import { escapeHtml } from './views.mjs';

const seconds = () => Math.floor(Date.now() / 1000);
const leaseSeconds = 60;
const retryDelays = [15, 60, 300];

export function setupMailQueue(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS mail_jobs (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL, kind TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued' CHECK(status IN ('queued', 'sending', 'delivered', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0, attempt_limit INTEGER NOT NULL DEFAULT 4,
      next_at INTEGER NOT NULL, lease TEXT, lease_until INTEGER, provider_ref TEXT,
      UNIQUE(order_id, kind), FOREIGN KEY(order_id, kind) REFERENCES email_previews(order_id, kind)
    );
    CREATE INDEX IF NOT EXISTS mail_jobs_due ON mail_jobs(status, next_at);
    CREATE TABLE IF NOT EXISTS mail_attempts (
      job_id TEXT NOT NULL REFERENCES mail_jobs(id), attempt INTEGER NOT NULL,
      started_at INTEGER NOT NULL, finished_at INTEGER, outcome TEXT,
      PRIMARY KEY(job_id, attempt)
    );
    CREATE TABLE IF NOT EXISTS simulated_mail_receipts (
      job_id TEXT PRIMARY KEY REFERENCES mail_jobs(id), reference TEXT NOT NULL
    );
  `);
}

export function queueEmail(db, orderId, kind, now = seconds()) {
  db.prepare('INSERT OR IGNORE INTO mail_jobs (id, order_id, kind, next_at) VALUES (?, ?, ?, ?)')
    .run(randomUUID(), orderId, kind, now);
}

function claim(db, transaction, now) {
  return transaction(() => {
    const expired = db.prepare("SELECT id, attempts, attempt_limit FROM mail_jobs WHERE status = 'sending' AND lease_until <= ?").all(now);
    for (const job of expired) {
      db.prepare("UPDATE mail_attempts SET outcome = 'expired', finished_at = ? WHERE job_id = ? AND attempt = ?")
        .run(now, job.id, job.attempts);
      db.prepare('UPDATE mail_jobs SET status = ?, next_at = ?, lease = NULL, lease_until = NULL WHERE id = ?')
        .run(job.attempts < job.attempt_limit ? 'queued' : 'failed', now, job.id);
    }
    const job = db.prepare(`SELECT job.*, orders.email, orders.locale, email_previews.subject, email_previews.body
      FROM mail_jobs AS job JOIN orders ON orders.id = job.order_id
      JOIN email_previews ON email_previews.order_id = job.order_id AND email_previews.kind = job.kind
      WHERE job.status = 'queued' AND job.next_at <= ? AND NOT EXISTS (
        SELECT 1 FROM mail_jobs AS earlier WHERE earlier.order_id = job.order_id AND earlier.rowid < job.rowid
        AND earlier.status IN ('queued', 'sending'))
      ORDER BY job.rowid LIMIT 1`).get(now);
    if (!job) return null;
    const lease = randomUUID();
    const attempt = job.attempts + 1;
    db.prepare("UPDATE mail_jobs SET status = 'sending', attempts = ?, lease = ?, lease_until = ? WHERE id = ?")
      .run(attempt, lease, now + leaseSeconds, job.id);
    db.prepare('INSERT INTO mail_attempts (job_id, attempt, started_at) VALUES (?, ?, ?)').run(job.id, attempt, now);
    return { ...job, attempt, lease };
  });
}

function settle(db, transaction, job, result, now) {
  transaction(() => {
    const accepted = result.status === 'accepted';
    const retry = result.status === 'temporary' && job.attempt < job.attempt_limit;
    const status = accepted ? 'delivered' : retry ? 'queued' : 'failed';
    const delay = retry ? retryDelays[Math.min(job.attempt - 1, retryDelays.length - 1)] : 0;
    const updated = db.prepare(`UPDATE mail_jobs SET status = ?, next_at = ?, lease = NULL, lease_until = NULL, provider_ref = ?
      WHERE id = ? AND status = 'sending' AND lease = ?`).run(status, now + delay, accepted ? result.reference : null, job.id, job.lease);
    if (updated.changes) db.prepare('UPDATE mail_attempts SET finished_at = ?, outcome = ? WHERE job_id = ? AND attempt = ?')
      .run(now, result.status, job.id, job.attempt);
  });
}

export async function deliverBatch(db, transaction, provider, clock = seconds, limit = 12) {
  let handled = 0;
  for (; handled < limit; handled++) {
    const job = claim(db, transaction, clock());
    if (!job) break;
    let result;
    try {
      result = await provider({ key: job.id, email: job.email, locale: job.locale, subject: job.subject, body: job.body, orderId: job.order_id });
      if (!['accepted', 'temporary', 'permanent'].includes(result?.status) ||
          (result.status === 'accepted' && (typeof result.reference !== 'string' || !result.reference))) result = { status: 'temporary' };
    } catch {
      result = { status: 'temporary' };
    }
    settle(db, transaction, job, result, clock());
  }
  return handled;
}

export const simulatedMailProvider = db => message => {
  db.prepare('INSERT OR IGNORE INTO simulated_mail_receipts VALUES (?, ?)').run(message.key, 'sim-' + message.key);
  return { status: 'accepted', reference: db.prepare('SELECT reference FROM simulated_mail_receipts WHERE job_id = ?').get(message.key).reference };
};

export function retryEmail(db, id, now = seconds()) {
  return db.prepare(`UPDATE mail_jobs SET status = 'queued', attempt_limit = attempts + 1, next_at = ?
    WHERE id = ? AND status = 'failed'`).run(now, id).changes > 0;
}

const labels = { queued: 'Pendiente', sending: 'Procesando', delivered: 'Aceptado en simulación', failed: 'Requiere revisión' };
const outcomes = { accepted: 'Aceptado', temporary: 'Fallo temporal', permanent: 'Rechazado', expired: 'Interrumpido' };
const kinds = { paid: 'Confirmación', shipped: 'Expedición', refunded: 'Reembolso' };
const date = value => new Date(value * 1000).toISOString().slice(0, 19).replace('T', ' ') + ' UTC';

export function deliveryStatus(db, orderId, kind) {
  const job = db.prepare('SELECT * FROM mail_jobs WHERE order_id = ? AND kind = ?').get(orderId, kind);
  if (!job) return '';
  return `${labels[job.status]} · ${job.attempts} intentos`;
}

export function mailQueuePage(db, canManage, message = '') {
  const jobs = db.prepare('SELECT * FROM mail_jobs ORDER BY rowid DESC LIMIT 100').all();
  const totals = db.prepare('SELECT status, COUNT(*) AS count FROM mail_jobs GROUP BY status').all();
  const cards = jobs.map(job => {
    const attempts = db.prepare('SELECT * FROM mail_attempts WHERE job_id = ? ORDER BY attempt DESC').all(job.id);
    return `<article><h2>${kinds[job.kind]}</h2><p>${labels[job.status]} · ${job.attempts} intentos</p>
      <p><a href="/admin/${job.order_id}/email/${job.kind}">Ver correo del pedido ${job.order_id.slice(0, 8)}</a></p>
      ${job.status === 'queued' ? `<p>Disponible desde ${date(job.next_at)}</p>` : ''}
      ${job.provider_ref ? `<p>Referencia del simulador <code>${escapeHtml(job.provider_ref)}</code></p>` : ''}
      ${attempts.length ? `<details><summary>Historial de intentos</summary><ol>${attempts.map(attempt =>
        `<li>${date(attempt.started_at)} · ${outcomes[attempt.outcome] || 'En curso'}</li>`).join('')}</ol></details>` : ''}
      ${canManage && job.status === 'failed' ? `<form method="post" action="/admin/mail/${job.id}/retry"><button>Reintentar</button></form>` : ''}</article>`;
  }).join('');
  return `<a href="/admin">Volver a administración</a><h1 class="page-title">Cola de correos</h1>
    <p>Proveedor simulado. Los correos se generan a partir de los pedidos de prueba.</p>
    ${message ? `<p class="form-success" role="status">${message}</p>` : ''}
    <dl class="admin-metrics">${Object.entries(labels).map(([key, label]) =>
      `<div><dt>${label}</dt><dd>${totals.find(row => row.status === key)?.count || 0}</dd></div>`).join('')}</dl>
    ${canManage ? '<form method="post" action="/admin/mail/process"><button>Procesar cola ahora</button></form>' : ''}
    ${cards || '<p>Los próximos avisos de compra, envío y reembolso aparecerán aquí.</p>'}`;
}
