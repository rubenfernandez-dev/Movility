import { adminHtml, adminText } from './admin-language.mjs';
export function setupStripeRefunds(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS stripe_refunds (
    order_id TEXT PRIMARY KEY REFERENCES orders(id), refund_id TEXT UNIQUE,
    state TEXT NOT NULL DEFAULT 'requested', requested_at INTEGER NOT NULL
  )`);
}

export const stripeRefund = (db, id) => db.prepare('SELECT * FROM stripe_refunds WHERE order_id = ?').get(id);
export const refundPending = refund => ['requested', 'pending'].includes(refund?.state);
export const refundRetryable = (refund, now = Math.floor(Date.now() / 1000)) =>
  refund.state === 'requested' && now - refund.requested_at < 23 * 3600;

export function requestStripeRefund(db, id, now = Math.floor(Date.now() / 1000)) {
  db.prepare('INSERT OR IGNORE INTO stripe_refunds (order_id, requested_at) VALUES (?, ?)').run(id, now);
  return stripeRefund(db, id);
}

export function sendStripeRefund(config, attempt) {
  return config.client.refunds.create({
    payment_intent: attempt.payment_intent, amount: attempt.cents,
    metadata: { movility_refund: attempt.id },
  }, { idempotencyKey: 'movility-test-refund/' + attempt.id });
}

function matches(result, attempt) {
  return result?.object === 'refund' && /^re_[A-Za-z0-9]+$/.test(result.id || '') &&
    result.payment_intent === attempt.payment_intent && result.amount === attempt.cents &&
    result.currency === 'chf' && result.metadata?.movility_refund === attempt.id;
}

export function saveStripeRefundSubmission(db, attempt, result) {
  if (!matches(result, attempt)) return false;
  db.prepare("UPDATE stripe_refunds SET refund_id = ?, state = 'pending' WHERE order_id = ? AND state = 'requested'")
    .run(result.id, attempt.id);
  return true;
}

export function applyStripeRefundEvent(db, event, finish) {
  const result = event.data?.object;
  const id = result?.metadata?.movility_refund;
  if (typeof id !== 'string') return 'ignored';
  const attempt = db.prepare("SELECT * FROM stripe_attempts WHERE id = ? AND state = 'paid'").get(id);
  const refund = stripeRefund(db, id);
  if (!attempt || !refund || !matches(result, attempt) || (refund.refund_id && refund.refund_id !== result.id)) return 'ignored';
  if (refund.state === 'succeeded') return 'duplicate';
  if (result.status === 'succeeded') {
    finish(id);
    db.prepare("UPDATE stripe_refunds SET state = 'succeeded', refund_id = ? WHERE order_id = ?").run(result.id, id);
    return 'refunded';
  }
  if (refund.state === 'failed') return 'duplicate';
  if (!['pending', 'requires_action', 'failed', 'canceled'].includes(result.status)) return 'ignored';
  const state = ['failed', 'canceled'].includes(result.status) ? 'failed' : 'pending';
  db.prepare('UPDATE stripe_refunds SET state = ?, refund_id = ? WHERE order_id = ?').run(state, result.id, id);
  return state;
}

export function refundControls(order, refund, stripeEnabled) {
  const labels = { requested: 'Solicitud pendiente de enviar o verificar', pending: 'A la espera de Stripe',
    succeeded: 'Confirmado por Stripe', failed: 'Fallido o cancelado en Stripe' };
  return `${refund ? adminHtml`<p>Reembolso Stripe · ${adminText(labels[refund.state])}</p>` : ''}
    ${stripeEnabled && order.status !== 'refunded' && (!refund || refundRetryable(refund))
      ? adminHtml`<form method="post" action="/admin/${order.id}/stripe-refund"><button>${refund
        ? adminText('Reintentar solicitud Stripe') : adminText('Solicitar reembolso total en Stripe (prueba)')}</button></form>` : ''}`;
}
