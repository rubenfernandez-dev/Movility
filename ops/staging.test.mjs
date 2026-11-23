import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { stagingEnvironment } from './staging.mjs';

test('staging keeps a simulated order after restart and ignores external integration settings', { timeout: 15000 }, async () => {
  const folder = mkdtempSync(join(tmpdir(), 'movility-staging-'));
  const database = join(folder, 'staging.sqlite');
  const env = stagingEnvironment(database, 0, { ...process.env, MOVILITY_DB: ':memory:',
    MOVILITY_PAYMENT_MODE: 'stripe-test', MOVILITY_EMAIL_MODE: 'resend-test', MOVILITY_PUSH_MODE: 'web-push',
    MOVILITY_CARRIER_SECRET: 'not-a-production-secret', MOVILITY_STAGING_ADMIN_PASSWORD: 'staging-fixture' });
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.mjs'], { env, stdio: ['ignore', 'pipe', 'inherit'] });
    const lines = createInterface({ input: child.stdout });
    const [first] = await once(lines, 'line');
    return first.split(' ')[1];
  }
  async function stop() {
    if (child && child.exitCode === null && child.signalCode === null) {
      const done = once(child, 'exit');
      child.kill();
      await done;
    }
  }
  try {
    const base = await start();
    const health = await fetch(base + '/healthz');
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await health.json(), { result: 'ok' });
    const checkout = await fetch(base + '/fr-CH/checkout');
    assert.equal(checkout.headers.get('x-robots-tag'), 'noindex, nofollow');
    const body = await checkout.text();
    assert.match(body, /Données fictives uniquement/);
    for (const [locale, message] of [['fr-CH', 'code postal suisse à quatre chiffres'], ['de-CH', 'vierstellige Schweizer Postleitzahl']]) {
      const invalid = await fetch(base + '/' + locale + '/checkout', {
        method: 'POST', headers: { Origin: base },
        body: new URLSearchParams({ email: 'bad', bill_name: 'Client Test', bill_zip: '123', result: 'paid' }),
      });
      assert.equal(invalid.status, 400);
      const errors = await invalid.text();
      assert.match(errors, /tabindex="-1" autofocus aria-labelledby="checkout-error"/);
      assert.match(errors, /href="#checkout-bill_zip"/);
      assert.match(errors, /aria-invalid="true" aria-describedby="error-bill_zip"/);
      assert.match(errors, /<details open>/);
      assert.match(errors, new RegExp(message));
    }
    const order = await fetch(base + '/fr-CH/checkout', {
      method: 'POST', redirect: 'manual', headers: { Origin: base },
      body: new URLSearchParams({
        id: body.match(/name="id" value="([^"]+)"/)[1],
        quotedPrice: body.match(/name="quotedPrice" value="([^"]+)"/)[1],
        email: 'staging@example.com', name: 'Client Test', street: 'Rue Exemple 1',
        zip: '1201', city: 'Genève', method: 'Visa', result: 'paid',
        bill_name: 'Facturation Test', bill_street: 'Rue Facture 2', bill_zip: '1003', bill_city: 'Lausanne',
      }),
    });
    assert.equal(order.status, 303);
    const orderPath = order.headers.get('location');
    for (const provider of ['carrier', 'stripe']) {
      assert.equal((await fetch(base + '/integrations/' + provider + '/events', {
        method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' },
      })).status, 404);
    }
    await stop();
    const restarted = await start();
    assert.match(await (await fetch(restarted + orderPath)).text(), /Paiement de test confirmé/);
    const auth = 'Basic ' + Buffer.from('admin:staging-fixture').toString('base64');
    const id = orderPath.split('/').at(-1);
    const codePath = restarted + '/admin/' + id + '/guest-code';
    const proofPath = restarted + '/fr-CH/guest-access';
    const submit = (url, fields, headers = {}) => fetch(url, { method: 'POST', redirect: 'manual',
      headers: { Origin: restarted, ...headers }, body: new URLSearchParams(fields) });
    assert.equal((await submit(codePath, { action: 'issue' })).status, 401);
    const codeResponse = await submit(codePath, { action: 'issue' }, { Authorization: auth });
    const code = (await codeResponse.text()).match(/<code>([A-Za-z0-9_-]{32})<\/code>/)[1];
    assert.equal((await submit(proofPath, { code, email: 'wrong@example.com' })).status, 400);
    const redeemed = await submit(proofPath, { code, email: 'STAGING@example.com' });
    assert.equal(redeemed.status, 303);
    const proof = redeemed.headers.get('set-cookie').split(';')[0];
    assert.match(await (await fetch(proofPath, { headers: { Cookie: proof } })).text(), /Ouvrir la commande/);
    assert.equal((await submit(proofPath, { code, email: 'staging@example.com' })).status, 400);
    const account = restarted + '/fr-CH/account';
    const mailbox = restarted + '/admin/customer-codes';
    assert.equal((await fetch(mailbox)).status, 401);
    async function signIn(email) {
      assert.equal((await submit(account, { action: 'request', email })).status, 303);
      const html = await (await fetch(mailbox, { headers: { Authorization: auth } })).text();
      const loginCode = html.match(/<code>([A-Za-z0-9_-]{32})<\/code>/)[1];
      const login = await submit(account, { action: 'verify', email, code: loginCode });
      assert.equal(login.status, 303);
      assert.equal((await submit(account, { action: 'verify', email, code: loginCode })).status, 400);
      return login.headers.get('set-cookie').split(';')[0];
    }
    const other = await signIn('other@example.com');
    assert.equal((await submit(account, { action: 'link' }, { Cookie: other + '; ' + proof })).status, 400);
    const customer = await signIn('staging@example.com');
    assert.equal((await submit(account, { action: 'link' }, { Cookie: customer })).status, 400);
    assert.equal((await submit(account, { action: 'link' }, { Cookie: customer + '; ' + proof })).status, 303);
    const signedIn = await (await fetch(account, { headers: { Cookie: customer } })).text();
    assert.match(signedIn, new RegExp(orderPath));
    assert.doesNotMatch(await (await fetch(account, { headers: { Cookie: other } })).text(), new RegExp(orderPath));
    assert.equal((await submit(account, { action: 'logout' }, { Cookie: customer })).status, 303);
    assert.doesNotMatch(await (await fetch(account, { headers: { Cookie: customer } })).text(), new RegExp(orderPath));
    const offers = restarted + '/fr-CH/offers';
    const offerInbox = restarted + '/admin/offer-codes';
    const offerEmail = 'offers@example.com';
    assert.equal((await fetch(offerInbox)).status, 401);
    assert.equal((await submit(offers, { action: 'request', email: offerEmail })).status, 400);
    assert.equal((await submit(offers, { action: 'request', email: offerEmail, consent: 'yes' })).status, 303);
    const offerCode = async () => (await (await fetch(offerInbox, { headers: { Authorization: auth } })).text())
      .match(/<code>([A-Za-z0-9_-]{32})<\/code>/)[1];
    const confirmationCode = await offerCode();
    assert.equal((await submit(offers, { action: 'confirm', email: 'wrong@example.com', code: confirmationCode })).status, 400);
    assert.equal((await submit(offers, { action: 'confirm', email: offerEmail, code: confirmationCode })).status, 303);
    assert.equal((await submit(offers, { action: 'confirm', email: offerEmail, code: confirmationCode })).status, 400);
    const stopCode = await offerCode();
    assert.equal((await submit(offers, { action: 'stop', code: stopCode })).status, 303);
    assert.equal((await submit(offers, { action: 'stop', code: stopCode })).status, 400);
    const consentDb = new DatabaseSync(database, { readOnly: true });
    try {
      assert.equal(consentDb.prepare('SELECT state FROM offer_subscriptions WHERE email=?').get(offerEmail).state, 'revoked');
      const consent = consentDb.prepare('SELECT action, locale, source, version FROM offer_consent_events WHERE email=? ORDER BY id').all(offerEmail);
      assert.deepEqual(consent.map(row => [row.action, row.locale, row.source, row.version]), [
        ['requested', 'fr-CH', 'guest', 'offers-v1'], ['confirmed', 'fr-CH', 'guest', 'offers-v1'],
        ['revoked', 'fr-CH', 'guest', 'offers-v1'],
      ]);
    } finally { consentDb.close(); }
    assert.equal((await submit(codePath, { action: 'revoke' }, { Authorization: auth })).status, 303);
    assert.doesNotMatch(await (await fetch(proofPath, { headers: { Cookie: proof } })).text(), /Ouvrir la commande/);
    const docPath = restarted + '/admin/' + id + '/document/';
    assert.equal((await fetch(docPath + 'invoice')).status, 401);
    const invoice = await (await fetch(docPath + 'invoice', { headers: { Authorization: auth } })).text();
    assert.match(invoice, /Facture de test TEST-000001/);
    assert.match(invoice, /Rue Facture 2/);
    assert.doesNotMatch(invoice, /Rue Exemple 1<br>1201 Genève<br>.*Client Test/);
    for (let i = 0; i < 2; i++) {
      const refund = await fetch(restarted + '/admin/' + id + '/refund', { method: 'POST',
        redirect: 'manual', headers: { Authorization: auth, Origin: restarted }, body: new URLSearchParams() });
      assert.equal(refund.status, 303);
    }
    const credit = await (await fetch(docPath + 'credit', { headers: { Authorization: auth } })).text();
    assert.match(credit, /Avoir de test TEST-000002/);
    assert.match(credit, /TEST-000001/);
    assert.match(credit, /Rue Facture 2/);
    const csv = await (await fetch(restarted + '/admin/accounting.csv', { headers: { Authorization: auth } })).text();
    assert.match(csv, /"Cobro","Visa","CHF","2499.00"/);
    assert.equal(csv.match(/"Reembolso","Visa","CHF","-2499.00"/g)?.length, 1);
  } finally {
    await stop();
    unlinkSync(database);
    rmdirSync(folder);
  }
});
