import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { setTimeout as delay } from 'node:timers/promises';
import { generateVAPIDKeys } from 'web-push';
import { backupVolume, restoreVolume } from './database.mjs';
import { stagingEnvironment } from './staging.mjs';
import { shipmentFromToken, shipmentPath } from '../tracking.mjs';

const stagingOrigin = 'https://staging.movility.example';

test('staging configuration rejects live payments, live keys and an unconfigured test recipient', () => {
  const base = { MOVILITY_STAGING_ORIGIN: stagingOrigin, MOVILITY_STAGING_ADMIN_PASSWORD: 'fixture-password' };
  const build = overrides => stagingEnvironment(':memory:', 0, { ...base, ...overrides });
  assert.throws(() => build({ MOVILITY_STAGING_ADMIN_PASSWORD: '' }), /MOVILITY_STAGING_ADMIN_PASSWORD/);
  assert.throws(() => build({ MOVILITY_STAGING_PAYMENT_MODE: 'live' }), /Stripe mode requires/);
  const stripe = { MOVILITY_STAGING_PAYMENT_MODE: 'stripe-test', MOVILITY_STAGING_STRIPE_WEBHOOK_SECRET: 'whsec_fixture' };
  assert.throws(() => build({ ...stripe, MOVILITY_STAGING_STRIPE_SECRET_KEY: 'sk_live_fixture' }), /Stripe mode requires/);
  assert.equal(build({ ...stripe, MOVILITY_STAGING_STRIPE_SECRET_KEY: 'sk_test_fixture' }).MOVILITY_PAYMENT_MODE, 'stripe-test');
  const resend = { MOVILITY_STAGING_EMAIL_MODE: 'resend-test', MOVILITY_STAGING_EMAIL_FROM: 'from@example.com',
    MOVILITY_STAGING_RESEND_API_KEY: 'fixture' };
  assert.throws(() => build(resend), /one authorized recipient/);
  const configured = build({ ...resend, MOVILITY_STAGING_EMAIL_TEST_TO: 'qa@example.com',
    MOVILITY_EMAIL_TEST_TO: 'ignored@example.com', MOVILITY_DB: 'ignored.sqlite' });
  assert.equal(configured.MOVILITY_EMAIL_TEST_TO, 'qa@example.com');
  assert.equal(configured.MOVILITY_DB, ':memory:');
  assert.equal(configured.MOVILITY_PUBLIC_ORIGIN, stagingOrigin);
});

