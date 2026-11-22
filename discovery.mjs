import { escapeHtml, money } from './views.mjs';

const models = [
  { id: 'one', name: 'Movility One', use: ['Kompakter Alltag', 'Quotidien compact'], width: 60, weight: 27, range: 20, fold: true },
  { id: 'compact', name: 'Movility Compact', use: ['Transport und Reisen', 'Transport et voyages'], width: 55, weight: 21, range: 15, fold: true },
  { id: 'tour', name: 'Movility Tour', use: ['Längere Strecken', 'Trajets plus longs'], width: 66, weight: 34, range: 30, fold: false },
];

export const modelPath = '/assets/movility-one.glb';
export const viewerScript = '/assets/model-viewer.min.js';
const text = {
  'de-CH': {
    title: 'Rollstühle vergleichen', intro: 'Wähle zwei Profile und vergleiche Breite, Gewicht und Reichweite.',
    example: 'Die technischen Angaben dienen der Demonstration. Vergleichsprofile ohne Testpreis sind nicht bestellbar.',
    first: 'Erstes Modell', second: 'Zweites Modell', submit: 'Vergleichen', pick: 'Bitte wähle zwei verschiedene Modelle.',
    feature: 'Merkmal', use: 'Einsatzprofil', width: 'Gesamtbreite', weight: 'Gewicht', range: 'Beispiel-Reichweite',
    fold: 'Faltbar', yes: 'Ja', no: 'Nein', price: 'Testpreis', prototype: 'Vergleichsprofil', product: 'Movility One ansehen',
    open: 'Im 3D-Viewer ansehen', viewer: 'Movility One in 3D', hint: 'Zieh das Modell zum Drehen. Mit den Pfeiltasten kannst du die Ansicht ebenfalls ändern.',
    alt: 'Vereinfachtes 3D-Modell eines Elektrorollstuhls mit Joystick, Rädern und Fussstütze.',
    fallback: 'Wenn die 3D-Ansicht nicht lädt, kannst du das Produktfoto öffnen.',
    photo: 'Produktfoto öffnen', demo: 'Vereinfachtes Demonstrationsmodell',
  },
  'fr-CH': {
    title: 'Comparer les fauteuils', intro: 'Choisissez deux profils pour comparer leur largeur, leur poids et leur autonomie.',
    example: 'Les caractéristiques servent à la démonstration. Les profils sans prix de test ne peuvent pas être commandés.',
    first: 'Premier modèle', second: 'Deuxième modèle', submit: 'Comparer', pick: 'Choisissez deux modèles différents.',
    feature: 'Caractéristique', use: 'Usage prévu', width: 'Largeur totale', weight: 'Poids', range: 'Exemple d’autonomie',
    fold: 'Pliable', yes: 'Oui', no: 'Non', price: 'Prix de test', prototype: 'Profil de comparaison', product: 'Voir le Movility One',
    open: 'Explorer en 3D', viewer: 'Movility One en 3D', hint: 'Faites glisser le modèle pour le tourner. Vous pouvez aussi utiliser les touches fléchées.',
    alt: 'Modèle 3D simplifié d’un fauteuil roulant électrique avec joystick, roues et repose-pieds.',
    fallback: 'Si la vue 3D ne se charge pas, vous pouvez ouvrir la photo du produit.',
    photo: 'Ouvrir la photo du produit', demo: 'Modèle de démonstration simplifié',
  },
};

export const compareLabel = (locale) => text[locale].submit;

export function comparisonPage(locale, query, cents, extraModels = []) {
  const t = text[locale];
  const localIndex = locale === 'de-CH' ? 0 : 1;
  const items = [...models, ...extraModels.map(model => ({ ...model, id: model.sku, use: ['Demokatalog', 'Catalogue de test'] }))];
  const first = items.find(model => model.id === query.get('first')) ?? items[0];
  const second = items.find(model => model.id === query.get('second')) ?? items[3] ?? items[1];
  const options = (selected) => items.map(model => `<option value="${model.id}" ${model.id === selected.id ? 'selected' : ''}>${escapeHtml(model.name)}</option>`).join('');
  const rows = [
    [t.use, model => model.use[localIndex]],
    [t.width, model => `${model.width} cm`],
    [t.weight, model => `${model.weight} kg`],
    [t.range, model => `${model.range} km`],
    [t.fold, model => model.fold ? t.yes : t.no],
    [t.price, model => model.id === 'one' ? money(locale, cents) : model.cents ? money(locale, model.cents) : t.prototype],
  ];
  return `<section class="compare-head"><h1 class="page-title">${t.title}</h1><p class="lead">${t.intro}</p></section>
    <form class="compare-form" action="/${locale}/compare" method="get">
      <label>${t.first}<select name="first">${options(first)}</select></label>
      <label>${t.second}<select name="second">${options(second)}</select></label>
      <button>${t.submit}</button>
    </form>
    ${first === second ? `<p class="form-error" role="alert">${t.pick}</p>` : `<div class="compare-table">
      <table><caption>${escapeHtml(first.name)} / ${escapeHtml(second.name)}</caption>
      <thead><tr><th scope="col">${t.feature}</th><th scope="col">${escapeHtml(first.name)}</th><th scope="col">${escapeHtml(second.name)}</th></tr></thead>
      <tbody>${rows.map(([label, value]) => `<tr><th scope="row">${label}</th><td>${value(first)}</td><td>${value(second)}</td></tr>`).join('')}</tbody></table></div>`}
    <p class="compare-note">${t.example}</p>
    <a class="button secondary" href="/${locale}/movility-one">${t.product}</a>`;
}

export function viewerLink(locale) {
  const t = text[locale];
  return `<a class="button secondary" href="/${locale}/movility-one/3d">${t.open}</a>`;
}

export function viewerPage(locale, photo, { name, url = modelPath, productPath = '/movility-one' } = {}) {
  const t = text[locale];
  return `<section class="viewer">
    <p class="eyebrow">${t.demo}</p><h1 class="page-title">${name ? escapeHtml(name) + ' · 3D' : t.viewer}</h1><p>${t.hint}</p>
    <script type="module" src="${viewerScript}"></script>
    <model-viewer src="${url}" alt="${name ? escapeHtml(name) : t.alt}" camera-controls disable-pan touch-action="pan-y"
      camera-orbit="35deg 72deg auto" shadow-intensity="1" loading="eager">
      ${photo ? `<img slot="poster" class="viewer-poster" src="${photo}" alt="">` : ''}
    </model-viewer>
    ${photo ? `<p class="compare-note">${t.fallback} <a href="${photo}">${t.photo}</a></p>` : ''}
    <a href="/${locale}${productPath}">${name ? escapeHtml(name) : t.product}</a>
  </section>`;
}
