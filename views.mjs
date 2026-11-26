export const methods = ['TWINT', 'PayPal', 'Visa', 'Mastercard'];

export const copy = {
  'de-CH': {
    priceChanged: 'Der Preis hat sich geändert. Bitte prüfe den neuen Gesamtbetrag und bestätige erneut.',
    title: 'Mobility Schweiz', demo: 'Testshop · Keine echten Zahlungen', catalog: 'Zum Modell',
    category: 'Elektrorollstuhl · Demomodell', description: 'Ein fiktives Modell zum Testen des Einkaufs und der Lieferung innerhalb der Schweiz.',
    checkout: 'Zur Testkasse', commercialCheckout: 'Zur Kasse', email: 'E-Mail für die Simulation', method: 'Zahlungsart',
    pay: 'Zahlung simulieren', fail: 'Fehler simulieren', failed: 'Die Testzahlung ist fehlgeschlagen.',
    retry: 'Zurück zur Kasse', invalid: 'Bitte überprüfe deine Angaben.', soldOut: 'Keine Einheit verfügbar.',
    paid: 'Testzahlung bestätigt', shipped: 'Bestellung versendet', refunded: 'Testzahlung erstattet', tracking: 'Sendungsnummer:',
    delivered: 'Bestellung zugestellt',
  },
  'fr-CH': {
    priceChanged: 'Le prix a changé. Vérifiez le nouveau total et confirmez à nouveau.',
    title: 'Mobility Suisse', demo: 'Boutique de test · Aucun paiement réel', catalog: 'Voir le modèle',
    category: 'Fauteuil roulant électrique · Modèle de démonstration', description: 'Un modèle fictif pour tester la commande et la livraison en Suisse.',
    checkout: 'Passer à la caisse de test', commercialCheckout: 'Passer à la caisse', email: 'E-mail pour la simulation', method: 'Mode de paiement',
    pay: 'Simuler le paiement', fail: 'Simuler un échec', failed: 'Le paiement de test a échoué.',
    retry: 'Retour à la caisse', invalid: 'Veuillez vérifier vos informations.', soldOut: 'Aucune unité disponible.',
    paid: 'Paiement de test confirmé', shipped: 'Commande expédiée', refunded: 'Paiement de test remboursé', tracking: 'Numéro de suivi :',
    delivered: 'Commande livrée',
  },
};

export const money = (locale, cents) => new Intl.NumberFormat(locale, {
  style: 'currency', currency: 'CHF',
}).format(cents / 100);

export function escapeHtml(text) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, (character) => entities[character]);
}

const pageFooter = { 'de-CH': 'Schweiz · CHF', 'fr-CH': 'Suisse · CHF', es: 'Mobility · Entorno de prueba' };
const adminFooter = { 'de-CH': 'Mobility · Testumgebung', 'fr-CH': 'Mobility · Environnement de test', es: pageFooter.es };
const stagingNotice = {
  'de-CH': 'Vorproduktion · Nur fiktive Daten',
  'fr-CH': 'Préproduction · Données fictives uniquement',
  es: 'Preproducción · Solo datos ficticios',
};

export function page(locale, title, content, header = '', metadata = {}, extras = {}) {
  const t = copy[locale];
  const footer = extras.storefront
    ? `<div class="storefront-footer">
        <p class="storefront-footer-brand"><a href="/${locale}">Mobility</a></p>
        <div class="storefront-footer-links">${extras.footer || ''}</div>
        ${process.env.MOVILITY_STAGE === 'staging' ? `<p class="storefront-footer-notice">${stagingNotice[locale]}</p>` : ''}
      </div>`
    : (extras.admin ? adminFooter : pageFooter)[locale] + (extras.footer ? ` · ${extras.footer}` : '');
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${escapeHtml(metadata.description || t?.description || title)}"><title>${escapeHtml(metadata.title || title)}</title>${metadata.links || ''}<link rel="stylesheet" href="/site.css"></head><body${extras.storefront ? ' class="storefront-page"' : ''}>
${header || '<header class="top"><div class="top-inner"><a class="brand" href="/de-CH">Mobility</a></div></header>'}
${extras.sidebar ? `<div class="admin-layout">${extras.sidebar}` : ''}
<main id="content" tabindex="-1"${extras.feature ? ' class="main-with-feature"' : ''}>
${extras.feature ? extras.feature + '<div class="home-content">' : ''}
${extras.feature || extras.commercial ? '' : process.env.MOVILITY_STAGE === 'staging' ? `<p class="demo">${stagingNotice[locale]}</p>`
  : t && !extras.admin ? `<p class="demo">${t.demo}</p>` : ''}${content}${extras.prompt || ''}${extras.feature ? '</div>' : ''}</main>
${extras.sidebar ? '</div>' : ''}
<footer>${footer}</footer></body></html>`;
}
