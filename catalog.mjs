import { productSpecs, productOffer } from './product-specs.mjs';
import { adminFragment, adminHtml, adminLocale, adminText } from './admin-language.mjs';
import { escapeHtml, money } from './views.mjs';
import { oneVideoLabel } from './movility-one-details.mjs';
import { missingProductPhoto, productAvailability, productDetails, productGallery, productOverview, galleryVideos } from './storefront.mjs';
import { coreSKU, skuPattern } from './cart.mjs';
import { compareLabel, comparisonLink, comparisonQuery, withQuery } from './discovery.mjs';
import { chairFilterKeys } from './chair-filters.mjs';
import { isPart } from './compatibility.mjs';

const initialFamilies = {
  wheelchair: { es: 'Sillas de ruedas', 'de-CH': 'Elektrorollstühle', 'fr-CH': 'Fauteuils roulants électriques' },
  accessory: { es: 'Accesorios', 'de-CH': 'Zubehör', 'fr-CH': 'Accessoires' },
  spare: { es: 'Recambios', 'de-CH': 'Ersatzteile', 'fr-CH': 'Pièces détachées' },
};
export const isWheelchair = model => !model.family || model.family === 'wheelchair';

const view3dLabel = { 'de-CH': '3D-Ansicht öffnen', 'fr-CH': 'Ouvrir la vue 3D' };

