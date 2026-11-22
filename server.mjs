import { createServer } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { basename, join } from 'node:path';
import { copy, page, money, methods, escapeHtml } from './views.mjs';
import { navigation, homepage, productPage, cartPage, checkoutPage, orderPage,
  productImage, sideImage, videoPath, captionsPath, transcriptPath } from './storefront.mjs';
import { comparisonPage, viewerPage, modelPath, viewerScript } from './discovery.mjs';
import { pageMetadata, publicOrigin, sitemap } from './seo.mjs';
import { orderEmail } from './postpurchase.mjs';
import { setupModels, modelAdmin, modelInput, extraCatalog, extraProduct } from './catalog.mjs';
import { basketPage, canCheckout, cartCookie, cartLines, cartQuote, cartText, cartTotal,
  changeCart, coreSKU, readCart, skuPattern } from './cart.mjs';

const port = Number(process.env.PORT || 3000);
const siteOrigin = publicOrigin(process.env.MOVILITY_PUBLIC_ORIGIN);
const { CODESPACES, CODESPACE_NAME, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN } = process.env;
const codespaceHost = CODESPACES === 'true' && CODESPACE_NAME && GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
  ? `${CODESPACE_NAME}-${port}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
  : null;
const admin = process.env.MOVILITY_ADMIN_PASSWORD || randomBytes(18).toString('base64url');
const dbPath = process.env.MOVILITY_DB || 'data/demo.sqlite';
if (!process.env.MOVILITY_DB) mkdirSync('data', { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS stock (id INTEGER PRIMARY KEY, units INTEGER NOT NULL CHECK (units >= 0));
  INSERT OR IGNORE INTO stock VALUES (1, 1);
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, email TEXT NOT NULL, locale TEXT NOT NULL, method TEXT NOT NULL,
    cents INTEGER NOT NULL, status TEXT NOT NULL, tracking TEXT
  );
  CREATE TABLE IF NOT EXISTS notices (
    order_id TEXT NOT NULL REFERENCES orders(id), kind TEXT NOT NULL,
    PRIMARY KEY (order_id, kind)
  );
  CREATE TABLE IF NOT EXISTS email_previews (
    order_id TEXT NOT NULL, kind TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL,
    PRIMARY KEY (order_id, kind),
    FOREIGN KEY (order_id, kind) REFERENCES notices(order_id, kind)
  );
  CREATE TABLE IF NOT EXISTS delivery_addresses (
    order_id TEXT PRIMARY KEY REFERENCES orders(id), name TEXT NOT NULL,
    street TEXT NOT NULL, zip TEXT NOT NULL, city TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS catalog (
    id INTEGER PRIMARY KEY, cents INTEGER NOT NULL CHECK (cents > 0),
    description_de TEXT NOT NULL DEFAULT '', description_fr TEXT NOT NULL DEFAULT ''
  );
  INSERT OR IGNORE INTO catalog (id, cents) VALUES (1, 249900);
`);

setupModels(db);
const catalog = () => db.prepare('SELECT * FROM catalog WHERE id = 1').get();
const extraModel = sku => db.prepare('SELECT * FROM extra_models WHERE sku = ?').get(sku);
const liveModels = () => db.prepare('SELECT * FROM extra_models WHERE active = 1 ORDER BY name, sku').all();
const displayModelAdmin = message => page('es', 'Modelos del catálogo', modelAdmin(
  db.prepare('SELECT * FROM extra_models ORDER BY active DESC, name, sku').all(), message));
const assets = new Map([
  ['/site.css', ['text/css; charset=utf-8', readFileSync(new URL('./site.css', import.meta.url))]],
  [productImage, ['image/jpeg', readFileSync(new URL('./assets/movility-one.jpg', import.meta.url))]],
  [sideImage, ['image/jpeg', readFileSync(new URL('.' + sideImage, import.meta.url))]],
  [modelPath, ['model/gltf-binary', readFileSync(new URL('./assets/movility-one.glb', import.meta.url))]],
  [viewerScript, ['text/javascript; charset=utf-8', readFileSync(new URL('./node_modules/@google/model-viewer/dist/model-viewer.min.js', import.meta.url))]],
]);
const mediaFile = path => process.env.MOVILITY_MEDIA_DIR
  ? join(process.env.MOVILITY_MEDIA_DIR, basename(path)) : new URL('.' + path, import.meta.url);
