import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { generateVAPIDKeys } from 'web-push';
import { setupPush, pushSubscription, addPushSubscription, removePushSubscription,
  pushState, queuePush, deliverPush, pushPayload, pushAdmin } from './order-push.mjs';

test('push alerts are scoped, deduplicated, retried and removed when the endpoint expires', async (t) => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec("PRAGMA foreign_keys = ON; CREATE TABLE orders (id TEXT PRIMARY KEY); INSERT INTO orders VALUES ('one'), ('two');");
  setupPush(db);
  const endpoint = 'https://fcm.googleapis.com/fcm/send/demo';
  const keys = { p256dh: generateVAPIDKeys().publicKey, auth: randomBytes(16).toString('base64url') };
  const subscription = pushSubscription({ endpoint, keys });
  assert.ok(subscription);
  for (const bad of ['https://127.0.0.1/alerts', 'https://fcm.googleapis.com.evil.test/send', 'https://fcm.googleapis.com:9999/send']) {
    assert.equal(pushSubscription({ endpoint: bad, keys }), null);
  }
  addPushSubscription(db, 'one', subscription, 'fr-CH', 'simulated', 100);
  addPushSubscription(db, 'two', subscription, 'de-CH', 'simulated', 100);
  assert.equal(pushState(db, 'one', endpoint, 'simulated', 100), true);
  queuePush(db, 'one', 'shipped', '/fr-CH/shipment/' + 'a'.repeat(43), 100);
  queuePush(db, 'one', 'shipped', '/fr-CH/shipment/' + 'a'.repeat(43), 100);
  const jobs = () => db.prepare('SELECT * FROM push_jobs').all();
  assert.equal(jobs().length, 1);
  const calls = [];
  const sender = job => {
    calls.push(pushPayload(job));
    if (calls.length === 1) throw Object.assign(new Error('transient'), { statusCode: 503 });
  };
  const run = (time, send = sender) => deliverPush(db, callback => callback(), { mode: 'simulated' }, send, () => time);
  await run(100);
  await run(159);
  assert.equal(calls.length, 1);
  await run(160);
  assert.equal(jobs()[0].status, 'sent');
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0].body, 'Votre commande a été expédiée.');
  assert.equal(calls[0].path, '/fr-CH/shipment/' + 'a'.repeat(43));

  queuePush(db, 'one', 'delivered', '/fr-CH/shipment/' + 'a'.repeat(43), 160);
  removePushSubscription(db, 'one', endpoint, 160);
  assert.deepEqual(jobs().map(job => job.status), ['sent', 'canceled']);
  await run(160, () => assert.fail('Canceled job entered the sender'));
  assert.equal(pushState(db, 'one', endpoint, 'simulated', 160), false);
  assert.equal(pushState(db, 'two', endpoint, 'simulated', 160), true);
  queuePush(db, 'two', 'delivered', '/de-CH/shipment/' + 'b'.repeat(43), 160);
  await run(160, () => { throw Object.assign(new Error('subscription expired'), { statusCode: 410 }); });
  assert.equal(pushState(db, 'two', endpoint, 'simulated', 160), false);
  assert.equal(jobs().at(-1).status, 'failed');
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM push_subscriptions WHERE endpoint = ?").get(endpoint).count, 0);
  const panel = pushAdmin(db, { mode: 'simulated' }, '');
  assert.match(panel, /Aceptado en simulación/);
  assert.match(panel, /Cancelado/);
  assert.match(panel, /Fallido/);
  assert.ok(!panel.includes(endpoint));
});
