import { adminHtml, adminText } from './admin-language.mjs';
import { aboutSections, information, validContactEmail, validContactPhone } from './information.mjs';
import { escapeHtml } from './views.mjs';

const languages = [['de', 'de-CH', 'Alemán'], ['fr', 'fr-CH', 'Francés']];
const pages = { about: 'Quiénes somos', contact: 'Datos públicos de contacto' };

export function setupInformation(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS information_settings (
    page TEXT PRIMARY KEY, content TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0
  );
  INSERT OR IGNORE INTO information_settings (page,content) VALUES ('about','{}'),('contact','{}');`);
}

export function informationSettings(db, page, configuredEmail) {
  const row = db.prepare('SELECT content, revision FROM information_settings WHERE page=?').get(page);
  const settings = JSON.parse(row.content);
  const defaults = {};
  for (const [code, locale] of languages) {
    [defaults['title_' + code], defaults['intro_' + code]] = information['/' + page][locale];
    if (page === 'about') aboutSections[locale].forEach(([heading, body], index) => {
      defaults['heading_' + code + '_' + index] = heading;
      defaults['body_' + code + '_' + index] = body;
    });
  }
  if (page === 'contact') {
    const email = configuredEmail?.trim();
    defaults.email = validContactEmail(email) ? email : '';
  }
  return { ...defaults, ...settings, revision: row.revision };
}

function fieldsFor(page) {
  const keys = {};
  for (const [code] of languages) {
    keys['title_' + code] = 100;
    keys['intro_' + code] = 400;
    if (page === 'contact') keys['hours_' + code] = 400;
    else aboutSections['de-CH'].forEach((_, index) => {
      keys['heading_' + code + '_' + index] = 100;
      keys['body_' + code + '_' + index] = 2000;
    });
  }
  if (page === 'contact') Object.assign(keys, { email: 254, phone: 35, address: 300 });
  return keys;
}

export function saveInformation(db, page, fields) {
  if (!fields) return { status: 'invalid' };
  const limits = fieldsFor(page);
  const values = Object.fromEntries(Object.keys(limits).map(key => [key, (fields.get(key) || '').trim().slice(0, limits[key] + 1)]));
  const revision = fields.get('revision') || '';
  const incomplete = languages.some(([code]) => !values['title_' + code] || !values['intro_' + code]);
  const invalidContact = page === 'contact' && (
    (values.email && !validContactEmail(values.email)) || (values.phone && !validContactPhone(values.phone)) ||
    Boolean(values.hours_de) !== Boolean(values.hours_fr));
  const invalidSections = page === 'about' && aboutSections['de-CH'].some((_, index) => {
    const filled = languages.flatMap(([code]) => ['heading', 'body'].map(field => Boolean(values[field + '_' + code + '_' + index])));
    return filled.some(Boolean) && !filled.every(Boolean);
  });
  if (incomplete || invalidContact || invalidSections || !/^\d{1,12}$/.test(revision) ||
      Object.keys(limits).some(key => values[key].length > limits[key])) return { status: 'invalid', values };
  const saved = db.prepare('UPDATE information_settings SET content=?,revision=revision+1 WHERE page=? AND revision=?')
    .run(JSON.stringify(values), page, Number(revision)).changes;
  return { status: saved ? 'saved' : 'conflict' };
}

export function informationAdmin(page, settings, result = {}) {
  const limits = fieldsFor(page);
  const text = key => escapeHtml((result.values?.[key] ?? settings[key] ?? '').slice(0, limits[key]));
  const input = (key, label, attrs = '') => adminHtml`<label>${adminText(label)}
    <input name="${key}" maxlength="${limits[key]}" value="${text(key)}" ${attrs}></label>`;
  const area = (key, label, attrs = '') => adminHtml`<label>${adminText(label)}
    <textarea name="${key}" rows="3" maxlength="${limits[key]}" ${attrs}>${text(key)}</textarea></label>`;
  const messages = {
    saved: 'Cambios publicados.',
    invalid: page === 'contact' ? 'Completa los textos en ambos idiomas y revisa los datos de contacto.' :
      'Completa el título y la introducción en ambos idiomas. Cada bloque debe estar completo o vacío en los dos idiomas.',
    conflict: 'El contenido cambió mientras lo editabas. Revisa los datos actuales y vuelve a guardar.',
  };
  return adminHtml`<h1>${adminText(pages[page])}</h1><p><a href="/de-CH/${page}">Deutsch</a> · <a href="/fr-CH/${page}">Français</a></p>
    ${result.status ? `<p class="${result.status === 'saved' ? 'form-success' : 'form-error'}" role="${result.status === 'saved' ? 'status' : 'alert'}">${adminText(messages[result.status])}</p>` : ''}
    <form class="admin-catalog information-editor" method="post" action="/admin/content/${page}">
      <input type="hidden" name="revision" value="${settings.revision}">
      ${page === 'contact' ? adminHtml`<fieldset><legend>Datos públicos</legend><p>Estos campos son opcionales. Solo publica datos de atención al cliente.</p>
        ${input('email', 'Correo público', 'type="email"')}${input('phone', 'Teléfono público', 'type="tel"')}
        ${area('address', 'Dirección pública')}</fieldset>` : ''}
      ${languages.map(([code, locale, label]) => adminHtml`<fieldset>
        <legend>${adminText(label)}</legend>
        ${input('title_' + code, 'Título', `lang="${locale}" required`)}
        ${area('intro_' + code, 'Introducción', `lang="${locale}" required`)}
        ${page === 'contact' ? area('hours_' + code, 'Horario opcional', `lang="${locale}"`) :
          aboutSections[locale].map((_, index) => adminHtml`<h2>Bloque ${index + 1}</h2>
            ${input('heading_' + code + '_' + index, 'Título del bloque', `lang="${locale}"`)}
            ${area('body_' + code + '_' + index, 'Texto del bloque', `lang="${locale}"`)}`).join('')}
      </fieldset>`).join('')}
      <button>Guardar y publicar</button>
    </form>`;
}
