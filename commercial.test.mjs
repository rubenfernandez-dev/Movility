import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, rmdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { createCheckout, reserveStripe, stripeMode, stripeMethodsFor, saveStripeSession, paymentAttempt } from './stripe-payments.mjs';
import { requestStripeRefund, sendStripeRefund } from './stripe-refunds.mjs';
import { resendConfig, resendProvider } from './resend-mail.mjs';
import { deliverBatch } from './mail-queue.mjs';

const origin = 'https://movility.example';
const env = {
  MOVILITY_STAGE: 'production', MOVILITY_ENABLE_LIVE: '1', MOVILITY_CATALOG_PROFILE: 'commercial',
  MOVILITY_PUBLIC_ORIGIN: origin, MOVILITY_PAYMENT_MODE: 'stripe-live', MOVILITY_STRIPE_METHODS: 'card,twint,paypal',
  MOVILITY_STRIPE_LIVE_SECRET_KEY: 'sk_live_fixtureonly', MOVILITY_STRIPE_LIVE_WEBHOOK_SECRET: 'whsec_fixturelive',
  MOVILITY_EMAIL_MODE: 'resend-live', MOVILITY_RESEND_LIVE_API_KEY: 'fixture-only',
  MOVILITY_EMAIL_LIVE_FROM: 'sales@example.test', MOVILITY_EMAIL_WORKER: 'manual', MOVILITY_PUSH_MODE: 'off',
  MOVILITY_ADMIN_PASSWORD: 'fixture-panel',
};

test('commercial activation rejects mixed or incomplete settings', () => {
  assert.equal(stripeMode({}, origin), null);
  assert.equal(resendConfig({}, origin), null);
  assert.throws(() => stripeMode({ ...env, MOVILITY_ENABLE_LIVE: '' }, origin), /requires MOVILITY_STAGE/);
  assert.throws(() => stripeMode({ ...env, MOVILITY_STRIPE_LIVE_SECRET_KEY: 'sk_test_fixture' }, origin), /Do not mix modes/);
  assert.throws(() => stripeMode({ ...env, MOVILITY_STRIPE_LIVE_WEBHOOK_SECRET: '' }, origin), /signing secret/);
  assert.throws(() => stripeMode({ ...env, MOVILITY_STRIPE_METHODS: 'invoice' }, origin), /Unknown Stripe method/);
  assert.throws(() => resendConfig({ ...env, MOVILITY_EMAIL_TEST_TO: 'sandbox@example.test' }, origin), /not be mixed/);
  assert.throws(() => resendConfig({ ...env, MOVILITY_EMAIL_LIVE_FROM: '' }, origin), /verified sender/);
  const stopped = spawnSync(process.execPath, ['server.mjs'], {
    env: { ...process.env, ...env, MOVILITY_EMAIL_MODE: 'simulated', MOVILITY_RESEND_LIVE_API_KEY: '',
      MOVILITY_EMAIL_LIVE_FROM: '', MOVILITY_DB: ':memory:' }, encoding: 'utf8', timeout: 3000,
  });
  assert.equal(stopped.status, 1);
  assert.match(stopped.stderr, /requires both stripe-live and resend-live/);
  for (const [code, label] of [['card', 'Tarjeta'], ['twint', 'TWINT'], ['paypal', 'PayPal']]) {
    assert.deepEqual(stripeMethodsFor(stripeMode({ ...env, MOVILITY_STRIPE_METHODS: code }, origin), 10000), [label]);
  }
});

