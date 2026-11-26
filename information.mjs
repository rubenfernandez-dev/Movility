import { escapeHtml } from './views.mjs';
import { contactForm } from './contact.mjs';
import { aboutEditorial } from './about-editorial.mjs';

export const information = {
  '/about': {
    'de-CH': ['Über uns', 'Mobility hilft dir, einen Elektrorollstuhl zu finden, der zu deinem Alltag passt. Klare Angaben und ein direkter Vergleich zeigen dir, worin sich die Modelle unterscheiden.'],
    'fr-CH': ['Qui sommes-nous ?', 'Mobility vous aide à choisir un fauteuil électrique adapté à votre quotidien. Des fiches claires et un comparateur vous permettent de repérer les différences entre les modèles.'],
  },
  '/contact': {
    'de-CH': ['Kontakt', 'Fragen zur Auswahl oder zu deiner Bestellung? Schreib uns.'],
    'fr-CH': ['Contact', 'Une question sur un modèle ou votre commande ? Écrivez-nous.'],
  },
  '/delivery-returns-warranty': {
    'de-CH': ['Lieferung, Rückgabe und Garantie', 'Informationen für Bestellungen in der Schweiz.'],
    'fr-CH': ['Livraison, retours et garantie', 'Informations pour les commandes en Suisse.'],
  },
};

const serviceSections = {
  'de-CH': [
    ['Lieferung', 'Wir liefern ausschliesslich innerhalb der Schweiz. Lieferzeiten, Versandkosten und Übergabeoptionen ergänzen wir vor dem Verkaufsstart.'],
    ['Rückgabe', 'Die Rückgabebedingungen, Fristen und der Ablauf werden vor dem Verkaufsstart auf dieser Seite ergänzt.'],
    ['Garantie und Kundendienst', 'Angaben zur Garantie und zum Ablauf bei einem Defekt werden vor dem Verkaufsstart ergänzt. Halte bei einer Anfrage die Modellbezeichnung und, wenn vorhanden, die Bestellnummer bereit.'],
  ],
  'fr-CH': [
    ['Livraison', 'Nous livrons exclusivement en Suisse. Les délais, les frais et les modalités de remise seront précisés avant l’ouverture des ventes.'],
    ['Retours', 'Les conditions, les délais et la procédure de retour seront précisés sur cette page avant l’ouverture des ventes.'],
    ['Garantie et service après-vente', 'Les informations sur la garantie et la procédure en cas de panne seront publiées avant l’ouverture des ventes. Pour toute demande, préparez le nom du modèle et, si vous l’avez, le numéro de commande.'],
  ],
};

const aboutSections = {
  'de-CH': [
    ['Den passenden Rollstuhl finden', 'Vergleiche Breite, Gewicht, Reichweite und Faltbarkeit. Achte bei deiner Auswahl auch darauf, wie viel Platz du zu Hause, unterwegs oder im Fahrzeug hast.'],
    ['Zubehör und Ersatzteile zuordnen', 'Im Katalog kannst du Teile nach Rollstuhlmodell filtern. Wenn eine Variante oder Seriennummer entscheidend ist, prüfe den Hinweis in der Produktbeschreibung oder frage bei uns nach.'],
    ['Für die Schweiz aufgebaut', 'Wir führen einen eigenen Warenbestand in der Schweiz und liefern ausschliesslich innerhalb der Schweiz. Katalog und Bestellung stehen auf Deutsch und Französisch zur Verfügung.'],
  ],
  'fr-CH': [
    ['Trouver un fauteuil adapté', 'Comparez la largeur, le poids, l’autonomie et le pliage. Tenez aussi compte de l’espace dont vous disposez à la maison, en déplacement ou dans votre véhicule.'],
    ['Identifier les accessoires et pièces détachées', 'Filtrez le catalogue par modèle de fauteuil. Si la compatibilité dépend d’une version ou d’un numéro de série, vérifiez la fiche ou posez-nous la question.'],
    ['Pensé pour la Suisse', 'Nous disposons de notre propre stock en Suisse et livrons exclusivement en Suisse. Le catalogue et le parcours de commande sont disponibles en français et en allemand.'],
  ],
};

