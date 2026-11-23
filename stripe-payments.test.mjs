import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createCheckout, stripeMode, stripeMethodsFor, stripeCheckoutUrl, applyStripeOutcome,
  setupStripePayments, paymentAttempt, reserveStripe } from './stripe-payments.mjs';
import { requestStripeRefund, sendStripeRefund } from './stripe-refunds.mjs';

const order = { locale: 'fr-CH', email: 'stripe-fixture@example.com',
  address: { name: 'Client Démo', street: 'Rue Test 1', zip: '1201', city: 'Genève' },
  lines: [{ sku: 'one', name: 'Movility One', quantity: 1, cents: 249900 }],
};
const webhookSecret = 'whsec_stripefixtureonly';
const env = { MOVILITY_PAYMENT_MODE: 'stripe-test', MOVILITY_STRIPE_SECRET_KEY: 'sk_test_fixtureonly',
  MOVILITY_STRIPE_WEBHOOK_SECRET: webhookSecret, MOVILITY_STRIPE_METHODS: 'card,twint,paypal' };
const origin = 'https://movility.example';

test('Stripe Checkout uses a stable test request, authoritative totals and method limits', async () => {
  const config = stripeMode(env, origin);
  assert.throws(() => stripeMode({ ...env, MOVILITY_STRIPE_SECRET_KEY: 'sk_live_fixture' }, origin));
  assert.deepEqual(stripeMethodsFor(config, 500000), ['Tarjeta', 'TWINT', 'PayPal']);
  assert.deepEqual(stripeMethodsFor(config, 500001), ['Tarjeta', 'PayPal']);
  assert.equal(stripeCheckoutUrl('https://checkout.stripe.com.evil.example/pay'), null);
  const calls = [];
  const fake = { origin, client: { checkout: { sessions: { create: (body, options) => {
    calls.push({ body, options });
    return { id: 'cs_test_fixture' };
  } } } } };
  const attempt = { id: 'fixture', method: 'TWINT', expires_at: 1800, payload: JSON.stringify(order) };
  await createCheckout(fake, attempt);
  await createCheckout(fake, attempt);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0].options.idempotencyKey, 'movility-test-checkout/fixture');
  assert.equal(calls[0].body.line_items[0].price_data.unit_amount, 249900);
  assert.equal(calls[0].body.line_items[0].price_data.currency, 'chf');
  assert.deepEqual(calls[0].body.payment_method_types, ['twint']);
});

test('Stripe reservations release once and contradictory late payment goes to review', () => {
  const db = new DatabaseSync(':memory:');
  try {
    setupStripePayments(db);
    let units = 1;
    let orders = 0;
    const handlers = { release: line => { units += line.quantity; }, fulfill: () => { orders++; } };
    reserveStripe(db, 'one', 'TWINT', order, 249900, line => { units -= line.quantity; }, 100);
    const session = { client_reference_id: 'one', id: 'cs_test_one', amount_total: 249900,
      currency: 'chf', payment_method_types: ['twint'] };
    assert.equal(units, 0);
    assert.equal(applyStripeOutcome(db, { kind: 'expired', session }, handlers), 'expired');
    assert.equal(applyStripeOutcome(db, { kind: 'expired', session }, handlers), 'duplicate');
    assert.equal(applyStripeOutcome(db, { kind: 'paid', session: { ...session, payment_intent: 'pi_one' } }, handlers), 'review');
    assert.deepEqual([units, orders, paymentAttempt(db, 'one').state], [1, 0, 'review']);
  } finally { db.close(); }
});

