import { adminFragment, adminHtml } from './admin-language.mjs';
import { escapeHtml } from './views.mjs';
import { purchasedLines } from './inventory.mjs';

export function setupSerials(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS serial_registry (
      serial TEXT PRIMARY KEY, sku TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state IN ('shipped','restocked','hold')),
      latest_order_id TEXT NOT NULL REFERENCES orders(id)
    );
    CREATE TABLE IF NOT EXISTS shipment_serials (
      order_id TEXT NOT NULL REFERENCES orders(id), serial TEXT NOT NULL REFERENCES serial_registry(serial),
      sku TEXT NOT NULL, receipt_id TEXT REFERENCES return_receipts(id),
      PRIMARY KEY(order_id, serial)
    );
    CREATE INDEX IF NOT EXISTS shipment_serials_receipt ON shipment_serials(receipt_id);
    CREATE INDEX IF NOT EXISTS shipment_serials_lookup ON shipment_serials(serial);
  `);
}

const format = /^[A-Z0-9][A-Z0-9 ._/:+-]{0,63}$/;
const normalize = value => value.trim().toUpperCase();

export function shipmentSerials(db, orderId) {
  return db.prepare(`SELECT shipped.serial, shipped.sku, shipped.receipt_id, receipt.restocked
    FROM shipment_serials AS shipped LEFT JOIN return_receipts AS receipt ON receipt.id = shipped.receipt_id
    WHERE shipped.order_id = ? ORDER BY shipped.sku, shipped.serial`).all(orderId);
}

export function readShipmentSerials(order, fields) {
  const entries = [];
  for (const line of purchasedLines(order)) {
    if (line.requires_serial === 0) continue;
    const values = (fields.get('serial_' + line.sku) || '').split(/\r?\n/).map(normalize).filter(Boolean);
    if (values.length !== line.quantity || values.some(serial => !format.test(serial))) return null;
    for (const serial of values) entries.push({ sku: line.sku, serial });
  }
  return new Set(entries.map(entry => entry.serial)).size === entries.length ? entries : null;
}

function serialKey(list) {
  return list.map(({ sku, serial }) => sku + '\u0000' + serial).sort().join('\u0001');
}

export function sameShipmentSerials(a, b) {
  return serialKey(a) === serialKey(b);
}

export function assignShipmentSerials(db, orderId, entries) {
  const get = db.prepare('SELECT sku, state FROM serial_registry WHERE serial = ?');
  for (const entry of entries) {
    const previous = get.get(entry.serial);
    if (previous && (previous.sku !== entry.sku || previous.state !== 'restocked')) return false;
  }
  const assign = db.prepare(`INSERT INTO serial_registry (serial, sku, state, latest_order_id) VALUES (?, ?, 'shipped', ?)
    ON CONFLICT(serial) DO UPDATE SET state = 'shipped', latest_order_id = excluded.latest_order_id`);
  const add = db.prepare('INSERT INTO shipment_serials (order_id, serial, sku) VALUES (?, ?, ?)');
  for (const { sku, serial } of entries) {
    assign.run(serial, sku, orderId);
    add.run(orderId, serial, sku);
  }
  return true;
}

export function readReturnSerials(fields) {
  const values = fields.getAll('serial').map(normalize);
  return values.some(value => !format.test(value)) || new Set(values).size !== values.length ? null : values;
}

export function receiptMatches(db, id, serials) {
  const recorded = db.prepare('SELECT serial FROM shipment_serials WHERE receipt_id = ?').all(id).map(row => row.serial);
  return recorded.length === serials.length && recorded.every(serial => serials.includes(serial));
}

export function validReturnSelection(records, sku, quantity, serials) {
  if (!records.some(record => record.sku === sku)) return !serials.length;
  return serials.length === quantity && serials.every(serial => records.some(record =>
    record.sku === sku && record.serial === serial && !record.receipt_id));
}

export function markSerialsReceived(db, orderId, receiptId, serials, restocked) {
  const history = db.prepare('UPDATE shipment_serials SET receipt_id = ? WHERE order_id = ? AND serial = ? AND receipt_id IS NULL');
  const registry = db.prepare("UPDATE serial_registry SET state = ? WHERE latest_order_id = ? AND serial = ? AND state = 'shipped'");
  for (const serial of serials) {
    if (!history.run(receiptId, orderId, serial).changes ||
        !registry.run(restocked ? 'restocked' : 'hold', orderId, serial).changes) throw new Error('Serial state changed during receipt');
  }
}

export function shipmentForm(order) {
  const tracked = purchasedLines(order).filter(line => line.requires_serial !== 0);
  return adminHtml`<form class="shipment-form" method="post" action="/admin/${order.id}/ship">
    <label>Referencia de seguimiento <input name="tracking" required maxlength="80"></label>
    ${tracked.map(line => adminHtml`<label>${escapeHtml(line.name)} · ${line.quantity} números de serie
      <textarea name="serial_${line.sku}" rows="${Math.min(4, line.quantity + 1)}" required></textarea>
    </label>`).join('')}
    ${tracked.length ? adminFragment('<p>Escribe un número de serie por línea. Se guardan en mayúsculas.</p>') : ''}
    <button>Registrar envío</button></form>`;
}

export function serialSummary(records) {
  if (!records.length) return '';
  return adminHtml`<details class="returns"><summary>Números de serie enviados</summary><ul>${records.map(record =>
    adminHtml`<li>${record.sku} · <code>${escapeHtml(record.serial)}</code> · ${record.receipt_id ? record.restocked ? 'Repuesto' : 'En revisión' : 'Enviado'}</li>`).join('')}</ul></details>`;
}

export function serialLookup(db, raw) {
  const serial = normalize(raw);
  const valid = format.test(serial);
  const history = valid ? db.prepare(`SELECT shipments.order_id, shipments.sku, shipments.receipt_id,
    orders.tracking, receipts.restocked, receipts.received_at
    FROM shipment_serials AS shipments JOIN orders ON orders.id = shipments.order_id
    LEFT JOIN return_receipts AS receipts ON receipts.id = shipments.receipt_id
    WHERE shipments.serial = ? ORDER BY shipments.rowid DESC`).all(serial) : [];
  return adminHtml`<a href="/admin">Volver a administración</a><h1 class="page-title">Historial por número de serie</h1>
    <form class="order-filter" method="get" action="/admin/serials">
      <label>Número de serie<input name="serial" maxlength="64" required value="${escapeHtml(serial.slice(0, 64))}"></label>
      <button>Buscar</button>
    </form>
    ${history.length ? adminHtml`<ul class="serial-history">${history.map(row => adminHtml`<li>
      <a href="/admin/orders/${row.order_id}">Pedido ${row.order_id.slice(0, 8)}</a> · SKU ${row.sku} · ${escapeHtml(row.tracking || '')}
      <br>${row.receipt_id ? (row.restocked ? 'Devuelto y repuesto' : 'Devuelto y en revisión') + ' · ' +
        adminHtml`<time datetime="${row.received_at}">${row.received_at.slice(0, 16).replace('T', ' ')} UTC</time>` : 'Enviado'}</li>`).join('')}</ul>`
      : raw ? adminFragment('<p>No se encontraron envíos con ese número de serie.</p>') : ''}`;
}
