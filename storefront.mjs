import { productOffer, productSpecs } from './product-specs.mjs';
import { deliveryCountries } from './delivery-countries.mjs';
import { copy, methods, money, escapeHtml, storefrontBrand } from './views.mjs';
import { compareLabel, comparisonLink, comparisonQuery, viewerLink, withQuery } from './discovery.mjs';
import { addToCart, cartQuote, coreSKU } from './cart.mjs';
import { shippingPrice, shippingQuote, shippingText } from './shipping.mjs';
import { trackingHistory } from './tracking.mjs';
import { information } from './information.mjs';
import { oneFitPanel, oneVideoLabel, oneDistinction } from './movility-one-details.mjs';

const labels = {
  'de-CH': {
    help: 'Beratung & FAQ', basket: 'Warenkorb', skip: 'Zum Inhalt', menu: 'Menü', navigation: 'Hauptnavigation',
    image: 'Illustrative Studioaufnahme eines kompakten schwarzen Elektrorollstuhls',
    sample: 'Illustration des Demomodells',
    browse: 'Produktkatalog', browseAction: 'Katalog ansehen',
    hero: 'Elektrorollstühle für den Alltag', heroAction: 'Elektrorollstühle ansehen',
    heroIntro: 'Vergleiche Elektrorollstühle und finde das Modell, das zu dir passt.',
    advice: 'Beratung anfragen', noPhoto: 'Kein Produktfoto verfügbar', deliveryLink: 'Lieferung innerhalb der Schweiz',
    alternatives: 'Alternativen vergleichen', technicalLink: 'Masse und technische Daten', compatibilityLink: 'Kompatibilität',
    stock: 'Auf Lager',
    add: 'Zum Warenkorb', summary: 'Bestellübersicht', country: 'Lieferland',
    zoomAction: 'Bild vergrössern', technical: 'Technische Daten',
    gallery: 'Produktgalerie', front: 'Schräg von vorn', side: 'Seitenansicht', rear: 'Rückansicht', video: 'Produktvideo',
    transcript: 'Transkript zum Produktvideo lesen', videoUnavailable: 'Dieses Video kann in deinem Browser nicht abgespielt werden.',
    delivery: 'Lieferung im Test', total: 'Gesamtbetrag', quantity: 'Menge', demoData: 'Verwende für diese Testbestellung nur fiktive Angaben.',
    address: 'Lieferadresse', name: 'Vor- und Nachname', street: 'Strasse und Hausnummer', zip: 'Postleitzahl', city: 'Ort',
    faq: 'Häufige Fragen', reference: 'Bestellreferenz', progress: 'Bestellstatus',
  },
  'fr-CH': {
    help: 'Conseils et FAQ', basket: 'Panier', skip: 'Aller au contenu', menu: 'Menu', navigation: 'Navigation principale',
    image: 'Vue illustrative en studio d’un fauteuil roulant électrique noir et compact',
    sample: 'Illustration du modèle de démonstration',
    browse: 'Catalogue de produits', browseAction: 'Voir le catalogue',
    hero: 'Fauteuils roulants électriques au quotidien', heroAction: 'Voir les fauteuils électriques',
    heroIntro: 'Comparez les fauteuils électriques pour choisir le modèle qui vous convient.',
    advice: 'Demander conseil', noPhoto: 'Photo du produit indisponible', deliveryLink: 'Livraison en Suisse',
    alternatives: 'Comparer les autres modèles', technicalLink: 'Dimensions et caractéristiques', compatibilityLink: 'Compatibilité',
    stock: 'En stock',
    add: 'Voir le panier', summary: 'Récapitulatif', country: 'Pays de livraison',
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
const button = (url, label, secondary = false) => `<a class="button${secondary ? ' secondary' : ''}" href="${url}">${label}</a>`;
const status = (l, t, available) => `<span class="stock ${available ? 'available' : ''}">${available ? l.stock : t.soldOut}</span>`;
export const productAvailability = (locale, available) => status(labels[locale], copy[locale], available);

export function missingProductPhoto(locale) {
  return `<div class="product-placeholder">${labels[locale].noPhoto}</div>`;
}

export function homeHero(locale, chair, photo, alt, demo, context = new URLSearchParams()) {
  const l = labels[locale];
  const chairs = comparisonQuery(context);
  chairs.set('family', 'wheelchair');
  chairs.delete('compatible');
  const french = locale === 'fr-CH';
  const catalogue = chair ? withQuery('/' + locale, chairs) : '/' + locale;
  const modelPath = chair?.sku === coreSKU ? '/mobility-one' : '/models/' + chair?.sku;
  return `<section class="home-hero${chair ? '' : ' home-hero-brand'}" aria-labelledby="home-title">
    <div class="home-hero-inner">
      <div class="home-hero-copy">
        <h1 id="home-title" lang="${locale}">${chair ? l.hero : 'Mobility'}</h1>
        <p>${chair ? l.heroIntro : french ? 'Fauteuils roulants électriques et conseils pour choisir selon vos besoins.' : 'Elektrorollstühle und Beratung für deine Bedürfnisse.'}</p>
        <div class="home-hero-actions">
          <a class="button" href="${escapeHtml(catalogue)}#catalogue">${chair ? l.heroAction : l.browseAction}</a>
          ${chair ? `<a href="${escapeHtml(comparisonLink(locale, context))}">${compareLabel(locale)}</a>` : ''}
          <a href="/${locale}/contact">${l.advice}</a>
        </div>
      </div>
      ${chair ? `<figure class="home-hero-media${demo ? ' demo-photo' : ''}">
        ${photo ? `<img src="${escapeHtml(photo)}" alt="${escapeHtml(alt || (demo ? l.image : chair.name))}" width="1200" height="900" fetchpriority="high">` : missingProductPhoto(locale)}
        <figcaption><a href="${escapeHtml(withQuery('/' + locale + modelPath, context))}">${escapeHtml(chair.name)}</a>${demo ? `<span>${l.sample}</span>` : ''}</figcaption>
      </figure>` : ''}
    </div>
  </section>`;
}

export function homeModelDetail(locale, photo, context) {
  const french = locale === 'fr-CH';
  const title = french ? 'Mobility One de profil' : 'Mobility One von der Seite';
  const description = french
    ? 'Cette vue du modèle de démonstration montre le châssis, les roues et le repose-pieds.'
    : 'Diese Ansicht des Demomodells zeigt den Rahmen, die Räder und die Fussstütze.';
  const query = comparisonQuery(context);
  query.set('view', 'side');
  const source = escapeHtml(withQuery('/' + locale + '/mobility-one', query));
  return `<section class="home-model-detail section" aria-labelledby="home-model-detail-title">
    <img src="${escapeHtml(photo)}" alt="" width="1200" height="900" loading="lazy">
    <div><h2 id="home-model-detail-title">${title}</h2><p>${description}</p>
      <a href="${source}#gallery">${french ? 'Voir la galerie du modèle' : 'Zur Galerie des Modells'}</a></div>
  </section>`;
}

export function navigation(locale, suffix, query = '', units = 0, context = new URLSearchParams(), languageHref) {
  const l = labels[locale];
  const alt = locale === 'de-CH' ? 'fr-CH' : 'de-CH';
  const french = alt === 'fr-CH';
  const languageName = french ? 'Français' : 'Deutsch';
  const links = `<a href="${escapeHtml(withQuery('/' + locale, context))}#catalogue">${l.browseAction}</a><a href="${escapeHtml(comparisonLink(locale, context))}">${compareLabel(locale)}</a>
    <a href="/${locale}#faq">${l.help}</a><a href="/${locale}/about"${suffix === '/about' ? ' aria-current="page"' : ''}>${information['/about'][locale][0]}</a>
    <a href="/${locale}/contact"${suffix === '/contact' ? ' aria-current="page"' : ''}>${information['/contact'][locale][0]}</a>`;
  return `<a class="skip" href="#content">${l.skip}</a>
    <header class="top"><div class="top-inner storefront-header">${storefrontBrand(locale)}
    <nav class="storefront-nav" aria-label="${l.navigation}">${links}</nav>
    <div class="top-actions">
      <details class="storefront-menu">
        <summary class="header-control" aria-label="${l.menu}">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true" focusable="false"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </summary>
        <nav aria-label="${l.navigation}">${links}</nav>
      </details>
      <a class="header-control header-language" href="${escapeHtml(languageHref || `/${alt}${suffix}${query}`)}" lang="${alt}" hreflang="${alt}" aria-label="${languageName}">${french ? 'FRA' : 'DE'}</a>
      <a class="header-control basket" href="/${locale}/cart" aria-label="${l.basket}${units ? ` (${units})` : ''}">
        <svg viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">
          <path d="M2 3h3l2.4 12h12l2.1-8H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>
        </svg>${units ? `<span class="basket-count" aria-hidden="true">${units}</span>` : ''}
      </a>
    </div></div></header>`;
}

export function homepage(locale, { filters, products, faqs, selection = '', detail = '' }) {
  const l = labels[locale];
  return `<section class="section" id="catalogue" tabindex="-1"><h2>${l.browse}</h2>${filters}${selection}${products}</section>
  ${detail}<section class="section faq" id="faq"><h2>${l.faq}</h2>
    ${faqs.length ? faqs.map(({ question, answer, destination, label }) => `<details>
      <summary>${escapeHtml(question)}</summary><p class="faq-answer">${escapeHtml(answer)}</p>
      ${destination ? `<p><a href="${escapeHtml(href(locale, destination))}">${escapeHtml(label)}</a></p>` : ''}</details>`).join('')
      : `<p><a href="/${locale}/contact">${information['/contact'][locale][0]}</a></p>`}
  </section>`;
}

export function productGallery(locale, name, path, photos, view, demo = false, alts = {}, previewPath = '', context = new URLSearchParams()) {
  const l = labels[locale];
  const views = Object.entries(photos).filter(([, url]) => url);
  if (!views.length) return null;
  const selected = views.some(([key]) => key === view) ? view : views[0][0];
  const tabs = views.map(([key, url]) => {
    const params = comparisonQuery(context);
    params.set('view', key);
    return `<li><a href="${escapeHtml(withQuery(previewPath || `/${locale}${path}`, params))}#gallery" ${key === selected ? 'aria-current="true"' : ''}>
      <img src="${url}" alt="" width="120" height="90"><span>${l[key]}</span></a></li>`;
  }).join('');
  return {
    photo: `<figure class="product-photo" id="gallery" tabindex="-1" aria-label="${l.gallery}">
      <img src="${photos[selected]}" alt="${escapeHtml(alts[selected] || l[selected] + ' · ' + name)}" width="1200" height="900">
      <figcaption>${demo ? l.sample + ' · ' : ''}${l[selected]}</figcaption></figure>`,
    controls: `<div class="product-gallery" role="group" aria-label="${l.gallery}">
      <a class="button secondary product-zoom" href="${photos[selected]}">${l.zoomAction}</a>
      ${views.length > 1 ? `<ul class="gallery-options">${tabs}</ul>` : ''}</div>`,
  };
}

export function productDetails(locale, specs, features) {
  if (!specs.length && !features) return '';
  const l = labels[locale];
  return `<div class="product-details">
    ${specs.length ? `<section class="technical-card" id="product-specifications" tabindex="-1"><h2>${l.technical}</h2>
      <dl class="technical-specs">${specs.map(([label, value]) =>
        `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></section>` : ''}
    ${features ? `<section class="technical-card">${features}</section>` : ''}
  </div>`;
}

export function productOverview(locale, { name, category, description, sku, cents, available, chair = true,
  specifications = false, compatibility = false, preview = false, context = new URLSearchParams(), afterPurchase = '', gallery, mediaActions = '', part = null }) {
  const l = labels[locale];
  const compare = comparisonLink(locale, context, available ? sku : undefined);
  return `<section class="product${gallery ? '' : ' product-no-gallery'}" itemscope itemtype="https://schema.org/Product">
    <div class="product-heading"><p class="eyebrow">${escapeHtml(category)}</p><h1 itemprop="name">${escapeHtml(name)}</h1></div>
    <div class="product-media">${gallery?.photo || missingProductPhoto(locale)}</div>
    <div class="product-purchase">
      <div class="product-price-row"><p class="price">${money(locale, cents)}</p>${productAvailability(locale, available)}</div>
      ${productOffer(cents, available)}
      ${part?.html || ''}
      ${!preview ? `<div class="product-actions">${part?.pending ? `<a class="button" href="/${locale}/contact?model=${sku}&amp;topic=compatibility">${locale === 'de-CH' ? 'Kompatibilität anfragen' : 'Vérifier la compatibilité'}</a>` : ''}
        ${available ? addToCart(locale, sku, part?.pending) : ''}
        ${chair ? `<a class="button secondary" href="${escapeHtml(compare)}">${available ? compareLabel(locale) : l.alternatives}</a>` : ''}
        ${part?.pending ? '' : `<a class="button ${available || chair ? 'secondary' : ''}" href="/${locale}/contact?model=${sku}">${l.advice}</a>`}</div>` : ''}
      <p class="product-delivery"><a href="/${locale}/delivery-returns-warranty">${l.deliveryLink}</a></p>
    </div>
    ${gallery || mediaActions ? `<div class="product-media-actions">${gallery?.controls || ''}${mediaActions}</div>` : ''}
    <div class="product-notes">${afterPurchase}
    <p class="lead product-description" itemprop="description">${escapeHtml(description)}</p>
    ${specifications || compatibility && !part ? `<div class="product-quicklinks">
      ${specifications ? `<a href="#product-specifications">${l.technicalLink}</a>` : ''}
      ${compatibility && !part ? `<a href="#product-compatibility">${l.compatibilityLink}</a>` : ''}</div>` : ''}
  </div></section>`;
}

export function productVideo(locale, media, title) {
  if (!media) return '';
  const l = labels[locale];
  return `<section class="section product-video" id="${media.id || 'product-video'}" tabindex="-1"><h3>${escapeHtml(title || l.video)}</h3>
    <video controls playsinline preload="none"${media.poster ? ` poster="${media.poster}"` : ''}>
      <source src="${media.video}" type="video/mp4"><track kind="captions" srclang="${locale}" src="${media.captions}" label="${locale === 'de-CH' ? 'Deutsch' : 'Français'}">
      ${l.videoUnavailable}
    </video><p><a href="${media.transcript}">${l.transcript}</a></p></section>`;
}

export function galleryVideos(locale, managed = [], legacy, legacyFolding = false) {
  const l = labels[locale];
  const heading = locale === 'de-CH' ? 'Videos zum Modell' : 'Vidéos du modèle';
  const videos = [...managed, ...(legacy ? [{ ...legacy, id: 'product-video',
    title: legacyFolding ? oneVideoLabel(locale) : l.video, purpose: legacyFolding ? 'folding' : 'other' }] : [])];
  return {
    folding: videos.find(item => item.purpose === 'folding')?.id,
    links: videos.length ? `<nav aria-label="${heading}" class="gallery-video-links"><ul>${videos.map(item =>
      `<li><a href="#${item.id}">${escapeHtml(item.title)}</a></li>`).join('')}</ul></nav>` : '',
    players: videos.length ? `<section class="section" aria-labelledby="gallery-videos-title"><h2 id="gallery-videos-title">${heading}</h2>
      ${videos.map(item => productVideo(locale, item, item.title)).join('')}</section>` : '',
  };
}

export function productPage(locale, cents, available, model, { view = 'front', video = false, videos = [], photos, features = '', alts = {}, previewPath = '',
  demoPhotos = !photos, compatibility = '', context = new URLSearchParams(), details = {} } = {}) {
  const l = labels[locale];
  const t = copy[locale];
  const description = (locale === 'de-CH' ? model.description_de : model.description_fr) || t.description;
  const gallery = galleryVideos(locale, videos, video === true ? {
    video: videoPath, poster: productImage, captions: captionsPath(locale), transcript: transcriptPath(locale),
  } : video, details.folding_video);
  const fit = oneFitPanel(locale, details, gallery.folding);
  const distinction = `<p class="one-distinction">${escapeHtml(oneDistinction(locale, details))}</p>`;
  const photosAndControls = productGallery(locale, 'Mobility One', '/mobility-one',
    photos || { front: productImage, side: sideImage }, view, demoPhotos, alts, previewPath, context);
  return `${productOverview(locale, { name: 'Mobility One', category: t.category, description, sku: coreSKU, cents, available,
      compatibility: Boolean(compatibility), specifications: true, preview: Boolean(previewPath), context, afterPurchase: distinction + fit,
      gallery: photosAndControls, mediaActions: (previewPath ? '' : viewerLink(locale)) + gallery.links })}
    ${productDetails(locale, productSpecs(locale, model), features)}${compatibility}${gallery.players}`;
}

export function cartPage(locale, cents, available, model, live = false) {
  const l = labels[locale];
  const t = copy[locale];
  return `<h1 class="page-title">${l.basket}</h1>
    <article class="${model ? 'confirmation' : 'catalog-card'}">${model ? '' : image(l)}<div>${status(l, t, available)}<h2>${escapeHtml(model?.name || 'Mobility One')}</h2>
    <dl class="specs"><div><dt>${l.quantity}</dt><dd>1</dd></div><div><dt>${l.total}</dt><dd>${money(locale, cents)}</dd></div></dl>
    <p class="cart-action">${available ? button(href(locale, '/checkout?model=' + (model?.sku || coreSKU)), live ? t.commercialCheckout : t.checkout)
      : button(href(locale, model?.sku && model.sku !== coreSKU ? '/models/' + model.sku : '/mobility-one'), t.catalog)}</p></div></article>`;
}

export function checkoutPage(locale, totals, id, values = {}, message = '', model, lines, stripeMethods, invalid = [], live = false, termsVersion) {
  const l = labels[locale];
  const t = copy[locale];
  const german = locale === 'de-CH';
  const { subtotal, shipping, total: cents } = totals;
  const delivery = shippingText[locale];
  const breakdown = `<dl class="specs checkout-breakdown">
    <div><dt>${delivery.subtotal}</dt><dd>${money(locale, subtotal)}</dd></div>
    <div><dt>${delivery.shipping}</dt><dd>${shippingPrice(locale, shipping)}</dd></div>
  </dl>`;
  const billingTitle = german ? 'Rechnungsadresse' : 'Adresse de facturation';
  const autocomplete = { email: 'email', name: 'name', street: 'street-address', zip: 'postal-code', city: 'address-level2' };
  const emailLabel = live ? (german ? 'E-Mail-Adresse' : 'Adresse e-mail') : t.email;
  const names = { ...l, email: emailLabel, method: t.method };
  const label = key => key.startsWith('bill_') ? billingTitle + ' · ' + names[key.slice(5)] : names[key];
  const error = key => key === 'country'
    ? (german ? 'Lieferungen sind nur innerhalb der Schweiz möglich.' : 'La livraison est disponible uniquement en Suisse.')
    : key.endsWith('zip')
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
  const summary = `<aside class="summary" aria-labelledby="checkout-summary"><h2 id="checkout-summary" class="visually-hidden">${l.summary}</h2>
    ${breakdown}<p class="checkout-summary-total"><span>${l.total}</span> <strong>${money(locale, cents)}</strong></p>
    <details class="checkout-order-details"><summary>${l.summary}</summary>
    ${lines ? `<ul>${lines.map(line => `<li>${line.quantity} × ${escapeHtml(line.name)} · ${money(locale, line.quantity * line.cents)}</li>`).join('')}</ul>`
      : `${model ? '' : image(l)}<h3>${escapeHtml(model?.name || 'Mobility One')}</h3>`}
    ${lines ? '' : `<p>${l.quantity}: 1</p>`}
    <p><a href="/${locale}/delivery-returns-warranty">${l.deliveryLink}</a></p></details></aside>`;
  return `<p class="checkout-back page-back"><a href="/${locale}/cart${model && !lines ? '?model=' + model.sku : ''}">${german ? 'Zurück zum Warenkorb' : 'Retour au panier'}</a></p>
    <h1 class="page-title">${live ? t.commercialCheckout : t.checkout}</h1>${live ? '' : `<p>${l.demoData}</p>`}
    ${message ? `<section class="form-error" tabindex="-1" autofocus aria-labelledby="checkout-error">
      <h2 id="checkout-error">${message}</h2>${invalid.length ? `<ul>${invalid.map(key =>
        `<li><a href="#checkout-${key}">${label(key)} · ${error(key)}</a></li>`).join('')}</ul>` : ''}</section>` : ''}
    <div class="checkout-grid">${summary}<form method="post" novalidate action="/${locale}/checkout${lines ? '/cart' : ''}">
      <input type="hidden" name="id" value="${id}">
      <input type="hidden" name="quotedPrice" value="${cents}">
      <input type="hidden" name="shippingQuote" value="${shippingQuote(shipping)}">
      ${lines ? `<input type="hidden" name="cartQuote" value="${escapeHtml(cartQuote(lines))}">` : ''}
      ${lines ? '' : `<input type="hidden" name="model" value="${model?.sku || coreSKU}">`}
      <fieldset><legend>${l.address}</legend>
        <div><label for="checkout-country">${l.country}</label>
          <select id="checkout-country" name="country" autocomplete="shipping country" required ${invalidAttrs('country')}>
            ${Object.entries(deliveryCountries).map(([code, country]) =>
              `<option value="${code}" ${values.country === code ? 'selected' : ''}>${country[locale]}</option>`).join('')}
          </select>${inlineError('country')}</div>
        ${field('email', emailLabel, 'type="email" maxlength="254"' + (live ? '' : ' placeholder="demo@example.com"'))}
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
      ${breakdown}<p class="checkout-confirm-total">${l.total} <strong>${money(locale, cents)}</strong></p>
      ${live ? '' : stripeMethods ? `<p class="checkout-test-notice">${german ? 'Stripe-Testmodus. Es wird nichts abgebucht.' : 'Mode test Stripe. Aucun montant ne sera débité.'}</p>` : `<p class="checkout-test-notice">${german ? 'Simulierte Zahlung. Es wird nichts abgebucht.' : 'Paiement simulé. Aucun montant ne sera débité.'}</p>`}
      ${termsVersion ? `<p><label><input type="checkbox" name="acceptTerms" value="1" required>
        ${german ? 'Ich akzeptiere die' : 'J’accepte les'}
        <a href="/${locale}/terms?version=${termsVersion}">${german ? 'Verkaufsbedingungen' : 'conditions de vente'} (${termsVersion})</a>.</label>
        <input type="hidden" name="termsVersion" value="${termsVersion}"></p>` : ''}
      <div class="product-actions checkout-actions">${stripeMethods ? stripeMethods.length
        ? `<button name="result" value="stripe">${german ? 'Weiter zu Stripe' : 'Continuer vers Stripe'}${live ? '' : german ? ' (Test)' : ' (test)'}</button>`
        : `<p>${german ? 'Für diesen Betrag ist keine Zahlungsart verfügbar.' : 'Aucun mode de paiement disponible pour ce montant.'}</p>`
        : `<button name="result" value="paid">${t.pay}</button><button class="secondary" name="result" value="failed">${t.fail}</button>`}</div>
    </form></div>`;
}

export function orderPage(locale, order, events = [], push = '', trackingPath = '', live = false) {
  const l = labels[locale];
  const t = copy[locale];
  const statusText = live ? { ...t, ...(locale === 'de-CH'
    ? { paid: 'Zahlung bestätigt', refunded: 'Zahlung erstattet' }
    : { paid: 'Paiement confirmé', refunded: 'Paiement remboursé' }) } : t;
  const delivered = events.some(event => event.event_status === 'delivered');
  const state = delivered && order.status === 'shipped' ? 'delivered' : order.status;
  const steps = order.status === 'refunded' && !order.tracking ? ['paid', 'refunded']
    : ['paid', 'shipped', ...(delivered ? ['delivered'] : []), ...(order.status === 'refunded' ? ['refunded'] : [])];
  return `<section class="confirmation"><p class="eyebrow">${l.progress}</p><h1 class="page-title">${statusText[state]}</h1>
    ${order.lines?.length ? `<ul>${order.lines.map(line => `<li>${line.quantity} × ${escapeHtml(line.name)}</li>`).join('')}</ul>` : ''}
    ${order.shipping ? `<dl class="specs checkout-breakdown">
      <div><dt>${shippingText[locale].subtotal}</dt><dd>${money(locale, order.cents - order.shipping.cents)}</dd></div>
      <div><dt>${shippingText[locale].shipping}</dt><dd>${shippingPrice(locale, order.shipping)}</dd></div></dl>` : ''}
    <p class="order-total"><strong>${money(locale, order.cents)}</strong>
      <span>${order.lines?.length ? '' : escapeHtml(order.model_name || 'Movility One') + ' · '}${order.method}</span></p>
    <p class="order-reference">${l.reference} <code>${order.id}</code></p>
    <ol class="timeline">${steps.map((step) => `<li ${step === state ? 'aria-current="step"' : ''}>${statusText[step]}</li>`).join('')}</ol>
    ${order.tracking ? `<p>${t.tracking} ${escapeHtml(order.tracking)}</p>` : ''}
    ${state === 'paid' ? `<p>${locale === 'de-CH' ? 'Sobald die Bestellung versendet ist, findest du hier die Sendungsnummer.' : 'Le numéro de suivi apparaîtra ici après l’expédition.'}</p>` : ''}
    ${trackingPath ? `<p><a class="button" href="${escapeHtml(trackingPath)}">${locale === 'de-CH' ? 'Sendung verfolgen' : 'Suivre l’expédition'}</a></p>` : ''}
    ${trackingHistory(locale, events)}
    ${push}
    ${order.lines?.length ? button(href(locale) + '#catalogue', l.browseAction, true)
      : button(href(locale, order.model_sku && order.model_sku !== coreSKU ? '/models/' + order.model_sku : '/mobility-one'), t.catalog, true)}</section>`;
}
