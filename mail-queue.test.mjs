import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { setupMailQueue, queueEmail, deliverBatch, retryEmail, simulatedMailProvider } from './mail-queue.mjs';

function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`CREATE TABLE orders (id TEXT PRIMARY KEY, email TEXT, locale TEXT);
    CREATE TABLE email_previews (order_id TEXT REFERENCES orders(id), kind TEXT, body TEXT, subject TEXT,
        PRIMARY KEY(order_id, kind));
    INSERT INTO orders VALUES ('one', 'demo@example.com', 'fr-CH');
    INSERT INTO email_previews VALUES ('one','paid','Confirmation','Commande confirmée'),
      ('one','shipped','Suivi','Commande expédiée');`);
  setupMailQueue(db);
  const transaction = callback => {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = callback();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  };
  return { db, transaction };
}

test('mail queue backs off, preserves order and retries permanent failures manually', async (t) => {
  const { db, transaction } = fixture(t);
  queueEmail(db, 'one', 'paid', 100);
  queueEmail(db, 'one', 'paid', 100);
  queueEmail(db, 'one', 'shipped', 100);
  const jobs = () => db.prepare('SELECT * FROM mail_jobs ORDER BY rowid').all();
  const attempts = [];
  const provider = message => {
    attempts.push(message);
    if (attempts.length === 1) return { status: 'temporary' };
    if (message.subject === 'Commande expédiée') return { status: 'permanent' };
    return simulatedMailProvider(db)(message);
  };
  assert.equal(await deliverBatch(db, transaction, provider, () => 100), 1);
  assert.equal(jobs()[0].next_at, 115);
  assert.equal(await deliverBatch(db, transaction, provider, () => 114), 0);
  assert.equal(await deliverBatch(db, transaction, provider, () => 115), 2);
  assert.equal(attempts[0].key, attempts[1].key);
  assert.equal(attempts[0].email, 'demo@example.com');
  assert.deepEqual(jobs().map(job => job.status), ['delivered', 'failed']);
  assert.equal(retryEmail(db, jobs()[1].id, 116), true);
  assert.equal(retryEmail(db, jobs()[1].id, 116), false);
  await deliverBatch(db, transaction, simulatedMailProvider(db), () => 116);
  assert.deepEqual(jobs().map(job => [job.status, job.attempts]), [['delivered', 2], ['delivered', 2]]);
});

test('expired work reuses the same provider key and ignores a late worker', async (t) => {
  const { db, transaction } = fixture(t);
  queueEmail(db, 'one', 'paid', 100);
  const accept = simulatedMailProvider(db);
  let release;
  const interrupted = deliverBatch(db, transaction, message => new Promise(resolve => {
    accept(message);
    release = resolve;
  }), () => 100, 1);
  assert.equal(await deliverBatch(db, transaction, accept, () => 159), 0);
  assert.equal(await deliverBatch(db, transaction, accept, () => 160), 1);
  release({ status: 'permanent' });
  await interrupted;
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM simulated_mail_receipts').get().n, 1);
  assert.equal(db.prepare('SELECT status FROM mail_jobs').get().status, 'delivered');
  assert.deepEqual(db.prepare('SELECT outcome FROM mail_attempts ORDER BY attempt').all().map(row => row.outcome),
    ['expired', 'accepted']);
});
