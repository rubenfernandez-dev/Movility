import { escapeHtml, money } from './views.mjs';

export const chairFilterKeys = ['max_width', 'max_price', 'fold'];

export function chairFilterValues(query) {
  const clean = new URLSearchParams();
  for (const [key, pattern] of [['max_width', /^\d{1,3}(?:\.\d{1,2})?$/], ['max_price', /^\d{1,6}(?:\.\d{1,2})?$/]]) {
    const value = query.get(key)?.trim().replace(',', '.') || '';
    if (pattern.test(value)) clean.set(key, String(Number(value)));
  }
  const fold = query.get('fold');
  if (fold === '1' || fold === '0') clean.set('fold', fold);
  return clean;
}

export function matchesChairFilters(model, filters) {
  return (!filters.has('max_width') || Number.isFinite(model.width) && model.width >= 0 && model.width <= Number(filters.get('max_width'))) &&
    (!filters.has('max_price') || Number.isFinite(model.cents) && model.cents >= 0 && model.cents <= Math.round(Number(filters.get('max_price')) * 100)) &&
    (!filters.has('fold') || model.fold === Number(filters.get('fold')));
}

const text = {
  'de-CH': {
    filters: 'Rollstühle filtern', guide: 'So wählst du aus', width: 'Max. Breite (cm)', price: 'Max. Preis (CHF)',
    fold: 'Faltbarkeit', any: 'Alle', yes: 'Faltbar', no: 'Nicht faltbar', apply: 'Anwenden',
    remove: 'Filter entfernen', clear: 'Alle Filter löschen', count: n => n === 1 ? '1 Rollstuhl' : n + ' Rollstühle',
    empty: 'Keine Rollstühle entsprechen diesen Filtern.', contact: 'Beratung anfragen', close: 'Zurück zu den Filtern',
    measures: 'Miss die lichte Breite der engsten Tür oder Durchfahrt an der schmalsten Stelle. Berücksichtige Türflügel, Griffe und andere Hindernisse. Vergleiche diese Breite mit der Gesamtbreite des Rollstuhls und prüfe, ob genügend Platz zum Lenken bleibt.',
    use: 'Prüfe beim Transport das Gewicht und die Masse im gefalteten Zustand, falls verfügbar. Vergleiche die angegebene Reichweite mit deinen üblichen Wegen. Prüfe bei der maximalen Belastung, welche Last der Hersteller einrechnet.',
  },
  'fr-CH': {
    filters: 'Filtrer les fauteuils', guide: 'Comment choisir', width: 'Largeur max. (cm)', price: 'Prix max. (CHF)',
    fold: 'Pliage', any: 'Tous', yes: 'Pliable', no: 'Non pliable', apply: 'Appliquer',
    remove: 'Retirer le filtre', clear: 'Effacer tous les filtres', count: n => n === 1 ? '1 fauteuil' : n + ' fauteuils',
    empty: 'Aucun fauteuil ne correspond à ces filtres.', contact: 'Demander conseil', close: 'Retour aux filtres',
    measures: 'Mesurez la largeur libre de la porte ou du passage le plus étroit à son point le plus serré. Tenez compte du battant, des poignées et des obstacles. Comparez cette largeur à la largeur totale du fauteuil et vérifiez l’espace disponible pour manœuvrer.',
    use: 'Pour le transport, vérifiez le poids et les dimensions pliées, si elles sont indiquées. Comparez l’autonomie annoncée à vos trajets habituels. Pour la charge maximale, vérifiez ce que le fabricant inclut dans la charge.',
  },
};

export function chairFilterPanel(locale, context, filters, count) {
  const t = text[locale];
  const url = removed => {
    const query = new URLSearchParams(context);
    query.set('family', 'wheelchair');
    for (const key of removed) query.delete(key);
    return escapeHtml('/' + locale + '?' + query.toString()) + '#catalogue';
  };
  const active = [...filters.keys()];
  const values = {
    max_width: key => filters.get(key) + ' cm',
    max_price: key => money(locale, Math.round(Number(filters.get(key)) * 100)),
    fold: key => filters.get(key) === '1' ? t.yes : t.no,
  };
  const labels = { max_width: t.width, max_price: t.price, fold: t.fold };
  return `<div class="chair-filter-panel" id="chair-filters" tabindex="-1">
    <div class="chair-filter-toolbar">
      <p>${t.count(count)}</p><a href="#chair-guide">${t.guide}</a>
    </div>
    <details class="chair-filter-editor"><summary>${t.filters}</summary>
      <form class="chair-filter-form" method="get" action="/${locale}#catalogue">
        <input type="hidden" name="family" value="wheelchair">
        ${['first', 'second'].filter(key => context.has(key)).map(key =>
          `<input type="hidden" name="${key}" value="${escapeHtml(context.get(key))}">`).join('')}
        ${['max_width', 'max_price'].map(key =>
          `<label>${labels[key]}<input name="${key}" type="text" inputmode="decimal" maxlength="10" value="${filters.get(key) || ''}"></label>`).join('')}
        <label>${t.fold}<select name="fold"><option value="">${t.any}</option>
          <option value="1"${filters.get('fold') === '1' ? ' selected' : ''}>${t.yes}</option>
          <option value="0"${filters.get('fold') === '0' ? ' selected' : ''}>${t.no}</option>
        </select></label><button>${t.apply}</button>
      </form>
    </details>
    ${active.length ? `<ul class="chair-active-filters">
      ${active.map(key => `<li><a href="${url([key])}" aria-label="${t.remove} · ${labels[key]} · ${values[key](key)}">${values[key](key)} <span aria-hidden="true">×</span></a></li>`).join('')}
      <li><a href="${url(chairFilterKeys)}">${t.clear}</a></li></ul>` : ''}
    <section id="chair-guide" class="chair-guide" tabindex="-1"><h3>${t.guide}</h3>
      <p>${t.measures}</p><p>${t.use}</p><a href="#chair-filters">${t.close}</a></section>
  </div>`;
}

export function noChairMatches(locale, context) {
  const t = text[locale];
  const clean = new URLSearchParams(context);
  for (const key of chairFilterKeys) clean.delete(key);
  clean.set('family', 'wheelchair');
  return `<div class="chair-no-results"><p>${t.empty}</p>
    <div class="product-actions"><a href="/${locale}?${escapeHtml(clean.toString())}#catalogue">${t.clear}</a>
      <a href="/${locale}/contact">${t.contact}</a></div></div>`;
}
