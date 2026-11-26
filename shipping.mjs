import { adminHtml, adminText } from './admin-language.mjs';
import { cartTotal } from './cart.mjs';
import { escapeHtml, money } from './views.mjs';

const modes = { pending: 'Envío pendiente', free: 'Envío gratuito', fixed: 'Tarifa fija por pedido' };
export const legacyShipping = { mode: 'pending', cents: 0, vatRateBps: null };
export function setupShipping(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS shipping_settings (
    id INTEGER PRIMARY KEY CHECK(id=1), mode TEXT NOT NULL, cents INTEGER NOT NULL,
    vat_rate_bps INTEGER, revision INTEGER NOT NULL DEFAULT 0
  );
  INSERT OR IGNORE INTO shipping_settings (id,mode,cents) VALUES (1,'pending',0);
  CREATE TABLE IF NOT EXISTS order_shipping (
    order_id TEXT PRIMARY KEY REFERENCES orders(id), mode TEXT NOT NULL, cents INTEGER NOT NULL, vat_rate_bps INTEGER
  );`);
}

const columns = 'mode, cents, vat_rate_bps AS vatRateBps';
export const shippingSettings = db => db.prepare('SELECT ' + columns + ', revision FROM shipping_settings WHERE id=1').get();
export const orderShipping = (db, id) => db.prepare('SELECT ' + columns + ' FROM order_shipping WHERE order_id=?').get(id);
export function saveOrderShipping(db, id, shipping) {
  if (shipping) db.prepare('INSERT INTO order_shipping VALUES (?,?,?,?)').run(id, shipping.mode, shipping.cents, shipping.vatRateBps);
}
export function shippingBlock(shipping, tax) {
  if (shipping.mode === 'pending') return 'Confirma si el envío es gratuito o tiene tarifa fija.';
  if (shipping.mode === 'fixed' && tax?.mode === 'included' && shipping.vatRateBps !== tax.rateBps) {
    return 'Confirma el IVA del envío para la tasa vigente del catálogo.';
  }
  return '';
}

export function saveShippingSettings(db, fields, tax) {
  const mode = fields?.get('mode');
  const amount = fields?.get('amount')?.trim().replace(',', '.') || '';
  const revision = fields?.get('revision') || '';
  const confirmVat = mode === 'fixed' && fields?.get('confirmVat') === '1';
  if (!Object.hasOwn(modes, mode) || !/^\d+$/.test(revision) ||
      (mode === 'fixed' && (!/^\d{1,6}(?:\.\d{1,2})?$/.test(amount) || Number(amount) <= 0)) ||
      (confirmVat && (tax?.mode !== 'included' || fields.get('vatRateBps') !== String(tax.rateBps)))) return 'invalid';
  const cents = mode === 'fixed' ? Math.round(Number(amount) * 100) : 0;
  return db.prepare('UPDATE shipping_settings SET mode=?, cents=?, vat_rate_bps=?, revision=revision+1 WHERE id=1 AND revision=?')
    .run(mode, cents, confirmVat ? tax.rateBps : null, Number(revision)).changes ? 'saved' : 'conflict';
}

export function checkoutTotals(lines, { mode, cents, vatRateBps } = legacyShipping) {
  const subtotal = cartTotal(lines);
  return { subtotal, total: subtotal + cents, shipping: { mode, cents, vatRateBps } };
}
export const shippingQuote = shipping => shipping.mode + ':' + shipping.cents;
export const shippingText = {
  'de-CH': { subtotal: 'Zwischensumme', shipping: 'Versand', pending: 'Noch offen · im Test ohne Versandkosten' },
  'fr-CH': { subtotal: 'Sous-total', shipping: 'Livraison', pending: 'À confirmer · sans frais de livraison dans ce test' },
};
export const shippingPrice = (locale, shipping, sign = 1) => shipping.mode === 'pending'
  ? shippingText[locale].pending : money(locale, shipping.cents ? shipping.cents * sign : 0);

export function shippingAdmin(settings, tax, result = '') {
  const blocker = shippingBlock(settings, tax);
  return adminHtml`<h1>Tarifa de envío en Suiza</h1>
    ${blocker ? adminHtml`<p class="form-error" role="status">Checkout comercial bloqueado. ${escapeHtml(adminText(blocker))}</p>` : ''}
    ${result === 'saved' ? adminHtml`<p role="status">Configuración de envío guardada.</p>` : ''}
    ${result === 'invalid' ? adminHtml`<p role="alert">Revisa la tarifa y la confirmación del IVA.</p>` : ''}
    ${result === 'conflict' ? adminHtml`<p role="alert">La configuración cambió. Revisa los valores actuales.</p>` : ''}
    <form class="confirmation" method="post" action="/admin/shipping">
      <input type="hidden" name="revision" value="${settings.revision}">
      <label>Modalidad<select name="mode">${Object.entries(modes).map(([value,label]) =>
        `<option value="${value}"${settings.mode === value ? ' selected' : ''}>${escapeHtml(adminText(label))}</option>`).join('')}</select></label>
      <label>Tarifa en CHF<input name="amount" inputmode="decimal" maxlength="9" value="${settings.mode === 'fixed' ? (settings.cents / 100).toFixed(2) : ''}"></label>
      ${tax?.mode === 'included' ? adminHtml`<input type="hidden" name="vatRateBps" value="${tax.rateBps}">
        <label><input type="checkbox" name="confirmVat" value="1"${settings.vatRateBps === tax.rateBps ? ' checked' : ''}>
        Confirmo que la tarifa fija incluye IVA a la misma tasa que los artículos (${tax.rateBps / 100} %).</label>` : ''}
      <button>Guardar tarifa de envío</button>
    </form>`;
}
