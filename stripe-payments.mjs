import Stripe from 'stripe';
import { escapeHtml, money } from './views.mjs';

const choices = { card: 'Tarjeta', twint: 'TWINT', paypal: 'PayPal' };
export const stripeMode = (env, origin) => {
  const mode = env.MOVILITY_PAYMENT_MODE || 'simulated';
  if (mode === 'simulated') return null;
  if (mode !== 'stripe-test' || !/^sk_test_[A-Za-z0-9]+$/.test(env.MOVILITY_STRIPE_SECRET_KEY || '') ||
      !/^whsec_[A-Za-z0-9]+$/.test(env.MOVILITY_STRIPE_WEBHOOK_SECRET || '') || !origin) {
    throw new Error('Stripe test requires a test secret key, a webhook secret and an HTTPS public origin.');
  }
  const enabled = (env.MOVILITY_STRIPE_METHODS || 'card').split(',').map(value => value.trim());
  if (!enabled.length || enabled.some(key => !Object.hasOwn(choices, key))) throw new Error('Unknown Stripe method.');
  return { client: new Stripe(env.MOVILITY_STRIPE_SECRET_KEY, { timeout: 12000, maxNetworkRetries: 0 }),
    secret: env.MOVILITY_STRIPE_WEBHOOK_SECRET, origin, methods: [...new Set(enabled)].map(key => choices[key]) };
};

export function stripeType(method) {
  return Object.keys(choices).find(key => choices[key] === method);
}
export function stripeMethodsFor(config, cents) {
  return config?.methods.filter(method => method !== 'TWINT' || (cents >= 50 && cents <= 500000));
}

export function createCheckout(config, attempt) {
  const data = JSON.parse(attempt.payload);
  const returnUrl = `${config.origin}/${data.locale}/payment/${attempt.id}`;
  return config.client.checkout.sessions.create({
    mode: 'payment', locale: data.locale === 'de-CH' ? 'de' : 'fr', adaptive_pricing: { enabled: false },
    payment_method_types: [stripeType(attempt.method)],
    client_reference_id: attempt.id, expires_at: attempt.expires_at,
    success_url: returnUrl, cancel_url: returnUrl,
    line_items: data.lines.map(line => ({ quantity: line.quantity,
      price_data: { currency: 'chf', unit_amount: line.cents, product_data: { name: line.name } },
    })),
  }, { idempotencyKey: 'movility-test-checkout/' + attempt.id });
}

export function stripeCheckoutUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === 'https://checkout.stripe.com' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function verifyStripeEvent(config, body, signature) {
  if (typeof signature !== 'string') return null;
  try {
    const event = config.client.webhooks.constructEvent(body, signature, config.secret);
    return event.livemode === false ? event : null;
  } catch { return null; }
}

