import { createHmac, randomBytes } from 'node:crypto';
import { adminHtml, adminText } from './admin-language.mjs';
import { modelValidation, technicalFields, insertModel, previewLinks } from './catalog.mjs';
import { isPart } from './compatibility.mjs';
import { escapeHtml } from './views.mjs';

export const importPath = '/admin/catalog-import';
export const maxCsvBytes = 128 * 1024;
const maxRows = 200;
const columns = ['sku', 'family', 'name', 'price_chf', 'description_de', 'description_fr',
  'width_cm', 'weight_kg', 'range_km', 'length_cm', 'height_cm', 'max_load_kg', 'fold', 'compatible_skus'];
const modelColumns = ['name', 'cents', 'units', 'active', 'description_de', 'description_fr',
  ...technicalFields.slice(0, 3), 'fold', 'family', ...technicalFields.slice(3)];
const csvFields = { price: 'price_chf', cents: 'price_chf', ...Object.fromEntries(technicalFields.map((key, index) => [key, columns[index + 6]])) };
const labelled = key => csvFields[key] || key;
const signingKey = randomBytes(32);

export const catalogTemplate = '\uFEFF' + [
  columns.join(';'),
  'sample-chair;wheelchair;Silla de prueba;2499.00;Fiktiver Elektrorollstuhl;Fauteuil roulant électrique fictif;60;27;0;95;92;120;1;',
  'sample-bag;accessory;Bolsa de prueba;49.00;Fiktive Tasche;Sac fictif;;;;;;;;sample-chair',
  'sample-wheel;spare;Rueda de prueba;89.00;Fiktives Ersatzrad;Roue de rechange fictive;;;;;;;;sample-chair|one',
].join('\r\n') + '\r\n';

function csvRecords(source) {
  const records = [];
  let row = [];
  let value = '';
  let state = 'start';
  let line = 1;
  let rowLine = 1;
  const endField = () => { row.push(value.trim()); value = ''; state = 'start'; };
  const endRow = () => {
    endField();
    if (row.some(Boolean) || row.length > 1) records.push({ line: rowLine, values: row });
    row = [];
    rowLine = line + 1;
  };
  for (const char of source.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')) {
    if (state === 'quote') {
      if (char === '"') state = 'closed';
      else value += char;
    } else if (char === '"' && state === 'closed') {
      value += char;
      state = 'quote';
    } else if (char === ';') endField();
    else if (char === '\n') endRow();
    else if (char === '"' && state === 'start') state = 'quote';
    else if (char === '"' || state === 'closed') return { line, invalid: true };
    else { value += char; state = 'plain'; }
    if (char === '\n') line++;
    if (records.length > maxRows + 1) return { line: rowLine, tooMany: true };
  }
  if (state === 'quote') return { line: rowLine, invalid: true };
  if (row.length || state !== 'start') endRow();
  return { records };
}

