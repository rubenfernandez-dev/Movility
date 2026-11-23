import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { stagingEnvironment } from './staging.mjs';
import { shipmentFromToken, shipmentPath } from '../tracking.mjs';

test('staging keeps a simulated order after restart and ignores external integration settings', { timeout: 15000 }, async () => {
  const folder = mkdtempSync(join(tmpdir(), 'movility-staging-'));
  const database = join(folder, 'staging.sqlite');
  const env = stagingEnvironment(database, 0, { ...process.env, MOVILITY_DB: ':memory:',
    MOVILITY_PAYMENT_MODE: 'stripe-test', MOVILITY_EMAIL_MODE: 'resend-test', MOVILITY_PUSH_MODE: 'web-push',
    MOVILITY_CARRIER_SECRET: 'not-a-production-secret', MOVILITY_STAGING_ADMIN_PASSWORD: 'staging-fixture' });
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.mjs'], { env, stdio: ['ignore', 'pipe', 'inherit'] });
    const lines = createInterface({ input: child.stdout });
    const [first] = await once(lines, 'line');
    return first.split(' ')[1];
  }
  async function stop() {
    if (child && child.exitCode === null && child.signalCode === null) {
      const done = once(child, 'exit');
      child.kill();
      await done;
    }
  }
  try {
    const base = await start();
    const health = await fetch(base + '/healthz');
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await health.json(), { result: 'ok' });
    const checkout = await fetch(base + '/fr-CH/checkout');
    assert.equal(checkout.headers.get('x-robots-tag'), 'noindex, nofollow');
    const body = await checkout.text();
    assert.match(body, /Données fictives uniquement/);
    for (const [locale, message] of [['fr-CH', 'code postal suisse à quatre chiffres'], ['de-CH', 'vierstellige Schweizer Postleitzahl']]) {
      const invalid = await fetch(base + '/' + locale + '/checkout', {
        method: 'POST', headers: { Origin: base },
        body: new URLSearchParams({ email: 'bad', bill_name: 'Client Test', bill_zip: '123', result: 'paid' }),
      });
      assert.equal(invalid.status, 400);
      const errors = await invalid.text();
      assert.match(errors, /tabindex="-1" autofocus aria-labelledby="checkout-error"/);
      assert.match(errors, /href="#checkout-bill_zip"/);
      assert.match(errors, /aria-invalid="true" aria-describedby="error-bill_zip"/);
      assert.match(errors, /<details open>/);
      assert.match(errors, new RegExp(message));
    }
    const order = await fetch(base + '/fr-CH/checkout', {
      method: 'POST', redirect: 'manual', headers: { Origin: base },
      body: new URLSearchParams({
        id: body.match(/name="id" value="([^"]+)"/)[1],
        quotedPrice: body.match(/name="quotedPrice" value="([^"]+)"/)[1],
        email: 'staging@example.com', name: 'Client Test', street: 'Rue Exemple 1',
        zip: '1201', city: 'Genève', method: 'Visa', result: 'paid',
        bill_name: 'Facturation Test', bill_street: 'Rue Facture 2', bill_zip: '1003', bill_city: 'Lausanne',
      }),
    });
    assert.equal(order.status, 303);
    const orderPath = order.headers.get('location');
    for (const provider of ['carrier', 'stripe']) {
      assert.equal((await fetch(base + '/integrations/' + provider + '/events', {
        method: 'POST', body: '{}', headers: { 'Content-Type': 'application/json' },
      })).status, 404);
    }
    await stop();
    const restarted = await start();
    const buyerCookie = order.headers.getSetCookie()[0].split(';')[0];
    const orderResponse = await fetch(restarted + orderPath, { headers: { Cookie: buyerCookie } });
    assert.equal(orderResponse.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(orderResponse.headers.get('cache-control'), 'no-store');
    assert.match(await orderResponse.text(), /Paiement de test confirmé/);
    const auth = 'Basic ' + Buffer.from('admin:staging-fixture').toString('base64');
    const id = orderPath.split('/').at(-1);
    const codePath = restarted + '/admin/' + id + '/guest-code';
    const proofPath = restarted + '/fr-CH/guest-access';
    const submit = (url, fields, headers = {}) => fetch(url, { method: 'POST', redirect: 'manual',
      headers: { Origin: restarted, ...headers }, body: new URLSearchParams(fields) });
    assert.equal((await submit(codePath, { action: 'issue' })).status, 401);
    const codeResponse = await submit(codePath, { action: 'issue' }, { Authorization: auth });
    const code = (await codeResponse.text()).match(/<code>([A-Za-z0-9_-]{32})<\/code>/)[1];
    assert.equal((await submit(proofPath, { code, email: 'wrong@example.com' })).status, 400);
    const redeemed = await submit(proofPath, { code, email: 'STAGING@example.com' });
    assert.equal(redeemed.status, 303);
    const proof = redeemed.headers.get('set-cookie').split(';')[0];
    assert.equal((await fetch(restarted + orderPath, { headers: { Cookie: proof } })).status, 200);
    assert.match(await (await fetch(proofPath, { headers: { Cookie: proof } })).text(), /Ouvrir la commande/);
    assert.equal((await submit(proofPath, { code, email: 'staging@example.com' })).status, 400);
    const account = restarted + '/fr-CH/account';
    const mailbox = restarted + '/admin/customer-codes';
    assert.equal((await fetch(mailbox)).status, 401);
    async function signIn(email) {
      assert.equal((await submit(account, { action: 'request', email })).status, 303);
      const html = await (await fetch(mailbox, { headers: { Authorization: auth } })).text();
      const loginCode = html.match(/<code>([A-Za-z0-9_-]{32})<\/code>/)[1];
      const login = await submit(account, { action: 'verify', email, code: loginCode });
      assert.equal(login.status, 303);
      assert.equal((await submit(account, { action: 'verify', email, code: loginCode })).status, 400);
      return login.headers.get('set-cookie').split(';')[0];
    }
    const other = await signIn('other@example.com');
    assert.equal((await submit(account, { action: 'link' }, { Cookie: other + '; ' + proof })).status, 400);
    const customer = await signIn('staging@example.com');
    assert.equal((await submit(account, { action: 'link' }, { Cookie: customer })).status, 400);
    assert.equal((await submit(account, { action: 'link' }, { Cookie: customer + '; ' + proof })).status, 303);
    const signedIn = await (await fetch(account, { headers: { Cookie: customer } })).text();
    assert.match(signedIn, new RegExp(orderPath));
    assert.equal((await fetch(restarted + orderPath, { headers: { Cookie: customer } })).status, 200);
    assert.equal((await fetch(restarted + orderPath, { headers: { Cookie: other } })).status, 403);
    assert.doesNotMatch(await (await fetch(account, { headers: { Cookie: other } })).text(), new RegExp(orderPath));
    assert.equal((await submit(account, { action: 'logout' }, { Cookie: customer })).status, 303);
    assert.equal((await fetch(restarted + orderPath, { headers: { Cookie: customer } })).status, 403);
    assert.doesNotMatch(await (await fetch(account, { headers: { Cookie: customer } })).text(), new RegExp(orderPath));
    const offers = restarted + '/fr-CH/offers';
    const offerInbox = restarted + '/admin/offer-codes';
    assert.equal((await fetch(restarted + '/admin/campaigns')).status, 401);
    assert.match(await (await fetch(restarted + '/admin/campaigns', { headers: { Authorization: auth } })).text(),
      /Programar para todos los suscritos/);
    const offerEmail = 'offers@example.com';
    assert.equal((await fetch(offerInbox)).status, 401);
    assert.equal((await submit(offers, { action: 'request', email: offerEmail })).status, 400);
    assert.equal((await submit(offers, { action: 'request', email: offerEmail, consent: 'yes' })).status, 303);
    const offerCode = async () => (await (await fetch(offerInbox, { headers: { Authorization: auth } })).text())
      .match(/<code>([A-Za-z0-9_-]{32})<\/code>/)[1];
    const confirmationCode = await offerCode();
    assert.equal((await submit(offers, { action: 'confirm', email: 'wrong@example.com', code: confirmationCode })).status, 400);
    assert.equal((await submit(offers, { action: 'confirm', email: offerEmail, code: confirmationCode })).status, 303);
    assert.equal((await submit(offers, { action: 'confirm', email: offerEmail, code: confirmationCode })).status, 400);
    const stopCode = await offerCode();
    assert.equal((await submit(offers, { action: 'stop', code: stopCode })).status, 303);
    assert.equal((await submit(offers, { action: 'stop', code: stopCode })).status, 400);
    const consentDb = new DatabaseSync(database, { readOnly: true });
    try {
      assert.equal(consentDb.prepare('SELECT state FROM offer_subscriptions WHERE email=?').get(offerEmail).state, 'revoked');
      const consent = consentDb.prepare('SELECT action, locale, source, version FROM offer_consent_events WHERE email=? ORDER BY id').all(offerEmail);
      assert.deepEqual(consent.map(row => [row.action, row.locale, row.source, row.version]), [
        ['requested', 'fr-CH', 'guest', 'offers-v1'], ['confirmed', 'fr-CH', 'guest', 'offers-v1'],
        ['revoked', 'fr-CH', 'guest', 'offers-v1'],
      ]);
    } finally { consentDb.close(); }
    assert.equal((await submit(codePath, { action: 'revoke' }, { Authorization: auth })).status, 303);
    assert.equal((await fetch(restarted + orderPath, { headers: { Cookie: buyerCookie } })).status, 403);
    assert.doesNotMatch(await (await fetch(proofPath, { headers: { Cookie: proof } })).text(), /Ouvrir la commande/);
    const docPath = restarted + '/admin/' + id + '/document/';
    assert.equal((await fetch(docPath + 'invoice')).status, 401);
    const invoiceResponse = await fetch(docPath + 'invoice', { headers: { Authorization: auth } });
    assert.equal(invoiceResponse.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(invoiceResponse.headers.get('cache-control'), 'no-store');
    const invoice = await invoiceResponse.text();
    assert.match(invoice, /Facture de test TEST-000001/);
    assert.match(invoice, /Rue Facture 2/);
    assert.doesNotMatch(invoice, /Rue Exemple 1<br>1201 Genève<br>.*Client Test/);
    for (let i = 0; i < 2; i++) {
      const refund = await fetch(restarted + '/admin/' + id + '/refund', { method: 'POST',
        redirect: 'manual', headers: { Authorization: auth, Origin: restarted }, body: new URLSearchParams() });
      assert.equal(refund.status, 303);
    }
    const credit = await (await fetch(docPath + 'credit', { headers: { Authorization: auth } })).text();
    assert.match(credit, /Avoir de test TEST-000002/);
    assert.match(credit, /TEST-000001/);
    assert.match(credit, /Rue Facture 2/);
    const csv = await (await fetch(restarted + '/admin/accounting.csv', { headers: { Authorization: auth } })).text();
    assert.match(csv, /"Cobro","Visa","CHF","2499.00"/);
    assert.equal(csv.match(/"Reembolso","Visa","CHF","-2499.00"/g)?.length, 1);
    const initialArticles = await (await fetch(restarted + '/admin/models?q=movility&family=wheelchair&status=published',
      { headers: { Authorization: auth } })).text();
    assert.match(initialArticles, /<h3>Movility One<\/h3>/);
    assert.match(initialArticles, /href="\/admin\/models\/one\/content">Características, fotos y vídeo/);
    const localizedAdmin = await fetch(restarted + '/admin/models?family=wheelchair&lang=fr-CH',
      { headers: { Authorization: auth } });
    const adminLanguageCookie = localizedAdmin.headers.get('set-cookie').split(';')[0];
    const localizedArticles = await localizedAdmin.text();
    assert.match(localizedArticles, /<html lang="fr-CH">/);
    assert.match(localizedArticles, /Articles du catalogue/);
    assert.match(localizedArticles, /family=wheelchair&amp;lang=de-CH/);
    assert.match(localizedArticles, /Caractéristiques, photos et vidéo/);
    const localizedSecurity = await fetch(restarted + '/admin/security',
      { headers: { Authorization: auth, Cookie: adminLanguageCookie } });
    assert.match(await localizedSecurity.text(), /Sécurité de l’administration/);
    const localizedStock = await fetch(restarted + '/admin/inventory?lang=de-CH', { headers: { Authorization: auth } });
    assert.match(await localizedStock.text(), /<html lang="de-CH">[\s\S]*Lagerbewegungen[\s\S]*Lagerbewegungen als CSV herunterladen/);
    const accessory = { sku: 'travel-bag', family: 'accessory', name: 'Travel Bag', price: '49', units: '2',
      active: '1', description_de: 'Tasche', description_fr: 'Sac de transport' };
    assert.equal((await submit(restarted + '/admin/models', accessory, { Authorization: auth })).status, 303);
    assert.match(await (await fetch(restarted + '/fr-CH')).text(), /Accessoires[\s\S]*Travel Bag/);
    assert.doesNotMatch(await (await fetch(restarted + '/fr-CH/compare')).text(), /Travel Bag/);
    const compatibilityPath = restarted + '/admin/models/travel-bag/compatibility';
    const compatHeaders = { Authorization: auth };
    assert.match(await (await fetch(restarted + '/fr-CH/models/travel-bag')).text(), /Compatibilité à confirmer/);
    assert.match(await (await fetch(compatibilityPath, { headers: compatHeaders })).text(), /Movility One/);
    assert.equal((await submit(compatibilityPath, { chair: 'one', 'de-one': 'Nur Version 2' }, compatHeaders)).status, 400);
    assert.equal((await submit(compatibilityPath, { chair: 'one', 'de-one': 'Nur Version 2', 'fr-one': 'Version 2 uniquement' },
      compatHeaders)).status, 303);
    const filteredParts = await (await fetch(restarted + '/fr-CH?family=accessory&compatible=one')).text();
    assert.match(filteredParts, /name="compatible"/);
    assert.match(filteredParts, /Travel Bag/);
    assert.match(await (await fetch(restarted + '/fr-CH/movility-one')).text(), /Accessoires et pièces compatibles[\s\S]*Travel Bag<\/a> · Version 2 uniquement/);
    assert.match(await (await fetch(restarted + '/de-CH/models/travel-bag')).text(), /Kompatible Rollstühle[\s\S]*Movility One<\/a> · Nur Version 2/);
    assert.equal((await submit(compatibilityPath, {}, compatHeaders)).status, 303);
    assert.match(await (await fetch(restarted + '/fr-CH?family=accessory&compatible=one')).text(), /Aucun article compatible trouvé/);
    const chairEditor = restarted + '/admin/models/one/compatibility';
    assert.equal((await submit(restarted + '/admin/models', {
      ...accessory, sku: 'test-chair', name: 'Test Chair', family: 'wheelchair', width: '60', weight: '40', range: '20',
    }, compatHeaders)).status, 303);
    assert.equal((await submit(restarted + '/admin/models', {
      ...accessory, sku: 'test-wheel', name: 'Test Wheel', family: 'spare',
    }, compatHeaders)).status, 303);
    assert.equal((await submit(compatibilityPath, { chair: 'test-chair' }, compatHeaders)).status, 303);
    const chairPanel = await fetch(chairEditor, { headers: compatHeaders });
    assert.match(chairPanel.headers.get('content-security-policy'), /script-src 'self'/);
    const chairPanelHtml = await chairPanel.text();
    assert.match(chairPanelHtml, /Accesorios[\s\S]*Travel Bag[\s\S]*Recambios[\s\S]*Test Wheel/);
    assert.match(chairPanelHtml, /data-name="Travel Bag" data-sku="travel-bag"/);
    assert.match(chairPanelHtml, /data-compat-selected> Solo seleccionados/);
    assert.match(chairPanelHtml, /role="status" data-compat-unsaved/);
    assert.match(chairPanelHtml, /src="\/assets\/compatibility-search.js" defer/);
    assert.match((await fetch(restarted + '/assets/compatibility-search.js')).headers.get('content-type'), /javascript/);
    const addBoth = await fetch(chairEditor, {
      method: 'POST', redirect: 'manual', headers: { ...compatHeaders, Origin: restarted },
      body: new URLSearchParams([['part', 'travel-bag'], ['part', 'test-wheel'], ['de-test-wheel', 'Ab Version 2'],
        ['fr-test-wheel', 'Dès la version 2']]),
    });
    assert.equal(addBoth.status, 303);
    assert.match(await (await fetch(restarted + '/fr-CH/movility-one')).text(), /Travel Bag[\s\S]*Test Wheel<\/a> · Dès la version 2/);
    assert.match(await (await fetch(compatibilityPath, { headers: compatHeaders })).text(), /name="chair" value="one" checked/);
    assert.equal((await submit(chairEditor, {}, compatHeaders)).status, 303);
    assert.match(await (await fetch(compatibilityPath, { headers: compatHeaders })).text(), /name="chair" value="test-chair" checked/);
    assert.doesNotMatch(await (await fetch(restarted + '/fr-CH/movility-one')).text(), /Test Wheel/);
    const accessoryCheckout = await (await fetch(restarted + '/fr-CH/checkout?model=travel-bag')).text();
    const accessoryOrder = await submit(restarted + '/fr-CH/checkout', {
      id: accessoryCheckout.match(/name="id" value="([^"]+)"/)[1], quotedPrice: '4900', model: 'travel-bag',
      email: 'staging@example.com', name: 'Client Test', street: 'Rue Exemple 1',
      zip: '1201', city: 'Genève', method: 'Visa', result: 'paid',
    });
    assert.equal(accessoryOrder.status, 303);
    const accessoryId = accessoryOrder.headers.get('location').split('/').at(-1);
    assert.equal((await submit(restarted + '/admin/' + accessoryId + '/ship', { tracking: 'STAGING-BAG' },
      { Authorization: auth })).status, 303);
    assert.equal((await submit(restarted + '/admin/' + accessoryId + '/tracking', { eventId: crypto.randomUUID(), status: 'delivered' },
      { Authorization: auth })).status, 303);
    const shipmentDb = new DatabaseSync(database, { readOnly: true });
    try {
      const token = shipmentPath(shipmentDb, 'fr-CH', accessoryId).split('/').at(-1);
      const { occurred_at } = shipmentDb.prepare("SELECT occurred_at FROM tracking_events WHERE order_id=? AND event_status='delivered'").get(accessoryId);
      const week = 7 * 24 * 60 * 60 * 1000;
      assert.equal(shipmentFromToken(shipmentDb, token, occurred_at + week - 1)?.tracking, 'STAGING-BAG');
      assert.equal(shipmentFromToken(shipmentDb, token, occurred_at + week), undefined);
    } finally { shipmentDb.close(); }
    const admin = { Authorization: auth };
    assert.equal((await submit(restarted + '/admin/families', {
      id: 'home', es: 'Hogar', de: 'Zuhause', fr: 'Maison',
    }, admin)).status, 303);
    for (let index = 1; index <= 21; index++) {
      assert.equal((await submit(restarted + '/admin/models', {
        ...accessory, sku: 'home-' + index, family: 'home', name: 'Home ' + index,
      }, admin)).status, 303);
    }
    const filteredAdmin = restarted + '/admin/models?q=home&family=home&status=published';
    const firstPage = await (await fetch(filteredAdmin, { headers: admin })).text();
    assert.match(firstPage, /1–20 de 21 artículos/);
    assert.match(firstPage, /q=home&amp;family=home&amp;status=published&amp;page=2#catalog-results/);
    const secondPage = await (await fetch(filteredAdmin + '&page=2', { headers: admin })).text();
    assert.match(secondPage, /21–21 de 21 artículos/);
    assert.match(secondPage, /Página 2 de 2/);
    assert.match(await (await fetch(restarted + '/fr-CH')).text(), /Maison[\s\S]*Home 11/);
    const catalogOrderPath = restarted + '/admin/catalog-order';
    assert.match(await (await fetch(catalogOrderPath, { headers: admin })).text(), /Movility One/);
    assert.equal((await submit(catalogOrderPath, { kind: 'family', id: 'home', position: '10' }, admin)).status, 303);
    assert.equal((await submit(catalogOrderPath, { kind: 'product', id: 'home-11', position: '10' }, admin)).status, 303);
    assert.equal((await submit(catalogOrderPath, { kind: 'product', id: 'home-1', position: '0' }, admin)).status, 400);
    for (const locale of ['de-CH', 'fr-CH']) {
      const ordered = await (await fetch(restarted + '/' + locale)).text();
      assert.match(ordered, /family=home#catalogue[\s\S]*family=accessory#catalogue/);
      assert.match(ordered, /\/models\/home-11"[\s\S]*\/models\/home-1"/);
    }
    assert.equal((await submit(catalogOrderPath, { kind: 'product', id: 'home-11', position: '' }, admin)).status, 303);
    assert.match(await (await fetch(restarted + '/fr-CH?family=home')).text(), /\/models\/home-1"[\s\S]*\/models\/home-11"/);
    const archived = await submit(restarted + '/admin/models?q=HOME-DRA&family=home&status=archived', {
      ...accessory, sku: 'home-draft', family: 'home', name: 'Étagère test', active: '0',
    }, admin);
    assert.equal(archived.headers.get('location'), '/admin/models?q=HOME-DRA&family=home&status=archived&saved=1');
    const adminResults = await (await fetch(restarted + archived.headers.get('location'), { headers: admin })).text();
    assert.match(adminResults, /<h3>Étagère test<\/h3><p>SKU home-draft · Archivado/);
    assert.match(adminResults, /name="q" maxlength="80" value="HOME-DRA"/);
    assert.doesNotMatch(adminResults, /Home 11|Travel Bag/);
    const searchByName = async status => (await fetch(restarted + '/admin/models?q=ETAGERE&status=' + status, { headers: admin })).text();
    assert.match(await searchByName('archived'), /<h3>Étagère test<\/h3><p>SKU home-draft · Archivado/);
    assert.match(await searchByName('published'), /No hay artículos que coincidan/);
    const frenchCatalogue = await (await fetch(restarted + '/fr-CH?family=home')).text();
    assert.match(frenchCatalogue, /family=home#catalogue" aria-current="true">Maison/);
    assert.match(frenchCatalogue, /Home 11/);
    assert.doesNotMatch(frenchCatalogue, /Étagère test|Travel Bag|<h4><a href="\/fr-CH\/movility-one"/);
    const germanCatalogue = await (await fetch(restarted + '/de-CH?family=wheelchair')).text();
    assert.match(germanCatalogue, /family=wheelchair#catalogue" aria-current="true">Elektrorollstühle/);
    assert.match(germanCatalogue, /<div class="model-grid">\s*<article>[\s\S]*?<h4><a href="\/de-CH\/movility-one">Movility One/);
    assert.doesNotMatch(germanCatalogue, /Home 11/);
    assert.equal((await submit(restarted + '/admin/models/home-11/content', {
      de: 'Material: Holz', fr: 'Matière : bois',
    }, admin)).status, 303);
    const media = new FormData();
    media.set('kind', 'front');
    media.set('file', new Blob([readFileSync(new URL('../assets/movility-one.jpg', import.meta.url))], { type: 'image/jpeg' }), 'photo.jpg');
    const upload = await fetch(restarted + '/admin/models/home-11/content/upload', {
      method: 'POST', body: media, redirect: 'manual', headers: { Origin: restarted, Authorization: auth },
    });
    assert.equal(upload.status, 303);
    const item = await (await fetch(restarted + '/fr-CH/models/home-11')).text();
    assert.match(item, /Matière : bois/);
    assert.match(item, /\/assets\/models\/home-11.jpg/);
    assert.equal((await fetch(restarted + '/assets/models/home-11.jpg')).headers.get('content-type'), 'image/jpeg');
  } finally {
    await stop();
    unlinkSync(database);
    if (existsSync(database + '.media')) {
      unlinkSync(join(database + '.media', 'home-11.jpg'));
      rmdirSync(database + '.media');
    }
    rmdirSync(folder);
  }
});
