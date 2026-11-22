import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { test } from 'node:test';
import { mkdtempSync, rmdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('French checkout, concurrent stock, shipment and idempotent refund', { timeout: 15000 }, async (t) => {
  const media = mkdtempSync(join(tmpdir(), 'movility-media-'));
  writeFileSync(join(media, 'movility-one.mp4'), '0123456789');
  writeFileSync(join(media, 'movility-one.fr-CH.vtt'), 'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nExemple\n');
  writeFileSync(join(media, 'movility-one.fr-CH.txt'), 'Transcription de test');
  const processHandle = spawn(process.execPath, ['server.mjs'], {
    env: {
      ...process.env, PORT: '0', MOVILITY_DB: ':memory:', MOVILITY_ADMIN_PASSWORD: 'local-test',
      CODESPACES: 'true', CODESPACE_NAME: 'movility-test', GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev',
      MOVILITY_MEDIA_DIR: media, MOVILITY_PUBLIC_ORIGIN: 'https://movility.example',
    },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  t.after(async () => {
    if (processHandle.exitCode === null && processHandle.signalCode === null) {
      const exited = once(processHandle, 'exit');
      processHandle.kill();
      await exited;
    }
    for (const name of ['movility-one.mp4', 'movility-one.fr-CH.vtt', 'movility-one.fr-CH.txt']) {
      rmSync(join(media, name), { force: true });
    }
    rmdirSync(media);
  });
  const lines = createInterface({ input: processHandle.stdout });
  const [startup] = await once(lines, 'line');
  const base = startup.split(' ')[1];
  const auth = 'Basic ' + Buffer.from('admin:local-test').toString('base64');
  const checkout = '/fr-CH/checkout';
  const get = (path, headers) => fetch(base + path, { headers, redirect: 'manual' });
  const post = (path, fields, headers) => fetch(base + path, {
    method: 'POST', body: new URLSearchParams(fields), headers: { Origin: base, ...headers }, redirect: 'manual',
  });
  const fields = async (method) => {
    const html = await (await get(checkout)).text();
    const [, id] = html.match(/name="id" value="([^"]+)"/);
    const [, quotedPrice] = html.match(/name="quotedPrice" value="([^"]+)"/);
    return {
      id, quotedPrice, email: 'demo@example.com', name: 'Client Démo', street: 'Route de Test 1', zip: '1201',
      city: 'Genève', method, result: 'paid',
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
  const model = Buffer.from(await glb.arrayBuffer());
  assert.equal(model.toString('ascii', 0, 4), 'glTF');
  assert.equal(model.readUInt32LE(8), model.length);
  assert.match(await (await get('/de-CH/cart')).text(), /\/de-CH\/checkout/);
  assert.equal((await get('/site.css')).headers.get('content-type'), 'text/css; charset=utf-8');
  assert.equal((await get('/assets/movility-one.jpg')).headers.get('content-type'), 'image/jpeg');
  assert.equal((await get('/admin')).status, 401);
  const failedPayment = { ...await fields('Visa'), result: 'failed' };
  assert.equal((await post(checkout, { ...failedPayment, zip: '12345' })).status, 400);
  assert.equal((await post(checkout, failedPayment, { Origin: 'https://other-0.app.github.dev' })).status, 403);
  const preview = { Origin: 'https://movility-test-0.app.github.dev' };
  assert.match(await (await post(checkout, failedPayment, preview)).text(), /a échoué/);
  const headers = { Authorization: auth };
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
  assert.match(confirmation, /599\.90/);
  assert.match(confirmation, new RegExp(orderPath));
  assert.equal((await post(`/admin/${orderId}/ship`, { tracking: 'CH-DEMO-1' }, headers)).status, 303);
  assert.match(await (await get(orderPath)).text(), /CH-DEMO-1/);
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
});
