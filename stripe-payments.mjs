import { adminFragment, adminHtml, adminText } from './admin-language.mjs';
import Stripe from 'stripe';
import { escapeHtml, money } from './views.mjs';

const choices = { card: 'Tarjeta', twint: 'TWINT', paypal: 'PayPal' };
export const stripeMode = (env, origin) => {
  const mode = env.MOVILITY_PAYMENT_MODE || 'simulated';
  const live = mode === 'stripe-live';
  const testKey = env.MOVILITY_STRIPE_SECRET_KEY;
  const testSecret = env.MOVILITY_STRIPE_WEBHOOK_SECRET;
  const liveKey = env.MOVILITY_STRIPE_LIVE_SECRET_KEY;
  const liveSecret = env.MOVILITY_STRIPE_LIVE_WEBHOOK_SECRET;
  if (mode === 'simulated' && !liveKey && !liveSecret && ![testKey, testSecret].some(value => value?.startsWith('sk_live_'))) return null;
  const key = live ? liveKey : testKey;
  const secret = live ? liveSecret : testSecret;
  if (!['stripe-test', 'stripe-live'].includes(mode) || (live ? testKey || testSecret : liveKey || liveSecret) ||
      !(live ? /^sk_live_[A-Za-z0-9]+$/ : /^sk_test_[A-Za-z0-9]+$/).test(key || '') ||
      !/^whsec_[A-Za-z0-9]+$/.test(secret || '') || !origin) {
    throw new Error('Stripe mode requires matching test/live credentials, a signing secret and an HTTPS public origin. Do not mix modes.');
  }
  if (live && (env.MOVILITY_STAGE !== 'production' || env.MOVILITY_ENABLE_LIVE !== '1')) {
    throw new Error('Stripe live requires MOVILITY_STAGE=production and MOVILITY_ENABLE_LIVE=1.');
  }
  const enabled = (env.MOVILITY_STRIPE_METHODS || 'card').split(',').map(value => value.trim());
  if (!enabled.length || enabled.some(key => !Object.hasOwn(choices, key))) throw new Error('Unknown Stripe method.');
  return { client: new Stripe(key, { timeout: 12000, maxNetworkRetries: 0 }),
    secret, live, origin, methods: [...new Set(enabled)].map(key => choices[key]) };
};

export function stripeType(method) {
  return Object.keys(choices).find(key => choices[key] === method);
}
export function stripeMethodsFor(config, cents) {
  return config?.methods.filter(method => method !== 'TWINT' || (cents >= 50 && cents <= 500000));
}

export function createCheckout(config, attempt) {
  if (Boolean(attempt.livemode) !== Boolean(config.live)) throw new Error('Stripe attempt belongs to a different mode.');
  const data = JSON.parse(attempt.payload);
  const returnUrl = `${config.origin}/${data.locale}/payment/${attempt.id}`;
  return config.client.checkout.sessions.create({
    mode: 'payment', locale: data.locale === 'de-CH' ? 'de' : 'fr', adaptive_pricing: { enabled: false },
    payment_method_types: [stripeType(attempt.method)],
    client_reference_id: attempt.id, expires_at: attempt.expires_at,
    success_url: returnUrl, cancel_url: returnUrl,
    line_items: [
      ...data.lines.map(line => ({ quantity: line.quantity,
        price_data: { currency: 'chf', unit_amount: line.cents, product_data: { name: line.name } } })),
      ...(data.shipping?.cents > 0 ? [{ quantity: 1, price_data: { currency: 'chf',
        unit_amount: data.shipping.cents, product_data: { name: data.locale === 'de-CH' ? 'Versand' : 'Livraison' } } }] : []),
    ],
  }, { idempotencyKey: (config.live ? 'movility-live-checkout/' : 'movility-test-checkout/') + attempt.id });
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
    return event.livemode === Boolean(config.live) ? event : null;
  } catch { return null; }
}

function sessionMatchesMode(session, live) {
  return session?.livemode === live &&
    (live ? /^cs_live_[A-Za-z0-9]+$/ : /^cs_test_[A-Za-z0-9]+$/).test(session.id || '');
}

export function stripeOutcome(event, live = false) {
  const session = event.data?.object;
  const type = event.type;
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded',
    'checkout.session.async_payment_failed', 'checkout.session.expired'].includes(type)) return null;
  if (session?.object !== 'checkout.session' || !sessionMatchesMode(session, live) || typeof session.client_reference_id !== 'string') return null;
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
  if (!db.prepare('PRAGMA table_info(stripe_attempts)').all().some(column => column.name === 'livemode')) {
    db.exec('ALTER TABLE stripe_attempts ADD COLUMN livemode INTEGER NOT NULL DEFAULT 0 CHECK(livemode IN (0,1))');
  }
}