test('signed commercial fixtures preserve stock, refund once and queue localized mail by mode', { timeout: 15000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'movility-commercial-'));
  const database = join(directory, 'test.sqlite');
  const activation = { ...process.env, ...env, PORT: '0', MOVILITY_DB: database };
  const incomplete = spawnSync(process.execPath, ['server.mjs'], { env: activation, encoding: 'utf8', timeout: 3000 });
  assert.equal(incomplete.status, 1);
  assert.match(incomplete.stderr, /Activación comercial bloqueada.*\/admin\/billing.*Tratamiento de IVA pendiente/);
  const settings = new DatabaseSync(database);
  settings.prepare('UPDATE billing_settings SET content=? WHERE id=1').run(JSON.stringify({
    name: 'Fixture Seller', street: 'Test 1', zip: '1201', city: 'Genève', country: 'CH',
    email: 'billing@example.test', mode: 'included', confirmed: true, vatId: 'VAT-FIXTURE', rate: '10',
  }));
  settings.prepare('INSERT INTO legal_versions (path,version,de,fr) VALUES (?,?,?,?)').run('/terms',1,'Fiktive Bedingungen','Conditions fictives');
  settings.close();
  const noExternal = 'data:text/javascript,' + encodeURIComponent(
    "import https from 'node:https'; https.request = () => { throw new Error('Outbound HTTPS disabled in fixture'); };");
  const child = spawn(process.execPath, ['--import', noExternal, 'server.mjs'], {
    env: { ...process.env, ...env, PORT: '0', MOVILITY_DB: database }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  let db;
  t.after(async () => {
    db?.close();
    if (child.exitCode === null && child.signalCode === null) {
      const exit = once(child, 'exit');
      child.kill();
      await exit;
    }
    rmSync(database, { force: true });
    rmdirSync(directory);
  });
  const output = createInterface({ input: child.stdout });
  const [ready] = await once(output, 'line');
  const base = ready.split(' ')[1];
  const admin = { Origin: base, Authorization: 'Basic ' + Buffer.from('admin:fixture-panel').toString('base64') };
  const model = { sku: 'fixture-chair', family: 'wheelchair', name: 'Fixture Chair', price: '100', units: '5',
    active: '1', description_de: 'Testmodell', description_fr: 'Modèle fictif' };
  const post = (path, values) => fetch(base + path, { method: 'POST', body: new URLSearchParams(values), headers: admin, redirect: 'manual' });
  assert.equal((await post('/admin/models', model)).status, 303);
  for (const locale of ['de-CH', 'fr-CH']) {
    assert.equal((await fetch(base + '/' + locale + '/checkout?model=' + model.sku)).status, 503);
  }
  const cartResponse = await post('/de-CH/cart', { sku: model.sku, action: 'add' });
  const cookie = cartResponse.headers.getSetCookie()[0].split(';')[0];
  assert.equal((await fetch(base + '/de-CH/checkout/cart', { headers: { Cookie: cookie } })).status, 503);
  const shippingPanel = await (await fetch(base + '/admin/shipping', { headers: admin })).text();
  assert.match(shippingPanel, /Checkout comercial bloqueado/);
  assert.equal((await post('/admin/shipping', { mode: 'fixed', amount: '11', revision: '0' })).status, 303);
  assert.equal((await fetch(base + '/de-CH/checkout?model=' + model.sku)).status, 503);
  assert.equal((await post('/admin/shipping', { mode: 'free', revision: '1' })).status, 303);

  const freeCheckout = await (await fetch(base + '/de-CH/checkout?model=' + model.sku)).text();
  const staleId = freeCheckout.match(/name="id" value="([^"]+)"/)[1];
  assert.equal((await post('/admin/shipping', { mode: 'fixed', amount: '11', revision: '2', confirmVat: '1', vatRateBps: '900' })).status, 400);
  assert.equal((await post('/admin/shipping', { mode: 'fixed', amount: '11', revision: '2', confirmVat: '1', vatRateBps: '1000' })).status, 303);
  const stale = await post('/de-CH/checkout', { id: staleId, model: model.sku, quotedPrice: '10000', shippingQuote: 'free:0',
    email: 'quote@example.test', name: 'Fixture', street: 'Test 1', city: 'Genève', zip: '1201', country: 'CH',
    method: 'Tarjeta', result: 'stripe', termsVersion: '1', acceptTerms: '1' });
  assert.equal(stale.status, 409);
  assert.match(await stale.text(), /name="quotedPrice" value="11100"/);
  db = new DatabaseSync(database);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON');
  const transaction = operation => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  assert.equal(paymentAttempt(db, staleId), undefined);
  const config = stripeMode(env, origin);
  const hook = (object, type, live = true) => {
    const payload = JSON.stringify({ type, livemode: live, data: { object } });
    const signature = config.client.webhooks.generateTestHeaderString({ payload, secret: config.secret });
    return fetch(base + '/integrations/stripe/events', { method: 'POST', body: payload,
      headers: { 'Content-Type': 'application/json', 'Stripe-Signature': signature } });
  };
  const units = () => db.prepare('SELECT units FROM extra_models WHERE sku=?').get(model.sku).units;
  const reserve = (locale, tag) => transaction(() => {
    const id = randomUUID();
    const data = { locale, email: tag + '@example.test', address: { name: 'Fixture', street: 'Test 1', zip: '1201', city: 'Genève' },
      lines: [{ sku: model.sku, name: model.name, quantity: 1, cents: 10000, requires_serial: 1 }],
      shipping: { mode: 'fixed', cents: 1100, vatRateBps: 1000 } };
    const attempt = reserveStripe(db, id, 'Tarjeta', data, 11100, () => {
      db.prepare('UPDATE extra_models SET units=units-1 WHERE sku=?').run(model.sku);
      db.prepare("INSERT INTO stock_movements(sku,delta,balance,reason) VALUES (?,-1,?,'reservation')").run(model.sku, units());
    }, undefined, true);
    const session = { object: 'checkout.session', id: 'cs_live_' + tag, client_reference_id: id, livemode: true,
      currency: 'chf', amount_total: 11100, payment_method_types: ['card'], payment_status: 'paid',
      payment_intent: 'pi_' + tag, url: 'https://checkout.stripe.com/c/pay/cs_live_' + tag };
    return { attempt, session };
  });
  const calls = [];
  for (const [locale, tag] of [['de-CH', 'de'], ['fr-CH', 'fr']]) {
    const checkout = await (await fetch(base + '/' + locale + '/checkout?model=' + model.sku)).text();
    assert.match(checkout, /Weiter zu Stripe|Continuer vers Stripe/);
    assert.doesNotMatch(checkout, /checkout-test-notice|value="paid"|demo@example/);
    const { attempt, session } = reserve(locale, tag);
    const fake = { ...config, client: { checkout: { sessions: { create: (body, options) => {
      calls.push(options.idempotencyKey);
      assert.deepEqual(body.payment_method_types, ['card']);
      assert.deepEqual(body.line_items.map(line => [line.quantity, line.price_data.unit_amount]), [[1, 10000], [1, 1100]]);
      return session;
    } } } } };
    assert.throws(() => createCheckout({ ...fake, live: false }, attempt), /different mode/);
    const opened = await createCheckout(fake, attempt);
    assert.equal(saveStripeSession(db, attempt.id, { ...opened, livemode: false, id: 'cs_test_' + tag }), false);
    assert.ok(saveStripeSession(db, attempt.id, opened));
    assert.equal((await hook(session, 'checkout.session.completed', false)).status, 401);
    const mixed = await hook({ ...session, livemode: false, id: 'cs_test_' + tag }, 'checkout.session.completed');
    assert.equal((await mixed.json()).result, 'ignored');
    const replies = await Promise.all([hook(session, 'checkout.session.completed'), hook(session, 'checkout.session.completed')]);
    assert.deepEqual((await Promise.all(replies.map(r => r.json()))).map(r => r.result).sort(), ['duplicate', 'paid']);
    const doc = await (await fetch(base + '/admin/' + attempt.id + '/document/invoice', { headers: admin })).text();
    assert.match(doc, /INV-00000[12]/);
    assert.match(doc, /Fixture Seller/);
    assert.doesNotMatch(doc, /Testrechnung|Facture de test|Testshop/);
    assert.equal((await post('/admin/' + attempt.id + '/ship', {
      tracking: 'S-' + tag, ['serial_' + model.sku]: 'SERIAL-' + tag,
    })).status, 303);
    if (locale === 'fr-CH') {
      requestStripeRefund(db, attempt.id);
      const refund = { object: 'refund', id: 're_fixture', payment_intent: session.payment_intent, amount: 11100,
        currency: 'chf', status: 'succeeded', metadata: { movility_refund: attempt.id } };
      const adapter = { live: true, client: { refunds: { create: (_body, options) => {
        assert.match(options.idempotencyKey, /^movility-live-refund\//);
        return refund;
      } } } };
      assert.equal(sendStripeRefund(adapter, paymentAttempt(db, attempt.id)), refund);
      for (const expected of ['refunded', 'duplicate']) {
        assert.equal((await (await hook(refund, 'refund.updated')).json()).result, expected);
      }
    }
  }
  assert.ok(calls.every(key => key.startsWith('movility-live-checkout/')));
  assert.equal(units(), 3);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 2);
  assert.deepEqual(db.prepare('SELECT cents FROM orders ORDER BY id').all().map(row => row.cents), [11100, 11100]);
  assert.deepEqual(db.prepare('SELECT cents FROM order_shipping ORDER BY order_id').all().map(row => row.cents), [1100, 1100]);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM stock_movements WHERE delta<0").get().n, 2);
  const { session } = reserve('de-CH', 'expire');
  for (const expected of ['expired', 'duplicate']) {
    assert.equal((await (await hook({ ...session, payment_status: 'unpaid' }, 'checkout.session.expired')).json()).result, expected);
  }
  assert.equal(units(), 3);
  const resend = resendConfig(env, origin);
  const mail = [];
  const provider = resendProvider(resend, (_url, options) => {
    mail.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ id: 'fixture-receipt' }), { status: 200 });
  });
  assert.equal(await deliverBatch(db, transaction, provider), 0);
  assert.equal(await deliverBatch(db, transaction, provider, undefined, 12, true), 0);
  assert.equal(await deliverBatch(db, transaction, provider, undefined, 12, 'live'), 5);
  assert.equal(await deliverBatch(db, transaction, provider, undefined, 12, 'live'), 0);
  for (const [recipient, confirmation, shipment] of [
    ['de@example.test', 'Bestellung bestätigt', 'Bestellung versendet'],
    ['fr@example.test', 'Commande confirmée', 'Commande expédiée'],
  ]) {
    for (const title of [confirmation, shipment]) {
      const message = mail.find(entry => entry.to[0] === recipient && entry.subject.includes(title));
      assert.ok(message, title);
      assert.doesNotMatch(message.subject + message.text, /\[TEST\]|Testzahlung|paiement de test|dans la démo/);
      assert.match(message.text, /https:\/\/movility\.example\//);
    }
  }
});