export function catalogImportPlan(db, csv, families) {
  if (!csv || Buffer.byteLength(csv) > maxCsvBytes) return { error: 'Selecciona un CSV de hasta 128 KiB.' };
  const { records, line, invalid, tooMany } = csvRecords(csv);
  if (invalid) return { error: 'CSV mal formado.', line };
  if (tooMany || records.length > maxRows + 1) return { error: 'El CSV admite hasta 200 artículos.', line };
  const [header, ...entries] = records;
  if (!header || header.values.length !== columns.length || columns.some((column, index) => header.values[index] !== column)) return { error: 'La cabecera no coincide con la plantilla.', line: header?.line || 1 };
  if (!entries.length) return { error: 'El archivo no contiene artículos.' };

  const rows = entries.map(entry => ({
    line: entry.line, ...Object.fromEntries(columns.map((key, i) => [key, entry.values[i] ?? ''])),
    fieldCount: entry.values.length,
  }));
  const counts = new Map();
  for (const row of rows) counts.set(row.sku, (counts.get(row.sku) || 0) + 1);
  const currentModels = new Map(db.prepare('SELECT * FROM extra_models').all().map(model => [model.sku, model]));
  const hasCoreChair = Boolean(db.prepare('SELECT 1 FROM catalog WHERE id=1').get());
  const uploadedModels = new Map(rows.map(row => [row.sku, row]));
  const existingLinks = db.prepare('SELECT chair FROM catalog_compatibility WHERE part = ?');
  const plan = rows.map(row => {
    const current = currentModels.get(row.sku);
    const fields = new URLSearchParams({ family: row.family, name: row.name, price: row.price_chf,
      description_de: row.description_de, description_fr: row.description_fr,
      units: '0', active: current?.active ? '1' : '0', fold: row.fold });
    for (const key of technicalFields) fields.set(key, row[labelled(key)]);
    const { values, errors } = modelValidation(fields, row.sku, families);
    const issues = errors.map(key => [labelled(key), 'Valor obligatorio o no válido.']);
    if (row.fieldCount !== columns.length) issues.push(['CSV', 'Número de columnas incorrecto.']);
    if (!row.family) issues.push(['family', 'La familia es obligatoria.']);
    if (counts.get(row.sku) > 1) issues.push(['sku', 'SKU duplicado en el CSV.']);
    if (current && row.family !== current.family) issues.push(['family', 'Cambia la familia desde el editor del artículo.']);
    if (row.family !== 'wheelchair') {
      for (const key of [...technicalFields, 'fold'].map(labelled)) {
        if (row[key]) issues.push([key, 'Campo exclusivo de sillas.']);
      }
    }
    const links = row.compatible_skus ? row.compatible_skus.split('|').map(sku => sku.trim()) : [];
    if (links.length && !isPart(row)) issues.push(['compatible_skus', 'Indica las compatibilidades en el accesorio o recambio.']);
    if (new Set(links).size !== links.length) issues.push(['compatible_skus', 'Referencia de compatibilidad duplicada.']);
    for (const sku of links) {
      const chair = currentModels.get(sku) || uploadedModels.get(sku);
      if (!(sku === 'one' && hasCoreChair) && (!chair || chair.family !== 'wheelchair' || sku === 'one')) {
        issues.push(['compatible_skus', 'SKU de silla inexistente o no válido.', sku]);
      }
    }
    const beforeLinks = new Set(current ? existingLinks.all(row.sku).map(link => link.chair) : []);
    const additions = links.filter(sku => !beforeLinks.has(sku));
    const changes = modelColumns.flatMap((key, index) => current && !['units', 'active'].includes(key) &&
      !(row.family !== 'wheelchair' && [...technicalFields, 'fold'].includes(key)) && current[key] !== values[index]
      ? [[key, current[key], values[index]]] : []);
    return { line: row.line, sku: row.sku, revision: current?.revision ?? null, values, changes, additions, issues };
  });
  return { rows: plan, invalid: plan.some(row => row.issues.length) };
}

export const importConfirmation = plan => createHmac('sha256', signingKey).update(JSON.stringify(plan)).digest('hex');

export function applyCatalogImport(db, plan, openingMovement) {
  const link = db.prepare("INSERT INTO catalog_compatibility (part, chair, note_de, note_fr) VALUES (?, ?, '', '')");
  let created = 0;
  let updated = 0;
  const articles = [];
  for (const row of plan.rows) {
    if (row.revision === null) {
      insertModel(db, row.sku, row.values);
      openingMovement(row.sku);
      created++;
      articles.push({ sku: row.sku, created: true });
    } else if (row.changes.length || row.additions.length) {
      const columns = row.changes.map(([key]) => key + ' = ?');
      columns.push('revision = revision + 1');
      db.prepare('UPDATE extra_models SET ' + columns.join(', ') + ' WHERE sku = ?')
        .run(...row.changes.map(([, , value]) => value), row.sku);
      updated++;
      articles.push({ sku: row.sku, created: false });
    }
  }
  for (const row of plan.rows) for (const sku of row.additions) link.run(row.sku, sku);
  return { created, updated, articles };
}

const displayValue = (key, value) => key === 'cents' ? (value / 100).toFixed(2) : value == null || value === -1 || value === '' ? '—' : String(value);

