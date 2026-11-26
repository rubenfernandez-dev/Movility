import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createServer, request as httpsRequest } from 'node:https';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { createInterface } from 'node:readline';
import { DatabaseSync } from 'node:sqlite';
import { stagingEnvironment } from './staging.mjs';

const temp = mkdtempSync(join(tmpdir(), 'movility-pilot-'));
const database = join(temp, 'staging.sqlite');
const recovered = join(temp, 'restore', 'staging.sqlite');
const certificate = join(temp, 'local.crt');
const key = join(temp, 'local.key');
const inherited = Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith('MOVILITY_')));
const adminPassword = randomBytes(24).toString('hex');
const visitor = 'movility_rehearsal=' + randomBytes(24).toString('hex');
const admin = 'Basic ' + Buffer.from('admin:' + adminPassword).toString('base64');
let proxy, upstream, child;
const log = message => console.log('OK ' + message);
const check = (status, response) => assert.equal(response.status, status);

async function stopApp() {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const stopped = once(child, 'exit');
  child.kill();
  await stopped;
}

try {
  execFileSync(process.env.MOVILITY_REHEARSAL_OPENSSL || 'openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', key, '-out', certificate,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const ca = readFileSync(certificate);
  proxy = createServer({ key: readFileSync(key), cert: ca }, (req, res) => {
    if (!req.headers.cookie?.split(/;\s*/).includes(visitor)) {
      res.writeHead(403, { 'X-Robots-Tag': 'noindex, nofollow', 'Cache-Control': 'no-store' });
      res.end('Acceso privado');
      return;
    }
    if (!upstream) { res.writeHead(503).end(); return; }
    const headers = { ...req.headers };
    delete headers.cookie;
    const cookies = req.headers.cookie.split(/;\s*/).filter(cookie => cookie !== visitor);
    if (cookies.length) headers.cookie = cookies.join('; ');
    const request = httpRequest(upstream + req.url, { method: req.method, headers }, response => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    });
    request.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.pipe(request);
  });
  proxy.listen(0, '127.0.0.1');
  await once(proxy, 'listening');
  const origin = 'https://127.0.0.1:' + proxy.address().port;
  console.log('Piloto temporal por HTTPS en el puerto ' + proxy.address().port);
  const env = stagingEnvironment(database, 0, {
    ...inherited, MOVILITY_STAGING_ORIGIN: origin, MOVILITY_STAGING_ADMIN_PASSWORD: adminPassword,
    MOVILITY_STAGING_PAYMENT_MODE: 'simulated', MOVILITY_STAGING_EMAIL_MODE: 'simulated', MOVILITY_STAGING_PUSH_MODE: 'simulated',
  });
  const start = async file => {
    child = spawn(process.execPath, ['server.mjs'], {
      env: { ...env, MOVILITY_DB: file }, stdio: ['ignore', 'pipe', 'inherit'],
    });
    const lines = createInterface({ input: child.stdout });
    const [line] = await Promise.race([once(lines, 'line'), once(child, 'exit').then(([code]) => {
      throw new Error('No arrancó preproducción: ' + code);
    })]);
    upstream = line.split(' ')[1];
  };
  const call = async (path, { privateAccess = true, auth = false, cookies = '', payload, image } = {}) => {
    const headers = {};
    const cookie = [privateAccess ? visitor : '', cookies].filter(Boolean).join('; ');
    if (cookie) headers.Cookie = cookie;
    if (auth) headers.Authorization = admin;
    let body;
    if (image) {
      const upload = new FormData();
      upload.set('kind', 'front');
      upload.set('file', new Blob([image], { type: 'image/jpeg' }), 'pilot.jpg');
      const encoded = new Response(upload);
      headers['Content-Type'] = encoded.headers.get('content-type');
      body = Buffer.from(await encoded.arrayBuffer());
    } else if (payload) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      body = Buffer.from(new URLSearchParams(payload).toString());
    }
    if (body) { headers.Origin = origin; headers['Content-Length'] = body.length; }
    return new Promise((resolve, reject) => {
      const req = httpsRequest(origin + path, { ca, headers, method: body ? 'POST' : 'GET', timeout: 5000 }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          const bytes = Buffer.concat(chunks);
          resolve({ status: res.statusCode, headers: res.headers, bytes, text: bytes.toString('utf8'),
            cookies: (res.headers['set-cookie'] || []).map(value => value.split(';')[0]).join('; ') });
        });
      });
      req.on('timeout', () => req.destroy(new Error('Timeout ' + path)));
      req.on('error', reject);
      req.end(body);
    });
  };

  await start(database);
  const verify = execFileSync(process.execPath, ['ops/verify-staging.mjs', upstream], { encoding: 'utf8', timeout: 10000 });
  assert.match(verify, /panel protegido sin credenciales/);
  for (const locale of ['de-CH', 'fr-CH']) {
    check(403, await call('/' + locale, { privateAccess: false }));
    const home = await call('/' + locale);
    check(200, home);
    assert.match(home.headers['x-robots-tag'], /noindex/);
    assert.match(home.text, /qa-chair/);
  }
  check(403, await call('/admin', { privateAccess: false, auth: true }));
  const challenge = await call('/admin');
  check(401, challenge);
  assert.match(challenge.headers['www-authenticate'], /^Basic/);
  check(200, await call('/admin', { auth: true }));
  check(403, await call('/assets/movility-one.jpg', { privateAccess: false }));
  log('certificado verificado, acceso privado, credencial independiente de /admin y noindex en DE/FR');

  check(303, await call('/admin/shipping', { auth: true, payload: { mode: 'fixed', amount: '12.50', revision: '0' } }));
  const photo = readFileSync(new URL('../assets/movility-one.jpg', import.meta.url));
  check(303, await call('/admin/models/qa-chair/content/upload', { auth: true, image: photo }));
  const photoPath = '/assets/models/qa-chair.jpg';
  assert.deepEqual((await call(photoPath)).bytes, photo);
  const buy = async (locale, route, expected, cookies = '') => {
    const checkout = await call(route, { cookies });
    check(200, checkout);
    const hidden = name => checkout.text.match(new RegExp('name="' + name + '" value="([^"]*)"'))?.[1].replaceAll('&quot;', '"');
    assert.equal(Number(hidden('quotedPrice')), expected);
    assert.equal(hidden('shippingQuote'), 'fixed:1250');
    assert.match(checkout.text, locale === 'de-CH' ? /Zwischensumme[\s\S]*Versand/ : /Sous-total[\s\S]*Livraison/);
    const result = await call(route.split('?')[0], { cookies, payload: {
      id: hidden('id'), model: hidden('model') || '', cartQuote: hidden('cartQuote') || '',
      quotedPrice: hidden('quotedPrice'), shippingQuote: hidden('shippingQuote'),
      name: 'Client Test', street: 'Rue de test 1', zip: '1201', city: 'Genève', country: 'CH',
      email: locale + '@example.test', method: 'Visa', result: 'paid',
    } });
    check(303, result);
    assert.ok(result.headers['set-cookie'].some(value => value.includes('Secure')));
    const path = result.headers.location;
    const order = await call(path, { cookies: result.cookies });
    check(200, order);
    const total = new Intl.NumberFormat(locale, { style: 'currency', currency: 'CHF' }).format(expected / 100);
    assert.ok(order.text.includes(total));
    return { id: path.split('/').at(-1), path, locale, total, cookies: result.cookies };
  };
  const german = await buy('de-CH', '/de-CH/checkout?model=one', 251150);
  let basket = '';
  for (const sku of ['qa-chair', 'qa-bag']) {
    const result = await call('/fr-CH/cart', { cookies: basket, payload: { action: 'add', sku } });
    check(303, result);
    basket = result.cookies;
  }
  const french = await buy('fr-CH', '/fr-CH/checkout/cart', 194150, basket);
  log('compra directa DE de CHF 2’511.50 y carrito mixto FR de CHF 1’941.50, con CHF 12.50 una vez');

  check(303, await call('/admin/' + french.id + '/ship', { auth: true, payload: {
    tracking: 'PILOT-CH-01', 'serial_qa-chair': 'PILOT-SERIE-01',
  } }));
  check(303, await call('/admin/' + french.id + '/tracking', { auth: true, payload: {
    eventId: randomUUID(), status: 'transit',
  } }));
  const shipped = await call(french.path, { cookies: french.cookies });
  const trackingPath = shipped.text.match(/href="(\/fr-CH\/shipment\/[^"]+)"/)[1];
  const tracking = await call(trackingPath);
  check(200, tracking);
  assert.match(tracking.text, /PILOT-CH-01[\s\S]*En transit/);
  check(403, await call(trackingPath, { privateAccess: false }));
  check(303, await call('/admin/mail/process', { auth: true, payload: {} }));
  for (const order of [german, french]) {
    const detail = await call('/admin/orders/' + order.id, { auth: true });
    check(200, detail);
    const mail = await call('/admin/' + order.id + '/email/paid', { auth: true });
    assert.match(mail.text, order.locale === 'de-CH' ? /Mobility · Bestellung bestätigt/ : /Mobility · Commande confirmée/);
    assert.ok(mail.text.includes(origin + order.path));
    assert.ok(mail.text.includes(order.total));
    assert.match(mail.text, /Aceptado en simulación/);
  }
  const shipMail = await call('/admin/' + french.id + '/email/shipped', { auth: true });
  assert.match(shipMail.text, /Commande expédiée/);
  assert.ok(shipMail.text.includes(origin + trackingPath));
  log('correo simulado aceptado en ambos idiomas, expedición FR y seguimiento HTTPS en tránsito');

  const verifyStock = file => {
    const db = new DatabaseSync(file, { readOnly: true });
    try {
      assert.equal(db.prepare('SELECT units FROM stock WHERE id=1').get().units, 0);
      for (const [sku, units] of [['qa-chair', 0], ['qa-bag', 2]]) {
        assert.equal(db.prepare('SELECT units FROM extra_models WHERE sku=?').get(sku).units, units);
      }
      assert.equal(db.prepare('SELECT COUNT(*) AS total FROM orders').get().total, 2);
    } finally { db.close(); }
  };
  verifyStock(database);
  const inventory = await call('/admin/inventory.csv', { auth: true });
  check(200, inventory);
  assert.match(inventory.text, /qa-chair/);
  const serial = await call('/admin/serials?serial=PILOT-SERIE-01', { auth: true });
  assert.match(serial.text, /PILOT-SERIE-01/);
  await stopApp();
  const cli = (action, ...args) => execFileSync(process.execPath, ['ops/database.mjs', action, ...args], {
    env: { ...inherited, MOVILITY_DB: database }, encoding: 'utf8', timeout: 10000,
  }).trim();
  const printed = cli('backup-volume', join(temp, 'backups'));
  const backup = printed.match(/^Copia verificada: (.+)$/)?.[1];
  assert.ok(backup, 'La copia debe devolver una ruta verificable');
  cli('restore-volume', backup, recovered);
  await start(recovered);
  verifyStock(recovered);
  const restored = await call(french.path, { cookies: french.cookies });
  check(200, restored);
  assert.ok(restored.text.includes(french.total));
  assert.match(restored.text, /Commande expédiée/);
  assert.match((await call(trackingPath)).text, /PILOT-CH-01[\s\S]*En transit/);
  assert.match((await call('/admin/orders/' + french.id, { auth: true })).text, /PILOT-SERIE-01/);
  assert.equal((await call('/admin/inventory.csv', { auth: true })).text, inventory.text);
  assert.deepEqual((await call(photoPath)).bytes, photo);
  const restoredMail = await call('/admin/' + french.id + '/email/shipped', { auth: true });
  assert.match(restoredMail.text, /Aceptado en simulación/);
  log('restauración en ruta nueva: pedido, stock e historial, serie, seguimiento, correo y foto idéntica');
} finally {
  await stopApp();
  if (proxy?.listening) { proxy.close(); await once(proxy, 'close'); }
  const resolved = realpathSync(temp);
  if (dirname(resolved) === realpathSync(tmpdir()) && basename(resolved).startsWith('movility-pilot-')) {
    rmSync(resolved, { recursive: true, force: true });
  }
}
