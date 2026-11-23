import { money } from './views.mjs';

const messages = {
  'de-CH': {
    greeting: 'Guten Tag,',
    paid: ['Bestellung bestätigt', 'Wir haben deine Bestellung und die Testzahlung erhalten.'],
    shipped: ['Bestellung versendet', 'Deine Bestellung wurde in der Demo als versendet erfasst.'],
    delivered: ['Bestellung zugestellt', 'Der Transportstatus deiner Testbestellung ist zugestellt.'],
    refunded: ['Zahlung erstattet', 'Die Rückerstattung für deine Testbestellung wurde erfasst.'],
    reference: 'Bestellreferenz', amount: 'Betrag', method: 'Zahlungsart', tracking: 'Sendungsnummer',
    status: 'Bestellstatus', shipment: 'Sendung verfolgen', signoff: 'Dein Movility-Team', demo: 'Dies ist eine Vorschau für den Testshop.',
  },
  'fr-CH': {
    greeting: 'Bonjour,',
    paid: ['Commande confirmée', 'Nous avons enregistré votre commande et le paiement de test.'],
    shipped: ['Commande expédiée', 'Votre commande a été marquée comme expédiée dans la démo.'],
    delivered: ['Commande livrée', 'Le suivi indique que votre commande de test a été livrée.'],
    refunded: ['Paiement remboursé', 'Le remboursement de votre commande de test a été enregistré.'],
    reference: 'Référence de commande', amount: 'Montant', method: 'Mode de paiement', tracking: 'Numéro de suivi',
    status: 'Suivi de commande', shipment: 'Suivre l’expédition', signoff: 'L’équipe Movility', demo: 'Ceci est un aperçu pour la boutique de test.',
  },
};

export function orderEmail(order, kind, shipmentUrl = '') {
  const t = messages[order.locale];
  const [title, description] = t[kind];
  const subject = `Movility · ${title}`;
  const orderPath = `/${order.locale}/orders/${order.id}`;
  const details = [
    ...(order.lines?.length ? order.lines.map(line => `${line.quantity} × ${line.name}`) : [order.model_name || 'Movility One']),
    `${t.reference}: ${order.id}`,
    `${t.amount}: ${money(order.locale, order.cents)}`,
    `${t.method}: ${order.method}`,
  ];
  if (['shipped', 'delivered'].includes(kind) && order.tracking) details.push(`${t.tracking}: ${order.tracking}`);
  if (shipmentUrl) details.push(`${t.shipment}: ${shipmentUrl}`);
  const body = [
    t.greeting, '', description, '', ...details, '', t.signoff, '', t.demo,
  ].join('\n');
  return { subject, body, orderPath: shipmentUrl || orderPath, statusLabel: shipmentUrl ? t.shipment : t.status };
}
