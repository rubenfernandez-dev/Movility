import { copy, methods, money, escapeHtml } from './views.mjs';
import { compareLabel, viewerLink } from './discovery.mjs';
import { addToCart, cartQuote, coreSKU } from './cart.mjs';
import { trackingHistory } from './tracking.mjs';
import { information } from './information.mjs';

const labels = {
  'de-CH': {
    help: 'Beratung & FAQ', basket: 'Warenkorb', skip: 'Zum Inhalt',
    image: 'Illustrative Studioaufnahme eines kompakten schwarzen Elektrorollstuhls',
    sample: 'Illustration des Demomodells', benefits: ['Versand innerhalb der Schweiz', 'Preise in Schweizer Franken', 'TWINT, PayPal und Karte'],
    browse: 'Produktkatalog', browseAction: 'Katalog ansehen',
    stock: 'Auf Lager', facts: 'Beispiel-Spezifikationen',
    specs: [['Bauweise', 'Faltbarer Rahmen'], ['Bedienung', 'Joystick'], ['Einsatz', 'Alltag und Reisen']],
    add: 'Zum Warenkorb', summary: 'Bestellübersicht', country: 'Schweiz',
    zoomAction: 'Bild vergrössern', technical: 'Technische Daten',
    gallery: 'Produktgalerie', front: 'Schräg von vorn', side: 'Seitenansicht', rear: 'Rückansicht', video: 'Produktvideo',
    transcript: 'Transkript zum Produktvideo lesen', videoUnavailable: 'Dieses Video kann in deinem Browser nicht abgespielt werden.',
    delivery: 'Lieferung im Test', total: 'Gesamtbetrag', quantity: 'Menge', demoData: 'Verwende für diese Testbestellung nur fiktive Angaben.',
    address: 'Lieferadresse', name: 'Vor- und Nachname', street: 'Strasse und Hausnummer', zip: 'Postleitzahl', city: 'Ort',
    faq: 'Häufige Fragen', reference: 'Bestellreferenz', progress: 'Bestellstatus',
  },
  'fr-CH': {
    help: 'Conseils et FAQ', basket: 'Panier', skip: 'Aller au contenu',
    image: 'Vue illustrative en studio d’un fauteuil roulant électrique noir et compact',
    sample: 'Illustration du modèle de démonstration', benefits: ['Livraison en Suisse', 'Prix en francs suisses', 'TWINT, PayPal et carte'],
    browse: 'Catalogue de produits', browseAction: 'Voir le catalogue',
    stock: 'En stock', facts: 'Exemples de caractéristiques',
    specs: [['Structure', 'Châssis pliable'], ['Commande', 'Joystick'], ['Utilisation', 'Quotidien et voyages']],
    add: 'Voir le panier', summary: 'Récapitulatif', country: 'Suisse',
    zoomAction: 'Agrandir l’image', technical: 'Caractéristiques techniques',
    gallery: 'Galerie du fauteuil', front: 'Vue de trois quarts', side: 'Vue de profil', rear: 'Vue arrière', video: 'Vidéo du fauteuil',
    transcript: 'Lire la transcription de la vidéo', videoUnavailable: 'Votre navigateur ne peut pas lire cette vidéo.',
    delivery: 'Livraison simulée', total: 'Total', quantity: 'Quantité', demoData: 'Utilisez uniquement des informations fictives pour cette commande de test.',
    address: 'Adresse de livraison', name: 'Prénom et nom', street: 'Rue et numéro', zip: 'Code postal', city: 'Localité',
    faq: 'Questions fréquentes', reference: 'Référence de commande', progress: 'État de la commande',
  },
};

export const productImage = '/assets/movility-one.jpg';
export const sideImage = '/assets/movility-one-side.jpg';
export const videoPath = '/assets/movility-one.mp4';
export const captionsPath = locale => `/assets/movility-one.${locale}.vtt`;
export const transcriptPath = locale => `/assets/movility-one.${locale}.txt`;
const image = (l, cls = '') => `<img class="${cls}" src="${productImage}" width="1200" height="900" alt="${l.image}">`;
const href = (locale, suffix = '') => `/${locale}${suffix}`;
const button = (url, label) => `<a class="button" href="${url}">${label}</a>`;
const status = (l, t, available) => `<span class="stock ${available ? 'available' : ''}">${available ? l.stock : t.soldOut}</span>`;
export const productAvailability = (locale, available) => status(labels[locale], copy[locale], available);

