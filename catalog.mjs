import { escapeHtml, money, copy } from './views.mjs';
import { productGallery, productVideo } from './storefront.mjs';
import { addToCart, coreSKU, skuPattern } from './cart.mjs';
import { isPart } from './compatibility.mjs';

const initialFamilies = {
  wheelchair: { es: 'Sillas de ruedas', 'de-CH': 'Elektrorollstühle', 'fr-CH': 'Fauteuils roulants électriques' },
  accessory: { es: 'Accesorios', 'de-CH': 'Zubehör', 'fr-CH': 'Accessoires' },
  spare: { es: 'Recambios', 'de-CH': 'Ersatzteile', 'fr-CH': 'Pièces détachées' },
};
export const isWheelchair = model => !model.family || model.family === 'wheelchair';

const language = {
  'de-CH': { models: 'Weitere Modelle', price: 'Preis', width: 'Breite', weight: 'Gewicht', range: 'Reichweite', fold: 'Faltbar', yes: 'Ja', no: 'Nein', cart: 'Zum Warenkorb', compare: 'Vergleichen' },
  'fr-CH': { models: 'Autres modèles', price: 'Prix', width: 'Largeur', weight: 'Poids', range: 'Autonomie', fold: 'Pliable', yes: 'Oui', no: 'Non', cart: 'Voir le panier', compare: 'Comparer' },
};

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

export function catalogOrderAdmin(families, products, message) {
  const row = (kind, id, name, position) => `<form class="catalog-filters" method="post" action="/admin/catalog-order">
    <input type="hidden" name="kind" value="${kind}"><input type="hidden" name="id" value="${escapeHtml(id)}">
    <label>${escapeHtml(name)} <input type="number" name="position" min="1" max="999999999" step="1" value="${position ?? ''}"></label>
    <button>Guardar posición</button></form>`;
  return `<p><a href="/admin/models">Volver a artículos</a></p><h1>Orden del catálogo</h1>
    <p>El número más bajo aparece primero. Deja el campo vacío para usar el orden automático al final.</p>
    ${message}<h2>Familias</h2>
    ${families.map(family => row('family', family.id, family.es, family.position)).join('')}
    <h2>Productos por familia</h2>
    ${families.map(family => `<section><h3>${escapeHtml(family.es)}</h3>
      ${products.filter(product => product.family === family.id)
        .map(product => row('product', product.sku, product.name, product.position)).join('') || '<p>Sin artículos.</p>'}</section>`).join('')}`;
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
  const editor = family => `<form class="confirmation" method="post" action="/admin/families${family ? '/' + family.id : ''}">
    ${family ? '' : '<label>Identificador <input name="id" required maxlength="24"></label>'}
    ${[['es','es','Nombre interno'], ['de','de-CH','Nombre en alemán'], ['fr','fr-CH','Nombre en francés']]
      .map(([key, lang, label]) => `<label>${label}<input name="${key}" required maxlength="100" value="${escapeHtml(family?.[lang] || '')}"></label>`).join('')}
    <button>${family ? 'Guardar familia' : 'Crear familia'}</button></form>`;
  return `<h1>Familias del catálogo</h1><p><a href="/admin/models">Volver a artículos</a> · <a href="/admin/catalog-order">Ordenar catálogo</a></p>${message}
    <h2>Nueva familia</h2>${editor()}${families.map(family => `<details><summary>${escapeHtml(family.es)}</summary>${editor(family)}</details>`).join('')}`;
}

export function catalogFilter(params, families) {
  const family = params.get('family');
  return families.some(row => row.id === family) ? family : '';
}

