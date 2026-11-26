import { escapeHtml, money } from './views.mjs';

import { productSpecs } from './product-specs.mjs';
import { coreSKU, skuPattern } from './cart.mjs';
import { chairFilterValues } from './chair-filters.mjs';

export const modelPath = '/assets/movility-one.glb';
export const viewerScript = '/assets/model-viewer.min.js';
const text = {
  'de-CH': {
    title: 'Rollstühle vergleichen', intro: 'Vergleiche die verfügbaren Angaben der Modelle.',
    first: 'Erstes Modell', second: 'Zweites Modell (optional)', submit: 'Vergleichen',
    feature: 'Merkmal', price: 'Preis in CHF', single: 'Nur ein Modell anzeigen',
    chosen: 'Ausgewählte Modelle', remove: 'Aus Vergleich entfernen', removeAction: 'Entfernen', back: 'Zurück zum Katalog',
    edit: 'Modelle ändern', differences: 'Nur Unterschiede', all: 'Alle Merkmale',
    noDifferences: 'Keine bestätigten Unterschiede bei den Merkmalen.', incomplete: 'Unvollständige Angaben',
    choose: 'Modell auswählen', empty: 'Wähle ein Modell, um den Vergleich zu beginnen.',
    open: 'Im 3D-Viewer ansehen', viewer: 'Mobility One in 3D', hint: 'Zieh das Modell zum Drehen. Mit den Pfeiltasten kannst du die Ansicht ebenfalls ändern.',
    alt: 'Vereinfachtes 3D-Modell eines Elektrorollstuhls mit Joystick, Rädern und Fussstütze.',
    fallback: 'Wenn die 3D-Ansicht nicht lädt, kannst du das Produktfoto öffnen.',
    photo: 'Produktfoto öffnen', product: 'Zurück zur Produktseite', demo: 'Vereinfachtes Demonstrationsmodell',
  },
  'fr-CH': {
    title: 'Comparer les fauteuils', intro: 'Comparez les caractéristiques disponibles pour chaque modèle.',
    first: 'Premier modèle', second: 'Deuxième modèle (facultatif)', submit: 'Comparer',
    feature: 'Caractéristique', price: 'Prix en CHF', single: 'Afficher un seul modèle',
    chosen: 'Modèles sélectionnés', remove: 'Retirer du comparateur', removeAction: 'Retirer', back: 'Retour au catalogue',
    edit: 'Modifier les modèles', differences: 'Uniquement les différences', all: 'Toutes les caractéristiques',
    noDifferences: 'Aucune différence confirmée dans les caractéristiques.', incomplete: 'Données incomplètes',
    choose: 'Choisir un modèle', empty: 'Sélectionnez un modèle pour commencer la comparaison.',
    open: 'Explorer en 3D', viewer: 'Mobility One en 3D', hint: 'Faites glisser le modèle pour le tourner. Vous pouvez aussi utiliser les touches fléchées.',
    alt: 'Modèle 3D simplifié d’un fauteuil roulant électrique avec joystick, roues et repose-pieds.',
    fallback: 'Si la vue 3D ne se charge pas, vous pouvez ouvrir la photo du produit.',
    photo: 'Ouvrir la photo du produit', product: 'Retour à la fiche produit', demo: 'Modèle de démonstration simplifié',
  },
};

export const compareLabel = (locale) => text[locale].submit;
const validSku = value => value === coreSKU || typeof value === 'string' && skuPattern.test(value);

export function comparisonQuery(query) {
  const context = new URLSearchParams();
  for (const key of ['family', 'compatible', 'first', 'second']) {
    const value = query.get(key);
    if (validSku(value) || value === '' && ['first', 'second'].includes(key)) context.set(key, value);
  }
  for (const [key, value] of chairFilterValues(query)) context.set(key, value);
  return context;
}

export function withQuery(path, query) {
  return path + (query.size ? '?' + query.toString() : '');
}

export function comparisonLink(locale, query, sku) {
  const params = comparisonQuery(query);
  if (sku && ![params.get('first'), params.get('second')].includes(sku)) {
    const first = params.get('first') || params.get('second');
    const explicit = params.has('first') || params.has('second');
    params.set('first', first || sku);
    if (first || explicit || sku !== coreSKU) params.set('second', first ? sku : explicit ? '' : coreSKU);
  }
  return withQuery('/' + locale + '/compare', params);
}

export function selectedModels(query, items, defaults = false) {
  const find = key => items.find(model => model.sku === query.get(key));
  if (defaults && !query.has('first') && !query.has('second')) return items.slice(0, 2);
  if (defaults && !query.has('second')) {
    const first = find('first');
    return first ? [first, items.find(model => model !== first)].filter(Boolean) : [];
  }
  return [...new Set([find('first'), find('second')].filter(Boolean))];
}

export function comparisonSelection(locale, query, selected, showRemove = true) {
  if (!selected.length) return '';
  const t = text[locale];
  return `<section class="compare-selection" aria-label="${t.chosen}"><p>${t.chosen}</p><ul>
    ${selected.map(model => {
      const params = comparisonQuery(query);
      const remaining = selected.find(item => item !== model);
      params.set('first', remaining?.sku || '');
      params.set('second', '');
      return `<li><span>${escapeHtml(model.name)}</span>${showRemove
        ? `<a href="${escapeHtml(comparisonLink(locale, params))}" aria-label="${t.remove} · ${escapeHtml(model.name)}">${t.removeAction}</a>` : ''}</li>`;
    }).join('')}</ul></section>`;
}

