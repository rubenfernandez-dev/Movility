import { escapeHtml } from './views.mjs';
import { adminHtml, adminText } from './admin-language.mjs';

export const legalPaths = ['/impressum', '/privacy', '/terms'];
const titles = {
  'de-CH': ['Impressum', 'Datenschutz', 'Verkaufsbedingungen'],
  'fr-CH': ['Mentions légales', 'Confidentialité', 'Conditions de vente'],
};
const cookieInfo = {
  'de-CH': [
    'Der Warenkorb wird bis zu 7 Tage gespeichert. Der Bestellzugang nach dem Checkout gilt bis zu einer Stunde, ein wiederhergestellter Gastzugang 15 Minuten. Ein Kundenkonto im Pilot speichert die Sitzung für bis zu einen Tag.',
    'Die Einstellung für Statistik gilt bis zu 30 Tage. Wenn du zustimmst, erfasst der Shop die Schritte Produktansicht, Warenkorb, Checkout und Kauf unter einer zufälligen Kennung. Ohne Zustimmung werden keine Schritte erfasst. Beim Widerruf wird dieser gespeicherte Verlauf gelöscht.',
    'Die Sprache des öffentlichen Shops steht in der URL. Das Administrationspanel speichert seine eigene Spracheinstellung. Diese Website verwendet für den Shop keinen lokalen Webspeicher. Wenn du Bestellbenachrichtigungen separat aktivierst, verwaltet der Browser ein Push-Abonnement und einen Service Worker.',
  ],
  'fr-CH': [
    'Le panier est mémorisé jusqu’à 7 jours. L’accès à la commande après le paiement dure jusqu’à une heure. Un accès invité rétabli dure 15 minutes. Dans le pilote, la session du compte client dure jusqu’à un jour.',
    'Le choix des statistiques est conservé jusqu’à 30 jours. Avec votre accord, la boutique enregistre les étapes fiche produit, panier, commande et achat sous un identifiant aléatoire. Sans accord, ces étapes ne sont pas enregistrées. Le retrait supprime le parcours enregistré.',
    'La langue de la boutique figure dans l’URL. Le panneau d’administration conserve son propre réglage de langue. La boutique n’utilise pas le stockage Web local. Si vous activez séparément les notifications de commande, le navigateur gère un abonnement push et un service worker.',
  ],
};

const drafts = {
  '/impressum': ['', ''],
  '/terms': ['', ''],
  '/privacy': [
    ['Wir bearbeiten die Angaben aus dem Kontaktformular, aus Bestellungen und aus der Lieferung, um Anfragen zu beantworten und Aufträge abzuwickeln. Dazu gehören Kontakt-, Adress-, Bestell- und Lieferdaten. Im Pilot sind Kundenkonto und Angebote mit separater Anmeldung verfügbar.',
     'Der 3D-Viewer und das Modell werden von dieser Website geladen. In der Simulation werden Zahlungen und Nachrichten intern verarbeitet. Wenn Stripe aktiviert ist, öffnet sich die Zahlungsseite von Stripe. Wenn Resend aktiviert ist, werden E-Mails über diesen Dienst zugestellt. Web Push nutzt nach separater Anmeldung den Push-Dienst des Browsers, wenn der externe Versand aktiviert ist.',
     ...cookieInfo['de-CH']].join('\n\n'),
    ['Nous traitons les données du formulaire de contact, des commandes et des livraisons afin de répondre aux demandes et de gérer les commandes. Cela comprend les coordonnées, adresses et données de commande et de livraison. Dans le pilote, le compte client et les offres nécessitent une inscription distincte.',
     'Le visualiseur 3D et son modèle sont chargés depuis ce site. En simulation, les paiements et messages sont traités en interne. Si Stripe est activé, le paiement ouvre la page Stripe. Si Resend est activé, les e-mails transitent par ce service. Si l’envoi externe est activé, les notifications utilisent le service push du navigateur après une inscription distincte.',
     ...cookieInfo['fr-CH']].join('\n\n'),
  ],
};
const notes = {
  '/impressum': 'Confirma razón social, forma jurídica, domicilio, correo público, registro e identificadores aplicables.',
  '/privacy': 'Confirma responsable, contacto de privacidad, alojamiento, proveedores y países, conservación por finalidad, destinatarios y ejercicio de derechos.',
  '/terms': 'Confirma formación del contrato, medios de pago, entrega, precios y tarifas, devoluciones y garantía. Incluye solo las condiciones aprobadas.',
};
export const legalTitle = (locale, path) => titles[locale][legalPaths.indexOf(path)];