export function catalogImportPage({ plan, csv, confirmation, result, stale, needsUpdate } = {}) {
  return adminHtml`<p><a href="/admin/models">Volver al catálogo</a></p><h1>Importar catálogo CSV</h1>
    <p><a href="${importPath}/template.csv">Descargar plantilla CSV</a></p>
    <p>Usa UTF-8, punto y coma y una fila por SKU. SKU, familia, nombre y precio en CHF son obligatorios. Las descripciones en ambos idiomas son obligatorias para publicar.</p>
    <p>Familias: <code>wheelchair</code>, <code>accessory</code>, <code>spare</code> o el identificador de una familia existente. Medidas en cm, peso y carga en kg, autonomía en km. Usa 1 o 0 en <code>fold</code>. Deja los datos desconocidos vacíos.</p>
    <p>En <code>compatible_skus</code>, separa con | los SKU de silla compatibles con cada accesorio o recambio. Las compatibilidades existentes se conservan. Sube fotos y vídeos desde el editor de contenido.</p>
    ${result ? adminHtml`<p role="status">Creados: ${result.created} · Actualizados: ${result.updated}</p>` : ''}
    ${stale ? adminHtml`<p role="alert">La vista previa ha cambiado. Revísala antes de confirmar.</p>` : ''}
    ${needsUpdate ? adminHtml`<p role="alert">Confirma expresamente los cambios en los SKU existentes.</p>` : ''}
    <form class="confirmation" method="post" enctype="multipart/form-data" action="${importPath}">
      <label>Archivo CSV <input required type="file" name="file" accept=".csv,text/csv"></label>
      <button>Ver vista previa</button></form>
    ${plan?.error ? adminHtml`<p role="alert">${plan.line ? adminText('Fila') + ' ' + plan.line + ' · ' : ''}${adminText(plan.error)}</p>` : ''}
    ${plan?.rows ? adminHtml`<h2>Vista previa de la carga</h2><div class="inventory-table"><table>
      <thead><tr><th scope="col">Fila</th><th scope="col">SKU</th><th scope="col">Estado</th><th scope="col">Cambios o errores</th></tr></thead>
      <tbody>${plan.rows.map(row => adminHtml`<tr><td>${row.line}</td><th scope="row">${escapeHtml(row.sku)}</th>
        <td>${adminText(row.revision === null ? 'Nuevo borrador' : 'SKU existente')}</td><td>
        ${row.issues.length ? row.issues.map(([field, message, subject]) => adminHtml`<p><code>${field}</code> · ${escapeHtml(adminText(message) + (subject ? ' ' + subject : ''))}</p>`).join('') :
          row.changes.map(([key, before, after]) => adminHtml`<p><code>${labelled(key)}</code> · ${escapeHtml(displayValue(key, before))} → ${escapeHtml(displayValue(key, after))}</p>`).join('') +
          (row.additions.length ? adminHtml`<p><code>compatible_skus</code> + ${escapeHtml(row.additions.join(' | '))}</p>` : '') +
          (row.revision !== null && !row.changes.length && !row.additions.length ? adminText('Sin cambios') : '')}
        </td></tr>`).join('')}</tbody></table></div>
      ${confirmation ? adminHtml`<form class="confirmation" method="post" action="${importPath}/confirm">
        <textarea hidden name="csv">\n${escapeHtml(csv)}</textarea><input type="hidden" name="confirmation" value="${confirmation}">
        ${plan.rows.some(row => row.revision !== null && (row.changes.length || row.additions.length))
          ? adminHtml`<label><input required type="checkbox" name="update" value="yes"> Confirmo los cambios en los SKU existentes</label>` : ''}
        <button>Confirmar importación</button> <a href="${importPath}">Cancelar importación</a></form>`
        : adminHtml`<p><a href="${importPath}">Cancelar importación</a></p>`}` : ''}
    ${result?.articles.length ? adminHtml`<ul>${result.articles.map(({ sku, created }) => adminHtml`<li>
      <strong>${sku}</strong> · ${adminText(created ? 'Nuevo borrador' : 'SKU existente')} ·
      <a href="/admin/models?q=${sku}&amp;edit=${sku}#item-${sku}">Editar artículo</a> ·
      <a href="/admin/inventory?sku=${sku}">Recibir stock del proveedor</a>
      ${previewLinks(sku)}</li>`).join('')}</ul>` : ''}`;
}