function modelVideo(sku, locale) {
  const base = `/assets/models/${sku}`;
  const bundle = { video: base + '.mp4', captions: base + '.' + locale + '.vtt', transcript: base + '.' + locale + '.txt' };
  if (!Object.values(bundle).every(path => existsSync(mediaFile(path)))) return null;
  const captions = readFileSync(mediaFile(bundle.captions), 'utf8');
  const transcript = readFileSync(mediaFile(bundle.transcript), 'utf8');
  return captions.replace(/^\uFEFF/, '').startsWith('WEBVTT') && transcript.trim() ? bundle : null;
}

function modelMedia(sku, locale) {
  const base = `/assets/models/${sku}`;
  const find = extension => existsSync(mediaFile(base + extension)) ? base + extension : '';
  const photos = { front: find('.jpg'), side: find('.side.jpg'), rear: find('.rear.jpg') };
  const photo = photos.front || photos.side || photos.rear;
  const video = modelVideo(sku, locale);
  return { photo, photos, model: find('.glb'), video: video ? { ...video, poster: photo } : null };
}
const videoFile = mediaFile(videoPath);
const videoLocales = new Set();
for (const locale of Object.keys(copy)) {
  const captions = mediaFile(captionsPath(locale));
  const transcript = mediaFile(transcriptPath(locale));
  if (!existsSync(videoFile) || !existsSync(captions) || !existsSync(transcript)) continue;
  const track = readFileSync(captions, 'utf8');
  const text = readFileSync(transcript, 'utf8');
  if (!track.replace(/^\uFEFF/, '').startsWith('WEBVTT') || !text.trim()) continue;
  videoLocales.add(locale);
  assets.set(captionsPath(locale), ['text/vtt; charset=utf-8', track]);
  assets.set(transcriptPath(locale), ['text/plain; charset=utf-8', text]);
}
const transaction = (work) => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};
const stock = () => db.prepare('SELECT units FROM stock WHERE id = 1').get().units;
function purchaseModel(sku) {
  if (sku === coreSKU) return { name: 'Movility One', cents: catalog().cents, units: stock() };
  const model = extraModel(sku);
  return model?.active ? model : null;
}
const orderLines = id => db.prepare('SELECT sku, name, quantity, cents FROM order_lines WHERE order_id = ? ORDER BY rowid').all(id);
function orderById(id) {
  const order = db.prepare(`SELECT orders.*, order_models.sku AS model_sku, order_models.name AS model_name
    FROM orders LEFT JOIN order_models ON orders.id = order_models.order_id WHERE orders.id = ?`).get(id);
  return order ? { ...order, lines: orderLines(id) } : null;
}
function changeStock(sku, quantity) {
  if (sku === coreSKU) {
    return db.prepare('UPDATE stock SET units = units + ? WHERE id = 1 AND units + ? >= 0').run(quantity, quantity).changes;
  }
  return db.prepare(`UPDATE extra_models SET units = units + ?, revision = revision + 1
    WHERE sku = ? AND units + ? >= 0 AND (? > 0 OR active = 1)`).run(quantity, sku, quantity, quantity).changes;
}
const adminHeader = 'Basic ' + Buffer.from('admin:' + admin).toString('base64');
const noticeKinds = ['paid', 'shipped', 'refunded'];

const storeEmail = (order, kind) => {
  const { subject, body } = orderEmail(order, kind);
  db.prepare('INSERT INTO email_previews VALUES (?, ?, ?, ?)').run(order.id, kind, subject, body);
};
const notice = (id, kind) => {
  db.prepare('INSERT INTO notices VALUES (?, ?)').run(id, kind);
  storeEmail(orderById(id), kind);
};
transaction(() => {
  const previousEvents = db.prepare(`SELECT orders.*, notices.kind FROM notices
    JOIN orders ON orders.id = notices.order_id
    LEFT JOIN email_previews ON email_previews.order_id = notices.order_id AND email_previews.kind = notices.kind
    WHERE email_previews.order_id IS NULL AND notices.kind IN ('paid', 'shipped', 'refunded')`).all();
  for (const event of previousEvents) storeEmail(orderById(event.id), event.kind);
});

function send(res, status, body, withViewer = false) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': withViewer
      ? "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
      : "default-src 'none'; style-src 'self'; img-src 'self'; media-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  });
  res.end(body);
}