export function stripeOutcome(event) {
  const session = event.data?.object;
  const type = event.type;
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed', 'checkout.session.expired'].includes(type)) return null;
  if (session?.object !== 'checkout.session' || session.livemode !== false || typeof session.id !== 'string' ||
      !/^cs_test_[A-Za-z0-9]+$/.test(session.id) || typeof session.client_reference_id !== 'string') return null;
  if (['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(type)) {
    if (session.payment_status !== 'paid' || typeof session.payment_intent !== 'string') return null;
    return { kind: 'paid', session };
  }
  return session.payment_status === 'unpaid' ? { kind: 'expired', session } : null;
}

export function setupStripePayments(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stripe_attempts (
      id TEXT PRIMARY KEY, method TEXT NOT NULL, cents INTEGER NOT NULL, payload TEXT NOT NULL,
      expires_at INTEGER NOT NULL, state TEXT NOT NULL DEFAULT 'preparing',
      session_id TEXT UNIQUE, checkout_url TEXT, payment_intent TEXT UNIQUE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
}

export const paymentAttempt = (db, id) => db.prepare('SELECT * FROM stripe_attempts WHERE id = ?').get(id);

export function reserveStripe(db, id, method, data, amount, hold, now = Math.floor(Date.now() / 1000)) {
  db.prepare('INSERT INTO stripe_attempts (id, method, cents, payload, expires_at) VALUES (?, ?, ?, ?, ?)')
    .run(id, method, amount, JSON.stringify(data), now + 32 * 60);
  for (const line of data.lines) hold(line);
  return paymentAttempt(db, id);
}

export function saveStripeSession(db, id, session) {
  const url = stripeCheckoutUrl(session.url);
  if (!url || session.livemode !== false || typeof session.id !== 'string' || !/^cs_test_[A-Za-z0-9]+$/.test(session.id)) return false;
  db.prepare(`UPDATE stripe_attempts SET session_id = ?, checkout_url = ?, state = 'open'
    WHERE id = ? AND state = 'preparing'`).run(session.id, url, id);
  return true;
}

export function applyStripeOutcome(db, outcome, { release, fulfill }) {
  const { session, kind } = outcome;
  const attempt = paymentAttempt(db, session.client_reference_id);
  if (!attempt || (attempt.session_id && attempt.session_id !== session.id)) return 'ignored';
  if (attempt.state === 'paid') {
    return kind === 'paid' && attempt.payment_intent === session.payment_intent ? 'duplicate' : 'ignored';
  }
  if (attempt.state === 'review') return 'review';
  if (attempt.state === 'expired' && kind === 'expired') return 'duplicate';
  if (session.currency !== 'chf' || session.amount_total !== attempt.cents ||
      !Array.isArray(session.payment_method_types) || !session.payment_method_types.includes(stripeType(attempt.method)) ||
      (attempt.state === 'expired' && kind === 'paid') ||
      (kind === 'paid' && db.prepare('SELECT 1 FROM stripe_attempts WHERE payment_intent = ? AND id <> ?').get(session.payment_intent, attempt.id))) {
    db.prepare("UPDATE stripe_attempts SET state = 'review', session_id = COALESCE(session_id, ?) WHERE id = ?").run(session.id, attempt.id);
    return 'review';
  }
  const data = JSON.parse(attempt.payload);
  if (kind === 'expired') {
    for (const line of data.lines) release(line);
    db.prepare("UPDATE stripe_attempts SET state = 'expired', session_id = ? WHERE id = ?").run(session.id, attempt.id);
    return 'expired';
  }
  fulfill(attempt, data);
  db.prepare("UPDATE stripe_attempts SET state = 'paid', session_id = ?, payment_intent = ? WHERE id = ?")
    .run(session.id, session.payment_intent, attempt.id);
  return 'paid';
}

const status = {
  'de-CH': { title: 'Stripe-Testzahlung', preparing: 'Die Zahlungsseite wird vorbereitet.', open: 'Die Testzahlung wird geprüft.',
    expired: 'Die Testzahlung wurde nicht abgeschlossen.', review: 'Die Testzahlung wird manuell geprüft.',
    retry: 'Status aktualisieren', resume: 'Stripe-Testzahlung öffnen', back: 'Zum Warenkorb',
    error: 'Stripe ist momentan nicht erreichbar. Die Testzahlung kann erneut geöffnet werden.',
  },
  'fr-CH': { title: 'Paiement test Stripe', preparing: 'La page de paiement est en cours de préparation.', open: 'Le paiement de test est en cours de vérification.',
    expired: 'Le paiement de test n’a pas été finalisé.', review: 'Le paiement de test est en cours de vérification manuelle.',
    retry: 'Actualiser le statut', resume: 'Ouvrir le paiement test Stripe', back: 'Retour au panier',
    error: 'Stripe est momentanément indisponible. Vous pouvez rouvrir le paiement test.',
  },
};

export function stripeStatus(locale, attempt, error = false) {
  const l = status[locale];
  const path = `/${locale}/payment/${attempt.id}`;
  return `<section class="confirmation"><h1 class="page-title">${l.title}</h1>
    <p>${error ? l.error : l[attempt.state]}</p>
    ${attempt.state === 'preparing' || attempt.state === 'open' ? `<div class="product-actions">
      ${attempt.expires_at > Math.floor(Date.now() / 1000) ? `<form method="post" action="${path}"><button>${l.resume}</button></form>` : ''}
      <a href="${path}">${l.retry}</a></div>` : `<a href="/${locale}/cart">${l.back}</a>`}</section>`;
}

export function stripeAdmin(attempts) {
  const labels = { preparing: 'Preparando', open: 'Pendiente', paid: 'Confirmado', expired: 'Caducado', review: 'En revisión' };
  return `<a href="/admin">Volver a administración</a><h1 class="page-title">Pagos de prueba con Stripe</h1>
    <p>Las sesiones pendientes reservan stock hasta recibir la confirmación o la caducidad de Stripe.</p>
    ${attempts.length ? `<div class="inventory-table"><table><thead><tr><th scope="col">Referencia</th>
    <th scope="col">Método</th><th scope="col">Importe</th><th scope="col">Estado</th></tr></thead><tbody>
    ${attempts.map(attempt => `<tr><th scope="row">${escapeHtml(attempt.id)}</th><td>${escapeHtml(attempt.method)}</td>
    <td>${money('es', attempt.cents)}</td><td>${labels[attempt.state]}</td></tr>`).join('')}</tbody></table></div>`
    : '<p>Todavía no hay sesiones de Stripe.</p>'}`;
}