export const validContactEmail = email => /^[\w.+-]+@[a-z\d.-]+\.[a-z]{2,}$/i.test(email || '');
export const informationBlocks = { about: aboutSections, 'delivery-returns-warranty': serviceSections };
export const validContactPhone = phone => /^\+?[\d ().-]+$/.test(phone || '') &&
  /^\d{6,15}$/.test(phone.replace(/\D/g, ''));

export function informationPage(locale, suffix, settings = {}, contactState, draft) {
  const french = locale === 'fr-CH';
  const lang = french ? 'fr' : 'de';
  const title = settings['title_' + lang] ?? information[suffix][locale][0];
  const intro = settings['intro_' + lang] ?? information[suffix][locale][1];
  const blocks = informationBlocks[suffix.slice(1)]?.[locale].map(([heading, text], index) => [
    settings['heading_' + lang + '_' + index] ?? heading, settings['body_' + lang + '_' + index] ?? text,
  ]).filter(([heading, text]) => heading && text);
  if (suffix === '/about') return aboutEditorial(locale, title, intro, blocks, draft);
  if (suffix === '/delivery-returns-warranty') {
    return `<section class="section service-information"><h1 class="page-title">${escapeHtml(title)}</h1><p class="lead information-text">${escapeHtml(intro)}</p>
      ${blocks.map(([heading, text], index) => `<section class="service-topic" id="${['delivery','returns','warranty'][index]}"><h2>${escapeHtml(heading)}</h2><p class="information-text">${escapeHtml(text)}</p></section>`).join('')}
      <p><a class="button secondary" href="/${locale}/contact">${information['/contact'][locale][0]}</a></p></section>`;
  }
  const email = settings.email;
  const phone = settings.phone;
  const address = settings.address;
  const hours = settings['hours_' + lang];
  const channel = validContactEmail(email)
    ? `<p><a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>`
    : '';
  const publicDetails = channel +
    (validContactPhone(phone) ? `<p><a href="tel:${phone.replace(/[^+\d]/g, '')}">${escapeHtml(phone)}</a></p>` : '') +
    (address ? `<p class="information-text">${escapeHtml(address)}</p>` : '') +
    (hours ? `<h3>${french ? 'Horaires' : 'Öffnungszeiten'}</h3><p class="information-text">${escapeHtml(hours)}</p>` : '');
  const content = `<div class="contact-grid">${contactForm(locale, contactState)}
      <aside class="confirmation"><h2>${french ? 'Préparer votre demande' : 'Deine Anfrage vorbereiten'}</h2>
        <p>${french ? 'Pour une pièce, indiquez le modèle du fauteuil. Pour une livraison, ajoutez la référence de commande si vous l’avez.' :
          'Nenne bei Ersatzteilen das Rollstuhlmodell. Bei Fragen zur Lieferung hilft die Bestellreferenz, falls du sie zur Hand hast.'}</p>
        ${publicDetails ? `<h3>${french ? 'Coordonnées' : 'Kontaktdaten'}</h3>${publicDetails}` : ''}<ul>
          <li><a href="/${locale}#faq">${french ? 'Questions fréquentes' : 'Häufige Fragen'}</a></li>
          <li><a href="/${locale}/delivery-returns-warranty">${information['/delivery-returns-warranty'][locale][0]}</a></li>
        </ul></aside></div>`;
  return `<section class="section contact-page"><h1 class="page-title">${escapeHtml(title)}</h1><p class="lead information-text">${escapeHtml(intro)}</p>${content}</section>`;
}

export function informationLinks(locale) {
  const label = locale === 'fr-CH' ? 'Informations clients' : 'Kundeninformationen';
  const links = Object.entries(information).map(([route, labels]) =>
    `<a href="/${locale}${route}">${escapeHtml(labels[locale][0])}</a>`).join('');
  return `<nav class="information-links" aria-label="${label}">${links}</nav>`;
}
