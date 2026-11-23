import { adminFragment, adminHtml, adminText } from './admin-language.mjs';
import { methods, money } from './views.mjs';
const reportMethods = [...methods, 'Tarjeta'];

export function setupAccounting(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_entries (
      order_id TEXT NOT NULL REFERENCES orders(id), kind TEXT NOT NULL CHECK(kind IN ('capture', 'refund')),
      method TEXT NOT NULL, cents INTEGER NOT NULL CHECK(cents > 0), occurred_at TEXT,
      PRIMARY KEY (order_id, kind)
    );
    CREATE INDEX IF NOT EXISTS payment_entries_occurred ON payment_entries(occurred_at);
    INSERT OR IGNORE INTO payment_entries (order_id, kind, method, cents, occurred_at)
    SELECT orders.id, 'capture', method, cents,
      (SELECT MIN(occurred_at) FROM stock_movements WHERE order_id = orders.id AND reason = 'order')
    FROM orders;
    INSERT OR IGNORE INTO payment_entries (order_id, kind, method, cents, occurred_at)
    SELECT orders.id, 'refund', method, cents,
      (SELECT MIN(occurred_at) FROM stock_movements WHERE order_id = orders.id AND reason = 'refund')
    FROM orders WHERE status = 'refunded';
  `);
}

export function recordPayment(db, order, kind) {
  db.prepare(`INSERT INTO payment_entries (order_id, kind, method, cents, occurred_at)
    VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`).run(order.id, kind, order.method, order.cents);
}

function dateInput(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value ? value : '';
}

export function accountingFilters(query) {
  const rawFrom = query.get('from') || '';
  const rawTo = query.get('to') || '';
  const rawMethod = query.get('method') || '';
  const from = dateInput(rawFrom);
  const to = dateInput(rawTo);
  const method = reportMethods.includes(rawMethod) ? rawMethod : '';
  const invalid = Boolean((rawFrom && !from) || (rawTo && !to) || (rawMethod && !method) || (from && to && from > to));
  return { from, to, method, invalid };
}

const where = `WHERE (? = '' OR method = ?) AND (? = '' OR occurred_at >= ?)
  AND (? = '' OR occurred_at < ? || 'T24')`;
const filterValues = ({ method, from, to }) => [method, method, from, from, to, to];

export function accountingData(db, filters) {
  if (filters.invalid) return { entries: [], captures: 0, refunds: 0, count: 0, undated: 0 };
  const parameters = filterValues(filters);
  const entries = db.prepare(`SELECT * FROM payment_entries ${where}
    ORDER BY occurred_at DESC, order_id, kind LIMIT 200`).all(...parameters);
  const totals = db.prepare(`SELECT COUNT(*) AS count,
    COALESCE(SUM(CASE WHEN kind = 'capture' THEN cents ELSE 0 END), 0) AS captures,
    COALESCE(SUM(CASE WHEN kind = 'refund' THEN cents ELSE 0 END), 0) AS refunds,
    COALESCE(SUM(CASE WHEN occurred_at IS NULL THEN 1 ELSE 0 END), 0) AS undated
    FROM payment_entries ${where}`).get(...parameters);
  return { entries, ...totals };
}

const kindLabel = { capture: 'Cobro', refund: 'Reembolso' };
const signed = entry => entry.kind === 'refund' ? -entry.cents : entry.cents;

export function accountingPage(data, filters) {
  const { from, to, method, invalid } = filters;
  const params = new URLSearchParams(Object.entries({ from, to, method }).filter(([, value]) => value));
  const download = '/admin/accounting.csv' + (params.size ? '?' + params.toString().replaceAll('&', '&amp;') : '');
  return adminHtml`<a href="/admin">Volver a administración</a>
    <h1 class="page-title">Conciliación de pedidos</h1>
    <p>Operaciones simuladas en CHF. Las fechas se muestran en UTC.</p>
    <form class="order-filter accounting-filter" method="get" action="/admin/accounting">
      <label>Desde<input name="from" type="date" value="${from}"></label>
      <label>Hasta<input name="to" type="date" value="${to}"></label>
      <label>Medio de pago<select name="method"><option value="">Todos</option>
        ${reportMethods.map(value => adminHtml`<option ${value === method ? 'selected' : ''}>${value}</option>`).join('')}
      </select></label><button>Filtrar</button></form>
    ${invalid ? adminFragment('<p class="form-error" role="alert">Revisa las fechas y el medio de pago. La fecha de inicio debe ser anterior o igual a la final.</p>') : `
    <dl class="admin-metrics"><div><dt>Cobros</dt><dd>${money('es', data.captures)}</dd></div>
      <div><dt>Reembolsos</dt><dd>${money('es', data.refunds)}</dd></div>
      <div><dt>Neto</dt><dd>${money('es', data.captures - data.refunds)}</dd></div></dl>
    <p><a href="${download}">Descargar CSV de conciliación</a></p>
    ${data.undated ? adminHtml`<p>${data.undated} operaciones históricas sin fecha registrada. Aparecen en la vista sin filtro de fechas.</p>` : ''}
    ${data.entries.length ? adminHtml`<div class="inventory-table"><table>
      <thead><tr><th scope="col">Fecha</th><th scope="col">Pedido</th><th scope="col">Operación</th><th scope="col">Método</th><th scope="col">Importe</th></tr></thead>
      <tbody>${data.entries.map(entry => adminHtml`<tr><td>${entry.occurred_at ? entry.occurred_at.slice(0, 16).replace('T', ' ') : 'Sin fecha registrada'}</td>
        <th scope="row"><a href="/admin/orders/${entry.order_id}">${entry.order_id.slice(0, 8)}</a></th>
        <td>${adminText(kindLabel[entry.kind])}</td><td>${entry.method}</td><td>${money('es', signed(entry))}</td></tr>`).join('')}</tbody>
    </table></div><p>${data.count} operaciones. La tabla muestra hasta 200; el CSV las incluye todas.</p>` : adminFragment('<p>No hay operaciones para este filtro.</p>')}`}`;
}

export function accountingCsv(db, filters) {
  const entries = db.prepare(`SELECT * FROM payment_entries ${where}
    ORDER BY occurred_at DESC, order_id, kind`).all(...filterValues(filters));
  const fields = ['fecha_utc', 'pedido', 'operacion', 'medio_pago', 'moneda', 'importe'];
  const rows = entries.map(entry => [entry.occurred_at || '', entry.order_id, kindLabel[entry.kind], entry.method, 'CHF', (signed(entry) / 100).toFixed(2)]);
  return '\uFEFF' + [fields, ...rows].map(row => row.map(value => '"' + value.replaceAll('"', '""') + '"').join(',')).join('\r\n') + '\r\n';
}