test('a signed Stripe test notification confirms exactly one stored order', { timeout: 15000 }, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'movility-stripe-'));
  const dbFile = join(directory, 'test.sqlite');
  const child = spawn(process.execPath, ['server.mjs'], {
    env: { ...process.env, ...env, PORT: '0', MOVILITY_DB: dbFile, MOVILITY_PUBLIC_ORIGIN: origin,
      MOVILITY_EMAIL_MODE: 'simulated', MOVILITY_EMAIL_WORKER: 'manual', MOVILITY_PUSH_MODE: 'off',
      MOVILITY_ADMIN_PASSWORD: 'stripe-test-panel' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      const exit = once(child, 'exit');
      child.kill();
      await exit;
    }
    rmSync(dbFile, { force: true });
    rmdirSync(directory);
  });
  const output = createInterface({ input: child.stdout });
  const [ready] = await once(output, 'line');
  const base = ready.split(' ')[1];
  const checkout = await (await fetch(base + '/fr-CH/checkout')).text();
  assert.match(checkout, /Continuer vers Stripe/);
  assert.doesNotMatch(checkout, /value="paid"/);
  const id = randomUUID();
  const db = new DatabaseSync(dbFile);
  db.exec('PRAGMA busy_timeout = 5000; BEGIN IMMEDIATE');
  reserveStripe(db, id, 'Tarjeta', order, 249900, () => db.exec('UPDATE stock SET units = units - 1 WHERE id = 1'));
  db.exec('COMMIT');
  db.close();
  const statusPath = base + '/fr-CH/payment/' + id;
  assert.match(await (await fetch(statusPath)).text(), /en cours de préparation/);
  assert.equal((await fetch(base + '/fr-CH/orders/' + id)).status, 404);
  const fixture = { id: 'evt_stripefixture', livemode: false, type: 'checkout.session.completed', data: { object: {
    object: 'checkout.session', id: 'cs_test_fixture', client_reference_id: id, livemode: false,
    currency: 'chf', amount_total: 249900, payment_method_types: ['card'], payment_status: 'paid', payment_intent: 'pi_fixture',
  } } };
  const config = stripeMode(env, origin);
  const event = (payload, secret = webhookSecret) => {
    const body = JSON.stringify(payload);
    const signature = config.client.webhooks.generateTestHeaderString({ payload: body, secret });
    return fetch(base + '/integrations/stripe/events', { method: 'POST', body, headers: {
      'Content-Type': 'application/json', 'Stripe-Signature': signature,
    } });
  };
  assert.equal((await event(fixture, 'bad-signature')).status, 401);
  assert.equal((await event({ ...fixture, livemode: true })).status, 401);
  const [first, second] = await Promise.all([event(fixture), event(fixture)]);
  const results = await Promise.all([first.json(), second.json()]);
  assert.deepEqual(results.map(result => result.result).sort(), ['duplicate', 'paid']);
  assert.equal((await fetch(statusPath, { redirect: 'manual' })).headers.get('location'), '/fr-CH/orders/' + id);
  const auth = 'Basic ' + Buffer.from('admin:stripe-test-panel').toString('base64');
  const ledger = await (await fetch(base + '/admin/accounting.csv', { headers: { Authorization: auth } })).text();
  assert.equal(ledger.match(/"Cobro","Tarjeta","CHF","2499.00"/g)?.length, 1);
  const refund = await fetch(base + '/admin/' + id + '/refund', { method: 'POST', body: new URLSearchParams(),
    headers: { Origin: base, Authorization: auth }, redirect: 'manual' });
  assert.equal(refund.status, 409);
  const requests = [];
  const fake = { client: { refunds: { create: (...args) => requests.push(args) } } };
  const refundDb = new DatabaseSync(dbFile);
  const attempt = paymentAttempt(refundDb, id);
  requestStripeRefund(refundDb, id);
  refundDb.close();
  sendStripeRefund(fake, attempt);
  sendStripeRefund(fake, attempt);
  assert.deepEqual(requests[0], requests[1]);
  assert.equal(requests[0][0].payment_intent, 'pi_fixture');
  const shipment = await fetch(base + '/admin/' + id + '/ship', { method: 'POST',
    body: new URLSearchParams({ tracking: 'TEST', serial_one: 'TEST-123' }),
    headers: { Origin: base, Authorization: auth }, redirect: 'manual' });
  assert.equal(shipment.status, 409);
  const refundEvent = { livemode: false, type: 'refund.updated', data: { object: {
    object: 'refund', id: 're_fixture', payment_intent: 'pi_fixture', amount: 249900, currency: 'chf',
    metadata: { movility_refund: id }, status: 'pending',
  } } };
  assert.equal((await (await event(refundEvent)).json()).result, 'pending');
  const settled = { ...refundEvent, data: { object: { ...refundEvent.data.object, status: 'succeeded' } } };
  const partial = { ...settled, data: { object: { ...settled.data.object, amount: 100 } } };
  assert.equal((await (await event(partial)).json()).result, 'ignored');
  const settledResults = await Promise.all([event(settled), event(settled)]);
  assert.deepEqual((await Promise.all(settledResults.map(response => response.json()))).map(result => result.result).sort(),
    ['duplicate', 'refunded']);
  const updated = await (await fetch(base + '/admin/accounting.csv', { headers: { Authorization: auth } })).text();
  assert.equal(updated.match(/"Reembolso","Tarjeta","CHF","-2499.00"/g)?.length, 1);
  const check = new DatabaseSync(dbFile);
  assert.equal(check.prepare('SELECT units FROM stock WHERE id = 1').get().units, 1);
  check.close();
});
