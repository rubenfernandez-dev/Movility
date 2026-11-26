import { adminHtml, adminText, adminLocale } from './admin-language.mjs';
import { dateInput } from './accounting.mjs';
import { money, escapeHtml } from './views.mjs';

const zone = 'Europe/Zurich';
const dayMs = 86400000;
const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
const zoneOffset = new Intl.DateTimeFormat('en', { timeZone: zone, timeZoneName: 'longOffset' });
const shiftDay = (day, offset) => new Date(Date.parse(day) + offset * dayMs).toISOString().slice(0, 10);

function localMidnight(day) {
  const utc = Date.parse(day);
  const offset = zoneOffset.formatToParts(utc).find(part => part.type === 'timeZoneName').value;
  const [, sign, hours, minutes] = /^GMT([+-])(\d{2}):(\d{2})$/.exec(offset);
  return new Date(utc - (sign === '+' ? 1 : -1) * (+hours * 60 + +minutes) * 60000);
}

export function statisticsPeriod(query, now = new Date()) {
  const days = query.get('days') === '7' ? 7 : 30;
  const today = localDate.format(now);
  const rawFrom = query.get('from');
  const rawTo = query.get('to');
  const custom = Boolean(rawFrom || rawTo);
  const from = custom ? dateInput(rawFrom || '') : shiftDay(today, 1 - days);
  const to = custom ? dateInput(rawTo || '') : today;
  if (!from || !to || from < '2000-01-01' || to > '9998-12-31' || from > to ||
      Date.parse(to) - Date.parse(from) > 365 * dayMs) return { days, from, to, invalid: true };
  return { days, from, to, start: localMidnight(from), end: localMidnight(shiftDay(to, 1)) };
}

const empty = () => ({ orders: 0, captures: 0, refunds: 0 });
export function salesStatistics(db, period) {
  const bounds = [period.start.toISOString(), period.end.toISOString()];
  const daily = new Map();
  for (let day = period.from; day <= period.to; day = shiftDay(day, 1)) daily.set(day, empty());
  const entries = db.prepare(`SELECT kind, cents, occurred_at FROM payment_entries
    WHERE occurred_at >= ? AND occurred_at < ?`).all(...bounds);
  const total = empty();
  for (const { kind, cents, occurred_at } of entries) {
    const row = daily.get(localDate.format(new Date(occurred_at)));
    if (kind === 'capture') {
      row.orders++;
      row.captures += cents;
      total.orders++;
      total.captures += cents;
    } else {
      row.refunds += cents;
      total.refunds += cents;
    }
  }
  const top = db.prepare(`WITH captured AS (
      SELECT order_id FROM payment_entries WHERE kind = 'capture' AND occurred_at >= ? AND occurred_at < ?
    ), items AS (
      SELECT sku, quantity FROM captured JOIN order_lines USING (order_id)
      UNION ALL
      SELECT COALESCE(order_models.sku, 'one'), 1 FROM captured LEFT JOIN order_models USING (order_id)
      WHERE NOT EXISTS (SELECT 1 FROM order_lines WHERE order_id = captured.order_id)
    )
    SELECT sku, SUM(quantity) AS units FROM items GROUP BY sku ORDER BY units DESC, sku LIMIT 10`).all(...bounds);
  const undated = db.prepare('SELECT COUNT(*) AS count FROM payment_entries WHERE occurred_at IS NULL').get().count;
  return { daily, total, top, undated };
}

export function salesStatisticsSection(report) {
  const { daily, total, top, undated } = report;
  const amount = cents => money(adminLocale(), cents);
  const metrics = [
    ['Pedidos pagados', total.orders], ['Importe cobrado', amount(total.captures)],
    ['Reembolsos', amount(total.refunds)], ['Neto', amount(total.captures - total.refunds)],
  ];
  return adminHtml`<section aria-labelledby="sales-title">
    <h2 id="sales-title">Ventas de prueba</h2>
    <dl class="admin-metrics">${metrics.map(([label, value]) =>
      adminHtml`<div><dt>${adminText(label)}</dt><dd>${value}</dd></div>`).join('')}</dl>
    <p>Los pedidos y cobros se cuentan en la fecha del cobro. Los reembolsos se descuentan en la fecha del abono. Neto = cobros menos reembolsos.</p>
    ${undated ? adminHtml`<p>Operaciones históricas sin fecha, fuera del rango: ${undated}</p>` : ''}
    <div class="inventory-table"><table><caption>Ventas por día en CHF</caption>
    <thead><tr><th scope="col">Fecha</th><th scope="col">Pedidos pagados</th><th scope="col">Importe cobrado</th>
      <th scope="col">Reembolsos</th><th scope="col">Neto</th></tr></thead>
    <tbody>${[...daily].reverse().map(([day, value]) => adminHtml`<tr><th scope="row"><time datetime="${day}">${day}</time></th>
      <td>${value.orders}</td><td>${amount(value.captures)}</td><td>${amount(value.refunds)}</td>
      <td>${amount(value.captures - value.refunds)}</td></tr>`).join('')}</tbody></table></div>
    <h3>SKU más vendidos</h3><p>Unidades de pedidos cobrados durante el periodo, antes de devoluciones.</p>
    ${top.length ? adminHtml`<ol>${top.map(({ sku, units }) =>
      adminHtml`<li><code>${escapeHtml(sku)}</code> · ${units}</li>`).join('')}</ol>`
      : adminHtml`<p>No hay ventas en este periodo.</p>`}
  </section>`;
}