export function comparisonPage(locale, query, items) {
  const t = text[locale];
  const context = comparisonQuery(query);
  const selected = selectedModels(context, items, true);
  const [first, second] = selected;
  const back = comparisonQuery(context);
  back.set('first', first?.sku || '');
  back.set('second', second?.sku || '');
  const options = selected => items.map(model => `<option value="${model.sku}" ${model === selected ? 'selected' : ''}>${escapeHtml(model.name)}</option>`).join('');
  const differencesOnly = selected.length === 2 && query.get('differences') === '1';
  const toggle = new URLSearchParams(back);
  if (!differencesOnly) toggle.set('differences', '1');
  const columns = selected.map(model => [[t.price, money(locale, model.cents)], ...productSpecs(locale, model, true)]);
  const rows = (columns[0] || []).map(([label], index) => ({ label, cells: columns.map(column => column[index]), price: index === 0 }));
  const incomplete = row => !row.price && row.cells.some(([, , value]) => value === undefined);
  const featured = differencesOnly ? rows.filter(row => row.price ||
    !incomplete(row) && row.cells[0][2] !== row.cells[1][2]) : rows;
  const missing = differencesOnly ? rows.filter(incomplete) : [];
  const renderRows = entries => entries.map(({ label, cells }) => `<tr role="row"><th scope="row" role="rowheader">${label}</th>
    ${cells.map(([, value]) => `<td role="cell">${escapeHtml(value)}</td>`).join('')}</tr>`).join('');
  return `<section class="compare-head"><p><a href="${escapeHtml(withQuery('/' + locale, back))}#catalogue">${t.back}</a></p>
    <h1 class="page-title">${t.title}</h1><p class="lead">${t.intro}</p></section>
    ${comparisonSelection(locale, context, selected)}
    ${items.length > 1 || !first ? `<details class="compare-editor"${!first ? ' open' : ''}>
      <summary>${t.edit}</summary><form class="compare-form" action="/${locale}/compare" method="get">
      ${[...context].filter(([key]) => key !== 'first' && key !== 'second').map(([key, value]) =>
        `<input type="hidden" name="${key}" value="${escapeHtml(value)}">`).join('')}
      <label>${t.first}<select name="first"><option value="">${t.choose}</option>${options(first)}</select></label>
      <label>${t.second}<select name="second"><option value="">${t.single}</option>${options(second)}</select></label>
      <button>${t.submit}</button>
    </form></details>` : ''}
    ${second ? `<p><a class="button secondary" href="${escapeHtml(withQuery('/' + locale + '/compare', toggle))}">${differencesOnly ? t.all : t.differences}</a></p>` : ''}
    ${differencesOnly && featured.length === 1 ? `<p>${t.noDifferences}</p>` : ''}
    ${selected.length ? `<div class="compare-table product-comparison">
      <table role="table"><caption>${selected.map(model => escapeHtml(model.name)).join(' / ')}</caption>
      <thead role="rowgroup"><tr role="row"><th scope="col" role="columnheader">${t.feature}</th>${selected.map(model =>
        `<th scope="col" role="columnheader"><a href="${escapeHtml(withQuery('/' + locale + (model.sku === coreSKU ? '/mobility-one' : '/models/' + model.sku), back))}">${escapeHtml(model.name)}</a></th>`).join('')}</tr></thead>
      <tbody role="rowgroup">${renderRows(featured)}</tbody>
      ${missing.length ? `<tbody role="rowgroup" class="comparison-incomplete"><tr role="row"><th scope="rowgroup" role="rowheader" colspan="3">${t.incomplete}</th></tr>${renderRows(missing)}</tbody>` : ''}</table></div>` : `<p>${t.empty}</p>`}`;
}

export function viewerLink(locale) {
  const t = text[locale];
  return `<a class="button secondary" href="/${locale}/mobility-one/3d">${t.open}</a>`;
}

export function viewerPage(locale, photo, { name, url = modelPath, productPath = '/mobility-one' } = {}) {
  const t = text[locale];
  return `<section class="viewer">
    <p class="eyebrow">${t.demo}</p><h1 class="page-title">${name ? escapeHtml(name) + ' · 3D' : t.viewer}</h1><p>${t.hint}</p>
    <script type="module" src="${viewerScript}"></script>
    <model-viewer src="${url}" alt="${name ? escapeHtml(name) : t.alt}" camera-controls disable-pan touch-action="pan-y"
      camera-orbit="35deg 72deg auto" shadow-intensity="1" loading="eager">
      ${photo ? `<img slot="poster" class="viewer-poster" src="${photo}" alt="">` : ''}
    </model-viewer>
    ${photo ? `<p class="compare-note">${t.fallback} <a href="${photo}">${t.photo}</a></p>` : ''}
    <a class="button secondary" href="/${locale}${productPath}">${t.product}</a>
  </section>`;
}
