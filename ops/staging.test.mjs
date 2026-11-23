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
    const checkout = await fetch(base + '/fr-CH/checkout');
    assert.equal(checkout.headers.get('x-robots-tag'), 'noindex, nofollow');
    const body = await checkout.text();
    assert.match(body, /Données fictives uniquement/);
    const order = await fetch(base + '/fr-CH/checkout', {
      method: 'POST', redirect: 'manual', headers: { Origin: base },
      body: new URLSearchParams({
        id: body.match(/name="id" value="([^"]+)"/)[1],
        quotedPrice: body.match(/name="quotedPrice" value="([^"]+)"/)[1],
        email: 'staging@example.com', name: 'Client Test', street: 'Rue Exemple 1',
        zip: '1201', city: 'Genève', method: 'Visa', result: 'paid',
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
    const csv = await (await fetch(restarted + '/admin/accounting.csv', { headers: { Authorization: auth } })).text();
    assert.match(csv, /"Cobro","Visa","CHF","2499.00"/);
  } finally {
    await stop();
    unlinkSync(database);
    rmdirSync(folder);
  }
});
