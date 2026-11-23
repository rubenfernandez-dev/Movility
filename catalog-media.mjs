import { randomUUID } from 'node:crypto';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeHtml } from './views.mjs';

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

export function contentAdmin(sku, name, features, saved, hasCompatibility = false) {
  const path = '/admin/models/' + sku + '/content';
  return `<h1>${escapeHtml(name)}</h1><p><a href="/admin/models">Volver al catálogo</a></p>
    ${hasCompatibility ? `<p><a href="/admin/models/${sku}/compatibility">Configurar compatibilidad</a></p>` : ''}
    ${saved ? '<p role="status">Contenido guardado.</p>' : ''}
    <h2>Características</h2><form class="confirmation" method="post" action="${path}">
    <label>Alemán, una característica por línea<textarea name="de" maxlength="2500" rows="6">${escapeHtml(features?.de || '')}</textarea></label>
    <label>Francés, una característica por línea<textarea name="fr" maxlength="2500" rows="6">${escapeHtml(features?.fr || '')}</textarea></label>
    <button>Guardar características</button></form>
    <h2>Fotos, vídeo y 3D</h2><p>JPG hasta 8 MB, MP4 hasta 32 MB y GLB hasta 16 MB. El vídeo necesita subtítulos y transcripción para mostrarse en cada idioma.</p>
    <form class="confirmation" enctype="multipart/form-data" method="post" action="${path}/upload">
      <label>Tipo de archivo<select name="kind">${Object.entries(types).map(([key, [, label]]) =>
        `<option value="${key}">${label}</option>`).join('')}</select></label>
      <label>Archivo<input type="file" name="file" accept="${Object.values(types).map(([, , accept]) => accept).join(',')}" required></label>
      <button>Subir o reemplazar archivo</button></form>`;
}

export async function receiveMedia(req, folder, sku) {
  const type = req.headers['content-type'] || '';
  const maxBody = 32 * 1024 * 1024 + 65536;
  if (!type.startsWith('multipart/form-data;') || Number(req.headers['content-length']) > maxBody) return false;
  const chunks = [];
  let size = 0;
  for await (const chunk of req.iterator({ destroyOnReturn: false })) {
    size += chunk.length;
    if (size > maxBody) { req.resume(); return false; }
    chunks.push(chunk);
  }
  let fields;
  try { fields = await new Request('http://localhost', { method: 'POST', headers: { 'Content-Type': type }, body: Buffer.concat(chunks) }).formData(); }
  catch { return false; }
  const kind = fields.get('kind');
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
  return true;
}
