export const methods = ['TWINT', 'PayPal', 'Visa', 'Mastercard'];

export const copy = {
  'de-CH': {
    priceChanged: 'Der Preis hat sich geändert. Bitte prüfe den neuen Gesamtbetrag und bestätige erneut.',
    title: 'Movility Schweiz', demo: 'Testshop · Keine echten Zahlungen', catalog: 'Zum Modell',
    category: 'Elektrorollstuhl · Demomodell', description: 'Ein fiktives Modell zum Testen des Einkaufs und der Lieferung innerhalb der Schweiz.',
    checkout: 'Zur Testkasse', email: 'E-Mail für die Simulation', method: 'Zahlungsart',
    pay: 'Zahlung simulieren', fail: 'Fehler simulieren', failed: 'Die Testzahlung ist fehlgeschlagen.',
    retry: 'Zurück zur Kasse', invalid: 'Bitte überprüfe deine Angaben.', soldOut: 'Keine Einheit verfügbar.',
    paid: 'Testzahlung bestätigt', shipped: 'Bestellung versendet', refunded: 'Testzahlung erstattet', tracking: 'Sendungsnummer:',
    delivered: 'Bestellung zugestellt',
  },
  'fr-CH': {
    priceChanged: 'Le prix a changé. Vérifiez le nouveau total et confirmez à nouveau.',
    title: 'Movility Suisse', demo: 'Boutique de test · Aucun paiement réel', catalog: 'Voir le modèle',
    category: 'Fauteuil roulant électrique · Modèle de démonstration', description: 'Un modèle fictif pour tester la commande et la livraison en Suisse.',
    checkout: 'Passer à la caisse de test', email: 'E-mail pour la simulation', method: 'Mode de paiement',
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

const pageFooter = { 'de-CH': 'Schweiz · CHF', 'fr-CH': 'Suisse · CHF', es: 'Movility · Entorno de prueba' };

export function page(locale, title, content, header = '', metadata = {}, extras = {}) {
  const t = copy[locale];
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${escapeHtml(metadata.description || t?.description || title)}"><title>${escapeHtml(metadata.title || title)}</title>${metadata.links || ''}<link rel="stylesheet" href="/site.css"></head><body>
${header || '<header class="top"><div class="top-inner"><a class="brand" href="/de-CH">Movility</a></div></header>'}
<main id="content" tabindex="-1">${t ? `<p class="demo">${t.demo}</p>` : ''}${extras.prompt || ''}${content}</main>
<footer>${pageFooter[locale]}${extras.footer ? ` · ${extras.footer}` : ''}</footer></body></html>`;
}