export function navigation(locale, suffix, query = '', units = 0) {
  const l = labels[locale];
  const alt = locale === 'de-CH' ? 'fr-CH' : 'de-CH';
  return `<a class="skip" href="#content">${l.skip}</a>
    <header class="top"><div class="top-inner"><a class="brand" href="/${locale}"><span aria-hidden="true">M</span> Movility</a>
    <nav><a href="/${locale}#catalogue">${l.browseAction}</a><a href="/${locale}/compare">${compareLabel(locale)}</a><a href="/${locale}#faq">${l.help}</a><a href="/${locale}/contact">${information['/contact'][locale][0]}</a></nav>
    <div class="top-actions"><a href="/${alt}${suffix}${escapeHtml(query)}" lang="${alt}">${alt === 'fr-CH' ? 'Français' : 'Deutsch'}</a><a class="basket" href="/${locale}/cart">${l.basket}${units ? ` (${units})` : ''}</a></div></div></header>`;
}

export function homepage(locale, { filters, products, faqs }) {
  const l = labels[locale];
  return `<ul class="benefits">${l.benefits.map((line) => `<li>${line}</li>`).join('')}</ul>
  <section class="section" id="catalogue" tabindex="-1"><h2>${l.browse}</h2>${filters}${products}</section>
  <section class="section faq" id="faq"><h2>${l.faq}</h2>
    ${faqs.length ? faqs.map(({ question, answer, destination, label }) => `<details>
      <summary>${escapeHtml(question)}</summary><p class="faq-answer">${escapeHtml(answer)}</p>
      ${destination ? `<p><a href="${escapeHtml(href(locale, destination))}">${escapeHtml(label)}</a></p>` : ''}</details>`).join('')
      : `<p><a href="/${locale}/contact">${information['/contact'][locale][0]}</a></p>`}
  </section>`;
}

export function productGallery(locale, name, path, photos, view, demo = false) {
  const l = labels[locale];
  const views = Object.entries(photos).filter(([, url]) => url);
  if (!views.length) return '';
  const selected = views.some(([key]) => key === view) ? view : views[0][0];
  const tabs = views.map(([key, url]) =>
    `<li><a href="/${locale}${path}?view=${key}#gallery" ${key === selected ? 'aria-current="true"' : ''}>
      <img src="${url}" alt="" width="120" height="90"><span>${l[key]}</span></a></li>`).join('');
  return `<section class="product-gallery" id="gallery" aria-label="${l.gallery}">
    <figure class="product-photo"><a href="${photos[selected]}" aria-label="${l.zoomAction}: ${l[selected]}">
      <img src="${photos[selected]}" alt="${l[selected]} · ${escapeHtml(name)}" width="1200" height="900">
      <span class="product-photo-action" aria-hidden="true">${l.zoomAction}</span></a>
      <figcaption>${demo ? l.sample + ' · ' : ''}${l[selected]}</figcaption></figure>
    ${views.length > 1 ? `<ul class="gallery-options">${tabs}</ul>` : ''}</section>`;
}

