import { coreSKU } from './cart.mjs';
import { escapeHtml } from './views.mjs';

export function setupCompatibility(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS catalog_compatibility (
    part TEXT NOT NULL REFERENCES extra_models(sku), chair TEXT NOT NULL,
    note_de TEXT NOT NULL, note_fr TEXT NOT NULL, PRIMARY KEY (part, chair)
  )`);
}

export const isPart = model => ['accessory', 'spare'].includes(model?.family);
const chairPath = sku => sku === coreSKU ? '/movility-one' : '/models/' + sku;

export function compatibilityAdmin(model, candidates, entries, message = '') {
  const field = isPart(model) ? 'chair' : 'part';
  const selected = new Map(entries.map(entry => [entry[field], entry]));
  const groups = field === 'chair' ? [['Sillas de ruedas', candidates]] :
    [['Accesorios', candidates.filter(item => item.family === 'accessory')],
      ['Recambios', candidates.filter(item => item.family === 'spare')]];
  const card = item => {
      const entry = selected.get(item.sku);
      return `<fieldset class="model-editor" data-compat-item data-name="${escapeHtml(item.name)}" data-sku="${item.sku}">
        <legend>${escapeHtml(item.name)}${item.active ? '' : ' · Archivado'}</legend>
        <p class="compat-sku">SKU ${item.sku}</p>
        <label class="admin-check"><input type="checkbox" name="${field}" value="${item.sku}" ${entry ? 'checked' : ''}> Compatible</label>
        <details ${entry?.note_de ? 'open' : ''}><summary>Condiciones de compatibilidad</summary>
        <label>Condición en alemán <input name="de-${item.sku}" maxlength="240" value="${escapeHtml(entry?.note_de || '')}"></label>
        <label>Condición en francés <input name="fr-${item.sku}" maxlength="240" value="${escapeHtml(entry?.note_fr || '')}"></label></details></fieldset>`;
  };
  return `<p><a href="/admin/models?family=${model.family}">Volver al catálogo</a> ·
    <a href="/admin/models/${model.sku}/content">Características, fotos y vídeo</a></p>
    <h1>Compatibilidad de ${escapeHtml(model.name)}</h1>
    <p>${field === 'chair' ? 'Marca las piezas compatibles con esta silla.' : 'Marca los modelos compatibles con esta pieza.'}
    Si hay una condición por versión, medida o número de serie, escríbela en ambos idiomas.</p>
    ${message}<form method="post" action="/admin/models/${model.sku}/compatibility" data-compat-editor>
    ${candidates.length ? `<div class="catalog-filters" data-compat-search hidden>
      <label>Buscar por nombre o SKU <input type="search" data-compat-query></label>
      <p role="status" data-compat-status></p></div>` : ''}
    ${groups.map(([label, items]) => `<section data-compat-group><h2>${label}</h2>
      ${items.length ? `<div class="admin-item-grid">${items.map(card).join('')}</div>` : '<p>Sin artículos en esta familia.</p>'}</section>`).join('')}
    ${candidates.length ? '<button>Guardar compatibilidad</button>' : ''}</form>
    ${candidates.length ? '<script src="/assets/compatibility-search.js" defer></script>' : ''}`;
}

export function compatibilityInput(fields, candidates, field) {
  if (!fields) return null;
  const allowed = new Set(candidates.map(item => item.sku));
  const entries = [...new Set(fields.getAll(field))].map(sku =>
    [sku, ...['de', 'fr'].map(lang => fields.get(lang + '-' + sku)?.trim() || '')]);
  return entries.every(([sku, de, fr]) => allowed.has(sku) && de.length <= 240 && fr.length <= 240 &&
    Boolean(de) === Boolean(fr)) ? entries : null;
}

export function compatibilityFilter(locale, family, chairs, selected) {
  const french = locale === 'fr-CH';
  return `<form class="catalog-filters" method="get" action="/${locale}#catalogue">
    <input type="hidden" name="family" value="${family}">
    <label>${french ? 'Compatible avec votre fauteuil' : 'Passend zu deinem Rollstuhl'}
    <select name="compatible"><option value="">${french ? 'Tous les modèles' : 'Alle Modelle'}</option>
      ${chairs.map(chair => `<option value="${chair.sku}" ${selected === chair.sku ? 'selected' : ''}>${escapeHtml(chair.name)}</option>`).join('')}
    </select></label><button>${french ? 'Filtrer' : 'Filtern'}</button></form>`;
}

export function compatibilitySection(locale, entries, partPage = false) {
  const french = locale === 'fr-CH';
  const heading = partPage ? (french ? 'Fauteuils compatibles' : 'Kompatible Rollstühle')
    : (french ? 'Accessoires et pièces compatibles' : 'Passendes Zubehör und Ersatzteile');
  if (!entries.length && !partPage) return '';
  const item = entry => {
    const note = french ? entry.note_fr : entry.note_de;
    const path = partPage ? chairPath(entry.sku) : '/models/' + entry.sku;
    return `<li><a href="/${locale}${path}">${escapeHtml(entry.name)}</a>${note ? ' · ' + escapeHtml(note) : ''}</li>`;
  };
  const content = partPage ? (entries.length ? `<ul>${entries.map(item).join('')}</ul>`
    : `<p>${french ? 'Compatibilité à confirmer. Contactez-nous avant de commander.' :
      'Kompatibilität noch offen. Kontaktiere uns vor der Bestellung.'}
      <a href="/${locale}/contact">${french ? 'Contact' : 'Kontakt'}</a></p>`)
    : [['accessory', french ? 'Accessoires' : 'Zubehör'], ['spare', french ? 'Pièces détachées' : 'Ersatzteile']]
      .map(([family, label]) => {
        const items = entries.filter(entry => entry.family === family);
        return items.length ? `<h3>${label}</h3><ul>${items.map(item).join('')}</ul>` : '';
      }).join('');
  return `<section class="section"><h2>${heading}</h2>${content}</section>`;
}