function sendVideo(req, res, file = videoFile) {
  const size = statSync(file).size;
  const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };
  let start = 0;
  let end = size - 1;
  if (req.headers.range) {
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (range?.[1]) {
      start = Number(range[1]);
      if (range[2]) end = Math.min(Number(range[2]), end);
    } else if (range?.[2]) {
      start = Math.max(0, size - Number(range[2]));
    } else {
      start = size;
    }
    if (start > end) {
      res.writeHead(416, { ...headers, 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  res.writeHead(req.headers.range ? 206 : 200, { ...headers, 'Content-Length': Math.max(0, end - start + 1) });
  if (req.method === 'HEAD' || !size) return res.end();
  const stream = createReadStream(file, { start, end });
  stream.on('error', () => res.destroy());
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

function redirect(res, location) {
  res.writeHead(303, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

async function form(req) {
  if (!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) return null;
  let body = '';
  for await (const part of req) {
    body += part.toString('latin1');
    if (body.length > 16384) return null;
  }
  return new URLSearchParams(Buffer.from(body, 'latin1').toString('utf8'));
}

const orderLabels = { paid: 'Cobrado', shipped: 'Enviado', refunded: 'Reembolsado' };

function adminView({ error, saved, draft, filter = '' } = {}) {
  const model = catalog();
  const units = stock();
  const orders = db.prepare(`SELECT orders.*, delivery_addresses.name, street, zip, city, order_models.name AS model_name FROM orders
    LEFT JOIN delivery_addresses ON orders.id = delivery_addresses.order_id
    LEFT JOIN order_models ON orders.id = order_models.order_id
    WHERE (? = '' OR status = ?) ORDER BY orders.rowid DESC`).all(filter, filter);
  const totals = db.prepare(`SELECT COUNT(*) AS quantity, COALESCE(SUM(cents), 0) AS gross,
    COALESCE(SUM(CASE WHEN status = 'refunded' THEN cents ELSE 0 END), 0) AS refunds FROM orders`).get();
  const breakdown = db.prepare(`SELECT method, COUNT(*) AS quantity, SUM(cents) AS gross,
    SUM(CASE WHEN status = 'refunded' THEN cents ELSE 0 END) AS refunds
    FROM orders GROUP BY method ORDER BY method`).all();
  const cards = orders.map((order) => {
    const lines = orderLines(order.id);
    const productNames = lines.length ? lines.map(line => `${line.quantity} × ${line.name}`).join(' · ') : order.model_name || 'Movility One';
    const events = db.prepare('SELECT kind FROM email_previews WHERE order_id = ? ORDER BY rowid').all(order.id);
    const notices = events.map(({ kind }) => `<li><a lang="${order.locale}" href="/admin/${order.id}/email/${kind}">${copy[order.locale][kind]}</a></li>`).join('');
    return `<article><h2>${order.id}</h2>
      <p>${escapeHtml(productNames)} · ${escapeHtml(order.email)} · ${order.locale} · ${order.method} · ${orderLabels[order.status]}</p>
      ${order.street ? `<p>${escapeHtml(order.name)} · ${escapeHtml(order.street)} · ${escapeHtml(order.zip)} ${escapeHtml(order.city)} · Suiza</p>` : ''}
      ${order.tracking ? `<p>Seguimiento: ${escapeHtml(order.tracking)}</p>` : ''}
      <h3>Bandeja de correo simulada</h3><ul>${notices}</ul>
      ${order.status === 'paid' ? `<form method="post" action="/admin/${order.id}/ship"><label>Referencia de seguimiento <input name="tracking" required maxlength="80"></label><button>Registrar envío</button></form>` : ''}
      ${order.status !== 'refunded' ? `<form method="post" action="/admin/${order.id}/refund"><button>Reembolsar en la simulación</button></form>` : ''}
    </article>`;
  }).join('');
  return page('es', 'Administración de prueba', `<h1>Administración de prueba</h1>
    <p>Unidades disponibles: ${stock()} · Pedidos: ${totals.quantity}</p>
    <p><a class="button secondary" href="/admin/models">Gestionar modelos del catálogo</a></p>
    <dl class="admin-metrics"><div><dt>Cobros</dt><dd>${money('es', totals.gross)}</dd></div>
      <div><dt>Reembolsos</dt><dd>${money('es', totals.refunds)}</dd></div>
      <div><dt>Neto</dt><dd>${money('es', totals.gross - totals.refunds)}</dd></div></dl>
    <details class="payment-breakdown"><summary>Desglose por forma de pago</summary>
      ${breakdown.length ? `<div class="compare-table"><table><thead><tr>
        <th scope="col">Método</th><th scope="col">Pedidos</th><th scope="col">Neto</th></tr></thead>
        <tbody>${breakdown.map(row => `<tr><th scope="row">${escapeHtml(row.method)}</th><td>${row.quantity}</td>
          <td>${money('es', row.gross - row.refunds)}</td></tr>`).join('')}</tbody></table></div>` : '<p>El desglose aparecerá con el primer pedido.</p>'}
    </details>
    ${error ? `<p class="form-error" role="alert">${error}</p>` : ''}
    ${saved ? '<p class="form-success" role="status">Cambios guardados. Ya están visibles en la tienda.</p>' : ''}
    <form class="admin-catalog" method="post" action="/admin/catalog">
      <fieldset><legend>Catálogo · Movility One</legend>
        <input type="hidden" name="expectedUnits" value="${units}">
        <input type="hidden" name="expectedPrice" value="${model.cents}">
        <div class="address-row"><label>Precio en CHF <input name="price" inputmode="decimal" required value="${escapeHtml(draft?.price ?? (model.cents / 100).toFixed(2))}"></label>
        <label>Unidades disponibles <input type="number" name="units" min="0" max="999" step="1" required value="${escapeHtml(draft?.units ?? String(units))}"></label></div>
        <label>Descripción en alemán<textarea name="descriptionDe" rows="3" maxlength="500" lang="de-CH">${escapeHtml(draft?.descriptionDe ?? (model.description_de || copy['de-CH'].description))}</textarea></label>
        <label>Descripción en francés<textarea name="descriptionFr" rows="3" maxlength="500" lang="fr-CH">${escapeHtml(draft?.descriptionFr ?? (model.description_fr || copy['fr-CH'].description))}</textarea></label>
        <button>Guardar cambios en la tienda</button>
      </fieldset>
    </form>
    ${stock() === 0 ? '<form method="post" action="/admin/restock"><button>Reponer una unidad de prueba</button></form>' : ''}
    <h2>Pedidos</h2>
    <form class="order-filter" method="get" action="/admin">
      <label>Estado del pedido <select name="status"><option value="">Todos</option>
      ${Object.entries(orderLabels).map(([value, label]) => `<option value="${value}" ${filter === value ? 'selected' : ''}>${label}</option>`).join('')}
      </select></label><button class="secondary">Filtrar</button>
    </form>
    ${cards || `<p>${filter ? 'No hay pedidos con este estado.' : 'Todavía no hay pedidos.'}</p>`}`);
}

function emailView(order, preview) {
  const { orderPath, statusLabel } = orderEmail(order, preview.kind);
  return page('es', 'Vista previa de correo', `<a href="/admin">Volver a pedidos</a>
    <h1 class="page-title">Vista previa de correo</h1>
    <p>Correo de prueba generado automáticamente. Disponible en este panel; envío externo pendiente.</p>
    <article class="email-preview">
      <p><strong>Para</strong> ${escapeHtml(order.email)}</p>
      <h2 lang="${order.locale}">${escapeHtml(preview.subject)}</h2>
      <div class="email-body" lang="${order.locale}">${escapeHtml(preview.body)}</div>
      <a href="${orderPath}" lang="${order.locale}">${statusLabel}</a>
    </article>`);
}

const server = createServer(async (req, res) => {
  try {
    const activePort = server.address().port;
    const localHosts = [`127.0.0.1:${activePort}`, `localhost:${activePort}`];
    if (!localHosts.includes(req.headers.host) && req.headers.host !== codespaceHost) {
      return send(res, 403, 'Forbidden');
    }
    const { pathname: path, searchParams } = new URL(req.url, 'http://localhost');
    const modelAsset = /^\/assets\/models\/([a-z0-9][a-z0-9-]{1,23})\.(?:(side\.|rear\.)?jpg|glb|mp4|(de-CH|fr-CH)\.(?:vtt|txt))$/.exec(path);
    if (modelAsset && ['GET', 'HEAD'].includes(req.method) && extraModel(modelAsset[1])?.active && existsSync(mediaFile(path))) {
      const [, sku, , trackLocale] = modelAsset;
      if (path.endsWith('.mp4')) {
        if (Object.keys(copy).some(language => modelVideo(sku, language))) return sendVideo(req, res, mediaFile(path));
      } else if (!trackLocale || modelVideo(sku, trackLocale)) {
        const types = { jpg: 'image/jpeg', glb: 'model/gltf-binary', vtt: 'text/vtt; charset=utf-8', txt: 'text/plain; charset=utf-8' };
        const extension = path.split('.').at(-1);
        const data = readFileSync(mediaFile(path));
        res.writeHead(200, { 'Content-Type': types[extension], 'Content-Length': data.length,
          'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
        return res.end(req.method === 'HEAD' ? undefined : data);
      }
    }
    if (req.method === 'GET' && path === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('User-agent: *\nDisallow: /admin\n');
    }
    if (req.method === 'GET' && path === '/sitemap.xml' && siteOrigin) {
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'X-Robots-Tag': 'noindex' });
      return res.end(sitemap(siteOrigin));
    }
    if (['GET', 'HEAD'].includes(req.method) && path === videoPath && videoLocales.size) return sendVideo(req, res);
    if (req.method === 'GET' && assets.has(path)) {
      const [type, data] = assets.get(path);
      res.writeHead(200, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
      return res.end(data);
    }
    const [, first, second, third] = path.split('/');
    const locale = Object.hasOwn(copy, first) ? first : 'de-CH';
    const t = copy[locale];
    const suffix = first === locale ? path.slice(locale.length + 1) : '';
    const modelRoute = /^\/models\/([a-z0-9][a-z0-9-]{1,23})(\/3d)?$/.exec(suffix);
    const languagePath = ['/movility-one', '/movility-one/3d', '/compare', '/cart', '/checkout', '/checkout/cart'].includes(suffix) ||
      modelRoute || /^\/orders\/[0-9a-f-]{36}$/.test(suffix)
      ? suffix : '';
    const view = searchParams.get('view');
    const galleryView = ['side', 'rear'].includes(view) ? view : 'front';
    const selectedSKU = searchParams.get('model') || '';
    const languageQuery = ['/cart', '/checkout'].includes(languagePath) && skuPattern.test(selectedSKU) ? `?model=${selectedSKU}`
      : languagePath === '/compare' && searchParams.size ? `?${searchParams}`
      : (languagePath === '/movility-one' || modelRoute && !modelRoute[2]) && galleryView !== 'front'
        ? `?view=${galleryView}#gallery` : '';
    const discoverable = first === locale && (suffix === '' || ['/movility-one', '/compare', '/movility-one/3d'].includes(suffix));
    const cartUnits = [...readCart(req).values()].reduce((sum, quantity) => sum + quantity, 0);
    const render = (body, status = 200) => send(res, status,
      page(locale, t.title, body, navigation(locale, languagePath, languageQuery, cartUnits),
        discoverable && status === 200 ? pageMetadata(locale, suffix, siteOrigin) : {}), languagePath === '/movility-one/3d' || Boolean(modelRoute?.[2]));
    const origin = req.headers.origin;
    const sameOrigin = localHosts.includes(req.headers.host) && origin === `http://${req.headers.host}`;
    const codespaceOrigin = codespaceHost && origin === `https://${codespaceHost}`;
    const basketCheckout = path === `/${locale}/checkout/cart`;
    if (req.method === 'POST' && !sameOrigin && !codespaceOrigin) {
      return send(res, 403, 'Forbidden');
    }
    if (first === 'admin') {
      if (req.headers.authorization !== adminHeader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Movility local demo", charset="UTF-8"');
        return send(res, 401, 'Authentication required');
      }
      if (req.method === 'GET' && path === '/admin') {
        const status = searchParams.get('status');
        return send(res, 200, adminView({ saved: searchParams.get('saved') === 'catalog',
          filter: Object.hasOwn(orderLabels, status) ? status : '' }));
      }
      if (req.method === 'GET' && path === '/admin/models') {
        return send(res, 200, displayModelAdmin(searchParams.has('saved')
          ? '<p class="form-success" role="status">Modelo guardado.</p>' : ''));
      }
      const modelEdit = /^\/admin\/models(?:\/([a-z0-9][a-z0-9-]{1,23}))?$/.exec(path);
      if (req.method === 'POST' && modelEdit) {
        const fields = await form(req);
        const sku = modelEdit[1] || fields?.get('sku')?.trim() || '';
        const input = modelInput(fields, sku);
        if (!input) return send(res, 400, displayModelAdmin('<p class="form-error" role="alert">Revisa el SKU, el precio, las traducciones y las características.</p>'));
        const saved = transaction(() => {
          const current = extraModel(sku);
          if (modelEdit[1] ? !current || String(current.revision) !== fields.get('revision') : current) return false;
          if (input[3] && !current?.active && liveModels().length >= 9) return false;
          if (current) {
            db.prepare(`UPDATE extra_models SET name = ?, cents = ?, units = ?, active = ?, description_de = ?,
              description_fr = ?, width = ?, weight = ?, range = ?, fold = ?, revision = revision + 1 WHERE sku = ?`).run(...input, sku);
          } else {
            db.prepare(`INSERT INTO extra_models (name, cents, units, active, description_de, description_fr,
              width, weight, range, fold, sku) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...input, sku);
          }
          return true;
        });
        return saved ? redirect(res, '/admin/models?saved=1') : send(res, 409, displayModelAdmin(
          '<p class="form-error" role="alert">El SKU ya existe, el modelo cambió mientras editabas o se alcanzó el límite de diez publicados.</p>'));
      }
      const emailRoute = /^\/admin\/([0-9a-f-]{36})\/email\/([a-z]+)$/.exec(path);
      if (req.method === 'GET' && emailRoute && noticeKinds.includes(emailRoute[2])) {
        const [, id, kind] = emailRoute;
        const preview = db.prepare('SELECT kind, subject, body FROM email_previews WHERE order_id = ? AND kind = ?').get(id, kind);
        return preview ? send(res, 200, emailView(orderById(id), preview)) : send(res, 404, 'Correo desconocido');
      }
      if (req.method === 'POST' && path === '/admin/catalog') {
        const fields = await form(req);
        const rawPrice = fields?.get('price')?.trim().replace(',', '.') || '';
        const rawUnits = fields?.get('units') || '';
        const descriptionDe = fields?.get('descriptionDe')?.trim() || '';
        const descriptionFr = fields?.get('descriptionFr')?.trim() || '';
        if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(rawPrice) || Number(rawPrice) <= 0 ||
            !/^\d{1,3}$/.test(rawUnits) || descriptionDe.length > 500 || descriptionFr.length > 500) {
          return send(res, 400, adminView({
            error: 'Introduce un precio positivo, un stock de 0 a 999 y descripciones de hasta 500 caracteres.',
            draft: { price: rawPrice, units: rawUnits, descriptionDe, descriptionFr },
          }));
        }
        const saved = transaction(() => {
          const current = catalog();
          if (fields.get('expectedUnits') !== String(stock()) || fields.get('expectedPrice') !== String(current.cents)) return false;
          db.prepare('UPDATE catalog SET cents = ?, description_de = ?, description_fr = ? WHERE id = 1')
            .run(Math.round(Number(rawPrice) * 100), descriptionDe, descriptionFr);
          db.prepare('UPDATE stock SET units = ? WHERE id = 1').run(Number(rawUnits));
          return true;
        });
        return saved ? redirect(res, '/admin?saved=catalog') : send(res, 409, adminView({
          error: 'El precio o el stock cambió mientras editabas. Revisa los valores actuales y vuelve a guardar.',
        }));
      }
      if (req.method === 'POST' && path === '/admin/restock') {
        db.exec('UPDATE stock SET units = 1 WHERE id = 1 AND units = 0');
        return redirect(res, '/admin');
      }
      if (req.method === 'POST' && /^\/admin\/[0-9a-f-]{36}\/(ship|refund)$/.test(path)) {
        const fields = await form(req);
        const tracking = fields?.get('tracking')?.trim();
        if (!fields || (third === 'ship' && (!tracking || tracking.length > 80))) return send(res, 400, 'Datos incorrectos');
        const found = transaction(() => {
          const order = orderById(second);
          if (!order) return false;
          if (third === 'ship' && order.status === 'paid') {
            db.prepare("UPDATE orders SET status = 'shipped', tracking = ? WHERE id = ?").run(tracking, second);
            notice(second, 'shipped');
          }
          if (third === 'refund' && order.status !== 'refunded') {
            db.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?").run(second);
            if (order.status === 'paid') {
              if (order.lines.length) {
                for (const line of order.lines) changeStock(line.sku, line.quantity);
              } else changeStock(order.model_sku || coreSKU, 1);
            }
            notice(second, 'refunded');
          }
          return true;
        });
        return found ? redirect(res, '/admin') : send(res, 404, 'Pedido desconocido');
      }
    }
    if (req.method === 'GET' && path === '/') return redirect(res, '/de-CH');
    if (req.method === 'GET' && path === `/${locale}`) {
      return render(homepage(locale, catalog().cents, stock() > 0, extraCatalog(locale, liveModels())));
    }
    if (req.method === 'GET' && path === `/${locale}/movility-one`) {
      const model = catalog();
      return render(productPage(locale, model.cents, stock() > 0, model, { view: galleryView, video: videoLocales.has(locale) }));
    }
    if (req.method === 'GET' && path === `/${locale}/compare`) {
      return render(comparisonPage(locale, searchParams, catalog().cents, liveModels()));
    }
    if (req.method === 'GET' && modelRoute) {
      const model = extraModel(modelRoute[1]);
      if (model?.active) {
        const media = modelMedia(model.sku, locale);
        if (!modelRoute[2]) return render(extraProduct(locale, model, media, galleryView));
        if (media.model) return render(viewerPage(locale, media.photo,
          { name: model.name, url: media.model, productPath: '/models/' + model.sku }));
      }
    }
    if (req.method === 'GET' && path === `/${locale}/movility-one/3d`) {
      return render(viewerPage(locale, productImage));
    }
    if (req.method === 'GET' && path === `/${locale}/cart`) {
      if (selectedSKU) {
        const model = extraModel(selectedSKU);
        return model?.active ? render(cartPage(locale, model.cents, model.units > 0, model)) : render(`<h1>${t.soldOut}</h1>`, 404);
      }
      return render(basketPage(locale, cartLines(readCart(req), purchaseModel)));
    }
    if (req.method === 'POST' && path === `/${locale}/cart`) {
      const cart = readCart(req);
      if (!changeCart(cart, await form(req), purchaseModel)) {
        return render(basketPage(locale, cartLines(cart, purchaseModel), cartText(locale).unavailable), 409);
      }
      res.setHeader('Set-Cookie', cartCookie(cart, Boolean(codespaceOrigin)));
      return redirect(res, `/${locale}/cart`);
    }
    if (req.method === 'GET' && basketCheckout) {
      const lines = cartLines(readCart(req), purchaseModel);
      if (!canCheckout(lines)) return render(basketPage(locale, lines, cartText(locale).unavailable), 409);
      return render(checkoutPage(locale, cartTotal(lines), randomUUID(), {}, '', null, lines));
    }
    if (req.method === 'GET' && path === `/${locale}/checkout`) {
      if (selectedSKU) {
        const model = extraModel(selectedSKU);
        if (!model?.active || !model.units) return render(`<h1>${t.soldOut}</h1>`, 409);
        return render(checkoutPage(locale, model.cents, randomUUID(), {}, '', model));
      }
      const model = catalog();
      if (!stock()) return render(productPage(locale, model.cents, false, model), 409);
      return render(checkoutPage(locale, model.cents, randomUUID()));
    }
    if (req.method === 'POST' && (basketCheckout || path === `/${locale}/checkout`)) {
      const fields = await form(req);
      const id = fields?.get('id') || '';
      const email = fields?.get('email')?.trim() || '';
      const method = fields?.get('method');
      const result = fields?.get('result');
      const quotedPrice = fields?.get('quotedPrice');
      const sku = basketCheckout ? '' : fields?.get('model') || '';
      const cart = basketCheckout ? readCart(req) : null;
      const lines = cart ? cartLines(cart, purchaseModel) : null;
      const selected = sku ? extraModel(sku) : null;
      const cents = lines ? cartTotal(lines) : selected?.cents ?? catalog().cents;
      const address = Object.fromEntries(['name', 'street', 'zip', 'city'].map(key => [key, fields?.get(key)?.trim() || '']));
      const validId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id);
      const values = { ...address, email, method };
      if (sku && !selected) return render(`<h1>${t.soldOut}</h1>`, 409);
      if (!validId ||
          email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          !address.name || address.name.length > 100 || !address.street || address.street.length > 160 ||
          !address.city || address.city.length > 100 || !/^[0-9]{4}$/.test(address.zip) ||
          !methods.includes(method) || !['paid', 'failed'].includes(result)) {
        return render(checkoutPage(locale, cents, validId ? id : randomUUID(), values, t.invalid, selected, lines), 400);
      }
      if (result === 'failed') return render(checkoutPage(locale, cents, id, values, t.failed, selected, lines));
      const outcome = transaction(() => {
        const existing = orderById(id);
        if (existing) {
          const sameItems = basketCheckout ? existing.lines.length && cartQuote(existing.lines) === fields.get('cartQuote')
            : !existing.lines.length && (existing.model_sku || '') === sku;
          return existing.email === email && existing.method === method && existing.locale === locale && sameItems ? 'repeat' : 'conflict';
        }
        if (basketCheckout) {
          const currentLines = cartLines(cart, purchaseModel);
          if (!canCheckout(currentLines)) return 'out';
          if (fields.get('cartQuote') !== cartQuote(currentLines)) return 'price';
          const insertLine = db.prepare('INSERT INTO order_lines VALUES (?, ?, ?, ?, ?)');
          db.prepare("INSERT INTO orders VALUES (?, ?, ?, ?, ?, 'paid', NULL)").run(id, email, locale, method, cartTotal(currentLines));
          for (const line of currentLines) {
            if (!changeStock(line.sku, -line.quantity)) throw new Error('Cart stock changed during checkout');
            insertLine.run(id, line.sku, line.name, line.quantity, line.cents);
          }
          db.prepare('INSERT INTO delivery_addresses VALUES (?, ?, ?, ?, ?)').run(id, address.name, address.street, address.zip, address.city);
          notice(id, 'paid');
          return 'ok';
        }
        const currentModel = sku ? extraModel(sku) : null;
        if (sku && !currentModel?.active) return 'out';
        const currentPrice = currentModel?.cents ?? catalog().cents;
        if (quotedPrice !== String(currentPrice)) return 'price';
        if (!changeStock(sku || coreSKU, -1)) return 'out';
        db.prepare("INSERT INTO orders VALUES (?, ?, ?, ?, ?, 'paid', NULL)").run(id, email, locale, method, currentPrice);
        if (currentModel) db.prepare('INSERT INTO order_models VALUES (?, ?, ?)').run(id, sku, currentModel.name);
        db.prepare('INSERT INTO delivery_addresses VALUES (?, ?, ?, ?, ?)').run(id, address.name, address.street, address.zip, address.city);
        notice(id, 'paid');
        return 'ok';
      });
      if (outcome === 'ok' || outcome === 'repeat') {
        if (basketCheckout && (outcome === 'ok' || cartQuote(lines) === fields.get('cartQuote'))) {
          res.setHeader('Set-Cookie', cartCookie(new Map(), Boolean(codespaceOrigin)));
        }
        return redirect(res, `/${locale}/orders/${id}`);
      }
      if (basketCheckout && (outcome === 'out' || outcome === 'price')) {
        const currentLines = cartLines(cart, purchaseModel);
        return render(canCheckout(currentLines)
          ? checkoutPage(locale, cartTotal(currentLines), id, values, cartText(locale).changed, null, currentLines)
          : basketPage(locale, currentLines, cartText(locale).unavailable), 409);
      }
      if (outcome === 'price') {
        const current = sku ? extraModel(sku) : null;
        return render(checkoutPage(locale, current?.cents ?? catalog().cents, id, values, t.priceChanged, current), 409);
      }
      return render(`<h1>${outcome === 'out' ? t.soldOut : t.invalid}</h1><a href="/${locale}">${t.catalog}</a>`, 409);
    }
    if (req.method === 'GET' && second === 'orders' && first === locale && path === `/${locale}/orders/${third}`) {
      const order = orderById(third);
      if (order) return render(orderPage(locale, order));
    }
    return render(`<h1>404</h1><a href="/${locale}">${t.catalog}</a>`, 404);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) send(res, 500, 'Internal server error');
    else res.end();
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Movility: http://127.0.0.1:${server.address().port}`);
  console.log('Administración local (/admin): admin / ' + admin);
});