test('staging simulates integrations and restores an independent volume with orders, serials, stock and media', { timeout: 20000 }, async () => {
  const folder = mkdtempSync(join(tmpdir(), 'movility-staging-'));
  const database = join(folder, 'staging.sqlite');
  const env = { ...process.env, MOVILITY_DB: ':memory:',
    MOVILITY_STAGING_PAYMENT_MODE: 'simulated', MOVILITY_STAGING_EMAIL_MODE: 'simulated',
    MOVILITY_PAYMENT_MODE: 'stripe-test', MOVILITY_EMAIL_MODE: 'resend-test', MOVILITY_PUSH_MODE: 'web-push',
    MOVILITY_CARRIER_SECRET: 'not-a-production-secret', MOVILITY_STAGING_ADMIN_PASSWORD: 'staging-fixture', MOVILITY_STAGING_ORIGIN: stagingOrigin,
    MOVILITY_STAGING_PUSH_MODE: 'simulated', MOVILITY_STAGING_PUSH_PUBLIC_KEY: '', MOVILITY_STAGING_PUSH_PRIVATE_KEY: '',
    MOVILITY_STAGING_PUSH_SUBJECT: '' };
  let child;
  async function start(db = database) {
    const socket = createServer().listen(0, '127.0.0.1');
    await once(socket, 'listening');
    const port = socket.address().port;
    await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
    const launcher = fileURLToPath(new URL('./staging.mjs', import.meta.url));
    child = spawn(process.execPath, ['--permission', '--allow-fs-read=*',
      '--allow-fs-write=' + folder, '--allow-fs-write=' + join(folder, '*'), launcher], {
      cwd: folder, env: { ...env, MOVILITY_STAGING_PORT: String(port), MOVILITY_STAGING_DB: db },
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const lines = createInterface({ input: child.stdout });
    const [first] = await Promise.race([
      once(lines, 'line'),
      once(child, 'exit').then(([code]) => { throw new Error('Pilot launcher stopped before startup: ' + code); }),
    ]);
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
    const verification = execFileSync(process.execPath, ['ops/verify-staging.mjs', base], { encoding: 'utf8', timeout: 10000 });
    assert.match(verification, /panel protegido sin credenciales/);
    const health = await fetch(base + '/healthz');
    assert.equal(health.status, 200);
    assert.equal(health.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await health.json(), { result: 'ok' });
    for (const language of ['de-CH', 'fr-CH']) {
      const demo = await fetch(base + '/' + language + '/models/qa-chair');
      assert.equal(demo.status, 200);
      assert.match(await demo.text(), /Mobility QA Compact/);
    }
    const checkout = await fetch(base + '/fr-CH/checkout?model=one');
    assert.equal(checkout.headers.get('x-robots-tag'), 'noindex, nofollow');
    const body = await checkout.text();
    assert.match(body, /Données fictives uniquement/);
    for (const [locale, message] of [['fr-CH', 'code postal suisse à quatre chiffres'], ['de-CH', 'vierstellige Schweizer Postleitzahl']]) {
      const invalid = await fetch(base + '/' + locale + '/checkout', {
        method: 'POST', headers: { Origin: base },
        body: new URLSearchParams({ model: 'one', email: 'bad', bill_name: 'Client Test', bill_zip: '123', result: 'paid' }),
      });
      assert.equal(invalid.status, 400);
      const errors = await invalid.text();
      assert.match(errors, /tabindex="-1" autofocus aria-labelledby="checkout-error"/);
      assert.match(errors, /<aside class="summary" aria-labelledby="checkout-summary">[\s\S]*<form method="post" novalidate/);
      assert.match(errors, /autocomplete="shipping postal-code"/);
      assert.match(errors, /autocomplete="billing postal-code"/);
      assert.match(errors, /href="#checkout-bill_zip"/);
      assert.match(errors, /aria-invalid="true" aria-describedby="error-bill_zip"/);
      assert.match(errors, /<details open>/);
      assert.match(errors, new RegExp(message));
    }
    const order = await fetch(base + '/fr-CH/checkout', {
      method: 'POST', redirect: 'manual', headers: { Origin: base },
      body: new URLSearchParams({
        id: body.match(/name="id" value="([^"]+)"/)[1],
        model: 'one', quotedPrice: body.match(/name="quotedPrice" value="([^"]+)"/)[1],
        email: 'staging@example.com', name: 'Client Test', street: 'Rue Exemple 1',
        country: 'CH', zip: '1201', city: 'Genève', method: 'Visa', result: 'paid',
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
    assert.equal(orderResponse.headers.get('referrer-policy'), 'strict-origin');
    assert.equal(orderResponse.headers.get('cache-control'), 'no-store');
    assert.match(await orderResponse.text(), /Paiement de test confirmé/);
    const auth = 'Basic ' + Buffer.from('admin:staging-fixture').toString('base64');
    const id = orderPath.split('/').at(-1);
    const codePath = restarted + '/admin/' + id + '/guest-code';
    const proofPath = restarted + '/fr-CH/guest-access';
    const submit = (url, fields, headers = {}) => fetch(url, { method: 'POST', redirect: 'manual',
      headers: { Origin: restarted, ...headers }, body: new URLSearchParams(fields) });
    const requestWrong = await submit(restarted + orderPath, { email: 'wrong@example.com' });
    assert.equal(requestWrong.headers.get('location'), '/fr-CH/guest-access?requested=1');
    const queuePath = restarted + '/admin/mail';
    const mailAuth = { Authorization: auth };
    assert.doesNotMatch(await (await fetch(queuePath, { headers: mailAuth })).text(), /\/email\/access-/);
    const requestOK = await submit(restarted + orderPath, { email: 'STAGING@example.com' });
    assert.equal(requestOK.headers.get('location'), requestWrong.headers.get('location'));
    assert.equal((await submit(restarted + orderPath, { email: 'staging@example.com' })).status, 303);
    assert.equal((await submit(queuePath + '/process', {}, mailAuth)).status, 303);
    const queue = await (await fetch(queuePath, { headers: mailAuth })).text();
    const recoveryLinks = queue.match(/\/admin\/[a-f0-9-]+\/email\/access-[a-f0-9-]+/g);
    assert.equal(recoveryLinks.length, 1);
    assert.equal((await fetch(restarted + recoveryLinks[0])).status, 401);
    const recoveryMail = await (await fetch(restarted + recoveryLinks[0], { headers: mailAuth })).text();
    assert.match(recoveryMail, /Code d’accès à votre commande/);
    const automaticCode = recoveryMail.match(/\n\n([A-Za-z0-9_-]{32})\n\n/)[1];
    const automaticProof = await submit(proofPath, { code: automaticCode, email: 'staging@example.com' });
    assert.equal(automaticProof.status, 303);
    assert.equal((await fetch(restarted + orderPath, { headers: { Cookie: automaticProof.headers.get('set-cookie').split(';')[0] } })).status, 200);
    assert.equal((await submit(proofPath, { code: automaticCode, email: 'staging@example.com' })).status, 400);
    assert.equal((await fetch(restarted + recoveryLinks[0], { headers: mailAuth })).status, 404);
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
    const initialArticles = await (await fetch(restarted + '/admin/models?q=mobility&family=wheelchair&status=published',
      { headers: { Authorization: auth } })).text();
    assert.match(initialArticles, /<h3>Mobility One<\/h3>/);
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
    assert.match(await (await fetch(compatibilityPath, { headers: compatHeaders })).text(), /Mobility One/);
    assert.equal((await submit(compatibilityPath, { chair: 'one', 'de-one': 'Nur Version 2' }, compatHeaders)).status, 400);
    assert.equal((await submit(compatibilityPath, { chair: 'one', 'de-one': 'Nur Version 2', 'fr-one': 'Version 2 uniquement' },
      compatHeaders)).status, 303);
    const filteredParts = await (await fetch(restarted + '/fr-CH?family=accessory&compatible=one')).text();
    assert.match(filteredParts, /name="compatible"/);
    assert.match(filteredParts, /Travel Bag/);
    assert.match(await (await fetch(restarted + '/fr-CH/mobility-one')).text(), /Accessoires et pièces compatibles[\s\S]*Travel Bag<\/a> · Version 2 uniquement/);
    assert.match(await (await fetch(restarted + '/de-CH/models/travel-bag')).text(), /Kompatible Rollstühle[\s\S]*Mobility One<\/a> · Nur Version 2/);
    assert.equal((await submit(compatibilityPath, {}, compatHeaders)).status, 303);
    assert.match(await (await fetch(restarted + '/fr-CH?family=accessory&compatible=one')).text(), /Nous ne pouvons pas encore vérifier quelles pièces conviennent au fauteuil Mobility One/);
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
    assert.match(await (await fetch(restarted + '/fr-CH/mobility-one')).text(), /Travel Bag[\s\S]*Test Wheel<\/a> · Dès la version 2/);
    assert.match(await (await fetch(compatibilityPath, { headers: compatHeaders })).text(), /name="chair" value="one" checked/);
    assert.equal((await submit(chairEditor, {}, compatHeaders)).status, 303);
    assert.match(await (await fetch(compatibilityPath, { headers: compatHeaders })).text(), /name="chair" value="test-chair" checked/);
    assert.doesNotMatch(await (await fetch(restarted + '/fr-CH/mobility-one')).text(), /Test Wheel/);
    const accessoryCheckout = await (await fetch(restarted + '/fr-CH/checkout?model=travel-bag')).text();
    const accessoryOrder = await submit(restarted + '/fr-CH/checkout', {
      id: accessoryCheckout.match(/name="id" value="([^"]+)"/)[1], quotedPrice: '4900', model: 'travel-bag',
      email: 'staging@example.com', name: 'Client Test', street: 'Rue Exemple 1',
      country: 'CH', zip: '1201', city: 'Genève', method: 'Visa', result: 'paid',
    });
    assert.equal(accessoryOrder.status, 303);
    const accessoryId = accessoryOrder.headers.get('location').split('/').at(-1);
    assert.equal((await submit(restarted + '/admin/' + accessoryId + '/ship', { tracking: 'STAGING-BAG' },
      { Authorization: auth })).status, 303);
    assert.equal((await submit(restarted + '/admin/' + accessoryId + '/tracking', { eventId: crypto.randomUUID(), status: 'delivered' },
      { Authorization: auth })).status, 303);
    const germanCheckout = await (await fetch(restarted + '/de-CH/checkout?model=qa-chair')).text();
    const germanOrder = await submit(restarted + '/de-CH/checkout', {
      id: germanCheckout.match(/name="id" value="([^"]+)"/)[1], quotedPrice: '189000', model: 'qa-chair',
      email: 'staging@example.com', name: 'Kunde Test', street: 'Teststrasse 1',
      country: 'CH', zip: '8001', city: 'Zürich', method: 'Visa', result: 'paid',
    });
    assert.equal(germanOrder.status, 303);
    const germanId = germanOrder.headers.get('location').split('/').at(-1);
    const orderUrl = restarted + '/de-CH/orders/' + germanId;
    const buyer = { Cookie: germanOrder.headers.getSetCookie()[0].split(';')[0] };
    assert.match(await (await fetch(orderUrl, { headers: buyer })).text(), /data-subscribe/);
    const subscription = await fetch(orderUrl + '/push', { method: 'POST',
      headers: { ...buyer, Origin: restarted, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'subscribe', subscription: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/staging-qa',
        keys: { p256dh: generateVAPIDKeys().publicKey,
          auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url') },
      } }) });
    assert.deepEqual(await subscription.json(), { active: true });
    assert.equal((await submit(restarted + '/admin/' + germanId + '/ship',
      { tracking: 'STAGING-DE', 'serial_qa-chair': 'QA-CHAIR-1' }, { Authorization: auth })).status, 303);
    let acceptedPush;
    for (let attempt = 0; attempt < 30 && !acceptedPush; attempt++) {
      const pushPanel = await fetch(restarted + '/admin/push?order=' + germanId, { headers: { Authorization: auth } });
      acceptedPush = (await pushPanel.text()).includes('Aceptado en simulación');
      if (!acceptedPush) await delay(200);
    }
    assert.equal(acceptedPush, true);
    const shipmentDb = new DatabaseSync(database, { readOnly: true });
    try {
      for (const [language, orderId] of [['fr-CH', accessoryId], ['de-CH', germanId]]) {
        const mail = kind => shipmentDb.prepare('SELECT body FROM email_previews WHERE order_id=? AND kind=?').get(orderId, kind).body;
        const orderLink = '/' + language + '/orders/' + orderId;
        assert.ok(mail('paid').includes(stagingOrigin + orderLink));
        const shipmentLink = shipmentPath(shipmentDb, language, orderId);
        assert.ok(mail('shipped').includes(stagingOrigin + shipmentLink));
        assert.equal((await fetch(restarted + shipmentLink)).status, 200);
        assert.equal((await fetch(restarted + orderLink)).status, 403);
      }
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
    assert.match(await (await fetch(catalogOrderPath, { headers: admin })).text(), /Mobility One/);
    assert.equal((await submit(catalogOrderPath, { kind: 'family', id: 'home', position: '10' }, admin)).status, 303);
    assert.equal((await submit(catalogOrderPath, { kind: 'product', id: 'home-11', position: '10' }, admin)).status, 303);
    assert.equal((await submit(catalogOrderPath, { kind: 'product', id: 'home-1', position: '0' }, admin)).status, 400);
    for (const locale of ['de-CH', 'fr-CH']) {
      const ordered = await (await fetch(restarted + '/' + locale)).text();
      assert.match(ordered, /family=home#catalogue[\s\S]*family=accessory#catalogue/);
      assert.match(ordered, /\/models\/home-11"[\s\S]*\/models\/home-1"/);
    }
    assert.equal((await submit(catalogOrderPath, { kind: 'product', id: 'home-11', position: '' }, admin)).status, 303);
    assert.match(await (await fetch(restarted + '/fr-CH?family=home')).text(), /\/models\/home-1\?family=home"[\s\S]*\/models\/home-11\?family=home"/);
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
    assert.doesNotMatch(frenchCatalogue, /Étagère test|Travel Bag|<h4><a href="\/fr-CH\/mobility-one"/);
    const germanCatalogue = await (await fetch(restarted + '/de-CH?family=wheelchair')).text();
    assert.match(germanCatalogue, /family=wheelchair#catalogue" aria-current="true">Elektrorollstühle/);
    assert.match(germanCatalogue, /<div class="model-grid">\s*<article class="catalog-product">[\s\S]*?<h4><a href="\/de-CH\/mobility-one\?family=wheelchair">\s*<img[^>]+>\s*Mobility One/);
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
    const editorialAsset = await fetch(restarted + '/admin/content/about/image', {
      method: 'POST', body: media, redirect: 'manual', headers: { Origin: restarted, Authorization: auth },
    });
    assert.equal(editorialAsset.status, 303);
    assert.equal((await fetch(restarted + '/admin/content/about/image')).status, 401);
    const privatePhoto = await fetch(restarted + '/admin/content/about/image', { headers: admin });
    assert.equal(privatePhoto.headers.get('cache-control'), 'private, no-store');
    const privateAbout = await (await fetch(restarted + '/admin/content/about/preview/de-CH', { headers: admin })).text();
    assert.ok(privateAbout.includes('src="/admin/content/about/image"'));
    const publicAbout = await (await fetch(restarted + '/de-CH/about')).text();
    assert.ok(publicAbout.includes('src="/assets/about-editorial.jpg"'));
    assert.doesNotMatch(publicAbout, /about-story|src="\/admin\/content\/about\/image"/);
    const item = await (await fetch(restarted + '/fr-CH/models/home-11')).text();
    assert.match(item, /Matière : bois/);
    assert.match(item, /\/assets\/models\/home-11.jpg/);
    assert.equal((await fetch(restarted + '/assets/models/home-11.jpg')).headers.get('content-type'), 'image/jpeg');
    const videosPath = restarted + '/admin/models/qa-chair/content/videos';
    const folding = { title_de: 'Falten Prüfstuhl', title_fr: 'Pliage essai', purpose: 'folding', position: '20' };
    const joystick = { title_de: 'Joystick Prüfstuhl', title_fr: 'Joystick essai', purpose: 'joystick', position: '10' };
    for (const fields of [folding, joystick]) {
      const result = await submit(videosPath, fields, admin);
      assert.match(result.headers.get('location'), /saved=1#model-videos$/);
    }
    const videoEditor = await (await fetch(restarted + '/admin/models/qa-chair/content', { headers: admin })).text();
    const [joystickId, foldingId] = [...videoEditor.matchAll(/content\/videos\/(\d+)\/upload/g)].map(match => match[1]);
    const incomplete = await submit(videosPath + '/' + foldingId, { ...folding, published: '1' }, admin);
    assert.match(incomplete.headers.get('location'), /video=invalid/);
    for (const [fields, id] of [[folding, foldingId], [joystick, joystickId]]) {
      const files = {
        video: '0000ftyp' + fields.purpose,
        deCaptions: 'WEBVTT\n\n00:00.000 --> 00:01.000\n' + fields.title_de,
        frCaptions: 'WEBVTT\n\n00:00.000 --> 00:01.000\n' + fields.title_fr,
        deTranscript: fields.title_de,
        frTranscript: fields.title_fr,
      };
      for (const [kind, contents] of Object.entries(files)) {
        const body = new FormData();
        body.set('kind', kind);
        body.set('file', new Blob([contents]), 'fixture');
        const result = await fetch(videosPath + '/' + id + '/upload', {
          method: 'POST', body, redirect: 'manual', headers: { ...admin, Origin: restarted },
        });
        assert.match(result.headers.get('location'), /saved=1#model-videos$/);
      }
      const asset = restarted + '/assets/models/qa-chair.video-' + id + '.mp4';
      assert.equal((await fetch(asset)).status, 404);
      const result = await submit(videosPath + '/' + id, { ...fields, published: '1' }, admin);
      assert.match(result.headers.get('location'), /saved=1#model-videos$/);
      assert.equal(await (await fetch(asset)).text(), files.video);
    }
    for (const locale of ['de-CH', 'fr-CH']) {
      const key = 'title_' + locale.slice(0, 2);
      const chair = await (await fetch(restarted + '/' + locale + '/models/qa-chair')).text();
      assert.equal((chair.match(/<video controls playsinline preload="none">/g) || []).length, 2);
      assert.ok(chair.indexOf('>' + joystick[key] + '</a>') < chair.indexOf('>' + folding[key] + '</a>'));
      const transport = chair.match(/<section class="one-fit">([\s\S]*?)<\/section>/)[1];
      assert.ok(transport.includes('#model-video-' + foldingId));
      assert.ok(!transport.includes('#model-video-' + joystickId));
      for (const [fields, id] of [[folding, foldingId], [joystick, joystickId]]) {
        const asset = '/assets/models/qa-chair.video-' + id + '.' + locale;
        assert.ok(chair.includes('<h3>' + fields[key] + '</h3>'));
        assert.ok(chair.includes('src="' + asset + '.vtt"'));
        assert.ok(chair.includes('href="' + asset + '.txt"'));
        assert.ok((await (await fetch(restarted + asset + '.vtt')).text()).includes(fields[key]));
        assert.equal(await (await fetch(restarted + asset + '.txt')).text(), fields[key]);
      }
      const otherChair = await (await fetch(restarted + '/' + locale + '/mobility-one')).text();
      assert.doesNotMatch(otherChair, /gallery-videos-title|<video|qa-chair\.video-/);
    }
    assert.equal((await fetch(restarted + '/assets/models/one.video-' + foldingId + '.mp4')).status, 404);
    const reordered = await submit(videosPath + '/' + foldingId, { ...folding, position: '0', published: '1' }, admin);
    assert.match(reordered.headers.get('location'), /saved=1#model-videos$/);
    const reorderedChair = await (await fetch(restarted + '/de-CH/models/qa-chair')).text();
    assert.ok(reorderedChair.indexOf('>' + folding.title_de + '</a>') < reorderedChair.indexOf('>' + joystick.title_de + '</a>'));
    await stop();
    const backup = backupVolume(database, join(folder, 'backups'));
    const copy = join(folder, 'recovered', 'staging.sqlite');
    assert.equal(restoreVolume(backup, copy), copy);
    assert.throws(() => restoreVolume(backup, copy), /medios de destino ya existe/);
    const afterSale = await start(copy);
    const restoredOrder = await fetch(afterSale + '/admin/orders/' + germanId, { headers: admin });
    assert.equal(restoredOrder.status, 200);
    assert.match(await restoredOrder.text(), /STAGING-DE[\s\S]*QA-CHAIR-1/);
    assert.equal((await fetch(afterSale + '/de-CH/checkout?model=qa-chair')).status, 409);
    const restoredImage = await fetch(afterSale + '/assets/models/home-11.jpg');
    assert.equal(restoredImage.status, 200);
    assert.deepEqual(Buffer.from(await restoredImage.arrayBuffer()), readFileSync(join(database + '.media', 'home-11.jpg')));
    const securityPath = '/admin/security';
    const freshPassword = 'new-fixture-admin-password';
    const newAdmin = { Authorization: 'Basic ' + Buffer.from('admin:' + freshPassword).toString('base64') };
    assert.equal((await fetch(afterSale + securityPath)).status, 401);
    const security = await fetch(afterSale + securityPath, { headers: admin });
    assert.equal(security.status, 200);
    assert.match(await security.text(), /autocomplete="current-password"/);
    const fields = { password: freshPassword, confirm: freshPassword };
    assert.equal((await submit(afterSale + securityPath, { ...fields, current: 'incorrect' }, { ...admin, Origin: afterSale })).status, 400);
    assert.equal((await submit(afterSale + securityPath, { ...fields, current: 'staging-fixture' }, { ...admin, Origin: afterSale })).status, 200);
    assert.equal((await fetch(afterSale + '/admin', { headers: admin })).status, 401);
    assert.equal((await fetch(afterSale + '/admin', { headers: newAdmin })).status, 200);
    await stop();
    const afterPasswordChange = await start(copy);
    assert.equal((await fetch(afterPasswordChange + '/admin', { headers: admin })).status, 401);
    assert.equal((await fetch(afterPasswordChange + '/admin', { headers: newAdmin })).status, 200);

  } finally {
    await stop();
    rmSync(folder, { recursive: true, force: true });
  }
});
