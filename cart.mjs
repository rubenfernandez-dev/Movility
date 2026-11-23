import { copy, escapeHtml, money } from './views.mjs';

export const skuPattern = /^[a-z0-9][a-z0-9-]{1,23}$/;
export const coreSKU = 'one';
const cookieName = 'movility_cart';
const maxQuantity = 99;
const skuIsValid = sku => sku === coreSKU || skuPattern.test(sku);
const quantityIsValid = value => Number.isInteger(value) && value > 0 && value <= maxQuantity;

export function readCart(req) {
  const cookie = req.headers.cookie?.split(';').map(value => value.trim())
    .find(value => value.startsWith(cookieName + '='));
  if (!cookie) return new Map();
  try {
    const entries = JSON.parse(decodeURIComponent(cookie.slice(cookieName.length + 1)));
    if (!Array.isArray(entries) || entries.length > 10) return new Map();
    return new Map(entries.filter(entry => Array.isArray(entry) && typeof entry[0] === 'string' &&
      skuIsValid(entry[0]) && quantityIsValid(entry[1])));
  } catch {
    return new Map();
  }
}

export function cartCookie(cart, secure) {
  const value = encodeURIComponent(JSON.stringify([...cart]));
  return `${cookieName}=${value}; Path=/; Max-Age=${cart.size ? 604800 : 0}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function changeCart(cart, fields, product) {
  const sku = fields?.get('sku') || '';
  const action = fields?.get('action');
  if (!skuIsValid(sku) || !['add', 'update', 'remove'].includes(action)) return false;
  if (action === 'remove') {
    cart.delete(sku);
    return true;
  }
  const units = action === 'add' ? (cart.get(sku) || 0) + 1 : Number(fields.get('quantity'));
  const model = product(sku);
  if (!quantityIsValid(units) || (!cart.has(sku) && cart.size >= 10) || !model || model.units < units) return false;
  cart.set(sku, units);
  return true;
}

export function cartLines(cart, product) {
  return [...cart].map(([sku, quantity]) => {
    const model = product(sku);
    return { sku, quantity, name: model?.name || sku, cents: model?.cents ?? 0,
      requires_serial: model?.requires_serial ?? 1,
      units: model?.units ?? 0, available: Boolean(model && model.units >= quantity) };
  });
}

export function cartQuote(lines) {
  return JSON.stringify(lines.map(({ sku, quantity, cents }) => [sku, quantity, cents]).sort(([a], [b]) => a.localeCompare(b)));
}

export const cartTotal = lines => lines.reduce((total, item) => total + item.quantity * item.cents, 0);
export const canCheckout = lines => lines.length > 0 && lines.every(line => line.available);

const labels = {
  'de-CH': {
    cart: 'Warenkorb', add: 'In den Warenkorb', empty: 'Dein Warenkorb ist leer.', browse: 'Modelle ansehen',
    quantity: 'Menge', price: 'Einzelpreis', total: 'Gesamtbetrag', update: 'Aktualisieren', remove: 'Entfernen',
    unavailable: 'Die gewünschte Menge ist nicht mehr verfügbar. Passe den Warenkorb an.',
    changed: 'Dein Warenkorb oder ein Preis hat sich geändert. Prüfe den Gesamtbetrag und bestätige erneut.',
  },
  'fr-CH': {
    cart: 'Panier', add: 'Ajouter au panier', empty: 'Votre panier est vide.', browse: 'Voir les modèles',
    quantity: 'Quantité', price: 'Prix unitaire', total: 'Total', update: 'Mettre à jour', remove: 'Retirer',
    unavailable: 'La quantité demandée n’est plus disponible. Modifiez votre panier.',
    changed: 'Votre panier ou un prix a changé. Vérifiez le total et confirmez à nouveau.',
  },
};
export const cartText = locale => labels[locale];

export function addToCart(locale, sku) {
  return `<form class="cart-add" method="post" action="/${locale}/cart">
    <input type="hidden" name="sku" value="${sku}">
    <button name="action" value="add">${labels[locale].add}</button></form>`;
}

export function basketPage(locale, lines, message = '') {
  const l = labels[locale];
  const t = copy[locale];
  return `<h1 class="page-title">${l.cart}</h1>
    ${message ? `<p class="form-error" role="alert">${message}</p>` : ''}
    ${lines.length ? `<div class="basket-lines">${lines.map(item => {
      const name = escapeHtml(item.name);
      const path = item.sku === coreSKU ? '/movility-one' : '/models/' + item.sku;
      return `<article><h2><a href="/${locale}${path}">${name}</a></h2>
        ${item.available ? '' : `<p class="form-error">${l.unavailable}</p>`}
        <p>${l.price}: ${money(locale, item.cents)} · ${l.total}: ${money(locale, item.cents * item.quantity)}</p>
        <form class="basket-edit" method="post" action="/${locale}/cart">
          <input type="hidden" name="sku" value="${item.sku}">
          <label>${l.quantity}<input type="number" name="quantity" min="1" max="${maxQuantity}" value="${item.quantity}" required></label>
          <button name="action" value="update">${l.update}</button>
          <button class="secondary" name="action" value="remove" formnovalidate>${l.remove}</button>
        </form></article>`;
    }).join('')}</div><p class="price">${l.total}: ${money(locale, cartTotal(lines))}</p>` : `<p>${l.empty}</p>`}
    <div class="product-actions">${canCheckout(lines) ? `<a class="button" href="/${locale}/checkout/cart">${t.checkout}</a>` : ''}
      <a class="button secondary" href="/${locale}">${l.browse}</a></div>`;
}