export function modelAdmin(models, families, message = '', params = new URLSearchParams()) {
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
  const query = filters.size ? '?' + escapeHtml(filters.toString()) : '';
  const form = (model) => {
    const editing = Boolean(model);
    const field = (key, label, value, attributes = '') => `<label>${label}<input name="${key}" value="${escapeHtml(String(value))}" ${attributes}></label>`;
    const description = (code, name) => `<label>Descripción en ${name}<textarea name="description_${code}" maxlength="500" required rows="2">${escapeHtml(model?.['description_' + code] ?? '')}</textarea></label>`;
    return `<form class="admin-catalog" method="post" action="/admin/models${editing ? '/' + model.sku : ''}${query}">
      ${editing ? `<input type="hidden" name="revision" value="${model.revision}">` : ''}
      <div class="address-row">
        <label>Familia<select name="family">${families.map(({ id, es }) =>
          `<option value="${id}" ${(model?.family || 'wheelchair') === id ? 'selected' : ''}>${escapeHtml(es)}</option>`).join('')}</select></label>
        ${editing ? `<p>SKU <strong>${model.sku}</strong></p>` : field('sku', 'SKU', '', 'required maxlength="24" pattern="[a-z0-9][a-z0-9\\-]{1,23}"')}
        ${field('name', 'Nombre comercial', model?.name ?? '', 'required maxlength="80"')}
        ${field('price', 'Precio en CHF', model ? (model.cents / 100).toFixed(2) : '', 'required inputmode="decimal"')}
        ${field('units', 'Unidades disponibles', model?.units ?? 0, 'type="number" min="0" max="999" required')}
        ${field('width', 'Anchura en cm (sillas)', model?.width || '', 'type="number" min="1" max="999"')}
        ${field('weight', 'Peso en kg (sillas)', model?.weight || '', 'type="number" min="1" max="999"')}
        ${field('range', 'Autonomía en km (sillas)', model?.range || '', 'type="number" min="1" max="999"')}
      </div>
      ${description('de', 'alemán')}${description('fr', 'francés')}
      <label><input type="checkbox" name="fold" value="1" ${model?.fold ? 'checked' : ''}> Plegable</label>
      <label><input type="checkbox" name="active" value="1" ${model?.active ? 'checked' : ''}> Publicado en la tienda</label>
      <button>${editing ? 'Guardar modelo' : 'Crear modelo'}</button>
    </form>`;
  };
  return `<a href="/admin">Volver a administración</a><h1 class="page-title">Artículos del catálogo</h1>
    <p><a href="/admin/families">Gestionar familias</a> · <a href="/admin/catalog-order">Ordenar catálogo</a></p>
    ${message}
    <details class="model-editor"><summary>Crear artículo</summary>${form()}</details>
    <form class="catalog-filters" action="/admin/models" method="get">
      <label>Nombre o SKU <input type="search" name="q" maxlength="80" value="${escapeHtml(search)}"></label>
      <label>Familia <select name="family"><option value="">Todas las familias</option>
        ${families.map(({ id, es }) => `<option value="${id}" ${family === id ? 'selected' : ''}>${escapeHtml(es)}</option>`).join('')}
      </select></label>
      <label>Estado <select name="status"><option value="">Todos los estados</option>
        <option value="published" ${status === 'published' ? 'selected' : ''}>Publicado</option>
        <option value="archived" ${status === 'archived' ? 'selected' : ''}>Archivado</option>
      </select></label>
      <button>Buscar</button>${filters.size ? '<a href="/admin/models">Limpiar búsqueda y filtros</a>' : ''}
    </form>
    ${visible.length ? families.map(({ id, es }) => {
      const items = visible.filter(model => model.family === id);
      return items.length ? `<section><h2>${escapeHtml(es)}</h2>
        ${items.map(model => `<article class="model-editor">
          <h3>${escapeHtml(model.name)}</h3><p>SKU ${model.sku} · ${model.active ? 'Publicado' : 'Archivado'} · ${model.units} ud.</p>
          <p><a href="/admin/models/${model.sku}/content">Características, fotos y vídeo</a></p>
          ${isPart(model) ? `<p><a href="/admin/models/${model.sku}/compatibility">Configurar compatibilidad</a></p>` : ''}
          ${model.sku === 'one' ? '<p><a href="/admin#catalog-editor">Editar precio, stock y descripciones</a></p>' :
            `<details><summary>Editar artículo</summary>${form(model)}</details>`}
          </article>`).join('')}</section>` : '';
    }).join('') : '<p>No hay artículos que coincidan con estos filtros.</p>'}`;
}

export function storefrontFamilyFilters(locale, families, activeFamily) {
  const french = locale === 'fr-CH';
  const link = (id, label) => `<li><a href="/${locale}${id ? '?family=' + id : ''}#catalogue"${id === activeFamily ? ' aria-current="true"' : ''}>${escapeHtml(label)}</a></li>`;
  return `<nav aria-label="${french ? 'Familles de produits' : 'Produktkategorien'}">
    <ul class="family-filters">${link('', french ? 'Tous les produits' : 'Alle Produkte')}
    ${families.map(row => link(row.id, row[locale])).join('')}</ul></nav>`;
}

