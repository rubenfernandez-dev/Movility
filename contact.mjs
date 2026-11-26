import { adminHtml, adminLocale, adminText } from './admin-language.mjs';
import { escapeHtml } from './views.mjs';

const topics = {
  advice: ['Asesoramiento', 'Beratung zur Modellauswahl', 'Conseil pour choisir un modèle'],
  compatibility: ['Compatibilidad', 'Zubehör und Ersatzteile', 'Accessoires et pièces détachées'],
  delivery: ['Envío y pedido', 'Bestellung und Lieferung', 'Commande et livraison'],
  service: ['Devolución o asistencia', 'Rückgabe oder Kundendienst', 'Retour ou service après-vente'],
  other: ['Otro', 'Sonstiges', 'Autre demande'],
};
const topicLabel = (topic, locale) => topics[topic][{ es: 0, 'de-CH': 1, 'fr-CH': 2 }[locale]];

export function setupContact(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS contact_messages (
    id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL, locale TEXT NOT NULL,
    name TEXT NOT NULL, email TEXT NOT NULL, topic TEXT NOT NULL, reference TEXT NOT NULL,
    message TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0 CHECK(resolved IN (0, 1))
  );
  CREATE INDEX IF NOT EXISTS contact_messages_recent ON contact_messages(created_at, email COLLATE NOCASE);`);
  if (!db.prepare('PRAGMA table_info(contact_messages)').all().some(column => column.name === 'model')) {
    db.exec("ALTER TABLE contact_messages ADD COLUMN model TEXT NOT NULL DEFAULT ''");
  }
}

const limits = { name: 100, email: 254, topic: 32, reference: 60, model: 24, message: 3000 };
const optional = new Set(['reference', 'model']);

export function readContact(fields, models = []) {
  if (!fields) return { values: {}, invalid: Object.keys(limits).filter(key => !optional.has(key)) };
  const values = Object.fromEntries(Object.entries(limits).map(([key, limit]) =>
    [key, (fields.get(key) || '').trim().slice(0, limit + 1)]));
  const invalid = Object.keys(limits).filter(key => values[key].length > limits[key] ||
    (!optional.has(key) && !values[key]));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email) && !invalid.includes('email')) invalid.push('email');
  if (!Object.hasOwn(topics, values.topic) && !invalid.includes('topic')) invalid.push('topic');
  if (values.model && !models.some(model => model.sku === values.model) && !invalid.includes('model')) invalid.push('model');
  return { values, invalid, trap: Boolean(fields.get('company_site')) };
}

export function saveContact(db, locale, values, now = Math.floor(Date.now() / 1000)) {
  const since = now - 900;
  const global = db.prepare('SELECT count(*) AS total FROM contact_messages WHERE created_at > ?').get(since).total;
  const address = db.prepare('SELECT count(*) AS total FROM contact_messages WHERE created_at > ? AND email=? COLLATE NOCASE')
    .get(since, values.email).total;
  if (global >= 30 || address >= 3) return false;
  db.prepare(`INSERT INTO contact_messages (created_at,locale,name,email,topic,reference,message,model)
    VALUES (?,?,?,?,?,?,?,?)`).run(now, locale, values.name, values.email, values.topic, values.reference, values.message, values.model || '');
  return true;
}

export function contactForm(locale, { values = {}, invalid = [], sent = false, limited = false, models = [] } = {}) {
  const fr = locale === 'fr-CH';
  const labels = fr ? {
    name: 'Votre nom', email: 'Adresse e-mail', topic: 'Motif de votre demande',
    reference: 'Référence de commande (facultatif)', model: 'Modèle ou article (facultatif)', message: 'Votre message',
  } : { name: 'Dein Name', email: 'E-Mail-Adresse', topic: 'Thema deiner Anfrage',
    reference: 'Bestellreferenz (optional)', model: 'Modell oder Artikel (optional)', message: 'Deine Nachricht' };
  const value = key => escapeHtml(values[key]?.slice(0, limits[key]) || '');
  const invalidAttrs = key => invalid.includes(key) ? ' aria-invalid="true"' : '';
  const input = (key, attrs = '') => `<label for="contact-${key}">${labels[key]}</label>
    <input id="contact-${key}" name="${key}" value="${value(key)}" maxlength="${limits[key]}" ${attrs}${invalidAttrs(key)}>`;
  if (sent) return `<section class="confirmation" role="status" tabindex="-1" autofocus>
    <h2>${fr ? 'Merci pour votre message' : 'Danke für deine Nachricht'}</h2>
    <p>${fr ? 'Votre demande a été enregistrée. Nous pouvons vous répondre à l’adresse indiquée.' :
      'Deine Anfrage wurde gespeichert. Wir können dir an die angegebene E-Mail-Adresse antworten.'}</p>
    <a href="/${locale}/contact">${fr ? 'Nouvelle demande' : 'Neue Anfrage'}</a></section>`;
  return `<form class="confirmation contact-form" method="post" action="/${locale}/contact" novalidate>
    <h2>${fr ? 'Écrivez-nous' : 'Schreib uns'}</h2>
    <p>${fr ? 'Le modèle et la référence de commande sont facultatifs.' : 'Modell und Bestellreferenz sind optional.'}</p>
    ${invalid.length || limited ? `<div class="form-error" tabindex="-1" autofocus role="alert">
      <p>${limited ? (fr ? 'Trop de demandes. Réessayez dans quelques minutes.' : 'Zu viele Anfragen. Versuche es in einigen Minuten erneut.')
        : (fr ? 'Vérifiez les champs suivants.' : 'Prüfe die folgenden Felder.')}</p>
      ${invalid.length ? `<ul>${invalid.map(key => `<li><a href="#contact-${key}">${labels[key]}</a></li>`).join('')}</ul>` : ''}</div>` : ''}
    ${input('name', 'autocomplete="name" required')}${input('email', 'type="email" autocomplete="email" required')}
    <label for="contact-topic">${labels.topic}</label><select id="contact-topic" name="topic" required${invalidAttrs('topic')}>
      <option value="">${fr ? 'Choisir un motif' : 'Thema auswählen'}</option>
      ${Object.keys(topics).map(key => `<option value="${key}" ${values.topic === key ? 'selected' : ''}>${topicLabel(key, locale)}</option>`).join('')}
    </select>
    <label for="contact-model">${labels.model}</label><select id="contact-model" name="model"${invalidAttrs('model')}>
      <option value="">${fr ? 'Sans modèle' : 'Ohne Modell'}</option>
      ${models.map(model => `<option value="${model.sku}"${values.model === model.sku ? ' selected' : ''}>${escapeHtml(model.name)}</option>`).join('')}
    </select>
    ${input('reference')}
    <label for="contact-message">${labels.message}</label><textarea id="contact-message" name="message" rows="6" maxlength="3000" required${invalidAttrs('message')}>${value('message')}</textarea>
    <div hidden><label>Website <input name="company_site" tabindex="-1" autocomplete="off"></label></div>
    <p>${fr ? 'Nous utilisons vos coordonnées pour répondre à cette demande. Évitez d’envoyer des données médicales ou bancaires.' :
      'Wir verwenden deine Kontaktdaten, um diese Anfrage zu beantworten. Bitte sende keine Gesundheits- oder Bankdaten.'}</p>
    <button>${fr ? 'Envoyer le message' : 'Nachricht senden'}</button></form>`;
}

export function contactInbox(db, resolved) {
  const locale = adminLocale();
  const entries = db.prepare('SELECT * FROM contact_messages WHERE resolved=? ORDER BY id DESC LIMIT 100').all(Number(resolved));
  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Zurich' });
  return adminHtml`<p><a href="/admin">Volver a administración</a></p><h1>Bandeja de contacto</h1>
    <nav aria-label="Bandeja de contacto"><a href="/admin/contact" ${resolved ? '' : 'aria-current="page"'}>Pendientes</a>
    <a href="/admin/contact?resolved=1" ${resolved ? 'aria-current="page"' : ''}>Resueltas</a></nav>
    ${entries.length ? entries.map(entry => adminHtml`<article class="contact-message"><h2>${escapeHtml(entry.name)}</h2>
      <p>${topicLabel(entry.topic, locale)} · ${date.format(entry.created_at * 1000)} · ${entry.locale}</p>
      ${entry.model ? adminHtml`<p>Modelo · SKU <code>${escapeHtml(entry.model)}</code></p>` : ''}
      <p><a href="mailto:${escapeHtml(encodeURIComponent(entry.email))}">${escapeHtml(entry.email)}</a>
        ${entry.reference ? ' · ' + escapeHtml(entry.reference) : ''}</p>
      <p class="email-body">${escapeHtml(entry.message)}</p>
      <form method="post" action="/admin/contact"><input type="hidden" name="id" value="${entry.id}">
        <button name="status" value="${resolved ? 'pending' : 'resolved'}">${adminText(resolved ? 'Reabrir consulta' : 'Marcar como resuelta')}</button>
      </form></article>`).join('') : adminHtml`<p>No hay consultas en esta vista.</p>`}`;
}

export function updateContactStatus(db, id, status) {
  return /^\d{1,12}$/.test(id) && ['pending', 'resolved'].includes(status) &&
    db.prepare('UPDATE contact_messages SET resolved=? WHERE id=?').run(Number(status === 'resolved'), Number(id)).changes > 0;
}