export const paymentAttempt = (db, id) => db.prepare('SELECT * FROM stripe_attempts WHERE id = ?').get(id);

export function reserveStripe(db, id, method, data, amount, hold, now = Math.floor(Date.now() / 1000), live = false) {
  db.prepare('INSERT INTO stripe_attempts (id, method, cents, payload, expires_at, livemode) VALUES (?, ?, ?, ?, ?, ?)')
    .run(id, method, amount, JSON.stringify(data), now + 32 * 60, Number(live));
  for (const line of data.lines) hold(line);
  return paymentAttempt(db, id);
}

export function saveStripeSession(db, id, session) {
  const url = stripeCheckoutUrl(session.url);
  const attempt = paymentAttempt(db, id);
  if (!url || !attempt || !sessionMatchesMode(session, Boolean(attempt.livemode)) ||
      (session.client_reference_id != null && session.client_reference_id !== id)) return false;
  db.prepare(`UPDATE stripe_attempts SET session_id = ?, checkout_url = ?, state = 'open'
    WHERE id = ? AND state = 'preparing'`).run(session.id, url, id);
  return true;
}

export function applyStripeOutcome(db, outcome, { release, fulfill }) {
  const { session, kind } = outcome;
  const attempt = paymentAttempt(db, session.client_reference_id);
  if (!attempt || !sessionMatchesMode(session, Boolean(attempt.livemode)) || (attempt.session_id && attempt.session_id !== session.id)) return 'ignored';
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
  const l = attempt.livemode ? (locale === 'de-CH' ? {
    ...status[locale], title: 'Stripe-Zahlung', open: 'Deine Zahlung wird geprüft.',
    expired: 'Die Zahlung wurde nicht abgeschlossen.', review: 'Deine Zahlung wird manuell geprüft.',
    resume: 'Stripe-Zahlung öffnen', error: 'Stripe ist momentan nicht erreichbar. Du kannst die Zahlungsseite erneut öffnen.',
  } : {
    ...status[locale], title: 'Paiement Stripe', open: 'Votre paiement est en cours de vérification.',
    expired: 'Le paiement n’a pas été finalisé.', review: 'Votre paiement est en cours de vérification manuelle.',
    resume: 'Ouvrir le paiement Stripe', error: 'Stripe est momentanément indisponible. Vous pouvez rouvrir la page de paiement.',
  }) : status[locale];
  const path = `/${locale}/payment/${attempt.id}`;
  return `<section class="confirmation"><h1 class="page-title">${l.title}</h1>
    <p>${error ? l.error : l[attempt.state]}</p>
    ${attempt.state === 'preparing' || attempt.state === 'open' ? `<div class="product-actions">
      ${attempt.expires_at > Math.floor(Date.now() / 1000) ? `<form method="post" action="${path}"><button>${l.resume}</button></form>` : ''}
      <a href="${path}">${l.retry}</a></div>` : `<a href="/${locale}/cart">${l.back}</a>`}</section>`;
}

export function stripeAdmin(attempts, openOnly = false, live = false) {
  const labels = { preparing: 'Preparando', open: 'Pendiente', paid: 'Confirmado', expired: 'Caducado', review: 'En revisión' };
  return adminHtml`<a href="/admin">Volver a administración</a><h1 class="page-title">${adminText(live ? 'Pagos con Stripe' : 'Pagos de prueba con Stripe')}</h1>
    <p>Las sesiones pendientes reservan stock hasta recibir la confirmación o la caducidad de Stripe.</p>
    <p><a href="/admin/stripe${openOnly ? '' : '?status=open'}">${adminText(openOnly ? 'Ver todas las sesiones' : 'Ver reservas abiertas')}</a></p>
    ${attempts.length ? adminHtml`<div class="inventory-table"><table><thead><tr><th scope="col">Referencia</th>
    <th scope="col">Método</th><th scope="col">Importe</th><th scope="col">Estado</th></tr></thead><tbody>
    ${attempts.map(attempt => adminHtml`<tr><th scope="row">${escapeHtml(attempt.id)}</th><td>${escapeHtml(attempt.method)}</td>
    <td>${money('es', attempt.cents)}</td><td>${adminText(labels[attempt.state])}</td></tr>`).join('')}</tbody></table></div>`
    : adminHtml`<p>${adminText(openOnly ? 'No hay reservas abiertas.' : 'Todavía no hay sesiones de Stripe.')}</p>`}`;
}
