import { adminFragment, adminHtml, adminText } from './admin-language.mjs';
import { initialFaqs } from './faq-seed.mjs';
import { escapeHtml } from './views.mjs';

const destinations = {
  '': 'Sin enlace',
  '#catalogue': 'Catálogo',
  '?family=accessory#catalogue': 'Accesorios',
  '?family=spare#catalogue': 'Recambios',
  '/compare': 'Comparador',
  '/contact': 'Contacto',
  '/about': 'Quiénes somos',
  '/delivery-returns-warranty': 'Envíos, devoluciones y garantía',
};

export function setupFaq(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS faq_entries (
    id INTEGER PRIMARY KEY, question_de TEXT NOT NULL, answer_de TEXT NOT NULL,
    question_fr TEXT NOT NULL, answer_fr TEXT NOT NULL, destination TEXT NOT NULL,
    label_de TEXT NOT NULL, label_fr TEXT NOT NULL, position INTEGER NOT NULL CHECK(position > 0),
    published INTEGER NOT NULL CHECK(published IN (0,1)), revision INTEGER NOT NULL DEFAULT 0
  ); CREATE INDEX IF NOT EXISTS faq_by_publication ON faq_entries(published, position, id);`);
  const seed = db.prepare(`INSERT OR IGNORE INTO faq_entries
    (id, question_de, answer_de, question_fr, answer_fr, destination, label_de, label_fr, position, published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`);
  initialFaqs.forEach((entry, index) => seed.run(index + 1, ...entry, (index + 1) * 10));
}

export function shopFaqs(db, locale) {
  const lang = locale === 'de-CH' ? 'de' : 'fr';
  return db.prepare(`SELECT question_${lang} AS question, answer_${lang} AS answer,
    destination, label_${lang} AS label FROM faq_entries WHERE published=1 ORDER BY position,id`).all();
}

const textLimits = { question_de: 180, answer_de: 3000, question_fr: 180, answer_fr: 3000, label_de: 100, label_fr: 100 };

export function updateFaq(db, id, fields) {
  if (!fields) return 'invalid';
  const read = key => (fields.get(key) || '').trim();
  const text = Object.fromEntries(Object.keys(textLimits).map(key => [key, read(key)]));
  const destination = read('destination');
  const position = read('position');
  const revision = read('revision');
  if (Object.entries(textLimits).some(([key, limit]) => text[key].length > limit) ||
      ['question_de', 'answer_de', 'question_fr', 'answer_fr'].some(key => !text[key]) ||
      !Object.hasOwn(destinations, destination) || (destination && (!text.label_de || !text.label_fr)) ||
      !/^[1-9]\d{0,8}$/.test(position) || (id && !/^\d{1,12}$/.test(revision))) return 'invalid';
  const data = [text.question_de, text.answer_de, text.question_fr, text.answer_fr, destination,
    destination ? text.label_de : '', destination ? text.label_fr : '', Number(position), Number(read('published') === '1')];
  if (id) {
    return db.prepare(`UPDATE faq_entries SET question_de=?, answer_de=?, question_fr=?, answer_fr=?,
      destination=?, label_de=?, label_fr=?, position=?, published=?, revision=revision+1
      WHERE id=? AND revision=?`).run(...data, id, Number(revision)).changes ? 'saved' : 'conflict';
  }
  db.prepare(`INSERT INTO faq_entries
    (question_de, answer_de, question_fr, answer_fr, destination, label_de, label_fr, position, published)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...data);
  return 'saved';
}

export function faqAdmin(db, message = '', attempt) {
  const entries = db.prepare('SELECT * FROM faq_entries ORDER BY position,id').all();
  const next = Math.min(999999999, (entries.at(-1)?.position || 0) + 10);
  const editor = entry => {
    const fields = attempt?.id === entry?.id ? attempt?.fields : null;
    const value = key => escapeHtml(String(fields?.get(key) ?? entry?.[key] ?? ''));
    const textInput = (key, label, required) => `<label>${adminText(label)}<input name="${key}" maxlength="${textLimits[key]}"
      value="${value(key)}"${required ? ' required' : ''}></label>`;
    const answer = (key, label) => `<label>${adminText(label)}<textarea name="${key}" maxlength="${textLimits[key]}" rows="4" required>${value(key)}</textarea></label>`;
    return adminHtml`<form class="admin-catalog faq-editor" method="post" action="/admin/faqs${entry ? '/' + entry.id : ''}">
      ${entry ? `<input type="hidden" name="revision" value="${entry.revision}">` : ''}
      ${textInput('question_de', 'Pregunta en alemán', true)}${answer('answer_de', 'Respuesta en alemán')}
      ${textInput('question_fr', 'Pregunta en francés', true)}${answer('answer_fr', 'Respuesta en francés')}
      <label>Enlace opcional<select name="destination">${Object.entries(destinations).map(([path, label]) =>
        `<option value="${escapeHtml(path)}"${value('destination') === escapeHtml(path) ? ' selected' : ''}>${adminText(label)}</option>`).join('')}</select></label>
      ${textInput('label_de', 'Texto del enlace en alemán')}${textInput('label_fr', 'Texto del enlace en francés')}
      <label>Posición<input type="number" name="position" required min="1" max="999999999" value="${fields || entry ? value('position') : next}"></label>
      <label class="admin-check"><input type="checkbox" name="published" value="1"
        ${(fields ? fields.get('published') === '1' : entry?.published) ? 'checked' : ''}> Publicada en la tienda</label>
      <button>${adminText(entry ? 'Guardar cambios' : 'Crear pregunta')}</button></form>`;
  };
  return adminHtml`<h1>Preguntas frecuentes</h1>
    <p>Las posiciones más bajas aparecen primero. Puedes dejar una pregunta como borrador.</p>
    <p><a href="/de-CH#faq">Deutsch</a> · <a href="/fr-CH#faq">Français</a></p>
    ${message}<details class="model-editor"${attempt?.id === undefined && attempt ? ' open' : ''}>
      <summary>Nueva pregunta</summary>${editor()}</details>
    ${entries.map(entry => adminHtml`<details class="model-editor"${attempt?.id === entry.id ? ' open' : ''}>
      <summary>${entry.position} · ${escapeHtml(entry.question_de)} / ${escapeHtml(entry.question_fr)} ·
      ${adminText(entry.published ? 'Publicada' : 'Borrador')}</summary>${editor(entry)}</details>`).join('')}`;
}

export function faqFeedback(result) {
  if (result === 'saved') return adminFragment('<p class="form-success" role="status">Pregunta guardada.</p>');
  if (result === 'conflict') return adminFragment('<p class="form-error" role="alert">La pregunta cambió mientras editabas. Revisa la versión actual y vuelve a guardar.</p>');
  return adminFragment('<p class="form-error" role="alert">Completa la pregunta y respuesta en ambos idiomas, la posición y, si eliges un enlace, sus dos textos.</p>');
}
