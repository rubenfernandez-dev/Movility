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
};

export function informationPage(locale, suffix, configuredEmail) {
  const french = locale === 'fr-CH';
  const [title, intro] = information[suffix][locale];
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
