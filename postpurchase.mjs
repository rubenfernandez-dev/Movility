import { money } from './views.mjs';

const messages = {
  'de-CH': {
    greeting: 'Guten Tag,',
    paid: ['Bestellung bestätigt', 'Wir haben deine Bestellung und die Testzahlung erhalten.'],
    shipped: ['Bestellung versendet', 'Deine Bestellung wurde in der Demo als versendet erfasst.'],
    refunded: ['Zahlung erstattet', 'Die Rückerstattung für deine Testbestellung wurde erfasst.'],
    reference: 'Bestellreferenz', amount: 'Betrag', method: 'Zahlungsart', tracking: 'Sendungsnummer',
    status: 'Bestellstatus', signoff: 'Dein Movility-Team', demo: 'Dies ist eine Vorschau für den Testshop.',
  },
  'fr-CH': {
    greeting: 'Bonjour,',
    paid: ['Commande confirmée', 'Nous avons enregistré votre commande et le paiement de test.'],
    shipped: ['Commande expédiée', 'Votre commande a été marquée comme expédiée dans la démo.'],
    refunded: ['Paiement remboursé', 'Le remboursement de votre commande de test a été enregistré.'],
    reference: 'Référence de commande', amount: 'Montant', method: 'Mode de paiement', tracking: 'Numéro de suivi',
    status: 'Suivi de commande', signoff: 'L’équipe Movility', demo: 'Ceci est un aperçu pour la boutique de test.',
  },
};

export function orderEmail(order, kind) {
  const t = messages[order.locale];
  const [title, description] = t[kind];
  const subject = `Movility · ${title}`;
  const orderPath = `/${order.locale}/orders/${order.id}`;
  const details = [
    order.model_name || 'Movility One',
    `${t.reference}: ${order.id}`,
    `${t.amount}: ${money(order.locale, order.cents)}`,
    `${t.method}: ${order.method}`,
  ];
  if (kind === 'shipped' && order.tracking) details.push(`${t.tracking}: ${order.tracking}`);
  const body = [
    t.greeting, '', description, '', ...details, '', t.signoff, '', t.demo,
  ].join('\n');
  return { subject, body, orderPath, statusLabel: t.status };
}