export function modelInput(fields, sku, families) {
  const read = (key) => fields?.get(key)?.trim() ?? '';
  const name = read('name');
  const price = read('price').replace(',', '.');
  const descriptions = ['description_de', 'description_fr'].map(read);
  const family = read('family') || 'wheelchair';
  const chair = family === 'wheelchair';
  const quantities = chair ? ['units', 'width', 'weight', 'range'].map(read) : [read('units'), '0', '0', '0'];
  if (!skuPattern.test(sku) || ['one', 'compact', 'tour', 'movility-one'].includes(sku) || !name || name.length > 80 ||
      !/^\d{1,6}(?:\.\d{1,2})?$/.test(price) || Number(price) <= 0 ||
      descriptions.some(value => !value || value.length > 500) ||
      !families.some(row => row.id === family) || quantities.some(value => !/^\d{1,3}$/.test(value)) ||
      (chair && quantities.slice(1).some(value => Number(value) < 1))) return null;
  const [units, width, weight, range] = quantities.map(Number);
  return [name, Math.round(Number(price) * 100), units, Number(read('active') === '1'),
    ...descriptions, width, weight, range, Number(chair && read('fold') === '1'), family];
}

export function extraCatalog(locale, models, families, photoFor) {
  return families.map(({ id, [locale]: label }) => {
    const items = models.filter(model => model.family === id);
    return items.length ? `<section class="section"><h3>${escapeHtml(label)}</h3><div class="model-grid">
      ${items.map(model => { const photo = photoFor(model.sku); return `<article>
        ${photo ? `<img class="model-thumb" src="${photo}" alt="" loading="lazy">` : ''}
        <h4><a href="/${locale}${model.sku === coreSKU ? '/movility-one' : '/models/' + model.sku}">${escapeHtml(model.name)}</a></h4>
        ${isWheelchair(model) && model.width ? `<p>${model.width} cm · ${model.weight} kg · ${model.range} km</p>` : ''}
        <p class="price">${money(locale, model.cents)}</p>
        ${model.units ? '' : `<p>${copy[locale].soldOut}</p>`}</article>`; }).join('')}</div></section>` : '';
  }).join('');
}

export function extraProduct(locale, model, media, view, features, compatibility = '') {
  const l = language[locale];
  const specs = [[l.width, model.width + ' cm'], [l.weight, model.weight + ' kg'],
    [l.range, model.range + ' km'], [l.fold, model.fold ? l.yes : l.no]];
  const name = escapeHtml(model.name);
  const gallery = productGallery(locale, model.name, '/models/' + model.sku, media.photos, view);
  return `<section class="${gallery ? 'product' : 'confirmation'}">${gallery}
    <div><p class="eyebrow">${model.sku}</p><h1>${name}</h1>
    <p class="lead">${escapeHtml(locale === 'de-CH' ? model.description_de : model.description_fr)}</p>
    <p class="price">${money(locale, model.cents)}</p>${isWheelchair(model) ? `<dl class="specs">
    ${specs.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>` : ''}
    ${isPart(model) ? compatibility : ''}
    <div class="product-actions cart-action">${model.units ? addToCart(locale, model.sku) : copy[locale].soldOut}
    ${media.model ? `<a class="button secondary" href="/${locale}/models/${model.sku}/3d">3D</a>` : ''}
    ${isWheelchair(model) ? `<a class="button secondary" href="/${locale}/compare?first=${model.sku}&amp;second=one">${l.compare}</a>` : ''}</div>${renderFeatures(locale, features)}</div></section>
    ${productVideo(locale, media.video)}${isWheelchair(model) ? compatibility : ''}`;
}

export function renderFeatures(locale, features) {
  const values = features?.[locale === 'de-CH' ? 'de' : 'fr']?.split(/\r?\n/).map(line => line.trim()).filter(Boolean) || [];
  return values.length ? `<h2>${locale === 'de-CH' ? 'Eigenschaften' : 'Caractéristiques'}</h2>
    <ul>${values.map(value => `<li>${escapeHtml(value)}</li>`).join('')}</ul>` : '';
}
