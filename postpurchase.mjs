import { money } from './views.mjs';
import { shippingPrice, shippingText } from './shipping.mjs';

const messages = {
  'de-CH': {
    greeting: 'Guten Tag,',
    paid: ['Bestellung bestätigt', 'Wir haben deine Bestellung und die Testzahlung erhalten.'],
    shipped: ['Bestellung versendet', 'Deine Bestellung wurde in der Demo als versendet erfasst.'],
    delivered: ['Bestellung zugestellt', 'Der Transportstatus deiner Testbestellung ist zugestellt.'],
    refunded: ['Zahlung erstattet', 'Die Rückerstattung für deine Testbestellung wurde erfasst.'],
    reference: 'Bestellreferenz', amount: 'Betrag', method: 'Zahlungsart', tracking: 'Sendungsnummer',
    card: 'Karte', status: 'Bestellstatus', shipment: 'Sendung verfolgen', signoff: 'Dein Mobility-Team', demo: 'Dies ist eine Vorschau für den Testshop.',
  },
  'fr-CH': {
    greeting: 'Bonjour,',
    paid: ['Commande confirmée', 'Nous avons enregistré votre commande et le paiement de test.'],
    shipped: ['Commande expédiée', 'Votre commande a été marquée comme expédiée dans la démo.'],
    delivered: ['Commande livrée', 'Le suivi indique que votre commande de test a été livrée.'],
    refunded: ['Paiement remboursé', 'Le remboursement de votre commande de test a été enregistré.'],
    reference: 'Référence de commande', amount: 'Montant', method: 'Mode de paiement', tracking: 'Numéro de suivi',
    card: 'Carte', status: 'Suivi de commande', shipment: 'Suivre l’expédition', signoff: 'L’équipe Mobility', demo: 'Ceci est un aperçu pour la boutique de test.',
  },
};

const commercialCopy = {
  'de-CH': { paid: 'Wir haben deine Bestellung und deine Zahlung erhalten.', shipped: 'Deine Bestellung wurde versendet.',
    delivered: 'Deine Bestellung wurde zugestellt.', refunded: 'Deine Zahlung wurde erstattet.' },
  'fr-CH': { paid: 'Nous avons reçu votre commande et votre paiement.', shipped: 'Votre commande a été expédiée.',
    delivered: 'Votre commande a été livrée.', refunded: 'Votre paiement a été remboursé.' },
};

export function orderEmail(order, kind, shipmentUrl = '', origin = '', live = false) {
  const t = messages[order.locale];
  const [title, description] = t[kind];
  const subject = `Mobility · ${title}`;
  const orderPath = `/${order.locale}/orders/${order.id}`;
  const details = [
    ...(order.lines?.length ? order.lines.map(line => `${line.quantity} × ${line.name}`) : [order.model_name || 'Movility One']),
    `${t.reference}: ${order.id}`,
    ...(order.shipping ? [
      `${shippingText[order.locale].subtotal}: ${money(order.locale, order.cents - order.shipping.cents)}`,
      `${shippingText[order.locale].shipping}: ${shippingPrice(order.locale, order.shipping)}`,
    ] : []),
    `${t.amount}: ${money(order.locale, order.cents)}`,
    `${t.method}: ${order.method === 'Tarjeta' ? t.card : order.method}`,
  ];
  if (['shipped', 'delivered'].includes(kind) && order.tracking) details.push(`${t.tracking}: ${order.tracking}`);
  if (shipmentUrl) details.push(`${t.shipment}: ${shipmentUrl}`);
  else if (kind === 'paid') details.push(`${t.status}: ${origin ? new URL(orderPath, origin).href : orderPath}`);
  const body = [
    t.greeting, '', live ? commercialCopy[order.locale][kind] : description, '', ...details, '', t.signoff,
    ...(live ? [] : ['', t.demo]),
  ].join('\n');
  return { subject, body, orderPath: shipmentUrl || orderPath, statusLabel: shipmentUrl ? t.shipment : t.status };
}
