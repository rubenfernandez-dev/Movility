import { randomUUID } from 'node:crypto';
import { escapeHtml } from './views.mjs';

const reasons = {
  opening: 'Saldo inicial', adjustment: 'Ajuste manual', order: 'Pedido cobrado',
  refund: 'Reembolso antes del envío', return: 'Devolución recibida y apta',
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
  `);
  db.exec(`INSERT INTO stock_movements (sku, delta, balance, reason)
    SELECT 'one', units, units, 'opening' FROM stock WHERE id = 1
    AND NOT EXISTS (SELECT 1 FROM stock_movements WHERE sku = 'one');
    INSERT INTO stock_movements (sku, delta, balance, reason)
    SELECT sku, units, units, 'opening' FROM extra_models AS model
    WHERE NOT EXISTS (SELECT 1 FROM stock_movements WHERE sku = model.sku);`);
}

export const purchasedLines = order => order.lines.length ? order.lines : [{
  sku: order.model_sku || 'one', name: order.model_name || 'Movility One', quantity: 1,
}];

export function returnControls(order, receipts, serials = []) {
  if (!order.tracking) return '';
  const rows = purchasedLines(order).map(line => {
    const existing = receipts.filter(receipt => receipt.sku === line.sku);
    const received = existing.reduce((sum, receipt) => sum + receipt.quantity, 0);
    const restocked = existing.reduce((sum, receipt) => sum + receipt.quantity * receipt.restocked, 0);
    const remaining = line.quantity - received;
    const outstanding = serials.filter(record => record.sku === line.sku && !record.receipt_id);
    return `<section class="return-line"><h4>${escapeHtml(line.name)}</h4>
      <p>Recibidas: ${received} de ${line.quantity} · Repuestas: ${restocked} · En revisión: ${received - restocked}</p>
      ${remaining > 0 ? `<form method="post" action="/admin/${order.id}/return">
        <input type="hidden" name="receipt" value="${randomUUID()}"><input type="hidden" name="sku" value="${line.sku}">
        ${serials.length ? `<fieldset class="serial-selection"><legend>Números de serie recibidos</legend>
          ${outstanding.map(record => `<label><input type="checkbox" name="serial" value="${escapeHtml(record.serial)}"> ${escapeHtml(record.serial)}</label>`).join('')}
        </fieldset>` : `<label>Unidades recibidas<input name="quantity" type="number" min="1" max="${remaining}" value="1" required></label>`}
        <label>Estado de las unidades<select name="disposition" required>
          <option value="">Selecciona el estado</option><option value="restock">Aptas para la venta</option><option value="hold">En revisión</option>
        </select></label><button class="secondary">Registrar recepción</button></form>` : ''}</section>`;
  });
  return `<details class="returns"><summary>Devolución física</summary>${rows.join('')}</details>`;
}

export function inventoryPage(models, movements, selected) {
  const visible = models.find(model => model.sku === selected);
  return `<a href="/admin">Volver a administración</a>
    <h1 class="page-title">Movimientos de stock</h1>
    <p>El saldo inicial de cada SKU refleja las unidades que había al activar el historial.</p>
    <div class="model-grid">${models.map(model => `<article><h2>${escapeHtml(model.name)}</h2>
      <p>${model.units} unidades disponibles · ${model.sku}</p></article>`).join('')}</div>
    <form class="order-filter" action="/admin/inventory" method="get"><label>Modelo<select name="sku">
      <option value="">Todos</option>${models.map(model => `<option value="${model.sku}" ${model.sku === selected ? 'selected' : ''}>${escapeHtml(model.name)}</option>`).join('')}
      </select></label><button>Filtrar</button></form>
    <p><a href="/admin/inventory.csv${visible ? '?sku=' + visible.sku : ''}">Descargar CSV de movimientos</a></p>
    <div class="inventory-table"><table>
      <thead><tr><th scope="col">Fecha (UTC)</th><th scope="col">SKU</th><th scope="col">Unidades</th>
      <th scope="col">Saldo</th><th scope="col">Motivo</th><th scope="col">Pedido</th></tr></thead>
      <tbody>${movements.map(move => `<tr><td><time datetime="${move.occurred_at}">${move.occurred_at.slice(0, 16).replace('T', ' ')}</time></td>
        <th scope="row">${move.sku}</th><td>${move.delta > 0 ? '+' : ''}${move.delta}</td><td>${move.balance}</td>
        <td>${reasons[move.reason]}</td><td>${move.order_id ? `<a href="/admin#order-${move.order_id}">${move.order_id.slice(0, 8)}</a>` : '—'}</td></tr>`).join('')}</tbody>
    </table></div><p>Se muestran los últimos 200 movimientos. El CSV incluye todos los del filtro.</p>`;
}

export function inventoryCsv(movements) {
  const csv = cell => '"' + String(cell ?? '').replaceAll('"', '""') + '"';
  const heading = ['fecha_utc', 'sku', 'unidades', 'saldo', 'motivo', 'pedido'];
  const rows = movements.map(move => [move.occurred_at, move.sku, move.delta, move.balance, reasons[move.reason], move.order_id]);
  return '\uFEFF' + [heading, ...rows].map(row => row.map(csv).join(',')).join('\r\n') + '\r\n';
}
