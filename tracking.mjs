import { adminHtml, adminText } from './admin-language.mjs';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { escapeHtml } from './views.mjs';

const statusLabels = {
  es: { transit: 'En tránsito', delivered: 'Entregado', exception: 'Incidencia de entrega' },
  'de-CH': { transit: 'Unterwegs', delivered: 'Zugestellt', exception: 'Zustellproblem' },
  'fr-CH': { transit: 'En transit', delivered: 'Livré', exception: 'Incident de livraison' },
};
const headings = { es: 'Seguimiento del transportista', 'de-CH': 'Sendungsverlauf', 'fr-CH': 'Historique de livraison' };
const orderId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

export function setupTracking(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS tracking_events (
      id INTEGER PRIMARY KEY, source TEXT NOT NULL, event_key TEXT NOT NULL,
      order_id TEXT NOT NULL REFERENCES orders(id), tracking TEXT NOT NULL,
      event_status TEXT NOT NULL CHECK(event_status IN ('transit','delivered','exception')),
      occurred_at INTEGER NOT NULL, UNIQUE(source, event_key)
    );
    CREATE INDEX IF NOT EXISTS tracking_by_order ON tracking_events(order_id, occurred_at);
    CREATE TABLE IF NOT EXISTS shipment_tracking_started (
      order_id TEXT PRIMARY KEY REFERENCES orders(id), started_at INTEGER NOT NULL
    );
  `);
}

export function trackingStart(db, id, now = Date.now()) {
  db.prepare('INSERT OR IGNORE INTO shipment_tracking_started VALUES (?, ?)').run(id, now);
}

export function normalizeTrackingEvent(input, source, now = Date.now()) {
  if (!input || typeof input !== 'object' || typeof input.eventId !== 'string' ||
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$/.test(input.eventId) || typeof input.orderId !== 'string' ||
      !orderId.test(input.orderId) || typeof input.tracking !== 'string' || !input.tracking ||
      input.tracking.length > 80 || typeof input.status !== 'string' || !Object.hasOwn(statusLabels.es, input.status) ||
      typeof input.occurredAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(input.occurredAt)) return null;
  const time = Date.parse(input.occurredAt);
  if (!Number.isFinite(time) || time > now + 300000) return null;
  const iso = new Date(time).toISOString();
  if (input.occurredAt !== iso && input.occurredAt !== iso.replace('.000Z', 'Z')) return null;
  return { source, key: input.eventId, orderId: input.orderId, tracking: input.tracking, status: input.status, time };
}

export function trackingEvents(db, id) {
  return db.prepare('SELECT * FROM tracking_events WHERE order_id = ? ORDER BY occurred_at DESC, id DESC').all(id);
}

export function applyTrackingEvent(db, event, onDelivery) {
  const prior = db.prepare('SELECT * FROM tracking_events WHERE source = ? AND event_key = ?').get(event.source, event.key);
  if (prior) return prior.order_id === event.orderId && prior.tracking === event.tracking &&
    prior.event_status === event.status && prior.occurred_at === event.time ? 'duplicate' : 'conflict';

  const order = db.prepare('SELECT tracking FROM orders WHERE id = ?').get(event.orderId);
  if (!order?.tracking || order.tracking !== event.tracking) return 'unmatched';
  const starts = db.prepare('SELECT started_at FROM shipment_tracking_started WHERE order_id = ?').get(event.orderId);
  if (starts && event.time < starts.started_at - 300000) return 'unmatched';
  const firstDelivery = event.status === 'delivered' && !db.prepare(
    "SELECT 1 FROM tracking_events WHERE order_id = ? AND event_status = 'delivered'").get(event.orderId);
  db.prepare('INSERT INTO tracking_events (source, event_key, order_id, tracking, event_status, occurred_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(event.source, event.key, event.orderId, event.tracking, event.status, event.time);
  if (firstDelivery) onDelivery(event.orderId);
  return 'applied';
}

export function trackingHistory(locale, events) {
  if (!events.length) return '';
  const l = statusLabels[locale];
  const current = events.find(event => event.event_status === 'delivered') || events[0];
  const format = new Intl.DateTimeFormat(locale, {dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Zurich'});
  return `<section class="carrier-history"><h3>${headings[locale]}</h3>
    <p><strong>${l[current.event_status]}</strong></p>
    <ol>${events.slice(0, 20).map(event => `<li>${l[event.event_status]} · <time datetime="${new Date(event.occurred_at).toISOString()}">${format.format(event.occurred_at)}</time></li>`).join('')}</ol></section>`;
}

export function trackingForm(order) {
  if (!order.tracking) return '';
  return adminHtml`<form class="tracking-form" method="post" action="/admin/${order.id}/tracking">
    <input type="hidden" name="eventId" value="${randomUUID()}">
    <label>Evento de prueba <select name="status" required><option value="">Selecciona el evento</option>
      ${Object.entries(statusLabels.es).map(([key, label]) => adminHtml`<option value="${key}">${escapeHtml(adminText(label))}</option>`).join('')}
    </select></label><button class="secondary">Registrar evento</button></form>`;
}

export function manualTrackingEvent(db, order, eventId, status) {
  const existing = db.prepare("SELECT occurred_at FROM tracking_events WHERE source = 'simulation' AND event_key = ?").get(eventId);
  return normalizeTrackingEvent({ eventId, status, orderId: order.id, tracking: order.tracking,
    occurredAt: new Date(existing?.occurred_at ?? Date.now()).toISOString() }, 'simulation');
}

export function carrierSignatureValid(secret, unixSeconds, signature, body, now = Date.now()) {
  if (typeof unixSeconds !== 'string' || !/^\d{10}$/.test(unixSeconds) ||
      Math.abs(Math.floor(now / 1000) - Number(unixSeconds)) > 300 ||
      typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(unixSeconds + '.').update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}

export async function readCarrierBody(req, limit = 4096) {
  if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return null;
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > limit) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