export function productDetails(locale, specs, features, demo = false) {
  if (!specs.length && !features) return '';
  const l = labels[locale];
  return `<div class="product-details">
    ${specs.length ? `<section class="technical-card"><h2>${demo ? l.facts : l.technical}</h2>
      <dl class="technical-specs">${specs.map(([label, value]) =>
        `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></section>` : ''}
    ${features ? `<section class="technical-card">${features}</section>` : ''}
  </div>`;
}

export function productVideo(locale, media) {
  if (!media) return '';
  const l = labels[locale];
  return `<section class="section product-video"><h2>${l.video}</h2>
    <video controls playsinline preload="none"${media.poster ? ` poster="${media.poster}"` : ''}>
      <source src="${media.video}" type="video/mp4"><track kind="captions" srclang="${locale}" src="${media.captions}" label="${locale === 'de-CH' ? 'Deutsch' : 'Français'}">
      ${l.videoUnavailable}
    </video><p><a href="${media.transcript}">${l.transcript}</a></p></section>`;
}

export function productPage(locale, cents, available, model, { view = 'front', video = false, photos, features = '' } = {}) {
  const l = labels[locale];
  const t = copy[locale];
  const description = (locale === 'de-CH' ? model.description_de : model.description_fr) || t.description;
  return `<section class="product">
    ${productGallery(locale, 'Movility One', '/movility-one', photos || { front: productImage, side: sideImage }, view, !photos)}
    <div class="product-overview"><p class="eyebrow">${t.category}</p><h1>Movility One</h1><p class="lead">${escapeHtml(description)}</p>
      <div class="product-purchase">${status(l, t, available)}<p class="price">${money(locale, cents)}</p>
      <div class="product-actions">${available ? addToCart(locale, coreSKU) : ''}${viewerLink(locale)}
        <a href="/${locale}/compare">${compareLabel(locale)}</a></div></div></div>
  </section>${productDetails(locale, l.specs, features, true)}${productVideo(locale, video === true ? {
    video: videoPath, poster: productImage, captions: captionsPath(locale), transcript: transcriptPath(locale),
  } : video || null)}`;
}

export function cartPage(locale, cents, available, model) {
  const l = labels[locale];
  const t = copy[locale];
  return `<h1 class="page-title">${l.basket}</h1>
    <article class="${model ? 'confirmation' : 'catalog-card'}">${model ? '' : image(l)}<div>${status(l, t, available)}<h2>${escapeHtml(model?.name || 'Movility One')}</h2>
    <dl class="specs"><div><dt>${l.quantity}</dt><dd>1</dd></div><div><dt>${l.total}</dt><dd>${money(locale, cents)}</dd></div></dl>
    <p class="cart-action">${available ? button(href(locale, '/checkout' + (model ? '?model=' + model.sku : '')), t.checkout)
      : button(href(locale, model ? '/models/' + model.sku : '/movility-one'), t.catalog)}</p></div></article>`;
}

export function checkoutPage(locale, cents, id, values = {}, message = '', model, lines, stripeMethods, invalid = []) {
  const l = labels[locale];
  const t = copy[locale];
  const german = locale === 'de-CH';
  const billingTitle = german ? 'Rechnungsadresse' : 'Adresse de facturation';
  const autocomplete = { email: 'email', name: 'name', street: 'street-address', zip: 'postal-code', city: 'address-level2' };
  const names = { ...l, email: t.email, method: t.method };
  const label = key => key.startsWith('bill_') ? billingTitle + ' · ' + names[key.slice(5)] : names[key];
  const error = key => key.endsWith('zip')
    ? (german ? 'Gib eine vierstellige Schweizer Postleitzahl ein.' : 'Saisissez un code postal suisse à quatre chiffres.')
    : key === 'email' ? (german ? 'Gib eine gültige E-Mail-Adresse ein.' : 'Saisissez une adresse e-mail valide.')
      : key === 'method' ? (german ? 'Wähle eine Zahlungsart.' : 'Choisissez un mode de paiement.')
        : (german ? 'Fülle dieses Feld aus und prüfe die Länge.' : 'Renseignez ce champ et vérifiez sa longueur.');
  const invalidAttrs = key => invalid.includes(key) ? `aria-invalid="true" aria-describedby="error-${key}"` : '';
  const inlineError = key => invalid.includes(key) ? `<p class="field-error" id="error-${key}">${error(key)}</p>` : '';
  const field = (name, title, attributes, optional = false) => {
    const key = optional ? name.slice(5) : name;
    const value = optional ? values.billing?.[key] : values[key];
    return `<div><label for="checkout-${name}">${title}</label><input id="checkout-${name}" name="${name}"
      value="${escapeHtml(value || '')}" autocomplete="${optional ? 'billing' : 'shipping'} ${autocomplete[key]}"
      ${optional ? '' : 'required'} ${attributes} ${invalidAttrs(name)}>${inlineError(name)}</div>`;
  };
  const summary = `<aside class="summary" aria-labelledby="checkout-summary"><h2 id="checkout-summary">${l.summary}</h2>
    ${lines ? `<ul>${lines.map(line => `<li>${line.quantity} × ${escapeHtml(line.name)} · ${money(locale, line.quantity * line.cents)}</li>`).join('')}</ul>`
      : `${model ? '' : image(l)}<h3>${escapeHtml(model?.name || 'Movility One')}</h3>`}
    <dl class="specs">
      ${lines ? '' : `<div><dt>${l.quantity}</dt><dd>1</dd></div>`}<div><dt>${l.delivery}</dt><dd>${money(locale, 0)}</dd></div>
      <div><dt>${l.total}</dt><dd>${money(locale, cents)}</dd></div>
    </dl></aside>`;
  return `<h1 class="page-title">${t.checkout}</h1><p>${l.demoData}</p>
    ${message ? `<section class="form-error" tabindex="-1" autofocus aria-labelledby="checkout-error">
      <h2 id="checkout-error">${message}</h2>${invalid.length ? `<ul>${invalid.map(key =>
        `<li><a href="#checkout-${key}">${label(key)} · ${error(key)}</a></li>`).join('')}</ul>` : ''}</section>` : ''}
    <div class="checkout-grid">${summary}<form method="post" novalidate action="/${locale}/checkout${lines ? '/cart' : ''}">
      <input type="hidden" name="id" value="${id}">
      <input type="hidden" name="quotedPrice" value="${cents}">
      ${lines ? `<input type="hidden" name="cartQuote" value="${escapeHtml(cartQuote(lines))}">` : ''}
      ${model ? `<input type="hidden" name="model" value="${model.sku}">` : ''}
      <fieldset><legend>${l.address} · ${l.country}</legend>
        ${field('email', t.email, 'type="email" maxlength="254" placeholder="demo@example.com"')}
        ${field('name', l.name, 'maxlength="100"')}${field('street', l.street, 'maxlength="160"')}
        <div class="address-row">${field('zip', l.zip, 'inputmode="numeric" pattern="[0-9]{4}" maxlength="4"')}
        ${field('city', l.city, 'maxlength="100"')}</div>
      </fieldset>
      <details ${Object.values(values.billing || {}).some(Boolean) || invalid.some(key => key.startsWith('bill_')) ? 'open' : ''}>
        <summary>${locale === 'de-CH' ? 'Abweichende Rechnungsadresse (optional)' : 'Adresse de facturation différente (facultatif)'}</summary>
        <fieldset><legend>${locale === 'de-CH' ? 'Rechnungsadresse · Schweiz' : 'Adresse de facturation · Suisse'}</legend>
        ${['name', 'street', 'zip', 'city'].map(key => field('bill_' + key, l[key],
          `maxlength="${key === 'zip' ? 4 : key === 'street' ? 160 : 100}"
          ${key === 'zip' ? 'inputmode="numeric" pattern="[0-9]{4}"' : ''}`, true)).join('')}</fieldset>
      </details>
      <fieldset><legend>${t.method}</legend>${inlineError('method')}<div class="pay-options">${(stripeMethods || methods).map((method, index) => {
        const label = method === 'Tarjeta' ? (locale === 'de-CH' ? 'Karte (Visa, Mastercard)' : 'Carte (Visa, Mastercard)') : method;
        return `<label class="option"><input type="radio" id="checkout-method${index ? '-' + index : ''}" name="method"
          value="${method}" ${values.method === method ? 'checked' : ''} required ${invalidAttrs('method')}> ${label}</label>`;
      }).join('')}</div></fieldset>
      <div class="product-actions checkout-actions">${stripeMethods ? stripeMethods.length
        ? `<button name="result" value="stripe">${locale === 'de-CH' ? 'Weiter zu Stripe (Test)' : 'Continuer vers Stripe (test)'}</button>`
        : `<p>${locale === 'de-CH' ? 'Für diesen Betrag ist keine Testzahlungsart verfügbar.' : 'Aucun mode de paiement test disponible pour ce montant.'}</p>`
        : `<button name="result" value="paid">${t.pay}</button><button class="secondary" name="result" value="failed">${t.fail}</button>`}</div>
    </form></div>`;
}

export function orderPage(locale, order, events = [], push = '') {
  const l = labels[locale];
  const t = copy[locale];
  const delivered = events.some(event => event.event_status === 'delivered');
  const state = delivered && order.status === 'shipped' ? 'delivered' : order.status;
  const steps = order.status === 'refunded' && !order.tracking ? ['paid', 'refunded']
    : ['paid', 'shipped', ...(delivered ? ['delivered'] : []), ...(order.status === 'refunded' ? ['refunded'] : [])];
  return `<section class="confirmation"><p class="eyebrow">${l.progress}</p><h1 class="page-title">${t[state]}</h1>
    ${order.lines?.length ? `<ul>${order.lines.map(line => `<li>${line.quantity} × ${escapeHtml(line.name)}</li>`).join('')}</ul>` : ''}
    <p>${order.lines?.length ? '' : escapeHtml(order.model_name || 'Movility One') + ' · '}${money(locale, order.cents)} · ${order.method}</p>
    <p>${l.reference} <code>${order.id}</code></p>
    <ol class="timeline">${steps.map((step) => `<li ${step === state ? 'aria-current="step"' : ''}>${t[step]}</li>`).join('')}</ol>
    ${order.tracking ? `<p>${t.tracking} ${escapeHtml(order.tracking)}</p>` : ''}
    ${trackingHistory(locale, events)}
    ${push}
    ${order.lines?.length ? button(href(locale), t.catalog)
      : button(href(locale, order.model_sku ? '/models/' + order.model_sku : '/movility-one'), t.catalog)}</section>`;
}
