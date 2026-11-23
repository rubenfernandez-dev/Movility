const editor = document.querySelector('[data-compat-editor]');
const search = editor.querySelector('[data-compat-search]');
const query = editor.querySelector('[data-compat-query]');
const onlySelected = editor.querySelector('[data-compat-selected]');
const status = editor.querySelector('[data-compat-status]');
const unsaved = editor.querySelector('[data-compat-unsaved]');
const messages = {
  es: ['Aún no hay artículos seleccionados', 'Sin coincidencias', 'resultado', 'resultados',
    'seleccionado', 'seleccionados', 'Hay cambios sin guardar.'],
  'de-CH': ['Noch keine Artikel ausgewählt', 'Keine Treffer', 'Treffer', 'Treffer',
    'ausgewählt', 'ausgewählt', 'Es gibt ungespeicherte Änderungen.'],
  'fr-CH': ['Aucun article sélectionné', 'Aucun résultat', 'résultat', 'résultats',
    'sélectionné', 'sélectionnés', 'Des modifications ne sont pas enregistrées.'],
};
const [emptySelection, noResults, result, resultsPlural, selectedLabel, selectedPlural, unsavedLabel] =
  messages[document.documentElement.lang] || messages.es;
const editableFields = [...editor.querySelectorAll('[data-compat-item] input')];
const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const groups = [...editor.querySelectorAll('[data-compat-group]')].map(group => ({
  group,
  items: [...group.querySelectorAll('[data-compat-item]')].map(item => ({
    item,
    checkbox: item.querySelector('input[type="checkbox"]'),
    name: normalize(item.dataset.name),
    sku: normalize(item.dataset.sku),
  })),
}));

function update() {
  const term = normalize(query.value);
  const selectedOnly = onlySelected.checked;
  let visible = 0;
  let selected = 0;
  for (const { group, items } of groups) {
    let matches = 0;
    for (const { item, checkbox, name, sku } of items) {
      if (checkbox.checked) selected += 1;
      const matchesTerm = name.includes(term) || sku.includes(term);
      item.hidden = !matchesTerm || (selectedOnly && !checkbox.checked);
      if (!item.hidden) matches += 1;
    }
    group.hidden = (Boolean(term) || selectedOnly) && matches === 0;
    visible += matches;
  }
  const results = selectedOnly && selected === 0 ? emptySelection
    : visible === 0 ? noResults : `${visible} ${visible === 1 ? result : resultsPlural}`;
  status.textContent = `${results} · ${selected} ${selected === 1 ? selectedLabel : selectedPlural}`;
}

query.addEventListener('input', update);
query.addEventListener('keydown', event => {
  if (event.key === 'Enter') event.preventDefault();
});
editor.addEventListener('change', event => {
  const item = event.target.closest('[data-compat-item]');
  const wasFocused = document.activeElement === event.target;
  update();
  if (wasFocused && item?.hidden) onlySelected.focus();
});

function warnBeforeLeaving(event) {
  event.preventDefault();
  event.returnValue = true;
}

function updateUnsaved() {
  const changed = editableFields.some(field => field.type === 'checkbox'
    ? field.checked !== field.defaultChecked : field.value !== field.defaultValue);
  unsaved.textContent = changed ? unsavedLabel : '';
  if (changed) window.addEventListener('beforeunload', warnBeforeLeaving);
  else window.removeEventListener('beforeunload', warnBeforeLeaving);
}

editor.addEventListener('input', updateUnsaved);
editor.addEventListener('change', updateUnsaved);
editor.addEventListener('submit', () => window.removeEventListener('beforeunload', warnBeforeLeaving));
window.addEventListener('pageshow', updateUnsaved);
updateUnsaved();
update();
search.hidden = false;
