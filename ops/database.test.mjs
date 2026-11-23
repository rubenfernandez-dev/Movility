import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { backupDatabase, restoreDatabase, verifyDatabase } from './database.mjs';

test('copies an active SQLite database and restores independently without overwriting', () => {
  const directory = mkdtempSync(join(tmpdir(), 'movility-backup-'));
  const source = join(directory, 'source.sqlite');
  let backup;
  const db = new DatabaseSync(source);
  try {
    db.exec(`PRAGMA journal_mode = WAL;
      CREATE TABLE orders (id TEXT PRIMARY KEY);
      CREATE TABLE stock (units INTEGER);
      CREATE TABLE catalog (id INTEGER);
      CREATE TABLE extra_models (id INTEGER);
      CREATE TABLE payment_entries (order_id TEXT REFERENCES orders(id));
      CREATE TABLE stock_movements (quantity INTEGER);
      INSERT INTO orders VALUES ('demo');
      INSERT INTO payment_entries VALUES ('demo');
      INSERT INTO stock VALUES (3);`);
    backup = backupDatabase(source, directory);
    db.exec('UPDATE stock SET units = 1');
    assert.throws(() => restoreDatabase(backup, source), { code: 'EEXIST' });
    const recovered = restoreDatabase(backup, join(directory, 'restored.sqlite'));
    const restored = new DatabaseSync(recovered, { readOnly: true });
    try {
      assert.equal(restored.prepare('SELECT units FROM stock').get().units, 3);
      assert.equal(restored.prepare('SELECT order_id FROM payment_entries').get().order_id, 'demo');
      assert.equal(db.prepare('SELECT units FROM stock').get().units, 1);
    } finally { restored.close(); }
    assert.throws(() => verifyDatabase(join(directory, 'missing.sqlite')));
  } finally {
    db.close();
    if (backup) { unlinkSync(backup); rmdirSync(dirname(backup)); }
    for (const file of readdirSync(directory)) unlinkSync(join(directory, file));
    rmdirSync(directory);
  }
});