export function setupLegal(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS legal_drafts (
    path TEXT PRIMARY KEY, de TEXT NOT NULL, fr TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS legal_versions (
      path TEXT NOT NULL, version INTEGER NOT NULL, de TEXT NOT NULL, fr TEXT NOT NULL,
      seller TEXT, PRIMARY KEY(path,version));
    CREATE TABLE IF NOT EXISTS order_terms (
      order_id TEXT PRIMARY KEY REFERENCES orders(id), version INTEGER NOT NULL, locale TEXT NOT NULL);`);
  const seed = db.prepare('INSERT OR IGNORE INTO legal_drafts(path,de,fr) VALUES (?,?,?)');
  for (const path of legalPaths) seed.run(path, ...drafts[path]);
}
export const legalDraft = (db, path) => db.prepare('SELECT * FROM legal_drafts WHERE path=?').get(path);
export function publishedLegal(db, path, version) {
  return version == null
    ? db.prepare('SELECT * FROM legal_versions WHERE path=? ORDER BY version DESC LIMIT 1').get(path)
    : db.prepare('SELECT * FROM legal_versions WHERE path=? AND version=?').get(path, version);
}
export function saveLegal(db, path, fields, seller) {
  const current = legalDraft(db, path);
  const de = fields?.get('de')?.trim() || '';
  const fr = fields?.get('fr')?.trim() || '';
  const publish = fields?.get('action') === 'publish';
  if (de.length > 24000 || fr.length > 24000) return 'invalid';
  if (String(current.revision) !== fields?.get('revision')) return 'conflict';
  if (publish && (!de || !fr || fields.get('confirmed') !== '1')) return 'invalid';
  db.prepare('UPDATE legal_drafts SET de=?,fr=?,revision=revision+1 WHERE path=?').run(de, fr, path);
  if (publish) {
    const version = (publishedLegal(db, path)?.version || 0) + 1;
    db.prepare('INSERT INTO legal_versions VALUES (?,?,?,?,?)').run(path, version, de, fr, JSON.stringify(path === '/terms' ? null : { address: seller.address, email: seller.email }));
  }
  return 'saved';
}

export function legalAdmin(db, path, result = '', submitted) {
  const draft = legalDraft(db, path);
  const current = publishedLegal(db, path);
  const editor = '/admin/legal' + path;
  return adminHtml`<h1>Contenidos legales</h1>
    <nav aria-label="Páginas legales">${legalPaths.map(item => `<a href="/admin/legal${item}">${escapeHtml(legalTitle('de-CH',item))} / ${escapeHtml(legalTitle('fr-CH',item))}</a>`).join('')}</nav>
    <p>${escapeHtml(adminText(notes[path]))}</p>
    ${path !== '/terms' ? adminHtml`<p>Revisa la dirección y el correo en <a href="/admin/content/contact">Datos públicos de contacto</a>.</p>` : ''}
    <p><a href="${editor}/preview/de-CH">Vista previa DE</a> · <a href="${editor}/preview/fr-CH">Vista previa FR</a></p>
    ${result === 'conflict' ? adminHtml`<p role="alert">El borrador cambió. Vuelve a cargar el editor.</p>` : ''}
    ${result === 'invalid' ? adminHtml`<p role="alert">Revisa ambos textos y confirma la revisión antes de publicar.</p>` : ''}
    ${result === 'saved' ? adminHtml`<p role="status">Cambios guardados.</p>` : ''}
    ${current ? adminHtml`<p>Versión publicada: ${current.version}</p>` : adminHtml`<p>Solo borrador.</p>`}
    <form class="confirmation legal-editor" method="post" action="${editor}">
      <input type="hidden" name="revision" value="${draft.revision}">
      <label>Deutsch<textarea name="de" lang="de-CH" rows="12" maxlength="24000">${escapeHtml(submitted?.get('de') ?? draft.de)}</textarea></label>
      <label>Français<textarea name="fr" lang="fr-CH" rows="12" maxlength="24000">${escapeHtml(submitted?.get('fr') ?? draft.fr)}</textarea></label>
      <label><input type="checkbox" name="confirmed" value="1"> Confirmo que los textos y datos se han validado.</label>
      <div class="product-actions"><button name="action" value="draft">Guardar borrador</button><button name="action" value="publish">Publicar versión</button></div>
    </form>`;
}

export function legalPage(locale, path, row, previewSeller) {
  const french = locale === 'fr-CH';
  const preview = previewSeller !== undefined;
  const seller = preview ? previewSeller : row?.seller && JSON.parse(row.seller);
  return `<section class="section service-information"><h1 class="page-title">${legalTitle(locale,path)}</h1>
    ${preview ? `<p>${french ? 'Aperçu du brouillon privé' : 'Private Entwurfsvorschau'}</p>` : ''}
    ${row?.version ? `<p>Version ${row.version}</p>` : ''}
    ${!row ? `<p>${french ? 'Cette page n’est pas encore publiée.' : 'Diese Seite ist noch nicht veröffentlicht.'}</p>` : ''}
    ${(seller?.address || seller?.email) ? `<p class="information-text">${[seller.address, seller.email].filter(Boolean).map(escapeHtml).join('\n')}</p>` : ''}
    ${row ? `<p class="information-text">${escapeHtml(row[french ? 'fr' : 'de'])}</p>` : ''}
    <p><a href="/${locale}/contact">${french ? 'Contact' : 'Kontakt'}</a></p>
  </section>`;
}

export function footerGroups(locale, cookieLink, accounts = false) {
  const french = locale === 'fr-CH';
  const prefix = '/' + locale;
  const support = [['/about','Über uns','Qui sommes-nous ?'], ['/contact','Kontakt','Contact'], ['/delivery-returns-warranty#delivery','Lieferung','Livraison'],
    ['/delivery-returns-warranty#returns','Rückgabe','Retours'], ['/delivery-returns-warranty#warranty','Garantie','Garantie']];
  const group = (name, links) => `<nav aria-label="${name}"><strong>${name}</strong><ul>${links}</ul></nav>`;
  const item = (path,label) => `<li><a href="${prefix + path}">${label}</a></li>`;
  return group(french ? 'Aide' : 'Hilfe', support.map(([path,de,fr])=>item(path,french?fr:de)).join('') + (accounts ? item('/account',french?'Mon compte':'Mein Konto') + item('/offers',french?'Offres':'Angebote') : '')) +
    group(french ? 'Informations légales' : 'Rechtliches', legalPaths.map(path=>item(path,legalTitle(locale,path))).join('') + '<li>'+cookieLink+'</li>');
}
export const cookieDetails = locale => `<div class="cookie-details">${cookieInfo[locale].map(item=>`<p>${escapeHtml(item)}</p>`).join('')}</div>`;
