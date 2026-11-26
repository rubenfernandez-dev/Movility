import { adminFragment, adminHtml, adminText } from './admin-language.mjs';
import { randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeHtml } from './views.mjs';

export const photoSlots = ['front', 'side', 'rear'];

const types = {
  front: ['.jpg', 'Foto principal', '.jpg,.jpeg'],
  side: ['.side.jpg', 'Foto lateral', '.jpg,.jpeg'],
  rear: ['.rear.jpg', 'Foto trasera', '.jpg,.jpeg'],
  video: ['.mp4', 'Vídeo MP4', '.mp4'],
  deCaptions: ['.de-CH.vtt', 'Subtítulos DE', '.vtt'],
  frCaptions: ['.fr-CH.vtt', 'Subtítulos FR', '.vtt'],
  deTranscript: ['.de-CH.txt', 'Transcripción DE', '.txt'],
  frTranscript: ['.fr-CH.txt', 'Transcripción FR', '.txt'],
  model: ['.glb', 'Modelo 3D GLB', '.glb'],
};
export const videoFileKinds = ['video', 'deCaptions', 'frCaptions', 'deTranscript', 'frTranscript'];

export function mediaUploadForm(path, allowed = Object.keys(types), id = '') {
  return adminHtml`<form class="confirmation"${id ? ` id="${id}"` : ''} enctype="multipart/form-data" method="post" action="${path}">
      <label>Tipo de archivo<select name="kind">${allowed.map(key =>
        `<option value="${key}">${adminText(types[key][1])}</option>`).join('')}</select></label>
      <label>Archivo<input type="file" name="file" accept="${allowed.map(key => types[key][2]).join(',')}" required></label>
      <button>Subir o reemplazar archivo</button></form>`;
}

export function contentAdmin(sku, name, features, saved, hasCompatibility = false, settings, available, previews, details = '', videos = '') {
  const path = '/admin/models/' + sku + '/content';
  return adminHtml`<h1>${escapeHtml(name)}</h1><p><a href="/admin/models">Volver al catálogo</a></p>
    ${hasCompatibility ? adminHtml`<p><a href="/admin/models/${sku}/compatibility">Configurar compatibilidad</a></p>` : ''}
    ${saved ? adminFragment('<p role="status">Contenido guardado.</p>') : ''}
    <h2>Características</h2><form class="confirmation" method="post" action="${path}">
    <label>Alemán, una característica por línea<textarea name="de" maxlength="2500" rows="6">${escapeHtml(features?.de || '')}</textarea></label>
    <label>Francés, una característica por línea<textarea name="fr" maxlength="2500" rows="6">${escapeHtml(features?.fr || '')}</textarea></label>
    <button>Guardar características</button></form>
    ${details}
    <h2>Fotos, vídeo y 3D</h2>${previews}
    <p>La primera foto disponible en el orden elegido se usa como principal.</p>
    <form class="confirmation" method="post" action="${path}/gallery">
      <label>Orden de galería<select name="order">${photoOrders.map(order => adminHtml`<option value="${order.join(',')}" ${order.join() === settings.order.join() ? 'selected' : ''}>${order.map(slot => adminText(types[slot][1])).join(' → ')}</option>`).join('')}</select></label>
      ${photoSlots.map(slot => adminHtml`<fieldset><legend>${adminText(types[slot][1])}</legend>
        ${['de-CH', 'fr-CH'].map(locale => adminHtml`<label>Texto alternativo · ${locale}<input id="alt-${slot}-${locale}" name="alt-${slot}-${locale}" maxlength="250" value="${escapeHtml(settings.alts[locale]?.[slot] || '')}"></label>`).join('')}
      ${available[slot] ? ['de-CH', 'fr-CH'].filter(locale => !settings.alts[locale]?.[slot]).map(locale => adminHtml`<p><a href="#alt-${slot}-${locale}">Texto alternativo pendiente · ${locale}</a></p>`).join('') : ''}
      </fieldset>`).join('')}
      <button>Guardar galería</button></form>
    ${available.video ? ['de-CH', 'fr-CH'].filter(locale => !available[locale]).map(locale => adminHtml`<p><a href="#media-upload">Vídeo pendiente de subtítulos o transcripción válidos · ${locale}</a></p>`).join('') : ''}
    <ul>${Object.keys(types).filter(key => key !== 'model' && !available[key]).map(key => adminHtml`<li>${adminText(types[key][1])} · Opcional · <a href="#media-upload">Archivo pendiente</a></li>`).join('')}</ul><p>JPG hasta 8 MB, MP4 hasta 32 MB y GLB hasta 16 MB. El vídeo necesita subtítulos y transcripción para mostrarse en cada idioma.</p>
    ${mediaUploadForm(path + '/upload', undefined, 'media-upload')}${videos}`;
}

