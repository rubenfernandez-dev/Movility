import { adminHtml, adminText } from './admin-language.mjs';
import { randomUUID } from 'node:crypto';
import { escapeHtml } from './views.mjs';

const reasons = {
  opening: 'Saldo inicial', adjustment: 'Ajuste manual', order: 'Pedido cobrado',
  refund: 'Reembolso antes del envío', return: 'Devolución recibida y apta',
  reservation: 'Reserva de pago Stripe', release: 'Liberación de reserva Stripe',
  supplier: 'Recepción de proveedor',
};

export function setupInventory(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY, sku TEXT NOT NULL, delta INTEGER NOT NULL, balance INTEGER NOT NULL,
      reason TEXT NOT NULL, order_id TEXT REFERENCES orders(id),
      occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE TABLE IF NOT EXISTS return_receipts (
      id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), sku TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0), restocked INTEGER NOT NULL CHECK(restocked IN (0, 1)),
      received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
    CREATE INDEX IF NOT EXISTS return_receipts_order_sku ON return_receipts(order_id, sku);
    CREATE TABLE IF NOT EXISTS supplier_receipts (
      id TEXT PRIMARY KEY, sku TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0),
      movement_id INTEGER NOT NULL UNIQUE REFERENCES stock_movements(id)
    );
    CREATE TABLE IF NOT EXISTS supplier_serials (
      serial TEXT PRIMARY KEY, receipt_id TEXT NOT NULL REFERENCES supplier_receipts(id)
    );
  `);
  db.exec(`INSERT INTO stock_movements (sku, delta, balance, reason)
    SELECT 'one', units, units, 'opening' FROM stock WHERE id = 1 AND EXISTS (SELECT 1 FROM catalog WHERE id = 1)
    AND NOT EXISTS (SELECT 1 FROM stock_movements WHERE sku = 'one');
    INSERT INTO stock_movements (sku, delta, balance, reason)
    SELECT sku, units, units, 'opening' FROM extra_models AS model
    WHERE NOT EXISTS (SELECT 1 FROM stock_movements WHERE sku = model.sku);`);
}

export const purchasedLines = order => order.lines.length ? order.lines : [{
  sku: order.model_sku || 'one', name: order.model_name || 'Movility One', quantity: 1, requires_serial: order.requires_serial ?? 1,
}];

export function returnControls(order, receipts, serials = []) {
  if (!order.tracking) return '';
  const rows = purchasedLines(order).map(line => {
    const existing = receipts.filter(receipt => receipt.sku === line.sku);
    const received = existing.reduce((sum, receipt) => sum + receipt.quantity, 0);
    const restocked = existing.reduce((sum, receipt) => sum + receipt.quantity * receipt.restocked, 0);
    const remaining = line.quantity - received;
    const outstanding = serials.filter(record => record.sku === line.sku && !record.receipt_id);
    return adminHtml`<section class="return-line"><h4>${escapeHtml(line.name)}</h4>
      <p>Recibidas: ${received} de ${line.quantity} · Repuestas: ${restocked} · En revisión: ${received - restocked}</p>
      ${remaining > 0 ? adminHtml`<form method="post" action="/admin/${order.id}/return">
        <input type="hidden" name="receipt" value="${randomUUID()}"><input type="hidden" name="sku" value="${line.sku}">
        ${serials.some(record => record.sku === line.sku) ? adminHtml`<fieldset class="serial-selection"><legend>Números de serie recibidos</legend>
          ${outstanding.map(record => adminHtml`<label><input type="checkbox" name="serial" value="${escapeHtml(record.serial)}"> ${escapeHtml(record.serial)}</label>`).join('')}
        </fieldset>` : adminHtml`<label>Unidades recibidas<input name="quantity" type="number" min="1" max="${remaining}" value="1" required></label>`}
        <label>Estado de las unidades<select name="disposition" required>
          <option value="">Selecciona el estado</option><option value="restock">Aptas para la venta</option><option value="hold">En revisión</option>
        </select></label><button class="secondary">Registrar recepción</button></form>` : ''}</section>`;
  });
  return adminHtml`<details class="returns"><summary>Devolución física</summary>${rows.join('')}</details>`;
}

export function inventoryBalances(db) {
  const reserved = new Map(db.prepare(`SELECT line.value ->> '$.sku' AS sku,
      SUM(line.value ->> '$.quantity') AS quantity
    FROM stripe_attempts, json_each(stripe_attempts.payload, '$.lines') AS line
    WHERE state IN ('preparing', 'open') GROUP BY sku`).all().map(row => [row.sku, row.quantity]));
  const review = new Map(db.prepare(`SELECT sku, SUM(quantity) AS quantity FROM return_receipts
    WHERE restocked = 0 GROUP BY sku`).all().map(row => [row.sku, row.quantity]));
  return { reserved, review };
}

export function inventoryPage(models, movements, selected, message = '', failed = false) {
  const visible = models.find(model => model.sku === selected);
  return adminHtml`<a href="/admin">Volver a administración</a>
    <h1 class="page-title">Movimientos de stock</h1>
    ${message ? adminHtml`<p role="${failed ? 'alert' : 'status'}">${adminText(message)}</p>` : ''}
    <p>El saldo inicial de cada SKU refleja las unidades que había al activar el historial.</p>
    <div class="model-grid">${models.map(model => adminHtml`<article><h2>${escapeHtml(model.name)}</h2>
      <p>${model.sku}</p><dl class="specs">
      <div><dt>Vendibles</dt><dd>${model.units}</dd></div>
      <div><dt>Reservadas</dt><dd>${model.reserved}</dd></div>
      <div><dt>Devoluciones en revisión</dt><dd>${model.review}</dd></div></dl>
      ${!model.active ? adminHtml`<p>Unidades físicas sin publicar: ${model.onHand}</p>` : ''}
      <p><a href="/admin/inventory?sku=${model.sku}#stock-history">Ver movimientos</a></p></article>`).join('')}</div>
    <form class="order-filter" action="/admin/inventory" method="get"><label>Modelo<select name="sku">
      <option value="">Todos</option>${models.map(model => adminHtml`<option value="${model.sku}" ${model.sku === selected ? 'selected' : ''}>${escapeHtml(model.name)}</option>`).join('')}
      </select></label><button>Filtrar</button></form>
    ${visible ? adminHtml`<form class="confirmation" method="post" action="/admin/inventory/receive">
      <h2>Recibir stock del proveedor</h2><p>SKU <strong>${visible.sku}</strong></p>
      <input type="hidden" name="sku" value="${visible.sku}">
      <input type="hidden" name="receipt" value="${randomUUID()}">
      <label>Unidades recibidas<input name="quantity" type="number" min="1" max="999" required></label>
      ${visible.tracked ? adminHtml`<label>Un número de serie por unidad, uno por línea
        <textarea name="serials" rows="4" required></textarea></label>` : ''}
      <button>Registrar entrada de stock</button></form>` : ''}
    <p><a href="/admin/inventory.csv${visible ? '?sku=' + visible.sku : ''}">Descargar CSV de movimientos</a></p>
    <p>Las reservas corresponden a sesiones abiertas o en preparación.</p>
    <div class="inventory-table" id="stock-history"><table>
      <thead><tr><th scope="col">Fecha (UTC)</th><th scope="col">SKU</th><th scope="col">Unidades</th>
      <th scope="col">Saldo</th><th scope="col">Motivo</th><th scope="col">Pedido</th></tr></thead>
      <tbody>${movements.map(move => adminHtml`<tr><td><time datetime="${move.occurred_at}">${move.occurred_at.slice(0, 16).replace('T', ' ')}</time></td>
        <th scope="row">${move.sku}</th><td>${move.delta > 0 ? '+' : ''}${move.delta}</td><td>${move.balance}</td>
        <td>${adminText(reasons[move.reason])}
          ${move.serials?.length ? adminHtml`<details><summary>Números de serie recibidos</summary><ul>${move.serials.map(serial =>
            adminHtml`<li><a href="/admin/serials?serial=${encodeURIComponent(serial)}">${escapeHtml(serial)}</a></li>`).join('')}</ul></details>` : ''}</td>
        <td>${move.order_id ? adminHtml`<a href="/admin/orders/${move.order_id}">${move.order_id.slice(0, 8)}</a>` : '—'}</td></tr>`).join('')}</tbody>
    </table></div><p>Se muestran los últimos 200 movimientos. El CSV incluye todos los del filtro.</p>`;
}

export function inventoryCsv(movements) {
  const csv = cell => '"' + String(cell ?? '').replaceAll('"', '""') + '"';
  const heading = ['fecha_utc', 'sku', 'unidades', 'saldo', 'motivo', 'pedido'];
  const rows = movements.map(move => [move.occurred_at, move.sku, move.delta, move.balance, reasons[move.reason], move.order_id]);
  return '\uFEFF' + [heading, ...rows].map(row => row.map(csv).join(',')).join('\r\n') + '\r\n';
}
