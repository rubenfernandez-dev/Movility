import { escapeHtml, money, copy } from './views.mjs';
import { productGallery, productVideo } from './storefront.mjs';
import { addToCart, skuPattern } from './cart.mjs';

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
}

export function modelAdmin(models, message = '') {
  const form = (model) => {
    const editing = Boolean(model);
    const field = (key, label, value, attributes = '') => `<label>${label}<input name="${key}" value="${escapeHtml(String(value))}" ${attributes}></label>`;
    const description = (code, name) => `<label>Descripción en ${name}<textarea name="description_${code}" maxlength="500" required rows="2">${escapeHtml(model?.['description_' + code] ?? '')}</textarea></label>`;
    return `<form class="admin-catalog" method="post" action="/admin/models${editing ? '/' + model.sku : ''}">
      ${editing ? `<input type="hidden" name="revision" value="${model.revision}">` : ''}
      <div class="address-row">
        ${editing ? `<p>SKU <strong>${model.sku}</strong></p>` : field('sku', 'SKU', '', 'required maxlength="24" pattern="[a-z0-9][a-z0-9\\-]{1,23}"')}
        ${field('name', 'Nombre comercial', model?.name ?? '', 'required maxlength="80"')}
        ${field('price', 'Precio en CHF', model ? (model.cents / 100).toFixed(2) : '', 'required inputmode="decimal"')}
        ${field('units', 'Unidades disponibles', model?.units ?? 0, 'type="number" min="0" max="999" required')}
        ${field('width', 'Anchura en cm', model?.width ?? '', 'type="number" min="1" max="999" required')}
        ${field('weight', 'Peso en kg', model?.weight ?? '', 'type="number" min="1" max="999" required')}
        ${field('range', 'Autonomía en km', model?.range ?? '', 'type="number" min="1" max="999" required')}
      </div>
      ${description('de', 'alemán')}${description('fr', 'francés')}
      <label><input type="checkbox" name="fold" value="1" ${model?.fold ? 'checked' : ''}> Plegable</label>
      <label><input type="checkbox" name="active" value="1" ${model?.active ? 'checked' : ''}> Publicado en la tienda</label>
      <button>${editing ? 'Guardar modelo' : 'Crear modelo'}</button>
    </form>`;
  };
  return `<a href="/admin">Volver a administración</a><h1 class="page-title">Modelos del catálogo</h1>
    <p>El Movility One se gestiona desde el panel principal. Los modelos archivados se conservan para el historial de pedidos.</p>
    <p>Los archivos de foto, vídeo y 3D se asocian por SKU desde la carpeta de medios.</p>
    ${message}
    <details class="model-editor" open><summary>Crear un modelo</summary>${form()}</details>
    ${models.map(model => `<details class="model-editor"><summary>${escapeHtml(model.name)} · ${model.active ? 'Publicado' : 'Archivado'} · ${model.units} ud.</summary>${form(model)}</details>`).join('')}`;
}

export function modelInput(fields, sku) {
  const read = (key) => fields?.get(key)?.trim() ?? '';
  const name = read('name');
  const price = read('price').replace(',', '.');
  const descriptions = ['description_de', 'description_fr'].map(read);
  const quantities = ['units', 'width', 'weight', 'range'].map(read);
  if (!skuPattern.test(sku) || ['one', 'compact', 'tour', 'movility-one'].includes(sku) || !name || name.length > 80 ||
      !/^\d{1,6}(?:\.\d{1,2})?$/.test(price) || Number(price) <= 0 ||
      descriptions.some(value => !value || value.length > 500) ||
      quantities.some(value => !/^\d{1,3}$/.test(value)) || quantities.slice(1).some(value => Number(value) < 1)) return null;
  const [units, width, weight, range] = quantities.map(Number);
  return [name, Math.round(Number(price) * 100), units, Number(read('active') === '1'),
    ...descriptions, width, weight, range, Number(read('fold') === '1')];
}

export function extraCatalog(locale, models) {
  const l = language[locale];
  return models.length ? `<section class="section"><h2>${l.models}</h2><div class="model-grid">
    ${models.map(model => `<article><h3><a href="/${locale}/models/${model.sku}">${escapeHtml(model.name)}</a></h3>
      <p>${model.width} cm · ${model.weight} kg · ${model.range} km</p><p class="price">${money(locale, model.cents)}</p>
      ${model.units ? '' : `<p>${copy[locale].soldOut}</p>`}</article>`).join('')}</div></section>` : '';
}

export function extraProduct(locale, model, media, view) {
  const l = language[locale];
  const specs = [[l.width, model.width + ' cm'], [l.weight, model.weight + ' kg'],
    [l.range, model.range + ' km'], [l.fold, model.fold ? l.yes : l.no]];
  const name = escapeHtml(model.name);
  const gallery = productGallery(locale, model.name, '/models/' + model.sku, media.photos, view);
  return `<section class="${gallery ? 'product' : 'confirmation'}">${gallery}
    <div><p class="eyebrow">${model.sku}</p><h1>${name}</h1>
    <p class="lead">${escapeHtml(locale === 'de-CH' ? model.description_de : model.description_fr)}</p>
    <p class="price">${money(locale, model.cents)}</p><dl class="specs">
    ${specs.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl>
    <div class="product-actions cart-action">${model.units ? addToCart(locale, model.sku) : copy[locale].soldOut}
    ${media.model ? `<a class="button secondary" href="/${locale}/models/${model.sku}/3d">3D</a>` : ''}
    <a class="button secondary" href="/${locale}/compare?first=${model.sku}&amp;second=one">${l.compare}</a></div></div></section>
    ${productVideo(locale, media.video)}`;
}
