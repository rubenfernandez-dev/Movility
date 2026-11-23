const editor = document.querySelector('[data-compat-editor]');
const search = editor.querySelector('[data-compat-search]');
const query = editor.querySelector('[data-compat-query]');
const status = editor.querySelector('[data-compat-status]');
const normalize = value => value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const groups = [...editor.querySelectorAll('[data-compat-group]')].map(group => ({
  group,
  items: [...group.querySelectorAll('[data-compat-item]')].map(item => ({
    item,
    name: normalize(item.dataset.name),
    sku: normalize(item.dataset.sku),
  })),
}));

function update() {
  const term = normalize(query.value);
  let visible = 0;
  const selected = editor.querySelectorAll('[data-compat-item] input[type="checkbox"]:checked').length;
  for (const { group, items } of groups) {
    let matches = 0;
    for (const { item, name, sku } of items) {
      item.hidden = Boolean(term) && !name.includes(term) && !sku.includes(term);
      if (!item.hidden) matches += 1;
    }
    group.hidden = Boolean(term) && matches === 0;
    visible += matches;
  }
  const results = visible === 0 ? 'Sin coincidencias' : `${visible} ${visible === 1 ? 'resultado' : 'resultados'}`;
  status.textContent = `${results} · ${selected} ${selected === 1 ? 'seleccionado' : 'seleccionados'}`;
}

query.addEventListener('input', update);
query.addEventListener('keydown', event => {
  if (event.key === 'Enter') event.preventDefault();
});
editor.addEventListener('change', update);
update();
search.hidden = false;