export function setupModels(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS extra_models (
      sku TEXT PRIMARY KEY, name TEXT NOT NULL, cents INTEGER NOT NULL CHECK(cents > 0),
      units INTEGER NOT NULL CHECK(units >= 0), active INTEGER NOT NULL CHECK(active IN (0, 1)),
      description_de TEXT NOT NULL, description_fr TEXT NOT NULL,
      width INTEGER NOT NULL, weight INTEGER NOT NULL, range INTEGER NOT NULL, fold INTEGER NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS order_models (
      order_id TEXT PRIMARY KEY REFERENCES orders(id), sku TEXT NOT NULL REFERENCES extra_models(sku),
      name TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS order_lines (
      order_id TEXT NOT NULL REFERENCES orders(id), sku TEXT NOT NULL, name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK(quantity > 0), cents INTEGER NOT NULL CHECK(cents > 0),
      PRIMARY KEY (order_id, sku)
    );
  `);
  for (const [table, column, type] of [
    ['extra_models', 'length', 'INTEGER'],
    ['extra_models', 'height', 'INTEGER'],
    ['extra_models', 'max_load', 'INTEGER'],
    ['extra_models', 'family', "TEXT NOT NULL DEFAULT 'wheelchair'"],
    ['order_models', 'requires_serial', 'INTEGER NOT NULL DEFAULT 1'],
    ['order_lines', 'requires_serial', 'INTEGER NOT NULL DEFAULT 1'],
  ]) {
    if (!db.prepare(`PRAGMA table_info(${table})`).all().some(row => row.name === column)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    }
  }
  db.exec(`CREATE TABLE IF NOT EXISTS catalog_families (id TEXT PRIMARY KEY, es TEXT NOT NULL,
    "de-CH" TEXT NOT NULL, "fr-CH" TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog_gallery (sku TEXT PRIMARY KEY, settings TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS catalog_features (sku TEXT PRIMARY KEY, de TEXT NOT NULL, fr TEXT NOT NULL);`);
  db.exec('CREATE TABLE IF NOT EXISTS catalog_positions (kind TEXT NOT NULL, id TEXT NOT NULL, position INTEGER NOT NULL CHECK(position > 0), PRIMARY KEY (kind, id))');
  const seed = db.prepare('INSERT OR IGNORE INTO catalog_families VALUES (?, ?, ?, ?)');
  for (const [id, labels] of Object.entries(initialFamilies)) seed.run(id, labels.es, labels['de-CH'], labels['fr-CH']);
}

export const catalogFamilies = db => db.prepare(`SELECT f.*, p.position FROM catalog_families f
  LEFT JOIN catalog_positions p ON p.kind='family' AND p.id=f.id ORDER BY p.position NULLS LAST, f.es, f.id`).all();

export function orderedProducts(db, models) {
  const positions = new Map(db.prepare("SELECT id, position FROM catalog_positions WHERE kind='product'").all()
    .map(({ id, position }) => [id, position]));
  return models.map(model => ({ ...model, position: positions.get(model.sku) }))
    .sort((a, b) => (a.position ?? Infinity) - (b.position ?? Infinity) || 0);
}

export function saveCatalogPosition(db, fields) {
  const kind = fields?.get('kind');
  const id = fields?.get('id') || '';
  const position = fields?.get('position')?.trim() ?? '';
  if (!skuPattern.test(id) || (position && !/^[1-9]\d{0,8}$/.test(position))) return false;
  const exists = kind === 'family' ? db.prepare('SELECT 1 FROM catalog_families WHERE id=?').get(id)
    : kind === 'product' && (id === coreSKU || db.prepare('SELECT 1 FROM extra_models WHERE sku=?').get(id));
  if (!exists) return false;
  if (position) {
    db.prepare(`INSERT INTO catalog_positions VALUES (?, ?, ?) ON CONFLICT(kind, id)
      DO UPDATE SET position=excluded.position`).run(kind, id, Number(position));
  } else {
    db.prepare('DELETE FROM catalog_positions WHERE kind=? AND id=?').run(kind, id);
  }
  return true;
}

const familyLabel = family => family[adminLocale()] || family.es;

export function catalogOrderAdmin(families, products, message, chairs = [], featured = '') {
  const row = (kind, id, name, position) => adminHtml`<form class="catalog-filters" method="post" action="/admin/catalog-order">
    <input type="hidden" name="kind" value="${kind}"><input type="hidden" name="id" value="${escapeHtml(id)}">
    <label>${escapeHtml(name)} <input type="number" name="position" min="1" max="999999999" step="1" value="${position ?? ''}"></label>
    <button>Guardar posición</button></form>`;
  return adminHtml`<p><a href="/admin/models">Volver a artículos</a></p><h1>Orden del catálogo</h1>
    <p>El número más bajo aparece primero. Deja el campo vacío para usar el orden automático al final.</p>
    ${message}
    <h2>Portada de la tienda</h2>
    <form class="catalog-filters" method="post" action="/admin/catalog-order">
      <input type="hidden" name="kind" value="featured">
      <label>Silla destacada<select name="sku"><option value="">Portada de marca</option>
        ${chairs.map(chair => `<option value="${chair.sku}"${chair.sku === featured ? ' selected' : ''}>${escapeHtml(chair.name)}</option>`).join('')}
      </select></label><button>Guardar portada</button>
    </form><h2>Familias</h2>
    ${families.map(family => row('family', family.id, familyLabel(family), family.position)).join('')}
    <h2>Productos por familia</h2>
    ${families.map(family => adminHtml`<section><h3>${escapeHtml(familyLabel(family))}</h3>
      ${products.filter(product => product.family === family.id)
        .map(product => row('product', product.sku, product.name, product.position)).join('') || adminFragment('<p>Sin artículos.</p>')}</section>`).join('')}`;
}
export const catalogFeatures = (db, sku) => db.prepare('SELECT de, fr FROM catalog_features WHERE sku = ?').get(sku);
export function saveFamily(db, fields, editing) {
  const id = editing || fields?.get('id')?.trim() || '';
  const names = ['es', 'de', 'fr'].map(key => fields?.get(key)?.trim() || '');
  if (!skuPattern.test(id) || names.some(value => !value || value.length > 100)) return false;
  const statement = editing ? 'UPDATE catalog_families SET es=?, "de-CH"=?, "fr-CH"=? WHERE id=?'
    : 'INSERT OR IGNORE INTO catalog_families (es,"de-CH","fr-CH",id) VALUES (?,?,?,?)';
  return Boolean(db.prepare(statement).run(...names, id).changes);
}
export function familiesAdmin(families, message = '') {
  const editor = family => adminHtml`<form class="confirmation" method="post" action="/admin/families${family ? '/' + family.id : ''}">
    ${family ? '' : adminFragment('<label>Identificador <input name="id" required maxlength="24"></label>')}
    ${[['es','es','Nombre interno'], ['de','de-CH','Nombre en alemán'], ['fr','fr-CH','Nombre en francés']]
      .map(([key, lang, label]) => adminHtml`<label>${adminText(label)}<input name="${key}" required maxlength="100" value="${escapeHtml(family?.[lang] || '')}"></label>`).join('')}
    <button>${adminText(family ? 'Guardar familia' : 'Crear familia')}</button></form>`;
  return adminHtml`<h1>Familias del catálogo</h1><p><a href="/admin/models">Volver a artículos</a> · <a href="/admin/catalog-order">Ordenar catálogo</a></p>${message}
    <h2>Nueva familia</h2>${editor()}${families.map(family => adminHtml`<details><summary>${escapeHtml(familyLabel(family))}</summary>${editor(family)}</details>`).join('')}`;
}

export function catalogFilter(params, families) {
  const family = params.get('family');
  return families.some(row => row.id === family) ? family : '';
}

export function previewLinks(sku) {
  return adminHtml`<p>Vista previa · <a href="/admin/models/${sku}/preview/de-CH">de-CH</a> · <a href="/admin/models/${sku}/preview/fr-CH">fr-CH</a></p>`;
}

export function modelAdmin(models, families, message = '', params = new URLSearchParams(), attempted = null) {
  const family = catalogFilter(params, families);
  const status = ['published', 'archived'].includes(params.get('status')) ? params.get('status') : '';
  const search = (params.get('q') || '').trim().slice(0, 80);
  const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const term = normalize(search);
  const visible = models.filter(model => (!family || model.family === family) &&
    (!status || Boolean(model.active) === (status === 'published')) &&
    (!term || normalize(model.name).includes(term) || normalize(model.sku).includes(term)));
  const filters = new URLSearchParams();
  if (search) filters.set('q', search);
  if (family) filters.set('family', family);
  if (status) filters.set('status', status);
  const pageSize = 20;
  const pageCount = Math.ceil(visible.length / pageSize);
  const requestedPage = params.get('page') || '';
  const currentPage = /^\d+$/.test(requestedPage) ? Math.max(1, Math.min(Number(requestedPage), pageCount)) : 1;
  const start = (currentPage - 1) * pageSize;
  const grouped = Map.groupBy(visible, model => model.family);
  const pageItems = families.flatMap(({ id }) => grouped.get(id) || []).slice(start, start + pageSize);
  const pageLink = number => {
    const query = new URLSearchParams(filters);
    query.set('page', String(number));
    return '/admin/models?' + escapeHtml(query.toString()) + '#catalog-results';
  };
  if (currentPage > 1) filters.set('page', String(currentPage));
  const query = filters.size ? '?' + escapeHtml(filters.toString()) : '';
  const editSku = params.get('edit');
  const form = (model, editing = Boolean(model)) => {
    const prefix = editing ? model.sku : 'new';
    const missing = ['de', 'fr'].filter(code => !model?.['description_' + code]?.trim());
    const feedback = missing.length ? adminHtml`<ul>${missing.map(code => adminHtml`<li><a href="#${prefix}-description-${code}">Falta la descripción · ${code === 'de' ? 'de-CH' : 'fr-CH'}</a></li>`).join('')}</ul>` : '';
    const preview = editing ? previewLinks(model.sku) : '';
    const missingSpecs = editing && isWheelchair(model) &&
      [...technicalFields, 'fold'].some(key => model[key] == null || model[key] < 0);
    const field = (key, label, value, attributes = '') => adminHtml`<label>${adminText(label)}<input name="${key}" value="${escapeHtml(String(value))}" ${attributes}></label>`;
    const description = (code, name) => adminHtml`<label>Descripción en ${adminText(name)} · ${code === 'de' ? 'de-CH' : 'fr-CH'} · Obligatoria para publicar<textarea id="${prefix}-description-${code}" name="description_${code}" maxlength="500" rows="2">${escapeHtml(model?.['description_' + code] ?? '')}</textarea></label>`;
    return adminHtml`<form class="admin-catalog" method="post" action="/admin/models${editing ? '/' + model.sku : ''}${query}">
      ${editing ? adminHtml`<input type="hidden" name="revision" value="${escapeHtml(String(model.revision ?? ''))}">` : ''}
      <div class="address-row">
        <label>Familia<select name="family">${families.map(familyRow => {
          const { id } = familyRow;
          return `<option value="${id}" ${(model?.family || 'wheelchair') === id ? 'selected' : ''}>${escapeHtml(familyLabel(familyRow))}</option>`;
        }).join('')}</select></label>
        ${editing ? adminHtml`<p>SKU <strong>${model.sku}</strong></p>` : field('sku', 'SKU', model?.skuInput || '', 'required maxlength="24" pattern="[a-z0-9][a-z0-9\\-]{1,23}"')}
        ${field('name', 'Nombre comercial', model?.name ?? '', 'required maxlength="80"')}
        ${field('price', 'Precio en CHF', model?.price ?? (model ? (model.cents / 100).toFixed(2) : ''), 'required inputmode="decimal"')}
        ${field('units', 'Unidades disponibles', model?.units ?? 0, 'type="number" min="0" max="999" required')}
        ${field('width', 'Anchura en cm (sillas)', model?.width >= 0 ? model.width : '', 'type="number" min="0" max="999"')}
        ${field('weight', 'Peso en kg (sillas)', model?.weight >= 0 ? model.weight : '', 'type="number" min="0" max="999"')}
        ${field('range', 'Autonomía en km (sillas)', model?.range >= 0 ? model.range : '', 'type="number" min="0" max="999"')}
        ${field('length', 'Longitud en cm (sillas)', model?.length ?? '', 'type="number" min="0" max="999"')}
        ${field('height', 'Altura en cm (sillas)', model?.height ?? '', 'type="number" min="0" max="999"')}
        ${field('max_load', 'Carga máxima en kg (sillas)', model?.max_load ?? '', 'type="number" min="0" max="999"')}
      </div>
      <h4>Requisitos de publicación</h4>${missing.length ? feedback : adminHtml`<p>Descripciones bilingües completas.</p>`}
      ${description('de', 'alemán')}${description('fr', 'francés')}
      <h4>Avisos opcionales</h4>
      <p>Las medidas, características adicionales y medios son opcionales.</p>
      ${missingSpecs ? adminHtml`<p>Hay datos técnicos pendientes.</p>` : ''}
      ${editing ? adminHtml`<p><a href="/admin/models/${model.sku}/content#media-upload">Revisar fotos, vídeo y medios pendientes</a></p>` : ''}
      ${preview}
      <label>Plegable <select name="fold"><option value="">Sin dato</option>
        <option value="1" ${model?.fold === 1 ? 'selected' : ''}>Sí</option>
        <option value="0" ${model?.fold === 0 ? 'selected' : ''}>No</option></select></label>
      <label><input type="checkbox" name="active" value="1" ${model?.active ? 'checked' : ''}> Publicado en la tienda</label>
      <button>${editing ? adminText('Guardar cambios') : adminText('Crear artículo')}</button>
    </form>`;
  };
  return adminHtml`<a href="/admin">Volver a administración</a><h1 class="page-title">Artículos del catálogo</h1>
    <div class="product-actions admin-catalog-links">
      <a class="button secondary" href="/admin/families">Gestionar familias</a>
      <a class="button secondary" href="/admin/catalog-import">Importar CSV</a>
      <a class="button secondary" href="/admin/catalog-order">Portada y orden del catálogo</a>
    </div>
    ${message}
    <details class="model-editor admin-create-item" ${attempted && !attempted.editing ? 'open' : ''}><summary>Crear artículo</summary>${form(attempted && !attempted.editing ? attempted.model : null, false)}</details>
    <form class="catalog-filters" action="/admin/models" method="get">
      <label>Nombre o SKU <input type="search" name="q" maxlength="80" value="${escapeHtml(search)}"></label>
      <label>Familia <select name="family"><option value="">Todas las familias</option>
        ${families.map(familyRow => { const { id } = familyRow; return adminHtml`<option value="${id}" ${family === id ? 'selected' : ''}>${escapeHtml(familyLabel(familyRow))}</option>`; }).join('')}
      </select></label>
      <label>Estado <select name="status"><option value="">Todos los estados</option>
        <option value="published" ${status === 'published' ? 'selected' : ''}>Publicado</option>
        <option value="archived" ${status === 'archived' ? 'selected' : ''}>Archivado</option>
      </select></label>
      <button>Buscar</button>${filters.size ? adminFragment('<a href="/admin/models">Limpiar búsqueda y filtros</a>') : ''}
    </form>
    <div id="catalog-results">
    ${visible.length ? adminHtml`<p>${pageCount > 1 ? `${start + 1}–${start + pageItems.length} de ` : ''}${visible.length} ${visible.length === 1 ? adminText('artículo') : adminText('artículos')}</p>` + families.map(familyRow => {
      const { id } = familyRow;
      const items = pageItems.filter(model => model.family === id);
      return items.length ? adminHtml`<section><h2>${escapeHtml(familyLabel(familyRow))}</h2><div class="admin-item-grid">
        ${items.map(model => adminHtml`<article class="model-editor" id="item-${model.sku}">
          <h3>${escapeHtml(model.name)}</h3><p>SKU ${model.sku} · ${model.active ? adminText('Publicado') : adminText('Archivado')} · ${model.units} ud.</p>
          <div class="admin-item-actions">
          <a class="button secondary" href="/admin/models/${model.sku}/content">Características, fotos y vídeo</a>
          ${isPart(model) || isWheelchair(model) ? adminHtml`<a class="button secondary" href="/admin/models/${model.sku}/compatibility">${isPart(model) ? adminText('Configurar compatibilidad') : adminText('Asignar accesorios y recambios')}</a>` : ''}
          ${model.sku === coreSKU ? adminFragment('<a class="button secondary" href="/admin#catalog-editor">Editar datos del artículo</a>') : ''}
          </div>
          ${model.sku === coreSKU ? '' :
            adminHtml`<details ${editSku === model.sku || attempted?.editing && attempted.model.sku === model.sku ? 'open' : ''}><summary>Editar artículo</summary>${form(attempted?.editing && attempted.model.sku === model.sku ? attempted.model : model)}</details>`}
          </article>`).join('')}</div></section>` : '';
    }).join('') : adminFragment('<p>No hay artículos que coincidan con estos filtros.</p>')}
    ${pageCount > 1 ? adminHtml`<nav class="product-actions" aria-label="Páginas del catálogo">
      ${currentPage > 1 ? adminHtml`<a class="button secondary" href="${pageLink(currentPage - 1)}">Anterior</a>` : ''}
      <span>Página ${currentPage} de ${pageCount}</span>
      ${currentPage < pageCount ? adminHtml`<a class="button secondary" href="${pageLink(currentPage + 1)}">Siguiente</a>` : ''}
    </nav>` : ''}</div>`;
}

export function storefrontFamilyFilters(locale, families, activeFamily, context = new URLSearchParams()) {
  const french = locale === 'fr-CH';
  const link = (id, label) => {
    const query = comparisonQuery(context);
    query.delete('family');
    if (id) query.set('family', id);
    if (!isPart({ family: id }) || !isPart({ family: activeFamily })) query.delete('compatible');
    if (id && id !== 'wheelchair') for (const key of chairFilterKeys) query.delete(key);
    return `<li><a href="${escapeHtml(withQuery('/' + locale, query))}#catalogue"${id === activeFamily ? ' aria-current="true"' : ''}>${escapeHtml(label)}</a></li>`;
  };
  return `<nav aria-label="${french ? 'Familles de produits' : 'Produktkategorien'}">
    <ul class="family-filters">${link('', french ? 'Tous les produits' : 'Alle Produkte')}
    ${families.map(row => link(row.id, row[locale])).join('')}</ul></nav>`;
}

export const technicalFields = ['width', 'weight', 'range', 'length', 'height', 'max_load'];

export function modelValidation(fields, sku, families) {
  const read = key => fields?.get(key)?.trim() ?? '';
  const name = read('name');
  const price = read('price').replace(',', '.');
  const descriptions = ['description_de', 'description_fr'].map(read);
  const active = read('active') === '1';
  const family = read('family') || 'wheelchair';
  const chair = family === 'wheelchair';
  const unitsInput = read('units');
  const specs = technicalFields.map(key => chair ? read(key) : '');
  const fold = chair ? read('fold') : '';
  const errors = [];
  if (!skuPattern.test(sku) || ['one', 'compact', 'tour', 'movility-one'].includes(sku)) errors.push('sku');
  if (!name || name.length > 80) errors.push('name');
  if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(price) || Number(price) <= 0) errors.push('price');
  for (const [index, key] of ['description_de', 'description_fr'].entries()) {
    if (descriptions[index].length > 500 || (active && !descriptions[index])) errors.push(key);
  }
  if (!families.some(row => row.id === family)) errors.push('family');
  if (!/^\d{1,3}$/.test(unitsInput)) errors.push('units');
  specs.forEach((value, index) => {
    if (value && !/^\d{1,3}$/.test(value)) errors.push(technicalFields[index]);
  });
  if (!['', '0', '1'].includes(fold)) errors.push('fold');
  const [width, weight, range, length, height, maxLoad] = specs.map(value => value ? Number(value) : null);
  return { errors, values: [name, Math.round(Number(price) * 100), Number(unitsInput), Number(active),
    ...descriptions, width ?? -1, weight ?? -1, range ?? -1, fold === '' ? -1 : Number(fold), family, length, height, maxLoad] };
}

export function modelInput(fields, sku, families) {
  const { errors, values } = modelValidation(fields, sku, families);
  return errors.length ? null : values;
}

export function insertModel(db, sku, values) {
  db.prepare(`INSERT INTO extra_models (name, cents, units, active, description_de, description_fr,
    width, weight, range, fold, family, length, height, max_load, sku) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(...values, sku);
}

export function extraCatalog(locale, models, families, photoFor, context = new URLSearchParams()) {
  return families.map(({ id, [locale]: label }) => {
    const items = models.filter(model => model.family === id);
    return items.length ? `<section class="catalog-family"><h3>${escapeHtml(label)}</h3><div class="model-grid">
      ${items.map(model => {
        const photo = photoFor(model.sku);
        const url = escapeHtml(withQuery('/' + locale + (model.sku === coreSKU ? '/mobility-one' : '/models/' + model.sku), context));
        const wheelchair = isWheelchair(model);
        const specs = wheelchair ? productSpecs(locale, model, false, ['width', 'weight', 'range']) : [];
        return `<article class="catalog-product">
          <h4><a href="${url}">
            ${photo ? `<img class="model-thumb" src="${photo}" alt="" loading="lazy" width="400" height="300">` : missingProductPhoto(locale)}
            ${escapeHtml(model.name)}</a></h4>
          <div class="catalog-price-row"><p class="price">${money(locale, model.cents)}</p>
            ${productAvailability(locale, model.units > 0)}</div>
          ${specs.length ? `<dl class="catalog-product-specs">${specs.map(([label, value]) =>
            `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>` : ''}
          ${wheelchair ? `<p class="catalog-compare"><a href="${escapeHtml(comparisonLink(locale, context, model.sku))}">${compareLabel(locale)}</a></p>` : ''}</article>`;
      }).join('')}</div></section>` : '';
  }).join('');
}

export function extraProduct(locale, model, media, view, features, compatibility = '', previewPath = '', context = new URLSearchParams(), familyLabel = '') {
  const wheelchair = isWheelchair(model);
  const specs = wheelchair ? productSpecs(locale, model) : [];
  const videos = galleryVideos(locale, media.videos, media.video);
  const transport = videos.folding ? `<section class="one-fit"><h2>${locale === 'de-CH' ? 'Masse und Transport' : 'Dimensions et transport'}</h2>
    <p><a href="#${videos.folding}">${oneVideoLabel(locale)}</a></p></section>` : '';
  const gallery = productGallery(locale, model.name, '/models/' + model.sku, media.photos, view, false, media.alts, previewPath, context);
  const viewer = media.model && !previewPath
    ? `<a class="button secondary" href="/${locale}/models/${model.sku}/3d">${view3dLabel[locale]}</a>` : '';
  const back = !previewPath && isPart({ family: context.get('family') }) && context.has('compatible')
    ? `<p class="page-back"><a href="${escapeHtml(withQuery('/' + locale, context))}#catalogue">${locale === 'fr-CH' ? 'Retour aux résultats' : 'Zurück zu den Ergebnissen'}</a></p>` : '';
  return `${back}${productOverview(locale, { name: model.name, category: familyLabel, description: locale === 'de-CH' ? model.description_de : model.description_fr,
      sku: model.sku, cents: model.cents, available: model.units > 0, chair: wheelchair,
      specifications: Boolean(specs.length), compatibility: Boolean(compatibility), part: typeof compatibility === 'object' ? compatibility : null, preview: Boolean(previewPath), context,
      afterPurchase: transport, gallery, mediaActions: viewer + videos.links })}
    ${productDetails(locale, specs, renderFeatures(locale, features))}${typeof compatibility === 'string' ? compatibility : ''}${videos.players}`;
}

export function renderFeatures(locale, features) {
  const values = features?.[locale === 'de-CH' ? 'de' : 'fr']?.split(/\r?\n/).map(line => line.trim()).filter(Boolean) || [];
  return values.length ? `<h2>${locale === 'de-CH' ? 'Eigenschaften' : 'Caractéristiques'}</h2>
    <ul>${values.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul>` : '';
}
