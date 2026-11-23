import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
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
