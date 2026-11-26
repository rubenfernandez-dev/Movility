import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { salesStatistics, statisticsPeriod } from './sales-statistics.mjs';

test('Zürich separates payments across midnight, books refunds on their own day and fills empty days', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`
      CREATE TABLE orders (id TEXT, status TEXT);
      CREATE TABLE payment_entries (order_id TEXT, kind TEXT, cents INTEGER, occurred_at TEXT);
      CREATE TABLE order_lines (order_id TEXT, sku TEXT, quantity INTEGER);
      CREATE TABLE order_models (order_id TEXT, sku TEXT);
      INSERT INTO orders VALUES ('paid','paid'), ('refunded','refunded'), ('failed','failed');
      INSERT INTO payment_entries VALUES
        ('paid','capture',10000,'2026-07-01T21:59:59.999Z'),
        ('refunded','capture',5000,'2026-07-01T22:00:00.000Z'),
        ('refunded','refund',5000,'2026-07-03T09:00:00.000Z');
      INSERT INTO order_lines VALUES ('paid','chair',1), ('paid','bag',2), ('failed','chair',10);
      INSERT INTO order_models VALUES ('refunded','wheel');
    `);
    const period = statisticsPeriod(new URLSearchParams({ from: '2026-07-01', to: '2026-07-04' }));
    const report = salesStatistics(db, period);
    assert.deepEqual(Object.fromEntries(report.daily), {
      '2026-07-01': { orders: 1, captures: 10000, refunds: 0 },
      '2026-07-02': { orders: 1, captures: 5000, refunds: 0 },
      '2026-07-03': { orders: 0, captures: 0, refunds: 5000 },
      '2026-07-04': { orders: 0, captures: 0, refunds: 0 },
    });
    assert.deepEqual(report.total, { orders: 2, captures: 15000, refunds: 5000 });
    assert.equal(report.total.captures - report.total.refunds, 10000);
    assert.deepEqual(report.top.map(({ sku, units }) => [sku, units]), [['bag', 2], ['chair', 1], ['wheel', 1]]);
  } finally { db.close(); }
});

test('daily boundaries account for both Zürich clock changes', () => {
  for (const [date, hours] of [['2026-03-29', 23], ['2026-10-25', 25]]) {
    const { start, end } = statisticsPeriod(new URLSearchParams({ from: date, to: date }));
    assert.equal((end - start) / 3600000, hours);
  }
  assert.equal(statisticsPeriod(new URLSearchParams({ from: '2026-02-30', to: '2026-03-01' })).invalid, true);
  const rolling = statisticsPeriod(new URLSearchParams({ days: '7' }), new Date('2026-07-01T22:00:00Z'));
  assert.equal(rolling.to, '2026-07-02');
  assert.equal(rolling.from, '2026-06-26');
});