const photoOrders = photoSlots.flatMap(first => photoSlots.filter(slot => slot !== first)
  .map(second => [first, second, photoSlots.find(slot => slot !== first && slot !== second)]));

export function gallerySettings(db, sku) {
  const row = db.prepare('SELECT settings FROM catalog_gallery WHERE sku = ?').get(sku);
  return row ? JSON.parse(row.settings) : { order: photoSlots, alts: {} };
}

export function saveGallery(db, sku, fields) {
  const order = photoOrders.find(candidate => candidate.join() === fields?.get('order'));
  if (!order) return false;
  const alts = Object.fromEntries(['de-CH', 'fr-CH'].map(locale => [locale,
    Object.fromEntries(photoSlots.map(slot => [slot, fields.get('alt-' + slot + '-' + locale)?.trim() || '']))]));
  if (Object.values(alts).some(values => Object.values(values).some(value => value.length > 250))) return false;
  db.prepare('INSERT INTO catalog_gallery VALUES (?, ?) ON CONFLICT(sku) DO UPDATE SET settings=excluded.settings')
    .run(sku, JSON.stringify({ order, alts }));
  return true;
}

export function mediaAvailability(sku, exists, videoFor) {
  const available = Object.fromEntries(Object.entries(types).map(([key, [extension]]) =>
    [key, exists('/assets/models/' + sku + extension)]));
  for (const [code, locale] of [['de', 'de-CH'], ['fr', 'fr-CH']]) {
    available[locale] = Boolean(videoFor(locale));
  }
  return available;
}

export async function receiveUpload(req, maxBody) {
  const type = req.headers['content-type'] || '';
  if (!type.startsWith('multipart/form-data;') || Number(req.headers['content-length']) > maxBody) return null;
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maxBody) { req.resume(); return null; }
    chunks.push(chunk);
  }
  try { return await new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': type }, body: Buffer.concat(chunks) }).formData(); }
  catch { return null; }
}

export async function receiveMedia(req, folder, sku, expectedKind) {
  const fields = await receiveUpload(req, 32 * 1024 * 1024 + 65536);
  if (!fields) return false;
  const kind = fields.get('kind');
  if (expectedKind && ![].concat(expectedKind).includes(kind)) return false;
  const file = fields.get('file');
  if (!Object.hasOwn(types, kind) || !file || typeof file.arrayBuffer !== 'function') return false;
  const [ext] = types[kind];
  const cap = ext === '.mp4' ? 32 : ext === '.glb' ? 16 : ext.endsWith('.jpg') ? 8 : 0.25;
  if (!file.size || file.size > cap * 1024 * 1024) return false;
  const bytes = Buffer.from(await file.arrayBuffer());
  const text = () => {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim(); } catch { return ''; }
  };
  const format = ext.endsWith('.jpg') ? bytes.subarray(0, 3).equals(Buffer.from([255,216,255]))
    : ext === '.mp4' ? bytes.toString('ascii', 4, 8) === 'ftyp'
      : ext === '.glb' ? bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'glTF' && bytes.readUInt32LE(8) === bytes.length
        : ext.endsWith('.vtt') ? /^WEBVTT(?:\s|$)/.test(text()) : Boolean(text());
  if (!format) return false;
  mkdirSync(folder, { recursive: true, mode: 0o700 });
  const temp = join(folder, randomUUID() + '.upload');
  try {
    writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 });
    renameSync(temp, join(folder, sku + ext));
  } finally {
    rmSync(temp, { force: true });
  }
  return kind;
}
