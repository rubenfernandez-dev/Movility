import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { test } from 'node:test';
import { createHmac, randomUUID } from 'node:crypto';
import { copyFileSync, mkdtempSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { setupAccounting, accountingData, accountingFilters } from './accounting.mjs';

test('accounting import keeps unknown dates and is safe to repeat', () => {
  const ledger = new DatabaseSync(':memory:');
  try {
    ledger.exec(`CREATE TABLE orders (id TEXT PRIMARY KEY, method TEXT, cents INTEGER, status TEXT);
      CREATE TABLE stock_movements (order_id TEXT, reason TEXT, occurred_at TEXT);
      INSERT INTO orders VALUES ('legacy', 'Visa', 12345, 'refunded');
      INSERT INTO stock_movements VALUES ('legacy', 'order', '2026-11-22T23:59:59.000Z');`);
    setupAccounting(ledger);
    setupAccounting(ledger);
    const all = accountingData(ledger, accountingFilters(new URLSearchParams()));
    assert.deepEqual([all.count, all.captures, all.refunds, all.undated], [2, 12345, 12345, 1]);
    const day = accountingData(ledger, accountingFilters(new URLSearchParams('from=2026-11-22&to=2026-11-22')));
    assert.deepEqual([day.count, day.captures, day.refunds], [1, 12345, 0]);
  } finally {
    ledger.close();
  }
});

test('French checkout, concurrent stock, shipment and idempotent refund', { timeout: 15000 }, async (t) => {
  const carrierSecret = 'carrier-integration-fixture-not-a-real-secret';
  const media = mkdtempSync(join(tmpdir(), 'movility-media-'));
  writeFileSync(join(media, 'movility-one.mp4'), '0123456789');
  writeFileSync(join(media, 'movility-one.fr-CH.vtt'), 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nExemple\n');
  writeFileSync(join(media, 'movility-one.fr-CH.txt'), 'Transcription de test');
  copyFileSync(new URL('./assets/movility-one.glb', import.meta.url), join(media, 'alpine.glb'));
  copyFileSync(new URL('./assets/movility-one.jpg', import.meta.url), join(media, 'alpine.jpg'));
  copyFileSync(new URL('./assets/movility-one-side.jpg', import.meta.url), join(media, 'alpine.side.jpg'));
  writeFileSync(join(media, 'alpine.mp4'), 'alpine-demo-video');
  writeFileSync(join(media, 'alpine.fr-CH.vtt'), 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nAlpine\n');
  writeFileSync(join(media, 'alpine.fr-CH.txt'), 'Transcription Alpine');
  writeFileSync(join(media, 'alpine.de-CH.vtt'), 'invalid');
  writeFileSync(join(media, 'alpine.de-CH.txt'), 'Alpine Transkript');
  const processHandle = spawn(process.execPath, ['server.mjs'], {
    env: {
      ...process.env, PORT: '0', MOVILITY_DB: ':memory:', MOVILITY_ADMIN_PASSWORD: 'local-test',
      CODESPACES: 'true', CODESPACE_NAME: 'movility-test', GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev',
      MOVILITY_MEDIA_DIR: media, MOVILITY_PUBLIC_ORIGIN: 'https://movility.example',
      MOVILITY_WAREHOUSE_PASSWORD: 'warehouse-fixture', MOVILITY_SUPPORT_PASSWORD: 'support-fixture',
      MOVILITY_FINANCE_PASSWORD: 'finance-fixture',
      MOVILITY_EMAIL_WORKER: 'manual',
      MOVILITY_CARRIER_SECRET: carrierSecret,
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  t.after(async () => {
    if (processHandle.exitCode === null && processHandle.signalCode === null) {
      const exited = once(processHandle, 'exit');
      processHandle.kill();
      await exited;
    }
    for (const name of ['movility-one.mp4', 'movility-one.fr-CH.vtt', 'movility-one.fr-CH.txt',
      'alpine.glb', 'alpine.jpg', 'alpine.side.jpg', 'alpine.mp4',
      'alpine.fr-CH.vtt', 'alpine.fr-CH.txt', 'alpine.de-CH.vtt', 'alpine.de-CH.txt']) {
      rmSync(join(media, name), { force: true });
    }
    rmdirSync(media);
  });
  const lines = createInterface({ input: processHandle.stdout });
  const [startup] = await once(lines, 'line');
  const base = startup.split(' ')[1];
  const auth = 'Basic ' + Buffer.from('admin:local-test').toString('base64');
  const roleHeaders = role => ({ Authorization: 'Basic ' + Buffer.from(role + ':' + role + '-fixture').toString('base64') });
  const checkout = '/fr-CH/checkout';
  const get = (path, headers) => fetch(base + path, { headers, redirect: 'manual' });
  const post = (path, fields, headers) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(fields), headers: { Origin: base, ...headers }, redirect: 'manual',
  });
  const fields = async (method, sku = '') => {
    const html = await (await get(checkout + (sku ? '?model=' + sku : ''))).text();
    const [, id] = html.match(/name="id" value="([^"]+)"/);
    const [, quotedPrice] = html.match(/name="quotedPrice" value="([^"]+)"/);
    return {
      id, quotedPrice, email: 'demo@example.com', name: 'Client Démo', street: 'Route de Test 1', zip: '1201',
      city: 'Genève', method, result: 'paid', ...(sku ? { model: sku } : {}),
    };
  };

  assert.match(await (await get('/de-CH')).text(), /Mobilität, die zu dir passt/);
  assert.match(await (await get('/fr-CH/movility-one')).text(), /\/de-CH\/movility-one/);
  const side = await get('/fr-CH/movility-one?view=side');
  assert.equal(side.headers.get('x-robots-tag'), 'noindex, nofollow');
  const gallery = await side.text();
  assert.match(gallery, /rel="canonical" href="https:\/\/movility\.example\/fr-CH\/movility-one"/);
  assert.match(gallery, /hreflang="de-CH" href="https:\/\/movility\.example\/de-CH\/movility-one"/);
  assert.match(gallery, /\/de-CH\/movility-one\?view=side#gallery/);
  assert.match(gallery, /aria-current="true"[\s\S]*Vue de profil/);
  assert.match(gallery, /<track kind="captions" srclang="fr-CH"/);
  assert.match(gallery, /movility-one.fr-CH.txt/);
  assert.doesNotMatch(await (await get('/de-CH/movility-one')).text(), /<video /);
  assert.match(await (await get('/sitemap.xml')).text(), /<loc>https:\/\/movility\.example\/fr-CH\/compare<\/loc>/);
  const segment = await get('/assets/movility-one.mp4', { Range: 'bytes=2-5' });
  assert.equal(segment.status, 206);
  assert.equal(segment.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await segment.text(), '2345');
  assert.equal((await get('/assets/movility-one.mp4', { Range: 'bytes=10-12' })).status, 416);
  const comparison = await (await get('/fr-CH/compare?first=one&second=tour')).text();
  assert.match(comparison, /Movility One \/ Movility Tour/);
  assert.match(comparison, /\/de-CH\/compare\?first=one&amp;second=tour/);
  assert.match(await (await get('/de-CH/compare?first=one&second=one')).text(), /zwei verschiedene Modelle/);
  assert.match(await (await get('/fr-CH/movility-one/3d')).text(), /<model-viewer/);
  const glb = await get('/assets/movility-one.glb');
  assert.equal(glb.headers.get('content-type'), 'model/gltf-binary');
  const glbBytes = Buffer.from(await glb.arrayBuffer());
  assert.equal(glbBytes.toString('ascii', 0, 4), 'glTF');
  assert.equal(glbBytes.readUInt32LE(8), glbBytes.length);
  assert.match(await (await get('/de-CH/cart')).text(), /Warenkorb ist leer/);
  assert.equal((await get('/site.css')).headers.get('content-type'), 'text/css; charset=utf-8');
  assert.equal((await get('/assets/movility-one.jpg')).headers.get('content-type'), 'image/jpeg');
  assert.equal((await get('/admin')).status, 401);
  const failedPayment = { ...await fields('Visa'), result: 'failed' };
  assert.equal((await post(checkout, { ...failedPayment, zip: '12345' })).status, 400);
  assert.equal((await post(checkout, failedPayment, { Origin: 'https://other-0.app.github.dev' })).status, 403);
  const preview = { Origin: 'https://movility-test-0.app.github.dev' };
  assert.match(await (await post(checkout, failedPayment, preview)).text(), /a échoué/);
  const headers = { Authorization: auth };
  const warehouse = roleHeaders('warehouse');
  const support = roleHeaders('support');
  const finance = roleHeaders('finance');
  assert.equal((await get('/admin/models', warehouse)).status, 403);
  assert.equal((await get('/admin/inventory.csv', warehouse)).status, 200);
  assert.equal((await get('/admin/accounting.csv', warehouse)).status, 403);
  assert.equal((await get('/admin/inventory.csv', finance)).status, 403);
  assert.equal((await get('/admin/accounting.csv', finance)).status, 200);
  assert.equal((await get('/admin/accounting', support)).status, 403);
  assert.equal((await post('/admin/restock', {}, warehouse)).status, 403);
  const edit = { expectedUnits: '1', expectedPrice: '249900', price: '2599,90', units: '1',
    descriptionDe: 'Neuer Testtext', descriptionFr: 'Description révisée <test>' };
  const panel = await get('/admin', headers);
  assert.equal(panel.headers.get('referrer-policy'), 'same-origin');
  const invalidEdit = await post('/admin/catalog', { ...edit, price: 'abc' }, headers);
  assert.equal(invalidEdit.status, 400);
  assert.match(await invalidEdit.text(), /value="abc"/);
  const saved = await post('/admin/catalog', edit, headers);
  assert.equal(saved.status, 303);
  assert.match(await (await get(saved.headers.get('location'), headers)).text(), /Cambios guardados/);
  assert.equal((await post('/admin/catalog', edit, headers)).status, 409);
  assert.match(await (await get('/fr-CH/movility-one')).text(), /Description révisée &lt;test&gt;/);
  const stale = await post(checkout, { ...failedPayment, result: 'paid' });
  assert.equal(stale.status, 409);
  assert.match(await stale.text(), /Le prix a changé/);
  const candidates = await Promise.all([fields('TWINT'), fields('PayPal')]);
  const results = await Promise.all(candidates.map((candidate) => post(checkout, candidate)));
  assert.deepEqual(results.map(({ status }) => status).sort(), [303, 409]);
  const winner = results.findIndex(({ status }) => status === 303);
  const orderPath = results[winner].headers.get('location');
  assert.match(await (await get(orderPath)).text(), /Paiement de test confirmé/);
  assert.equal((await post(checkout, candidates[winner])).headers.get('location'), orderPath);

  const orderId = candidates[winner].id;
  const emailPath = (kind) => `/admin/${orderId}/email/${kind}`;
  assert.equal((await get(emailPath('paid'))).status, 401);
  assert.equal((await get(emailPath('shipped'), headers)).status, 404);
  const confirmation = await (await get(emailPath('paid'), headers)).text();
  assert.match(confirmation, /Movility · Commande confirmée/);
  assert.match(confirmation, /demo@example\.com/);
  assert.match(confirmation, /Pendiente · 0 intentos/);
  assert.equal((await get('/admin/mail', finance)).status, 403);
  assert.equal((await post('/admin/mail/process', {}, support)).status, 403);
  assert.doesNotMatch(await (await get('/admin/mail', support)).text(), /Procesar cola ahora/);
  assert.equal((await post('/admin/mail/process', {}, headers)).status, 303);
  assert.equal((await post('/admin/mail/process', {}, headers)).status, 303);
  assert.match(await (await get(emailPath('paid'), support)).text(), /Aceptado en simulación · 1 intentos/);
  assert.match(confirmation, /599\.90/);
  assert.match(confirmation, new RegExp(orderPath));
  assert.equal((await get(emailPath('paid'), support)).status, 200);
  assert.equal((await get(emailPath('paid'), finance)).status, 403);
  assert.equal((await get(emailPath('paid'), warehouse)).status, 403);
  const warehouseOrders = await (await get('/admin', warehouse)).text();
  assert.match(warehouseOrders, /1201 Genève/);
  assert.doesNotMatch(warehouseOrders, /demo@example\.com|Reembolsar en la simulación|Neto/);
  const supportOrders = await (await get('/admin', support)).text();
  assert.match(supportOrders, /demo@example\.com/);
  assert.doesNotMatch(supportOrders, /1201 Genève|Registrar envío|Reembolsar en la simulación/);
  const financeOrders = await (await get('/admin', finance)).text();
  assert.match(financeOrders, /Reembolsar en la simulación/);
  assert.doesNotMatch(financeOrders, /1201 Genève|demo@example\.com|Registrar envío/);
  assert.equal((await post(`/admin/${orderId}/refund`, {}, warehouse)).status, 403);
  assert.equal((await post(`/admin/${orderId}/ship`, { tracking: 'CH-DEMO-1' }, headers)).status, 409);
  const firstShip = { tracking: 'CH-DEMO-1', serial_one: 'one-demo-01' };
  assert.equal((await post(`/admin/${orderId}/ship`, firstShip, support)).status, 403);
  assert.equal((await post(`/admin/${orderId}/ship`, firstShip, finance)).status, 403);
  assert.equal((await post(`/admin/${orderId}/ship`, firstShip, warehouse)).status, 303);
  assert.equal((await post(`/admin/${orderId}/ship`, firstShip, headers)).status, 303);
  assert.match(await (await get(orderPath)).text(), /CH-DEMO-1/);
  const trackingPath = `/admin/${orderId}/tracking`;
  const simulated = { eventId: randomUUID(), status: 'transit' };
  assert.equal((await post(trackingPath, simulated, finance)).status, 403);
  assert.equal((await post(trackingPath, simulated, warehouse)).status, 303);
  assert.equal((await post(trackingPath, simulated, warehouse)).status, 303);
  assert.equal((await post(trackingPath, { ...simulated, status: 'exception' }, warehouse)).status, 409);
  assert.match(await (await get(orderPath)).text(), /En transit/);
  const event = {
    eventId: 'carrier-1', orderId, tracking: 'CH-DEMO-1', status: 'delivered', occurredAt: new Date().toISOString(),
  };
  const signed = (payload, timestamp = String(Math.floor(Date.now() / 1000)), secret = carrierSecret) => {
    const body = JSON.stringify(payload);
    const digest = createHmac('sha256', secret).update(timestamp + '.').update(body).digest('hex');
    return fetch(base + '/integrations/carrier/events', { method: 'POST', body, headers: {
      'Content-Type': 'application/json', 'X-Movility-Timestamp': timestamp, 'X-Movility-Signature': 'sha256=' + digest,
    } });
  };
  assert.equal((await signed(event, '1700000000')).status, 401);
  assert.equal((await signed(event, undefined, 'bad-key')).status, 401);
  assert.equal((await signed({ ...event, tracking: 'wrong' })).status, 422);
  assert.deepEqual(await (await signed(event)).json(), { result: 'applied' });
  assert.deepEqual(await (await signed(event)).json(), { result: 'duplicate' });
  assert.equal((await signed({ ...event, status: 'exception' })).status, 409);
  assert.equal((await signed({ ...event, eventId: 'carrier-2', status: 'exception' })).status, 200);
  assert.equal((await signed({ ...event, eventId: 'carrier-3' })).status, 200);
  assert.match(await (await get(orderPath)).text(), /<h1 class="page-title">Commande livrée/);
  assert.match(await (await get(emailPath('delivered'), support)).text(), /Movility · Commande livrée/);
  const trackingOrders = await (await get('/admin', support)).text();
  assert.equal(trackingOrders.match(new RegExp('/admin/' + orderId + '/email/delivered', 'g'))?.length, 1);
  for (let i = 0; i < 2; i++) {
    assert.equal((await post(`/admin/${orderId}/refund`, {}, headers)).status, 303);
  }
  const admin = await (await get('/admin', headers)).text();
  assert.match(admin, /Unidades disponibles: 0 · Pedidos: 1/);
  assert.match(admin, /1201 Genève/);
  assert.match(admin, /Desglose por forma de pago/);
  assert.match(admin, new RegExp('<th scope="row">' + candidates[winner].method + '</th><td>1</td>'));
  assert.equal(admin.match(/Paiement de test remboursé/g)?.length, 1);
  assert.match(await (await get(emailPath('shipped'), headers)).text(), /Numéro de suivi: CH-DEMO-1/);
  assert.match(await (await get(emailPath('refunded'), headers)).text(), /Movility · Paiement remboursé/);
  assert.doesNotMatch(await (await get(emailPath('paid'), headers)).text(), /CH-DEMO-1/);
  assert.match(await (await get('/admin?status=paid', headers)).text(), /No hay pedidos con este estado/);
  assert.match(await (await get('/admin?status=refunded', headers)).text(), /1201 Genève/);
  assert.match(await (await get(orderPath)).text(), /Paiement de test remboursé/);
  assert.equal((await post('/admin/restock', {}, headers)).status, 303);
  assert.equal((await post('/admin/restock', {}, headers)).status, 303);
  assert.match(await (await get('/admin', headers)).text(), /Unidades disponibles: 1 · Pedidos: 1/);
  assert.equal((await post('/admin/catalog', { ...edit, expectedPrice: '259990', price: '999' }, headers)).status, 303);
  assert.match(await (await get(orderPath)).text(), /599\.90/);
  const model = { sku: 'alpine', name: 'Movility Alpine', price: '3199', units: '1',
    active: '1', description_de: 'Testmodell für den Alltag', description_fr: 'Modèle de test',
    width: '60', weight: '28', range: '24', fold: '1' };
  assert.equal((await post('/admin/models', model, headers)).status, 303);
  assert.equal((await post('/admin/models', model, headers)).status, 409);
  assert.match(await (await get('/fr-CH/models/alpine')).text(), /Modèle de test/);
  assert.match(await (await get('/fr-CH/models/alpine')).text(), /\/assets\/models\/alpine.jpg/);
  const alpineMedia = await (await get('/fr-CH/models/alpine?view=side')).text();
  assert.match(alpineMedia, /src="\/assets\/models\/alpine\.side\.jpg" alt="Vue de profil/);
  assert.match(alpineMedia, /\/de-CH\/models\/alpine\?view=side#gallery/);
  assert.match(alpineMedia, /src="\/assets\/models\/alpine.fr-CH.vtt"/);
  assert.match(alpineMedia, /href="\/assets\/models\/alpine.fr-CH.txt"/);
  assert.doesNotMatch(await (await get('/de-CH/models/alpine')).text(), /<video /);
  assert.equal((await get('/assets/models/alpine.de-CH.vtt')).status, 404);
  const alpineVideo = await get('/assets/models/alpine.mp4', { Range: 'bytes=0-5' });
  assert.equal(alpineVideo.status, 206);
  assert.equal(await alpineVideo.text(), 'alpine');
  assert.match(await (await get('/fr-CH/models/alpine/3d')).text(), /\/assets\/models\/alpine.glb/);
  assert.equal((await get('/assets/models/alpine.glb')).headers.get('content-type'), 'model/gltf-binary');
  assert.match(await (await get('/de-CH')).text(), /Movility Alpine/);
  assert.match(await (await get('/fr-CH/compare?first=alpine&second=one')).text(), /Movility Alpine \/ Movility One/);
  const extra = await Promise.all([fields('Visa', 'alpine'), fields('PayPal', 'alpine')]);
  const extraResults = await Promise.all(extra.map(candidate => post(checkout, candidate)));
  assert.deepEqual(extraResults.map(({ status }) => status).sort(), [303, 409]);
  const extraOrder = extraResults.find(({ status }) => status === 303).headers.get('location');
  assert.match(await (await get(extraOrder)).text(), /Movility Alpine/);
  assert.equal((await post('/admin/models/alpine', { ...model, revision: '0', active: '0' }, headers)).status, 409);
  assert.equal((await post('/admin/models/alpine', { ...model, revision: '1', name: 'Alpine édition 2', units: '0', active: '0' }, headers)).status, 303);
  assert.equal((await get('/fr-CH/models/alpine')).status, 404);
  assert.equal((await get('/assets/models/alpine.glb')).status, 404);
  assert.equal((await get('/assets/models/alpine.mp4')).status, 404);
  assert.equal((await get('/fr-CH/checkout?model=alpine')).status, 409);
  assert.doesNotMatch(await (await get('/fr-CH/compare')).text(), /Alpine/);
  assert.match(await (await get(extraOrder)).text(), /Movility Alpine/);
  assert.equal((await post('/admin/' + extraOrder.split('/').at(-1) + '/refund', {}, headers)).status, 303);
  assert.match(await (await get('/admin/models', headers)).text(), /Archivad[o] · 1 ud\./);
  assert.equal((await post('/admin/models/alpine', { ...model, revision: '3', units: '2' }, headers)).status, 303);

  let cookie = '';
  const cartHeaders = () => cookie ? { Cookie: cookie } : {};
  const mutateCart = async (action, sku, quantity = '') => {
    const response = await post('/fr-CH/cart', { action, sku, quantity }, cartHeaders());
    assert.equal(response.status, 303);
    cookie = response.headers.get('set-cookie').split(';')[0];
  };
  await mutateCart('add', 'one');
  await mutateCart('add', 'alpine');
  await mutateCart('remove', 'alpine');
  await mutateCart('add', 'alpine');
  await mutateCart('update', 'alpine', '2');
  const basket = await (await get('/de-CH/cart', cartHeaders())).text();
  assert.match(basket, /Movility One/);
  assert.match(basket, /Movility Alpine/);
  assert.match(basket, /Warenkorb \(3\)/);
  assert.match(basket, /name="quantity"[^>]*value="2"/);
  assert.match(basket, /\/de-CH\/checkout\/cart/);
  const basketCheckout = '/fr-CH/checkout/cart';
  const quote = async () => {
    const html = await (await get(basketCheckout, cartHeaders())).text();
    return {
      id: html.match(/name="id" value="([^"]+)"/)[1],
      cartQuote: html.match(/name="cartQuote" value="([^"]+)"/)[1].replaceAll('&quot;', '"'),
      email: 'basket@example.com', name: 'Client Demo', street: 'Rue de Test 1',
      zip: '1201', city: 'Genève', method: 'TWINT', result: 'paid',
    };
  };
  const staleBasket = await quote();
  assert.equal((await post('/admin/catalog', { ...edit, expectedPrice: '99900', price: '1099' }, headers)).status, 303);
  const revised = await post(basketCheckout, staleBasket, cartHeaders());
  assert.equal(revised.status, 409);
  assert.match(await revised.text(), /un prix a changé/);
  const baskets = await Promise.all([quote(), quote()]);
  const purchases = await Promise.all(baskets.map(value => post(basketCheckout, value, cartHeaders())));
  assert.deepEqual(purchases.map(({ status }) => status).sort(), [303, 409]);
  const winningIndex = purchases.findIndex(({ status }) => status === 303);
  const winningBasket = purchases[winningIndex];
  assert.match(winningBasket.headers.get('set-cookie'), /Max-Age=0/);
  const basketOrder = winningBasket.headers.get('location');
  assert.equal((await post(basketCheckout, baskets[winningIndex])).headers.get('location'), basketOrder);
  const summary = await (await get(basketOrder)).text();
  assert.match(summary, /1 × Movility One/);
  assert.match(summary, /2 × Movility Alpine/);
  const basketOrderId = basketOrder.split('/').at(-1);
  assert.match(await (await get(`/admin/${basketOrderId}/email/paid`, headers)).text(), /2 × Movility Alpine/);
  assert.equal((await post(`/admin/${basketOrderId}/refund`, {}, finance)).status, 303);
  assert.equal((await post(`/admin/${basketOrderId}/refund`, {}, headers)).status, 303);
  assert.match(await (await get('/admin', headers)).text(), /Unidades disponibles: 1/);
  assert.match(await (await get('/admin/models', headers)).text(), /Publicado · 2 ud\./);
  assert.equal((await get('/admin/inventory.csv')).status, 401);
  const audit = await (await get('/admin/inventory?sku=alpine', headers)).text();
  assert.match(audit, /Saldo inicial/);
  assert.match(audit, /Reembolso antes del envío/);

  const shippedBasket = await post(basketCheckout, await quote(), cartHeaders());
  assert.equal(shippedBasket.status, 303);
  const shippedId = shippedBasket.headers.get('location').split('/').at(-1);
  const actionPath = action => `/admin/${shippedId}/${action}`;
  const firstReceipt = { receipt: randomUUID(), sku: 'alpine', serial: 'alpine-01', disposition: 'restock' };
  assert.equal((await post(actionPath('return'), firstReceipt, headers)).status, 409);
  const shipment = { tracking: 'CH-STOCK-2', serial_one: 'ONE-DEMO-02', serial_alpine: 'ALPINE-01\nALPINE-02' };
  assert.equal((await post(actionPath('ship'), { ...shipment, serial_one: 'ONE-DEMO-01' }, headers)).status, 409);
  assert.equal((await post(actionPath('ship'), { ...shipment, serial_alpine: 'ALPINE-01\nalpine-01' }, headers)).status, 409);
  assert.equal((await post(actionPath('ship'), shipment, headers)).status, 303);
  assert.equal((await post(actionPath('return'), { ...firstReceipt, serial: 'ONE-DEMO-02' }, headers)).status, 409);
  assert.equal((await post(actionPath('return'), firstReceipt, headers)).status, 303);
  assert.equal((await post(actionPath('return'), firstReceipt, headers)).status, 303);
  assert.equal((await post(actionPath('return'), { ...firstReceipt, receipt: randomUUID(), quantity: '2' }, headers)).status, 409);
  assert.equal((await post(actionPath('return'), { ...firstReceipt, receipt: randomUUID(), serial: 'ALPINE-02', disposition: 'hold' }, headers)).status, 303);
  assert.equal((await post(actionPath('refund'), {}, headers)).status, 303);
  assert.match(await (await get('/admin', headers)).text(), /Recibidas: 2 de 2 · Repuestas: 1 · En revisión: 1/);
  assert.match(await (await get('/admin', headers)).text(), /Unidades disponibles: 0/);
  assert.equal((await post(actionPath('return'), { ...firstReceipt, receipt: randomUUID(), sku: 'one', serial: 'ONE-DEMO-02' }, headers)).status, 303);
  assert.match(await (await get('/admin', headers)).text(), /Unidades disponibles: 1/);
  assert.match(await (await get('/admin/models', headers)).text(), /Publicado · 1 ud\./);
  const inventoryDownload = await get('/admin/inventory.csv?sku=alpine', headers);
  assert.match(inventoryDownload.headers.get('content-type'), /text\/csv/);
  const csv = await inventoryDownload.text();
  assert.equal(csv.match(/Devolución recibida y apta/g)?.length, 1);
  assert.doesNotMatch(csv, /"one"/);
  assert.equal((await get('/admin/accounting.csv')).status, 401);
  assert.equal((await get('/admin/accounting.csv?from=2026-02-30', headers)).status, 400);
  assert.match(await (await get('/admin/accounting', headers)).text(), /Conciliación de pedidos/);
  const ledger = await (await get('/admin/accounting.csv?method=TWINT', headers)).text();
  assert.match(ledger, new RegExp('"' + basketOrderId + '","Cobro","TWINT","CHF","7497.00"'));
  assert.equal(ledger.match(new RegExp('"' + basketOrderId + '","Reembolso","TWINT","CHF","-7497.00"', 'g'))?.length, 1);
  assert.doesNotMatch(ledger, /example\.com|Genève/);
  const serialHistory = await (await get('/admin', headers)).text();
  assert.match(serialHistory, /ALPINE-01<\/code> · Repuesto/);
  assert.match(serialHistory, /ALPINE-02<\/code> · En revisión/);
  const resold = await post(checkout, await fields('Visa', 'alpine'), {});
  const resoldId = resold.headers.get('location').split('/').at(-1);
  assert.equal((await post(`/admin/${resoldId}/ship`, { tracking: 'CH-RESOLD', serial_alpine: 'ALPINE-02' }, headers)).status, 409);
  assert.equal((await post(`/admin/${resoldId}/ship`, { tracking: 'CH-RESOLD', serial_alpine: 'ALPINE-01' }, headers)).status, 303);
  assert.equal((await get('/admin/serials?serial=alpine-01')).status, 401);
  const serialLookup = await (await get('/admin/serials?serial=alpine-01', headers)).text();
  assert.match(serialLookup, /CH-RESOLD/);
  assert.match(serialLookup, /CH-STOCK-2/);
  assert.match(serialLookup, /Devuelto y repuesto/);
  const funnel = '/admin/analytics';
  const count = (html, stage, n) => assert.match(html, new RegExp('<th scope="row">' + stage + '</th><td>' + n + '</td>'));
  assert.equal((await get(funnel, support)).status, 403);
  count(await (await get(funnel, finance)).text(), 'Ficha de producto', 0);
  const visit = await get('/fr-CH/movility-one');
  assert.equal(visit.headers.get('set-cookie'), null);
  assert.match(await visit.text(), /Continuer sans statistiques/);
  const reject = await post('/fr-CH/analytics', { choice: 'decline', return: '//example.com' });
  assert.equal(reject.headers.get('location'), '/fr-CH');
  const rejected = reject.headers.get('set-cookie').split(';')[0];
  await get('/fr-CH/movility-one', { Cookie: rejected });
  count(await (await get(funnel, finance)).text(), 'Ficha de producto', 0);
  const accepted = await post('/fr-CH/analytics', { choice: 'accept', return: '/fr-CH/movility-one' });
  assert.equal(accepted.headers.get('location'), '/fr-CH/movility-one');
  const analytics = accepted.headers.get('set-cookie').split(';')[0];
  await get('/fr-CH/movility-one', { Cookie: analytics });
  await get('/de-CH/movility-one', { Cookie: analytics });
  const add = await post('/de-CH/cart', { action: 'add', sku: 'one' }, { Cookie: analytics });
  const basketOnly = add.headers.get('set-cookie').split(';')[0];
  const journey = { Cookie: analytics + '; ' + basketOnly };
  const funnelCheckout = await (await get(basketCheckout, journey)).text();
  const analyticsPurchase = {
    id: funnelCheckout.match(/name="id" value="([^"]+)"/)[1],
    cartQuote: funnelCheckout.match(/name="cartQuote" value="([^"]+)"/)[1].replaceAll('&quot;', '"'),
    email: 'metrics@example.com', name: 'Client Demo', street: 'Rue de Test 1', zip: '1201',
    city: 'Genève', method: 'Visa', result: 'paid',
  };
  assert.equal((await post(basketCheckout, analyticsPurchase, journey)).status, 303);
  assert.equal((await post(basketCheckout, analyticsPurchase, journey)).status, 303);
  const french = await (await get(funnel + '?days=7&locale=fr-CH', finance)).text();
  for (const stage of ['Ficha de producto', 'Carrito', 'Inicio de pago', 'Pedido confirmado']) count(french, stage, 1);
  assert.doesNotMatch(french, /metrics@example\.com|Genève/);
  count(await (await get(funnel + '?locale=de-CH', finance)).text(), 'Ficha de producto', 0);
  assert.equal((await post('/fr-CH/analytics', { choice: 'decline', return: '/fr-CH/analytics' }, journey)).status, 303);
  await get('/fr-CH/movility-one', { Cookie: analytics });
  count(await (await get(funnel, finance)).text(), 'Ficha de producto', 0);
});
