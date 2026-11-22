import { copy, methods, money, escapeHtml } from './views.mjs';
import { compareLabel, viewerLink } from './discovery.mjs';
import { addToCart, cartQuote, coreSKU } from './cart.mjs';

const labels = {
  'de-CH': {
    nav: 'Rollstuhl', help: 'Beratung & FAQ', basket: 'Warenkorb', skip: 'Zum Inhalt',
    hero: 'Mobilität, die zu dir passt.', intro: 'Entdecke einen kompakten Elektrorollstuhl für deinen Alltag. Informiere dich in Ruhe und probiere die Bestellung auf Deutsch aus.',
    discover: 'Movility One entdecken', image: 'Illustrative Studioaufnahme eines kompakten schwarzen Elektrorollstuhls',
    sample: 'Illustration des Demomodells', benefits: ['Versand innerhalb der Schweiz', 'Preise in Schweizer Franken', 'TWINT, PayPal und Karte'],
    browse: 'Das Modell im Überblick', fit: 'Kompakt und faltbar', drive: 'Steuerung per Joystick',
    stock: 'Auf Lager', details: 'Details ansehen', facts: 'Beispiel-Spezifikationen',
    specs: [['Bauweise', 'Faltbarer Rahmen'], ['Bedienung', 'Joystick'], ['Einsatz', 'Alltag und Reisen']],
    zoom: 'Produktbild vergrössern', add: 'Zum Warenkorb', summary: 'Bestellübersicht', country: 'Schweiz',
    gallery: 'Produktgalerie', front: 'Schräg von vorn', side: 'Seitenansicht', rear: 'Rückansicht', video: 'Produktvideo',
    transcript: 'Transkript zum Produktvideo lesen', videoUnavailable: 'Dieses Video kann in deinem Browser nicht abgespielt werden.',
    delivery: 'Lieferung im Test', total: 'Gesamtbetrag', quantity: 'Menge', demoData: 'Verwende für diese Testbestellung nur fiktive Angaben.',
    address: 'Lieferadresse', name: 'Vor- und Nachname', street: 'Strasse und Hausnummer', zip: 'Postleitzahl', city: 'Ort',
    faq: 'Häufige Fragen', questions: [
      ['Wohin liefert der Shop?', 'Der Testshop ist für Lieferadressen in der Schweiz eingerichtet.'],
      ['Wird meine Karte belastet?', 'Die Bestellung simuliert die Zahlung. Es werden keine Kartendaten verlangt.'],
      ['Wie verfolge ich die Bestellung?', 'Auf der Bestellseite erscheint die Sendungsnummer, sobald der Versand im Testpanel erfasst wurde.'],
    ], reference: 'Bestellreferenz', progress: 'Bestellstatus',
  },
  'fr-CH': {
    nav: 'Fauteuil', help: 'Conseils et FAQ', basket: 'Panier', skip: 'Aller au contenu',
    hero: 'La mobilité qui vous ressemble.', intro: 'Découvrez un fauteuil roulant électrique compact pour le quotidien. Prenez le temps de le découvrir et testez la commande en français.',
    discover: 'Découvrir le Movility One', image: 'Vue illustrative en studio d’un fauteuil roulant électrique noir et compact',
    sample: 'Illustration du modèle de démonstration', benefits: ['Livraison en Suisse', 'Prix en francs suisses', 'TWINT, PayPal et carte'],
    browse: 'Le fauteuil en un coup d’œil', fit: 'Compact et pliable', drive: 'Commande par joystick',
    stock: 'En stock', details: 'Voir les détails', facts: 'Exemples de caractéristiques',
    specs: [['Structure', 'Châssis pliable'], ['Commande', 'Joystick'], ['Utilisation', 'Quotidien et voyages']],
    zoom: 'Agrandir la photo du fauteuil', add: 'Voir le panier', summary: 'Récapitulatif', country: 'Suisse',
    gallery: 'Galerie du fauteuil', front: 'Vue de trois quarts', side: 'Vue de profil', rear: 'Vue arrière', video: 'Vidéo du fauteuil',
    transcript: 'Lire la transcription de la vidéo', videoUnavailable: 'Votre navigateur ne peut pas lire cette vidéo.',
    delivery: 'Livraison simulée', total: 'Total', quantity: 'Quantité', demoData: 'Utilisez uniquement des informations fictives pour cette commande de test.',
    address: 'Adresse de livraison', name: 'Prénom et nom', street: 'Rue et numéro', zip: 'Code postal', city: 'Localité',
    faq: 'Questions fréquentes', questions: [
      ['Où livrez-vous ?', 'La boutique de test est configurée pour les adresses de livraison en Suisse.'],
      ['Ma carte sera-t-elle débitée ?', 'Le paiement est simulé. Aucune donnée de carte bancaire ne vous est demandée.'],
      ['Comment suivre ma commande ?', 'Le numéro de suivi apparaît sur la page de commande dès que l’expédition est enregistrée dans le panneau de test.'],
    ], reference: 'Référence de commande', progress: 'État de la commande',
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

export function navigation(locale, suffix, query = '', units = 0) {
  const l = labels[locale];
  const alt = locale === 'de-CH' ? 'fr-CH' : 'de-CH';
  return `<a class="skip" href="#content">${l.skip}</a>
    <header class="top"><div class="top-inner"><a class="brand" href="/${locale}"><span aria-hidden="true">M</span> Movility</a>
    <nav><a href="/${locale}/movility-one">${l.nav}</a><a href="/${locale}/compare">${compareLabel(locale)}</a><a href="/${locale}#faq">${l.help}</a></nav>
    <div class="top-actions"><a href="/${alt}${suffix}${escapeHtml(query)}" lang="${alt}">${alt === 'fr-CH' ? 'Français' : 'Deutsch'}</a><a class="basket" href="/${locale}/cart">${l.basket}${units ? ` (${units})` : ''}</a></div></div></header>`;
}

export function homepage(locale, cents, available, extras = '') {
  const l = labels[locale];
  const t = copy[locale];
  const product = href(locale, '/movility-one');
  return `<section class="hero">
    <div class="hero-copy"><p class="eyebrow">${t.category}</p><h1>${l.hero}</h1><p class="lead">${l.intro}</p>
      <div class="product-actions">${button(product, l.discover)}${viewerLink(locale)}</div></div>
    <figure>${image(l)}<figcaption>${l.sample}</figcaption></figure>
  </section>
  <ul class="benefits">${l.benefits.map((line) => `<li>${line}</li>`).join('')}</ul>
  <section class="section"><h2>${l.browse}</h2><article class="catalog-card">
    <a href="${product}" aria-label="${l.discover}">${image(l)}</a><div>
      ${status(l, t, available)}<h3>Movility One</h3><p>${l.fit} · ${l.drive}</p>
      <p class="price">${money(locale, cents)}</p><a href="${product}">${l.details}</a></div>
  </article></section>
  ${extras}<section class="section faq" id="faq"><h2>${l.faq}</h2>
    ${l.questions.map(([question, answer]) => `<details><summary>${question}</summary><p>${answer}</p></details>`).join('')}
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
    <figure class="product-photo"><a href="${photos[selected]}" aria-label="${l.zoom}: ${l[selected]}">
      <img src="${photos[selected]}" alt="${l[selected]} · ${escapeHtml(name)}" width="1200" height="900"></a>
      <figcaption>${demo ? l.sample + ' · ' : ''}${l[selected]}</figcaption></figure>
    ${views.length > 1 ? `<ul class="gallery-options">${tabs}</ul>` : ''}</section>`;
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

export function productPage(locale, cents, available, model, { view = 'front', video = false } = {}) {
  const l = labels[locale];
  const t = copy[locale];
  const description = (locale === 'de-CH' ? model.description_de : model.description_fr) || t.description;
  return `<section class="product">
    ${productGallery(locale, 'Movility One', '/movility-one', { front: productImage, side: sideImage }, view, true)}
    <div><p class="eyebrow">${t.category}</p><h1>Movility One</h1><p class="lead">${escapeHtml(description)}</p>
      ${status(l, t, available)}<p class="price">${money(locale, cents)}</p>
      <div class="product-actions">${available ? addToCart(locale, coreSKU) : ''}${viewerLink(locale)}
        <a href="/${locale}/compare">${compareLabel(locale)}</a></div>
      <h2>${l.facts}</h2><dl class="specs">${l.specs.map(([key, value]) => `<div><dt>${key}</dt><dd>${value}</dd></div>`).join('')}</dl></div>
  </section>${productVideo(locale, video ? {
    video: videoPath, poster: productImage, captions: captionsPath(locale), transcript: transcriptPath(locale),
  } : null)}`;
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

export function checkoutPage(locale, cents, id, values = {}, message = '', model, lines) {
  const l = labels[locale];
  const t = copy[locale];
  const field = (name, label, attributes) => `<label>${label}<input name="${name}" value="${escapeHtml(values[name] || '')}" required ${attributes}></label>`;
  return `<h1 class="page-title">${t.checkout}</h1><p>${l.demoData}</p>
    ${message ? `<p class="form-error" role="alert">${message}</p>` : ''}
    <div class="checkout-grid"><form method="post" action="/${locale}/checkout${lines ? '/cart' : ''}">
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
      <fieldset><legend>${t.method}</legend><div class="pay-options">${methods.map((method) => `<label class="option"><input type="radio" name="method" value="${method}" ${values.method === method ? 'checked' : ''} required> ${method}</label>`).join('')}</div></fieldset>
      <button name="result" value="paid">${t.pay}</button>
      <button class="secondary" name="result" value="failed">${t.fail}</button>
    </form><aside class="summary"><h2>${l.summary}</h2>
      ${lines ? `<ul>${lines.map(line => `<li>${line.quantity} × ${escapeHtml(line.name)} · ${money(locale, line.quantity * line.cents)}</li>`).join('')}</ul>`
        : `${model ? '' : image(l)}<h3>${escapeHtml(model?.name || 'Movility One')}</h3>`}
      <dl class="specs">
        ${lines ? '' : `<div><dt>${l.quantity}</dt><dd>1</dd></div>`}<div><dt>${l.delivery}</dt><dd>${money(locale, 0)}</dd></div>
        <div><dt>${l.total}</dt><dd>${money(locale, cents)}</dd></div>
      </dl></aside></div>`;
}

export function orderPage(locale, order) {
  const l = labels[locale];
  const t = copy[locale];
  const steps = order.status === 'refunded' && !order.tracking ? ['paid', 'refunded']
    : ['paid', 'shipped', ...(order.status === 'refunded' ? ['refunded'] : [])];
  return `<section class="confirmation"><p class="eyebrow">${l.progress}</p><h1 class="page-title">${t[order.status]}</h1>
    ${order.lines?.length ? `<ul>${order.lines.map(line => `<li>${line.quantity} × ${escapeHtml(line.name)}</li>`).join('')}</ul>` : ''}
    <p>${order.lines?.length ? '' : escapeHtml(order.model_name || 'Movility One') + ' · '}${money(locale, order.cents)} · ${order.method}</p>
    <p>${l.reference} <code>${order.id}</code></p>
    <ol class="timeline">${steps.map((step) => `<li ${step === order.status ? 'aria-current="step"' : ''}>${t[step]}</li>`).join('')}</ol>
    ${order.tracking ? `<p>${t.tracking} ${escapeHtml(order.tracking)}</p>` : ''}
    ${order.lines?.length ? button(href(locale), t.catalog)
      : button(href(locale, order.model_sku ? '/models/' + order.model_sku : '/movility-one'), t.catalog)}</section>`;
}
