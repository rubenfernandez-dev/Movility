const editor = document.querySelector('[data-compat-editor]');
const search = editor.querySelector('[data-compat-search]');
const query = editor.querySelector('[data-compat-query]');
const onlySelected = editor.querySelector('[data-compat-selected]');
const status = editor.querySelector('[data-compat-status]');
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
  const results = selectedOnly && selected === 0 ? 'Aún no hay artículos seleccionados'
    : visible === 0 ? 'Sin coincidencias' : `${visible} ${visible === 1 ? 'resultado' : 'resultados'}`;
  status.textContent = `${results} · ${selected} ${selected === 1 ? 'seleccionado' : 'seleccionados'}`;
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
update();
search.hidden = false;
