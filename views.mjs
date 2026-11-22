export const methods = ['TWINT', 'PayPal', 'Visa', 'Mastercard'];

export const copy = {
  'de-CH': {
    title: 'Movility Schweiz', demo: 'Testshop · Keine echten Zahlungen', catalog: 'Zum Modell',
    category: 'Elektrorollstuhl · Demomodell', description: 'Ein fiktives Modell zum Testen des Einkaufs und der Lieferung innerhalb der Schweiz.',
    checkout: 'Zur Testkasse', email: 'E-Mail für die Simulation', method: 'Zahlungsart',
    pay: 'Zahlung simulieren', fail: 'Fehler simulieren', failed: 'Die Testzahlung ist fehlgeschlagen.',
    retry: 'Zurück zur Kasse', invalid: 'Bitte überprüfe deine Angaben.', soldOut: 'Keine Einheit verfügbar.',
    paid: 'Testzahlung bestätigt', shipped: 'Bestellung versendet', refunded: 'Testzahlung erstattet', tracking: 'Sendungsnummer:',
  },
  'fr-CH': {
    title: 'Movility Suisse', demo: 'Boutique de test · Aucun paiement réel', catalog: 'Voir le modèle',
    category: 'Fauteuil roulant électrique · Modèle de démonstration', description: 'Un modèle fictif pour tester la commande et la livraison en Suisse.',
    checkout: 'Passer à la caisse de test', email: 'E-mail pour la simulation', method: 'Mode de paiement',
    pay: 'Simuler le paiement', fail: 'Simuler un échec', failed: 'Le paiement de test a échoué.',
    retry: 'Retour à la caisse', invalid: 'Veuillez vérifier vos informations.', soldOut: 'Aucune unité disponible.',
    paid: 'Paiement de test confirmé', shipped: 'Commande expédiée', refunded: 'Paiement de test remboursé', tracking: 'Numéro de suivi :',
  },
};

export const money = (locale, cents) => new Intl.NumberFormat(locale, {
  style: 'currency', currency: 'CHF',
}).format(cents / 100);

export function escapeHtml(text) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return text.replace(/[&<>"']/g, (character) => entities[character]);
}

export function page(locale, title, content) {
  const t = copy[locale];
  return `<!doctype html>
<html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title><style>
  *{box-sizing:border-box}
  body{margin:0;background:#f5f8f7;color:#122d28;font:1rem/1.55 system-ui,sans-serif}
  header,main{max-width:68rem;margin:auto;padding:1.5rem}
  header{display:flex;justify-content:space-between;gap:1rem;align-items:center;border-bottom:1px solid #c9d9d4}
  nav{display:flex;gap:1rem;flex-wrap:wrap}
  a{color:#075844;text-underline-offset:.2em}
  a:focus-visible,button:focus-visible,input:focus-visible{outline:3px solid #9b4800;outline-offset:4px}
  .brand{font-weight:800;font-size:1.4rem}
  .demo{color:#34554c;margin:0 0 1.5rem}
  .product{display:grid;grid-template-columns:1fr 1fr;gap:clamp(1.5rem,5vw,5rem);align-items:center;padding:1rem 0}
  .specimen{display:grid;place-items:center;min-height:18rem;aspect-ratio:4/3;background:linear-gradient(145deg,#d6eee5,#a5d0c1);border-radius:1.5rem}
  .specimen span{font-size:clamp(6rem,20vw,11rem);line-height:1;font-weight:850;color:#245d50}
  h1{font-size:clamp(2.4rem,6vw,4.5rem);letter-spacing:-.055em;line-height:1.05;margin:.4em 0;overflow-wrap:anywhere}
  h2{overflow-wrap:anywhere}
  .eyebrow{font-weight:650;color:#245d50}
  .price{font-weight:750;font-size:1.8rem}
  form{max-width:34rem;margin:1rem 0}
  label{display:block}
  input:not([type=radio]){display:block;width:100%;padding:.7rem;border:1px solid #50786d;border-radius:.35rem;margin:.35rem 0 1rem;font:inherit}
  fieldset{border:1px solid #50786d;border-radius:.35rem;margin:1rem 0}
  .option{padding:.55rem .2rem;cursor:pointer}
  button,.button{display:inline-block;background:#0b5144;color:#fff;padding:.75rem 1.05rem;border:1px solid #0b5144;border-radius:.4rem;font:inherit;font-weight:700;text-decoration:none;cursor:pointer;margin:.25rem .25rem .25rem 0}
  .secondary{color:#0b5144;background:transparent}
  article{padding:1rem 1.5rem;background:#fff;border:1px solid #c9d9d4;border-radius:.65rem;margin:1rem 0}
  @media(max-width:42rem){.product{grid-template-columns:1fr}.specimen{min-height:0;aspect-ratio:2/1}.specimen span{font-size:5rem}}
</style></head><body>
<header><a class="brand" href="/${t ? locale : 'de-CH'}">Movility</a>
${t ? '<nav><a href="/de-CH" lang="de-CH">Deutsch</a><a href="/fr-CH" lang="fr-CH">Français</a></nav>' : ''}</header>
<main>${t ? `<p class="demo">${t.demo}</p>` : ''}${content}</main></body></html>`;
}
