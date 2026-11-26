import { adminHtml, adminText } from './admin-language.mjs';
import { escapeHtml } from './views.mjs';

const dimensions = {
  total_width: 'Ancho total (cm)', seat_width: 'Ancho del asiento (cm)',
  folded_length: 'Largo plegada (cm)', folded_width: 'Ancho plegada (cm)', folded_height: 'Alto plegada (cm)',
  weight: 'Peso (kg)', range: 'Autonomía (km)',
};
const localized = ['included_de', 'included_fr', 'distinction_de', 'distinction_fr'];
export function setupOneDetails(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS movility_one_details (
    id INTEGER PRIMARY KEY CHECK(id = 1), content TEXT NOT NULL);
    INSERT OR IGNORE INTO movility_one_details VALUES (1, '{}');`);
}

export function oneDetails(db) {
  return JSON.parse(db.prepare('SELECT content FROM movility_one_details WHERE id = 1').get().content);
}

export function saveOneDetails(db, fields) {
  if (!fields) return false;
  const read = key => fields.get(key)?.trim() || '';
  const details = {};
  for (const key of Object.keys(dimensions)) {
    const raw = read(key).replace(',', '.');
    if (!raw) continue;
    if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(raw) || Number(raw) === 0) return false;
    details[key] = Number(raw);
  }
  const folded = ['folded_length', 'folded_width', 'folded_height'];
  if (folded.some(key => key in details) && !folded.every(key => key in details)) return false;
  const battery = read('battery');
  if (!['', 'included', 'excluded'].includes(battery) || battery && !details.weight) return false;
  if (battery) details.battery = battery;
  for (const key of localized) {
    const value = read(key);
    if (value.length > (key.startsWith('included') ? 600 : 220)) return false;
    if (value) details[key] = value;
  }
  for (const key of ['included', 'distinction']) {
    if (Boolean(details[key + '_de']) !== Boolean(details[key + '_fr'])) return false;
  }
  if (read('folding_video') === '1') details.folding_video = true;
  db.prepare('UPDATE movility_one_details SET content=? WHERE id=1').run(JSON.stringify(details));
  return true;
}

export function resetOneVideoPurpose(db) {
  db.exec("UPDATE movility_one_details SET content = json_remove(content, '$.folding_video') WHERE id = 1");
}

export function oneDetailsEditor(details, invalid = false) {
  return adminHtml`<section class="section" id="one-fit"><h2>Medidas y transporte · Mobility One</h2>
    <p>Completa solo los datos confirmados por el proveedor. Indica las tres medidas plegadas juntas y añade los textos en ambos idiomas.</p>
    ${invalid ? adminHtml`<p role="alert">Revisa las medidas, el peso y los textos en ambos idiomas.</p>` : ''}
    <form class="confirmation" method="post" action="/admin/models/one/content/fit">
      <div class="address-row">${Object.entries(dimensions).map(([key, label]) => adminHtml`<label>${adminText(label)}
        <input name="${key}" inputmode="decimal" maxlength="6" value="${details[key] ?? ''}"></label>`).join('')}</div>
      <label>Batería en el peso indicado<select name="battery">
        <option value="">Sin confirmar</option>
        <option value="included" ${details.battery === 'included' ? 'selected' : ''}>Incluida</option>
        <option value="excluded" ${details.battery === 'excluded' ? 'selected' : ''}>Excluida</option>
      </select></label>
      ${['de', 'fr'].map(lang => adminHtml`<fieldset><legend lang="${lang}-CH">${lang === 'de' ? 'Deutsch' : 'Français'}</legend>
        <label>Qué incluye la compra<textarea name="included_${lang}" lang="${lang}-CH" maxlength="600">${escapeHtml(details['included_' + lang] || '')}</textarea></label>
        <label>Qué distingue al modelo<input name="distinction_${lang}" lang="${lang}-CH" maxlength="220" value="${escapeHtml(details['distinction_' + lang] || '')}"></label>
      </fieldset>`).join('')}
      <label><input type="checkbox" name="folding_video" value="1" ${details.folding_video ? 'checked' : ''}>El vídeo de Mobility One muestra cómo se pliega</label>
      <p><a href="#media-upload">Adjuntar vídeo, subtítulos y transcripciones</a></p>
      <button>Guardar medidas y transporte</button>
    </form></section>`;
}

const labels = {
  'de-CH': {
    fit: 'Passt er in deinen Alltag?', transport: 'Masse und Transport', total: 'Gesamtbreite', seat: 'Sitzbreite',
    folded: 'Gefaltete Masse (L × B × H)', weight: 'Gewicht', included: 'Lieferumfang',
    batteryIn: 'inklusive Akku', batteryOut: 'ohne Akku', video: 'Falten im Video ansehen',
    question: 'Hast du Fragen zu den Massen dieses Modells?',
    distinction: 'Den Mobility One kannst du in der Galerie aus mehreren Blickwinkeln und im 3D-Viewer ansehen.',
  },
  'fr-CH': {
    fit: 'Convient-il à votre quotidien ?', transport: 'Dimensions et transport', total: 'Largeur totale', seat: 'Largeur d’assise',
    folded: 'Dimensions pliées (L × l × H)', weight: 'Poids', included: 'Ce que comprend l’achat',
    batteryIn: 'batterie comprise', batteryOut: 'hors batterie', video: 'Voir comment il se plie',
    question: 'Vous avez des questions sur les dimensions de ce modèle ?',
    distinction: 'Vous pouvez examiner le Mobility One sous plusieurs angles dans la galerie et dans la vue 3D.',
  },
};

export const oneVideoLabel = locale => labels[locale].video;
export const oneDistinction = (locale, details) => details['distinction_' + locale.slice(0, 2)] || labels[locale].distinction;

export function oneFitPanel(locale, details, folding) {
  const t = labels[locale];
  const format = new Intl.NumberFormat(locale);
  const cm = value => format.format(value) + ' cm';
  const rows = [
    [t.total, details.total_width && cm(details.total_width)],
    [t.seat, details.seat_width && cm(details.seat_width)],
    [t.folded, details.folded_length && [details.folded_length, details.folded_width, details.folded_height].map(cm).join(' × ')],
    [t.weight, details.weight && (format.format(details.weight) + ' kg' +
      (details.battery === 'included' ? ' · ' + t.batteryIn : details.battery === 'excluded' ? ' · ' + t.batteryOut : ''))],
  ].filter(([, value]) => value);
  const included = details['included_' + locale.slice(0, 2)];
  return `<section class="one-fit" aria-labelledby="one-fit-title">
    <h2 id="one-fit-title">${t.fit}</h2>${rows.length || folding ? `<h3>${t.transport}</h3>` : ''}
    ${rows.length ? `<dl class="specs">${rows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>` : ''}
    ${folding ? `<p><a href="#${folding}">${t.video}</a></p>` : ''}
    <p><a href="/${locale}/contact?model=one">${t.question}</a></p>
    ${included ? `<h3>${t.included}</h3><p class="information-text">${escapeHtml(included)}</p>` : ''}
  </section>`;
}
