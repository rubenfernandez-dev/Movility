import { escapeHtml } from './views.mjs';

export const information = {
  '/about': {
    'de-CH': ['Über uns', 'Movility ist ein Schweizer Shop-Projekt für Elektrorollstühle, Zubehör und Ersatzteile.'],
    'fr-CH': ['Qui sommes-nous ?', 'Movility est un projet de boutique pour la Suisse, consacré aux fauteuils roulants électriques, aux accessoires et aux pièces détachées.'],
  },
  '/contact': {
    'de-CH': ['Kontakt', 'Fragen zur Modellauswahl, zu Ersatzteilen, zur Lieferung oder zu einer Bestellung?'],
    'fr-CH': ['Contact', 'Une question sur le choix d’un modèle, les pièces détachées, la livraison ou votre commande ?'],
  },
  '/delivery-returns-warranty': {
    'de-CH': ['Lieferung, Rückgabe und Garantie', 'Informationen für Bestellungen in der Schweiz.'],
    'fr-CH': ['Livraison, retours et garantie', 'Informations pour les commandes en Suisse.'],
  },
};

const serviceSections = {
  'de-CH': [
    ['Lieferung', 'Für den Start sind Lieferungen innerhalb der Schweiz vorgesehen. Lieferzeiten, Versandkosten und Übergabeoptionen werden vor dem Verkaufsstart veröffentlicht.'],
    ['Rückgabe', 'Die Rückgabebedingungen, Fristen und der Ablauf werden vor dem Verkaufsstart auf dieser Seite ergänzt.'],
    ['Garantie und Kundendienst', 'Angaben zur Garantie und zum Ablauf bei einem Defekt werden vor dem Verkaufsstart ergänzt. Halte bei einer Anfrage die Modellbezeichnung und, wenn vorhanden, die Bestellnummer bereit.'],
  ],
  'fr-CH': [
    ['Livraison', 'Le lancement est prévu pour les livraisons en Suisse. Les délais, les frais et les modalités de remise seront publiés avant l’ouverture des ventes.'],
    ['Retours', 'Les conditions, les délais et la procédure de retour seront précisés sur cette page avant l’ouverture des ventes.'],
    ['Garantie et service après-vente', 'Les informations sur la garantie et la procédure en cas de panne seront publiées avant l’ouverture des ventes. Pour toute demande, préparez le nom du modèle et, si vous l’avez, le numéro de commande.'],
  ],
};

export function informationPage(locale, suffix, configuredEmail) {
  const french = locale === 'fr-CH';
  const [title, intro] = information[suffix][locale];
  if (suffix === '/delivery-returns-warranty') {
    return `<section class="section"><h1 class="page-title">${title}</h1><p class="lead">${intro}</p>
      ${serviceSections[locale].map(([heading, text]) => `<h2>${heading}</h2><p>${text}</p>`).join('')}
      <p><a href="/${locale}/contact">${information['/contact'][locale][0]}</a></p></section>`;
  }
  const email = configuredEmail?.trim();
  const channel = email && /^[\w.+-]+@[a-z\d.-]+\.[a-z]{2,}$/i.test(email)
    ? `<p><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>`
    : `<p>${french ? 'Les coordonnées du service client seront publiées ici avant l’ouverture de la boutique.' :
      'Die Kontaktdaten des Kundendiensts werden hier vor der Shop-Eröffnung veröffentlicht.'}</p>`;
  const content = suffix === '/about'
    ? `<p>${french ? 'Le catalogue permet de comparer les dimensions, le poids et l’autonomie des modèles pour préparer votre choix.' :
      'Im Katalog kannst du Masse, Gewicht und Reichweite der Modelle vergleichen und deine Auswahl vorbereiten.'}</p>
      <p><a href="/${locale}/compare">${french ? 'Comparer les fauteuils' : 'Rollstühle vergleichen'}</a> ·
      <a href="/${locale}/contact">${information['/contact'][locale][0]}</a></p>`
    : `${channel}<p><a href="/${locale}#faq">${french ? 'Consulter les questions fréquentes' : 'Häufige Fragen lesen'}</a></p>`;
  return `<section class="section"><h1 class="page-title">${escapeHtml(title)}</h1><p class="lead">${escapeHtml(intro)}</p>${content}</section>`;
}

export function informationLinks(locale) {
  return Object.entries(information).map(([route, labels]) =>
    `<a href="/${locale}${route}">${escapeHtml(labels[locale][0])}</a>`).join(' · ');
}
