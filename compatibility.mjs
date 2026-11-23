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

export function compatibilityAdmin(part, chairs, entries, message = '') {
  const selected = new Map(entries.map(entry => [entry.chair, entry]));
  return `<p><a href="/admin/models/${part.sku}/content">Volver al artículo</a></p>
    <h1>Compatibilidad de ${escapeHtml(part.name)}</h1>
    <p>Marca los modelos compatibles. Si la pieza depende de una variante, medida o número de serie, indica la condición en ambos idiomas.</p>
    ${message}<form method="post" action="/admin/models/${part.sku}/compatibility">
    ${chairs.map(chair => {
      const entry = selected.get(chair.sku);
      return `<fieldset class="model-editor"><legend>${escapeHtml(chair.name)}${chair.active ? '' : ' · Archivado'}</legend>
        <label><input type="checkbox" name="chair" value="${chair.sku}" ${entry ? 'checked' : ''}> Compatible</label>
        <label>Condición en alemán <input name="de-${chair.sku}" maxlength="240" value="${escapeHtml(entry?.note_de || '')}"></label>
        <label>Condición en francés <input name="fr-${chair.sku}" maxlength="240" value="${escapeHtml(entry?.note_fr || '')}"></label></fieldset>`;
    }).join('')}<button>Guardar compatibilidad</button></form>`;
}

export function compatibilityInput(fields, chairs) {
  if (!fields) return null;
  const allowed = new Set(chairs.map(chair => chair.sku));
  const entries = [...new Set(fields.getAll('chair'))].map(sku =>
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
