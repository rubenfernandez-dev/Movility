import { adminHtml, adminText } from './admin-language.mjs';
import { escapeHtml } from './views.mjs';
import { mediaUploadForm, videoFileKinds } from './catalog-media.mjs';

const kinds = { folding: 'Plegado', joystick: 'Joystick', battery: 'Batería', other: 'Otros usos' };
export function setupCatalogVideos(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS catalog_videos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sku TEXT NOT NULL, title_de TEXT NOT NULL, title_fr TEXT NOT NULL,
    purpose TEXT NOT NULL, position INTEGER NOT NULL, published INTEGER NOT NULL CHECK(published IN (0,1)));
    CREATE INDEX IF NOT EXISTS catalog_videos_sku ON catalog_videos(sku, position, id);
    CREATE UNIQUE INDEX IF NOT EXISTS catalog_videos_fold ON catalog_videos(sku) WHERE purpose='folding';`);
}

export const catalogVideos = (db, sku) => db.prepare('SELECT * FROM catalog_videos WHERE sku=? ORDER BY position,id').all(sku);
export const catalogVideo = (db, sku, id) => db.prepare('SELECT * FROM catalog_videos WHERE sku=? AND id=?').get(sku, id);

export function saveCatalogVideo(db, sku, id, fields, videoFor) {
  const read = key => fields?.get(key)?.trim() || '';
  const titles = ['title_de', 'title_fr'].map(read);
  const purpose = read('purpose');
  const position = read('position');
  const published = Number(read('published') === '1');
  if (titles.some(title => !title || title.length > 120) || !Object.hasOwn(kinds, purpose) || !/^\d{1,6}$/.test(position)) return false;
  if (purpose === 'folding' && db.prepare("SELECT 1 FROM catalog_videos WHERE sku=? AND purpose='folding' AND id<>?").get(sku, id || 0)) return false;
  if (published && (!id || !['de-CH','fr-CH'].every(locale => videoFor(sku, locale, id)))) return false;
  if (id) return Boolean(db.prepare(`UPDATE catalog_videos SET title_de=?,title_fr=?,purpose=?,position=?,published=? WHERE id=? AND sku=?`)
    .run(...titles, purpose, Number(position), published, id, sku).changes);
  return Boolean(db.prepare('INSERT INTO catalog_videos (sku,title_de,title_fr,purpose,position,published) VALUES (?,?,?,?,?,0)')
    .run(sku, ...titles, purpose, Number(position)).changes);
}

export function catalogVideosAdmin(sku, videos, videoFor) {
  const path = '/admin/models/' + sku + '/content/videos';
  const form = (item, position) => adminHtml`<form class="confirmation" method="post" action="${path}${item ? '/' + item.id : ''}">
    <label>Título DE<input name="title_de" lang="de-CH" maxlength="120" required value="${escapeHtml(item?.title_de || '')}"></label>
    <label>Título FR<input name="title_fr" lang="fr-CH" maxlength="120" required value="${escapeHtml(item?.title_fr || '')}"></label>
    <label>Uso del vídeo<select name="purpose">${Object.entries(kinds).map(([key, label]) =>
      adminHtml`<option value="${key}" ${key === (item?.purpose || 'other') ? 'selected' : ''}>${adminText(label)}</option>`).join('')}</select></label>
    <label>Orden del vídeo<input name="position" type="number" min="0" max="999999" required value="${position}"></label>
    ${item ? adminHtml`<label><input type="checkbox" name="published" value="1" ${item.published ? 'checked' : ''}> Publicar vídeo</label>` : ''}
    <button>${adminText(item ? 'Guardar vídeo' : 'Crear vídeo')}</button></form>`;
  return adminHtml`<section id="model-videos" class="section"><h2>Vídeos del modelo</h2>
    <p>Crea una ficha por vídeo. Para publicar, adjunta el MP4, los subtítulos y las transcripciones en los dos idiomas.</p>
    <p>Usa un número menor para mostrar el vídeo antes. Solo se puede marcar un vídeo de plegado por silla.</p>
    ${videos.map(item => adminHtml`<details class="model-editor"><summary>${item.position} · ${escapeHtml(item.title_de)} / ${escapeHtml(item.title_fr)}
      · ${adminText(item.published ? 'Publicado' : 'Borrador')}</summary>
      ${form(item, item.position)}
      <p>DE · ${adminText(videoFor(sku, 'de-CH', item.id) ? 'Medios completos' : 'Medios pendientes')} ·
         FR · ${adminText(videoFor(sku, 'fr-CH', item.id) ? 'Medios completos' : 'Medios pendientes')}</p>
      ${mediaUploadForm(path + '/' + item.id + '/upload', videoFileKinds)}</details>`).join('')}
    <details class="model-editor"><summary>Añadir vídeo</summary>${form(null, Math.min(999999, (videos.at(-1)?.position || 0) + 10))}</details>
  </section>`;
}
