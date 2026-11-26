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
    added: 'Zum Warenkorb hinzugefügt', see: 'Zum Warenkorb', keep: 'Weiter einkaufen',
    available: 'Verfügbar', subtotal: 'Zwischensumme', correction: 'Bitte ändere die Menge oder entferne diesen Artikel.',
  },
  'fr-CH': {
    cart: 'Panier', add: 'Ajouter au panier', empty: 'Votre panier est vide.', browse: 'Voir les modèles',
    quantity: 'Quantité', price: 'Prix unitaire', total: 'Total', update: 'Mettre à jour', remove: 'Retirer',
    unavailable: 'La quantité demandée n’est plus disponible. Modifiez votre panier.',
    changed: 'Votre panier ou un prix a changé. Vérifiez le total et confirmez à nouveau.',
    added: 'Ajouté au panier', see: 'Voir le panier', keep: 'Continuer mes achats',
    available: 'Disponible', subtotal: 'Sous-total', correction: 'Modifiez la quantité ou retirez cet article.',
  },
};
export const cartText = locale => labels[locale];

export function addToCart(locale, sku, secondary = false) {
  return `<form class="cart-add" method="post" action="/${locale}/cart">
    <input type="hidden" name="sku" value="${sku}">
    <button${secondary ? ' class="secondary"' : ''} name="action" value="add">${labels[locale].add}</button></form>`;
}

export function basketPage(locale, lines, message = '', { added = '', rejected = '', live = false } = {}) {
  const l = labels[locale];
  const t = copy[locale];
  const addedLine = lines.find(line => line.sku === added);
  return `<h1 class="page-title">${l.cart}</h1>
    ${message ? `<p class="form-error" role="alert" tabindex="-1" autofocus>${rejected ? escapeHtml(rejected) + ' · ' : ''}${message}</p>` : ''}
    ${addedLine ? `<section class="cart-feedback" aria-labelledby="cart-added" tabindex="-1" autofocus>
      <h2 id="cart-added">${l.added}</h2><p>${escapeHtml(addedLine.name)} · ${l.quantity}: ${addedLine.quantity}</p>
      <div class="product-actions"><a class="button" href="#basket-items">${l.see}</a><a class="button secondary" href="/${locale}#catalogue">${l.keep}</a></div></section>` : ''}
    ${lines.length ? `<div class="basket-lines" id="basket-items" tabindex="-1">${lines.map(item => {
      const name = escapeHtml(item.name);
      const path = item.sku === coreSKU ? '/mobility-one' : '/models/' + item.sku;
      return `<article><h2 id="basket-item-${item.sku}"><a href="/${locale}${path}">${name}</a></h2>
        ${item.available ? `<span class="stock available">${l.available}</span>` :
          `<p class="field-error">${l.available}: ${item.units}. ${l.correction}</p>`}
        <p>${l.price}: ${money(locale, item.cents)} · ${l.subtotal}: ${money(locale, item.cents * item.quantity)}</p>
        <form class="basket-edit" method="post" action="/${locale}/cart" aria-labelledby="basket-item-${item.sku}">
          <input type="hidden" name="sku" value="${item.sku}">
          <label>${l.quantity}<input type="number" name="quantity" min="1" max="${Math.min(maxQuantity, item.units)}" value="${item.quantity}" required ${item.units ? '' : 'disabled'}></label>
          <button name="action" value="update" ${item.units ? '' : 'disabled'}>${l.update}</button>
          <button class="secondary" name="action" value="remove" formnovalidate>${l.remove}</button>
        </form></article>`;
    }).join('')}</div><p class="basket-total"><span>${l.subtotal}</span><strong>${money(locale, cartTotal(lines))}</strong></p>` : `<p class="basket-empty">${l.empty}</p>`}
    <div class="product-actions basket-actions">${canCheckout(lines) ? `<a class="button basket-checkout" href="/${locale}/checkout/cart">${live ? t.commercialCheckout : t.checkout}</a>` : ''}
      <a class="button${lines.length ? ' secondary' : ''}" href="/${locale}#catalogue">${l.browse}</a></div>`;
}
