import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { test } from 'node:test';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { generateVAPIDKeys } from 'web-push';
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
  const pushKeys = generateVAPIDKeys();
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
  const draftMedia = {
    'draft-qa.jpg': 'alpine.jpg', 'draft-qa.side.jpg': 'alpine.side.jpg', 'draft-qa.mp4': 'alpine.mp4',
    'draft-qa.de-CH.vtt': 'alpine.fr-CH.vtt', 'draft-qa.fr-CH.vtt': 'alpine.fr-CH.vtt',
    'draft-qa.de-CH.txt': 'alpine.de-CH.txt', 'draft-qa.fr-CH.txt': 'alpine.fr-CH.txt',
  };
  for (const [target, source] of Object.entries(draftMedia)) copyFileSync(join(media, source), join(media, target));
  const processHandle = spawn(process.execPath, ['server.mjs'], {
    env: {
      ...process.env, PORT: '0', MOVILITY_DB: ':memory:', MOVILITY_ADMIN_PASSWORD: 'local-test',
      CODESPACES: 'true', CODESPACE_NAME: 'movility-test', GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN: 'app.github.dev',
      MOVILITY_MEDIA_DIR: media, MOVILITY_PUBLIC_ORIGIN: 'https://movility.example',
      MOVILITY_WAREHOUSE_PASSWORD: 'warehouse-fixture', MOVILITY_SUPPORT_PASSWORD: 'support-fixture',
      MOVILITY_FINANCE_PASSWORD: 'finance-fixture',
      MOVILITY_PAYMENT_MODE: 'simulated', MOVILITY_EMAIL_MODE: 'simulated', MOVILITY_EMAIL_WORKER: 'manual',
      MOVILITY_CARRIER_SECRET: carrierSecret,
      MOVILITY_PUSH_MODE: 'simulated', MOVILITY_PUSH_WORKER: 'manual',
      MOVILITY_PUSH_PUBLIC_KEY: pushKeys.publicKey, MOVILITY_PUSH_PRIVATE_KEY: pushKeys.privateKey,
      MOVILITY_PUSH_SUBJECT: 'mailto:demo@example.com',
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
    for (const name of Object.keys(draftMedia)) rmSync(join(media, name), { force: true });
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
    const html = await (await get(checkout + '?model=' + (sku || 'one'))).text();
    const [, id] = html.match(/name="id" value="([^"]+)"/);
    const [, quotedPrice] = html.match(/name="quotedPrice" value="([^"]+)"/);
    return {
      id, quotedPrice, email: 'demo@example.com', name: 'Client Démo', street: 'Route de Test 1', country: 'CH', zip: '1201',
      city: 'Genève', method, result: 'paid', model: sku || 'one',
    };
  };

  for (const locale of ['de-CH', 'fr-CH']) {
    const response = await get('/' + locale);
    const homepage = await response.text();
    assert.match(homepage, /<a class="brand"[^>]*>[\s\S]*?Mobility<\/a>/);
    const legacyModel = await get('/' + locale + '/movility-one?view=side');
    assert.equal(legacyModel.status, 308);
    assert.equal(legacyModel.headers.get('location'), '/' + locale + '/mobility-one?view=side');
    const legacyViewer = await get('/' + locale + '/movility-one/3d');
    assert.equal(legacyViewer.headers.get('location'), '/' + locale + '/mobility-one/3d');
    const product = await (await get('/' + locale + '/mobility-one')).text();
    assert.match(product, /itemprop="name">Mobility One/);

    const prefix = '/' + locale;
    const entry = await get(prefix + '/checkout');
    assert.equal(entry.headers.get('location'), prefix + '/checkout/cart');
    const empty = await get(prefix + '/checkout/cart');
    assert.equal(empty.status, 409);
    const emptyHtml = await empty.text();
    assert.match(emptyHtml, /basket-empty/);
    assert.doesNotMatch(emptyHtml, /name="quotedPrice"|name="model"/);
    const direct = await (await get(prefix + '/checkout?model=one')).text();
    assert.match(direct, /name="model" value="one"/);
    assert.equal((await post(prefix + '/checkout', {})).status, 409);

    assert.match(homepage, /class="main-with-feature">\s*<section class="home-hero"[\s\S]*id="catalogue"/);
    assert.match(homepage, /<h1 id="home-title"/);
    assert.doesNotMatch(homepage, /data-home-discovery/);
    assert.match(homepage, /home-hero-media demo-photo/);
    assert.match(homepage, /home-model-detail[\s\S]*movility-one-side\.jpg[\s\S]*mobility-one\?view=side#gallery/);
    assert.doesNotMatch(homepage, /src="\/assets\/discovery-(?:compare|accessories)\.jpg"/);
    assert.ok(homepage.includes('href="/' + locale + '?family=wheelchair#catalogue"'));
    assert.ok(homepage.includes('href="/' + locale + '/compare"'));
    assert.ok(homepage.includes('href="/' + locale + '/contact"'));
    assert.ok(homepage.includes('href="/' + locale + '?family=spare#catalogue"'));
    const cards = await (await get('/' + locale + '?family=wheelchair')).text();
    assert.match(cards, /catalog-price-row[\s\S]*catalog-product-specs[\s\S]*catalog-compare/);
    assert.match(cards, /60 cm/);
    assert.match(cards, /27 kg/);
    assert.match(cards, /20 km/);
    assert.match(homepage, /<details class="storefront-menu">[\s\S]*<summary class="header-control"/);
    assert.match(homepage, locale === 'de-CH' ? /aria-label="Français">FRA<\/a>/ : /aria-label="Deutsch">DE<\/a>/);
    assert.match(homepage, new RegExp('href="/' + locale + '/cart" aria-label="(?:Warenkorb|Panier)"[^>]*>\\s*<svg'));
  }
  assert.match((await get('/assets/home-discovery.js')).headers.get('content-type'), /javascript/);
  assert.equal((await get('/assets/discovery-compare.jpg')).headers.get('content-type'), 'image/jpeg');
  assert.equal((await get('/assets/discovery-accessories.jpg')).headers.get('content-type'), 'image/jpeg');
  const publicHost = { Host: 'movility.example', Origin: 'https://movility.example' };
  const publicOrder = '/fr-CH/orders/00000000-0000-0000-0000-000000000000';
  const postForHost = (path, fields, matchingHost) => new Promise((resolve, reject) => {
    const outgoing = request(base + path, { method: 'POST',
      headers: { ...matchingHost, 'Content-Type': 'application/x-www-form-urlencoded' } }, async response => {
      try {
        const chunks = [];
        for await (const chunk of response) chunks.push(chunk);
        resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString() });
      } catch (error) { reject(error); }
    });
    outgoing.on('error', reject);
    outgoing.end(new URLSearchParams(fields).toString());
  });
  const publicRecovery = await postForHost(publicOrder, { email: 'fixture@example.com' }, publicHost);
  assert.equal(publicRecovery.status, 303);
  assert.equal(publicRecovery.headers.location, '/fr-CH/guest-access?requested=1');
  assert.equal((await post(publicOrder, { email: 'fixture@example.com' }, { Origin: publicHost.Origin })).status, 403);
  assert.match(await (await get('/fr-CH/mobility-one')).text(), /\/de-CH\/mobility-one/);
  const contact = await (await get('/fr-CH/contact')).text();
  assert.match(contact, /<h1 class="page-title">Contact<\/h1>/);
  assert.match(contact, /href="\/de-CH\/contact" lang="de-CH"/);
  assert.match(contact, /Envoyer le message/);
  assert.match(await (await get('/de-CH/contact')).text(), /Nachricht senden/);
  const contactFields = { name: 'QA Contact', email: 'contact-fixture@example.com', topic: 'compatibility',
    message: '<img src=x onerror=alert(1)>', reference: 'DEMO-42' };
  const invalidContact = await post('/fr-CH/contact', { ...contactFields, email: 'invalid' });
  assert.equal(invalidContact.status, 400);
  assert.match(await invalidContact.text(), /href="#contact-email"/);
  const contactSent = await post('/fr-CH/contact', contactFields);
  assert.equal(contactSent.headers.get('location'), '/fr-CH/contact?sent=1');
  assert.match(await (await get(contactSent.headers.get('location'))).text(), /Merci pour votre message/);
  const contactInbox = '/admin/contact';
  assert.equal((await get(contactInbox)).status, 401);
  assert.equal((await get(contactInbox, roleHeaders('finance'))).status, 403);
  const inbox = await (await get(contactInbox, roleHeaders('support'))).text();
  assert.match(inbox, /QA Contact[\s\S]*DEMO-42[\s\S]*&lt;img src=x onerror=alert\(1\)&gt;/);
  const inquiry = inbox.match(/name="id" value="(\d+)"/)[1];
  assert.equal((await post(contactInbox, { id: inquiry, status: 'resolved' }, roleHeaders('support'))).status, 303);
  assert.doesNotMatch(await (await get(contactInbox, roleHeaders('support'))).text(), /QA Contact/);
  assert.match(await (await get(contactInbox + '?resolved=1', roleHeaders('support'))).text(), /QA Contact/);
  assert.equal((await post('/fr-CH/contact', contactFields)).status, 303);
  assert.equal((await post('/fr-CH/contact', contactFields)).status, 303);
  assert.equal((await post('/fr-CH/contact', contactFields)).status, 429);
  assert.match(await (await get('/fr-CH')).text(), /href="\/fr-CH#catalogue">Voir le catalogue[\s\S]*Comment savoir si une pièce est compatible/);
  const faqPath = '/admin/faqs';
  assert.equal((await get(faqPath)).status, 401);
  assert.equal((await get(faqPath, roleHeaders('support'))).status, 403);
  assert.match(await (await get(faqPath, { Authorization: auth })).text(), /Wie finde ich den passenden Rollstuhl\?/);
  const newFaq = {
    question_de: 'Testfrage zum Zubehör?', answer_de: 'Antwort <strong>als Text</strong>.',
    question_fr: 'Question de test sur les accessoires ?', answer_fr: 'Réponse de test.',
    position: '1', destination: '/contact', label_de: 'Kontaktieren', label_fr: 'Nous contacter',
  };
  const faqAuth = { Authorization: auth };
  assert.equal((await post(faqPath, { ...newFaq, question_fr: '' }, faqAuth)).status, 400);
  assert.equal((await post(faqPath, { ...newFaq, destination: '//outside.example' }, faqAuth)).status, 400);
  assert.equal((await post(faqPath, newFaq, faqAuth)).status, 303);
  assert.doesNotMatch(await (await get('/de-CH')).text(), /Testfrage zum Zubehör/);
  assert.equal((await post(faqPath + '/9', { ...newFaq, revision: '0', published: '1' }, faqAuth)).status, 303);
  assert.match(await (await get('/de-CH')).text(), /Testfrage zum Zubehör\?[\s\S]*&lt;strong&gt;als Text&lt;\/strong&gt;[\s\S]*Wie finde ich den passenden Rollstuhl/);
  assert.match(await (await get('/fr-CH')).text(), /Question de test sur les accessoires[\s\S]*href="\/fr-CH\/contact">Nous contacter/);
  assert.equal((await post(faqPath + '/9', { ...newFaq, revision: '0' }, faqAuth)).status, 409);
  assert.equal((await post(faqPath + '/9', { ...newFaq, revision: '1' }, faqAuth)).status, 303);
  assert.doesNotMatch(await (await get('/fr-CH')).text(), /Question de test sur les accessoires/);
  assert.match(await (await get('/de-CH/about')).text(), /<h1 class="page-title">Über uns<\/h1>/);
  for (const [locale, other] of [['de-CH', 'fr-CH'], ['fr-CH', 'de-CH']]) {
    const about = await (await get('/' + locale + '/about')).text();
    assert.match(about, /eigenen Warenbestand in der Schweiz|notre propre stock en Suisse/);
    assert.match(about, /ausschliesslich innerhalb der Schweiz|exclusivement en Suisse/);
    for (const path of ['?family=wheelchair#catalogue', '/compare', '/contact']) {
      assert.ok(about.includes('href="/' + locale + path + '"'));
    }
    for (const page of ['/about', '/contact', '/delivery-returns-warranty']) {
      const response = await get('/' + locale + page);
      assert.equal(response.status, 200);
      const html = await response.text();
      const footer = html.slice(html.indexOf('<footer>'));
      assert.ok(html.includes('href="/' + other + page + '" lang="' + other + '"'));
      for (const link of ['/contact', '/delivery-returns-warranty#delivery', '/delivery-returns-warranty#returns',
        '/delivery-returns-warranty#warranty', '/impressum', '/privacy', '/terms', '/analytics']) {
        assert.ok(footer.includes('href="/' + locale + link + '"'));
      }
    }
  }
  const aboutEditor = '/admin/content/about';
  const contactEditor = '/admin/content/contact';
  const editorAuth = { Authorization: auth };
  assert.equal((await get(aboutEditor)).status, 401);
  assert.equal((await get('/assets/about-editorial.jpg')).headers.get('content-type'), 'image/jpeg');
  for (const locale of ['de-CH','fr-CH']) {
    const path = aboutEditor + '/preview/' + locale;
    assert.equal((await get(path)).status, 401);
    assert.equal((await get(path, roleHeaders('support'))).status, 403);
    const privatePage = await get(path, editorAuth);
    assert.match(privatePage.headers.get('cache-control'), /no-store/);
    assert.match(await privatePage.text(), /about-story[\s\S]*about-today/);
    const publicPage = await (await get('/' + locale + '/about')).text();
    assert.doesNotMatch(publicPage, /about-story|about-preview-note/);
    assert.match(publicPage, /storefront-nav[\s\S]*\/about" aria-current="page"/);
  }
  const draftFields = { revision: '0', de_alt: 'QA DE Bild', fr_alt: 'QA FR Image',
    de_story_0: 'Privates Testkapitel', de_story_1: 'Zweiter Absatz', de_story_2: 'Dritter Absatz',
    fr_story_0: 'Récit privé de test', fr_story_1: 'Deuxième paragraphe', fr_story_2: 'Troisième paragraphe' };
  assert.equal((await post(aboutEditor + '/draft', draftFields, editorAuth)).status, 303);
  assert.match(await (await get(aboutEditor + '/preview/fr-CH', editorAuth)).text(), /QA FR Image[\s\S]*Récit privé de test/);
  assert.doesNotMatch(await (await get('/fr-CH/about')).text(), /QA FR Image|Récit privé de test/);

  assert.equal((await get(contactEditor, roleHeaders('support'))).status, 403);
  assert.match(await (await get(aboutEditor + '?lang=fr-CH', editorAuth)).text(), /Titre du bloc/);
  const aboutChanges = { revision: '0', title_de: 'Über Mobility', intro_de: 'Mobilität und Alltag',
    title_fr: 'Le projet Mobility', intro_fr: 'Mobilité et vie quotidienne',
    heading_de_0: 'Unser Angebot', body_de_0: 'Testtext <script>als Text</script>',
    heading_fr_0: 'Notre gamme', body_fr_0: 'Un texte de test' };
  assert.equal((await post(aboutEditor, { ...aboutChanges, body_fr_0: '' }, editorAuth)).status, 400);
  assert.equal((await post(aboutEditor, aboutChanges, editorAuth)).status, 303);
  const editedGerman = await (await get('/de-CH/about')).text();
  assert.match(editedGerman, /<title>Über Mobility \| Mobility<\/title>/);
  assert.match(editedGerman, /Testtext &lt;script&gt;als Text&lt;\/script&gt;/);
  assert.match(await (await get('/fr-CH/about')).text(), /Le projet Mobility[\s\S]*Notre gamme/);
  assert.equal((await post(aboutEditor, aboutChanges, editorAuth)).status, 409);
  const contactChanges = { revision: '0', title_de: 'Kontakt', intro_de: 'Schreib uns.',
    title_fr: 'Contact', intro_fr: 'Écrivez à notre équipe.', email: 'service@example.com', phone: '+41 22 123 45 67',
    hours_de: 'Montag 9–17 Uhr', hours_fr: 'Lundi 9 h–17 h' };
  assert.equal((await post(contactEditor, { ...contactChanges, phone: 'javascript:alert(1)' }, editorAuth)).status, 400);
  assert.equal((await post(contactEditor, contactChanges, editorAuth)).status, 303);
  const editedContact = await (await get('/fr-CH/contact')).text();
  assert.match(editedContact, /Écrivez à notre équipe[\s\S]*Envoyer le message[\s\S]*mailto:service@example.com[\s\S]*tel:\+41221234567[\s\S]*Lundi 9 h–17 h/);
  assert.match(await (await get('/de-CH/contact')).text(), /Montag 9–17 Uhr/);
  assert.equal((await post(contactEditor, { ...contactChanges, revision: '1', email: '', phone: '', hours_de: '', hours_fr: '' }, editorAuth)).status, 303);
  assert.doesNotMatch(await (await get('/fr-CH/contact')).text(), /mailto:service@example.com|tel:\+41221234567|Lundi 9 h–17 h/);
  const service = await (await get('/fr-CH/delivery-returns-warranty')).text();
  assert.match(service, /<h1 class="page-title">Livraison, retours et garantie<\/h1>/);
  assert.match(service, /href="\/de-CH\/delivery-returns-warranty" lang="de-CH"/);
  assert.match(await (await get('/de-CH/delivery-returns-warranty')).text(), /Garantie und Kundendienst/);
  const serviceEditor = '/admin/content/delivery-returns-warranty';
  assert.equal((await get(serviceEditor)).status, 401);
  assert.equal((await get(serviceEditor, roleHeaders('support'))).status, 403);
  assert.match(await (await get(serviceEditor, editorAuth)).text(), /name="heading_de_0"[^>]*value="Lieferung"/);
  const serviceChanges = {
    revision: '0', title_de: 'Serviceinformationen', intro_de: 'Informationen zur Testbestellung.',
    title_fr: 'Informations de service', intro_fr: 'Informations pour la commande de test.',
    heading_de_0: 'Testlieferung', body_de_0: 'Lieferung wird hier erläutert.',
    heading_de_1: 'Testrückgabe', body_de_1: 'Rückgabe wird hier erläutert.',
    heading_de_2: 'Testgarantie', body_de_2: 'Garantie wird hier erläutert.',
    heading_fr_0: 'Livraison de test', body_fr_0: 'Texte de livraison.',
    heading_fr_1: 'Retour de test', body_fr_1: 'Texte de retour.',
    heading_fr_2: 'Garantie de test', body_fr_2: 'Texte <b>écrit</b> pour la garantie.',
  };
  assert.equal((await post(serviceEditor, { ...serviceChanges, body_fr_1: '' }, editorAuth)).status, 400);
  assert.equal((await post(serviceEditor, serviceChanges, editorAuth)).status, 303);
  const editedService = await (await get('/fr-CH/delivery-returns-warranty')).text();
  assert.match(editedService, /<title>Informations de service \| Mobility<\/title>/);
  assert.match(editedService, /Livraison de test[\s\S]*Retour de test[\s\S]*Texte &lt;b&gt;écrit&lt;\/b&gt; pour la garantie/);
  assert.match(await (await get('/de-CH/delivery-returns-warranty')).text(), /Testlieferung[\s\S]*Testrückgabe[\s\S]*Testgarantie/);
  assert.equal((await post(serviceEditor, serviceChanges, editorAuth)).status, 409);
  const renamedSitemap = await (await get('/sitemap.xml')).text();
  assert.match(renamedSitemap, /\/de-CH\/mobility-one<\/loc>/);
  assert.match(renamedSitemap, /\/fr-CH\/mobility-one<\/loc>/);
  assert.doesNotMatch(renamedSitemap, /\/movility-one/);
  assert.match(await (await get('/sitemap.xml')).text(), /<loc>https:\/\/movility\.example\/fr-CH\/about<\/loc>/);
  const side = await get('/fr-CH/mobility-one?view=side');
  assert.equal(side.headers.get('x-robots-tag'), 'noindex, nofollow');
  const gallery = await side.text();
  assert.match(gallery, /rel="canonical" href="https:\/\/movility\.example\/fr-CH\/mobility-one"/);
  assert.match(gallery, /hreflang="de-CH" href="https:\/\/movility\.example\/de-CH\/mobility-one"/);
  assert.match(gallery, /\/de-CH\/mobility-one\?view=side#gallery/);
  assert.match(gallery, /aria-current="true"[\s\S]*Vue de profil/);
  assert.match(gallery, /class="button secondary product-zoom"[^>]*>Agrandir l’image/);
  assert.match(gallery, /class="product-purchase"[\s\S]*class="one-fit"/);
  assert.match(gallery, /<track kind="captions" srclang="fr-CH"/);
  assert.match(gallery, /movility-one.fr-CH.txt/);
  assert.doesNotMatch(await (await get('/de-CH/mobility-one')).text(), /<video /);
  assert.match(await (await get('/sitemap.xml')).text(), /<loc>https:\/\/movility\.example\/fr-CH\/compare<\/loc>/);
  const segment = await get('/assets/movility-one.mp4', { Range: 'bytes=2-5' });
  assert.equal(segment.status, 206);
  assert.equal(segment.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal(await segment.text(), '2345');
  assert.equal((await get('/assets/movility-one.mp4', { Range: 'bytes=10-12' })).status, 416);
  const comparison = await (await get('/fr-CH/compare?first=one&second=tour')).text();
  assert.match(comparison, /<caption>Mobility One<\/caption>/);
  assert.match(comparison, /\/de-CH\/compare\?first=one&amp;second=tour/);
  assert.match(await (await get('/de-CH/compare?first=one&second=one')).text(), /<caption>Mobility One<\/caption>/);
  assert.match(await (await get('/fr-CH/mobility-one/3d')).text(), /<model-viewer/);
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
  for (const route of [checkout, '/de-CH/checkout/cart']) {
    const foreign = await post(route, { ...failedPayment, country: 'AT', zip: '1010', city: 'Wien', result: 'paid' });
    assert.equal(foreign.status, 400);
    assert.match(await foreign.text(), /id="error-country"/);
  }
  assert.equal((await post(checkout, { ...failedPayment, country: '' })).status, 400);
  const preview = { Host: 'movility-test-0.app.github.dev', Origin: 'https://movility-test-0.app.github.dev' };
  assert.match((await postForHost(checkout, failedPayment, preview)).body, /a échoué/);
  const headers = { Authorization: auth };
  const inventoryBeforeFailure = await (await get('/admin/inventory.csv?sku=one', headers)).text();
  const rejectedPayment = await post(checkout, failedPayment);
  assert.equal(rejectedPayment.status, 200);
  assert.equal(await (await get('/admin/inventory.csv?sku=one', headers)).text(), inventoryBeforeFailure);
  assert.equal((await get('/admin/orders/' + failedPayment.id, headers)).status, 404);
  assert.equal((await get(checkout + '?model=one')).status, 200);
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
  assert.match(await panel.clone().text(), /href="\/admin\/orders">Pedidos/);
  const overview = await panel.clone().text();
  assert.match(overview, /Pendientes de atención[\s\S]*Consultas sin resolver/);
  assert.match(await (await get('/admin/models?family=spare', headers)).text(),
    /href="\/admin\/models\?family=spare" aria-current="page">Recambios/);
  const warehouseNav = await (await get('/admin', roleHeaders('warehouse'))).text();
  assert.match(warehouseNav, /href="\/admin\/inventory">Movimientos de stock/);
  assert.doesNotMatch(warehouseNav, /href="\/admin\/contact"|href="\/admin\/security"|href="\/admin\/models"/);
  assert.equal(panel.headers.get('referrer-policy'), 'same-origin');
  const invalidEdit = await post('/admin/catalog', { ...edit, price: 'abc' }, headers);
  assert.equal(invalidEdit.status, 400);
  assert.match(await invalidEdit.text(), /value="abc"/);
  const saved = await post('/admin/catalog', edit, headers);
  assert.equal(saved.status, 303);
  assert.match(await (await get(saved.headers.get('location'), headers)).text(), /Cambios guardados/);
  assert.equal((await post('/admin/catalog', edit, headers)).status, 409);
  assert.match(await (await get('/fr-CH/mobility-one')).text(), /Description révisée &lt;test&gt;/);
  const stale = await post(checkout, { ...failedPayment, result: 'paid' });
  assert.equal(stale.status, 409);
  assert.match(await stale.text(), /Le prix a changé/);
  const candidates = await Promise.all([fields('TWINT'), fields('PayPal')]);
  const results = await Promise.all(candidates.map((candidate) => post(checkout, candidate)));
  assert.deepEqual(results.map(({ status }) => status).sort(), [303, 409]);
  const winner = results.findIndex(({ status }) => status === 303);
  const orderPath = results[winner].headers.get('location');
  const buyer = { Cookie: results[winner].headers.getSetCookie()[0].split(';')[0] };
  const withoutProof = await get(orderPath);
  assert.equal(withoutProof.status, 403);
  assert.doesNotMatch(await withoutProof.text(), /Paiement de test confirmé|599\.90/);
  assert.match(await (await get(orderPath, buyer)).text(), /Paiement de test confirmé/);
  const repeat = await post(checkout, candidates[winner]);
  assert.equal(repeat.headers.get('location'), orderPath);
  assert.equal(repeat.headers.get('set-cookie'), null);

  const orderId = candidates[winner].id;
  const paidOrders = await (await get('/admin/orders?status=paid', headers)).text();
  assert.equal(paidOrders.match(/href="\/admin\/orders\/[a-f0-9-]{36}\?status=paid"/g)?.length, 1);
  assert.ok(paidOrders.includes('/admin/orders/' + orderId));
  const inventory = await (await get('/admin/inventory.csv?sku=one', headers)).text();
  assert.equal(inventory.split(/\r?\n/).filter(line => line.includes(orderId)).length, 1);
  assert.equal((await get(checkout + '?model=one')).status, 409);
  const today = new Date().toISOString().slice(0, 10);
  const filters = '?status=paid&q=' + orderId.slice(0, 8) + '&from=' + today + '&to=' + today;
  const escapedFilters = filters.replaceAll('&', '&amp;');
  const orders = await (await get('/admin/orders' + filters, headers)).text();
  assert.ok(orders.includes('/admin/orders/' + orderId + escapedFilters));
  const details = await (await get('/admin/orders/' + orderId + filters, headers)).text();
  assert.ok(details.includes('/admin/orders' + escapedFilters));
  assert.match(await (await get('/admin/orders?from=2000-01-01&to=2000-01-01', headers)).text(), /No hay pedidos en este intervalo/);
  assert.match(await (await get('/admin/orders?from=2026-02-30', headers)).text(), /Revisa el intervalo de fechas/);
  const home = await (await get('/admin', headers)).text();
  assert.match(home, /href="\/admin\/orders\?status=paid"><strong>1<\/strong>/);
  assert.match(home, /href="\/admin\/stripe\?status=open"><strong>0<\/strong>/);
  assert.match(home, /href="\/admin\/mail\?status=failed"><strong>0<\/strong>/);
  const pushAddress = orderPath + '/push';
  const pushUpdate = (input, origin = base) => fetch(base + pushAddress, { method: 'POST', body: JSON.stringify(input),
    headers: { Origin: origin, 'Content-Type': 'application/json', ...buyer } });
  const orderWithPush = await get(orderPath, buyer);
  assert.match(orderWithPush.headers.get('content-security-policy'), /worker-src 'self'/);
  assert.match(await orderWithPush.text(), /Activer les notifications/);
  assert.match(await (await get('/push-worker.js')).text(), /showNotification/);
  const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/fixture',
    keys: { p256dh: generateVAPIDKeys().publicKey, auth: randomBytes(16).toString('base64url') } };
  assert.equal((await pushUpdate({ action: 'subscribe', subscription }, 'https://outside.example')).status, 403);
  assert.equal((await fetch(base + pushAddress, { method: 'POST', headers: { Origin: base }, body: '{}' })).status, 403);
  assert.deepEqual(await (await pushUpdate({ action: 'status', endpoint: subscription.endpoint })).json(), { active: false });
  assert.deepEqual(await (await pushUpdate({ action: 'subscribe', subscription })).json(), { active: true });
  const emailPath = (kind) => `/admin/${orderId}/email/${kind}`;
  assert.equal((await get(emailPath('paid'))).status, 401);
  assert.equal((await get(emailPath('shipped'), headers)).status, 404);
  const confirmation = await (await get(emailPath('paid'), headers)).text();
  assert.match(confirmation, /Mobility · Commande confirmée/);
  assert.match(confirmation, /demo@example\.com/);
  assert.match(confirmation, /Pendiente · 0 intentos/);
  assert.equal((await get('/admin/mail', finance)).status, 403);
  assert.equal((await post('/admin/mail/process', {}, support)).status, 403);
  assert.doesNotMatch(await (await get('/admin/mail', support)).text(), /Procesar cola ahora/);
  assert.equal((await post('/admin/mail/process', {}, headers)).status, 303);
  assert.equal((await post('/admin/mail/process', {}, headers)).status, 303);
  assert.match(await (await get(emailPath('paid'), support)).text(), /Aceptado en simulación · 1 intentos/);
  assert.match(confirmation, /599\.90/);
  assert.match(confirmation, /Montant:.*CHF/);
  assert.ok(confirmation.includes('Suivi de commande: https://movility.example' + orderPath));
  assert.equal((await get(emailPath('paid'), support)).status, 200);
  assert.equal((await get(emailPath('paid'), finance)).status, 403);
  assert.equal((await get(emailPath('paid'), warehouse)).status, 403);
  const adminOrderPath = '/admin/orders/' + orderId;
  const warehouseOrders = await (await get(adminOrderPath, warehouse)).text();
  assert.match(warehouseOrders, /1201 Genève/);
  assert.doesNotMatch(warehouseOrders, /demo@example\.com|Reembolsar en la simulación|Neto/);
  const supportOrders = await (await get(adminOrderPath, support)).text();
  assert.match(supportOrders, /demo@example\.com/);
  assert.doesNotMatch(supportOrders, /1201 Genève|Registrar envío|Reembolsar en la simulación/);
  const financeOrders = await (await get(adminOrderPath, finance)).text();
  assert.match(financeOrders, /Reembolsar en la simulación/);
  assert.doesNotMatch(financeOrders, /1201 Genève|demo@example\.com|Registrar envío/);
  assert.equal((await post(`/admin/${orderId}/refund`, {}, warehouse)).status, 403);
  assert.equal((await post(`/admin/${orderId}/ship`, { tracking: 'CH-DEMO-1' }, headers)).status, 409);
  const firstShip = { tracking: 'CH-DEMO-1', serial_one: 'one-demo-01' };
  assert.equal((await post(`/admin/${orderId}/ship`, firstShip, support)).status, 403);
  assert.equal((await post(`/admin/${orderId}/ship`, firstShip, finance)).status, 403);
  assert.equal((await post(`/admin/${orderId}/ship`, firstShip, warehouse)).status, 303);
  assert.equal((await post(`/admin/${orderId}/ship`, firstShip, headers)).status, 303);
  assert.match(await (await get(orderPath, buyer)).text(), /CH-DEMO-1/);
  const shipmentEmail = await (await get(emailPath('shipped'), headers)).text();
  const trackingLink = shipmentEmail.match(/href="(\/fr-CH\/shipment\/[A-Za-z0-9_-]{43})"/)[1];
  assert.match(shipmentEmail, /Montant:.*CHF/);
  assert.ok(shipmentEmail.includes('https://movility.example' + trackingLink));
  const publicShipment = await get(trackingLink);
  assert.equal(publicShipment.status, 200);
  assert.equal(publicShipment.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(publicShipment.headers.get('cache-control'), 'no-store');
  const shipmentDetails = await publicShipment.text();
  assert.match(shipmentDetails, /CH-DEMO-1/);
  assert.doesNotMatch(shipmentDetails, /Mobility One ·|599\.90|demo@example|Route de Test 1|Commande confirmée/);
  assert.equal((await get(trackingLink.slice(0, -1) + (trackingLink.endsWith('A') ? 'B' : 'A'))).status, 404);
  const trackingPath = `/admin/${orderId}/tracking`;
  const simulated = { eventId: randomUUID(), status: 'transit' };
  assert.equal((await post(trackingPath, simulated, finance)).status, 403);
  assert.equal((await post(trackingPath, simulated, warehouse)).status, 303);
  assert.equal((await post(trackingPath, simulated, warehouse)).status, 303);
  assert.equal((await post(trackingPath, { ...simulated, status: 'exception' }, warehouse)).status, 409);
  assert.match(await (await get(orderPath, buyer)).text(), /En transit/);
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
  assert.match(await (await get(orderPath, buyer)).text(), /<h1 class="page-title">Commande livrée/);
  assert.doesNotMatch(await (await get(orderPath, buyer)).text(), /data-subscribe/);
  const pushQueue = '/admin/push?order=' + orderId;
  assert.equal((await get(pushQueue)).status, 401);
  const queued = await (await get(pushQueue, support)).text();
  assert.equal(queued.match(/<td>Expedici.n<\/td>/g)?.length, 1);
  assert.equal(queued.match(/<td>Entrega<\/td>/g)?.length, 1);
  assert.equal(queued.match(/<td>Pendiente<\/td>/g)?.length, 2);
  assert.doesNotMatch(queued, /fcm.googleapis|demo@example/);
  assert.deepEqual(await (await pushUpdate({ action: 'unsubscribe', endpoint: subscription.endpoint })).json(), { active: false });
  const canceled = await (await get(pushQueue, support)).text();
  assert.equal(canceled.match(/<td>Cancelado<\/td>/g)?.length, 2);
  assert.deepEqual(await (await pushUpdate({ action: 'subscribe', subscription })).json(), { active: false });
  const deliveryEmail = await (await get(emailPath('delivered'), support)).text();
  assert.match(deliveryEmail, /Mobility · Commande livrée/);
  assert.ok(deliveryEmail.includes('href="' + trackingLink + '"'));
  assert.match(await (await get(trackingLink)).text(), /<strong>Livré<\/strong>/);
  const shippedDetails = await (await get(adminOrderPath, headers)).text();
  assert.match(shippedDetails, /CH-DEMO-1/);
  assert.match(shippedDetails, /ONE-DEMO-01/);
  const trackingOrders = await (await get(adminOrderPath, support)).text();
  assert.equal(trackingOrders.match(new RegExp('/admin/' + orderId + '/email/delivered', 'g'))?.length, 1);
  for (let i = 0; i < 2; i++) {
    assert.equal((await post(`/admin/${orderId}/refund`, {}, headers)).status, 303);
  }
  const admin = await (await get('/admin', headers)).text();
  assert.match(admin, /Unidades disponibles: 0 · Pedidos: 1/);
  assert.doesNotMatch(admin, /1201 Genève/);
  assert.match(admin, /Desglose por forma de pago/);
  assert.match(admin, new RegExp('<th scope="row">' + candidates[winner].method + '</th><td>1</td>'));
  assert.equal((await (await get(adminOrderPath, headers)).text()).match(/Paiement de test remboursé/g)?.length, 1);
  assert.match(await (await get(emailPath('shipped'), headers)).text(), /Numéro de suivi: CH-DEMO-1/);
  assert.match(await (await get(emailPath('refunded'), headers)).text(), /Mobility · Paiement remboursé/);
  assert.doesNotMatch(await (await get(emailPath('paid'), headers)).text(), /CH-DEMO-1/);
  assert.match(await (await get('/admin?status=paid', headers)).text(), /No hay pedidos con este estado/);
  const filteredOrders = await (await get('/admin/orders?status=refunded&q=ch-demo-1', headers)).text();
  assert.ok(filteredOrders.includes(adminOrderPath));
  assert.doesNotMatch(filteredOrders, /1201 Genève/);
  assert.doesNotMatch(await (await get('/admin/orders?q=ch-demo-1', finance)).text(), /CH-DEMO-1/);
  assert.equal((await get(adminOrderPath)).status, 401);
  assert.match(await (await get(orderPath, buyer)).text(), /Paiement de test remboursé/);
  assert.equal((await post('/admin/restock', {}, headers)).status, 303);
  assert.equal((await post('/admin/restock', {}, headers)).status, 303);
  assert.match(await (await get('/admin', headers)).text(), /Unidades disponibles: 1 · Pedidos: 1/);
  assert.equal((await post('/admin/catalog', { ...edit, expectedPrice: '259990', price: '999' }, headers)).status, 303);
  assert.match(await (await get(orderPath, buyer)).text(), /599\.90/);
  const model = { sku: 'alpine', name: 'Mobility Alpine', price: '3199', units: '1',
    active: '1', description_de: 'Testmodell für den Alltag', description_fr: 'Modèle de test',
    width: '60', weight: '', range: '0', length: '91', max_load: '125', fold: '1' };
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
  assert.match(await (await get('/de-CH')).text(), /Mobility Alpine/);
  assert.match(await (await get('/fr-CH/compare?first=alpine&second=one')).text(), /Mobility Alpine \/ Mobility One/);
  for (const locale of ['de-CH', 'fr-CH']) {
    const path = '/' + locale + '/models/alpine';
    const response = await get(path + '?view=side');
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    const product = await response.text();
    assert.ok(product.includes('<title>Mobility Alpine | Mobility</title>'));
    assert.ok(product.includes('rel="canonical" href="https://movility.example' + path + '"'));
    for (const language of ['de-CH', 'fr-CH']) {
      assert.ok(product.includes('hreflang="' + language + '" href="https://movility.example/' + language + '/models/alpine"'));
    }
    assert.match(product, /itemprop="priceCurrency" content="CHF"/);
    assert.match(product, /itemprop="price" content="3199.00"/);
    assert.match(product, /schema.org\/InStock/);
    assert.match(product, />91 cm<.*>0 km<.*>125 kg</);
    assert.doesNotMatch(product, />0 kg</);
    const compare = await (await get('/' + locale + '/compare?first=alpine&second=one')).text();
    assert.ok(compare.includes('href="' + path + '?first=alpine&amp;second=one">Mobility Alpine</a>'));
    assert.match(compare, />0 km<.*>20 km · (?:Demowert|Valeur de démonstration)</);
    assert.match(compare, /Keine Angabe|Non renseign/);
  }
  assert.ok((await (await get('/sitemap.xml')).text()).includes('https://movility.example/fr-CH/models/alpine'));
  const extra = await Promise.all([fields('Visa', 'alpine'), fields('PayPal', 'alpine')]);
  const extraResults = await Promise.all(extra.map(candidate => post(checkout, candidate)));
  assert.deepEqual(extraResults.map(({ status }) => status).sort(), [303, 409]);
  const extraWinner = extraResults.find(({ status }) => status === 303);
  assert.match(await (await get('/fr-CH/models/alpine')).text(), /schema.org\/OutOfStock/);
  for (const locale of ['de-CH', 'fr-CH']) {
    const prefix = '/' + locale;
    const compared = await (await get(prefix + '/compare?family=spare&compatible=one&first=alpine&second=one')).text();
    assert.match(compared, /compare-selection/);
    assert.match(compared, /<thead[\s\S]*Mobility Alpine[\s\S]*Mobility One[\s\S]*<tbody/);
    const back = prefix + '?family=spare&compatible=one&first=alpine&second=one#catalogue';
    assert.ok(compared.includes('href="' + back.replaceAll('&', '&amp;') + '"'));
    const returned = await (await get(back)).text();
    assert.match(returned, /compare-selection[\s\S]*Mobility Alpine[\s\S]*Mobility One/);
    const removed = await (await get(prefix + '/compare?family=spare&compatible=one&first=one&second=')).text();
    assert.match(removed, /<caption>Mobility One<\/caption>/);
    assert.match(removed, /first=&amp;second=/);
    const product = await (await get(prefix + '/models/alpine')).text();
    assert.ok(product.includes('href="' + prefix + '/contact?model=alpine"'));
    const advice = await (await get(prefix + '/contact?model=alpine')).text();
    assert.match(advice, /<option value="alpine" selected>Mobility Alpine<\/option>/);
    assert.match(advice, /<option value="">(?:Sans modèle|Ohne Modell)<\/option>/);
    const ticket = { ...contactFields, email: locale + '@example.com', topic: 'advice', model: 'alpine' };
    const confirmation = await post(prefix + '/contact', ticket);
    assert.equal(confirmation.status, 303);
    assert.match(await (await get(confirmation.headers.get('location'))).text(), /Merci pour votre message|Danke für deine Nachricht/);
  }
  assert.match(await (await get('/admin/contact', support)).text(), /SKU <code>alpine<\/code>/);
  const extraOrder = extraWinner.headers.get('location');
  const extraBuyer = { Cookie: extraWinner.headers.getSetCookie()[0].split(';')[0] };
  assert.match(await (await get(extraOrder, extraBuyer)).text(), /Mobility Alpine/);
  assert.equal((await post('/admin/models/alpine', { ...model, revision: '0', active: '0' }, headers)).status, 409);
  assert.equal((await post('/admin/models/alpine', { ...model, revision: '1', name: 'Alpine édition 2', units: '0', active: '0' }, headers)).status, 303);
  assert.equal((await get('/fr-CH/models/alpine')).status, 404);
  assert.equal((await get('/assets/models/alpine.glb')).status, 404);
  assert.equal((await get('/assets/models/alpine.mp4')).status, 404);
  assert.equal((await get('/fr-CH/checkout?model=alpine')).status, 409);
  assert.doesNotMatch(await (await get('/fr-CH/compare')).text(), /Alpine/);
  assert.match(await (await get(extraOrder, extraBuyer)).text(), /Mobility Alpine/);
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
  assert.match(basket, /Mobility One/);
  assert.match(basket, /Mobility Alpine/);
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
      country: 'CH', zip: '1201', city: 'Genève', method: 'TWINT', result: 'paid',
    };
  };
  for (const locale of ['de-CH', 'fr-CH']) {
    const basketPath = '/' + locale + '/cart';
    const added = await (await get(basketPath + '?added=alpine', cartHeaders())).text();
    assert.match(added, /cart-feedback[\s\S]*Mobility Alpine[\s\S]*href="#basket-items"/);
    const quoteFields = await quote();
    const invalidCheckout = await post('/' + locale + '/checkout/cart', { ...quoteFields, zip: '123' }, cartHeaders());
    assert.equal(invalidCheckout.status, 400);
    const corrected = await invalidCheckout.text();
    assert.match(corrected, /id="error-zip"/);
    assert.match(corrected, /value="basket@example.com"/);
    assert.match(corrected, /value="TWINT" checked/);
    assert.ok(corrected.includes('href="' + basketPath + '"'));
    assert.match(corrected, /checkout-confirm-total.*CHF/);
  }
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
  const basketBuyer = { Cookie: winningBasket.headers.getSetCookie().find(value => value.startsWith('movility_order_')).split(';')[0] };
  const summary = await (await get(basketOrder, basketBuyer)).text();
  assert.match(summary, /1 × Mobility One/);
  assert.match(summary, /2 × Mobility Alpine/);
  const basketOrderId = basketOrder.split('/').at(-1);
  assert.match(await (await get(`/admin/${basketOrderId}/email/paid`, headers)).text(), /2 × Mobility Alpine/);
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
  assert.match(await (await get('/admin/orders/' + shippedId, headers)).text(), /Recibidas: 2 de 2 · Repuestas: 1 · En revisión: 1/);
  assert.match(await (await get('/admin', headers)).text(), /Unidades disponibles: 0/);
  assert.equal((await post(actionPath('return'), { ...firstReceipt, receipt: randomUUID(), sku: 'one', serial: 'ONE-DEMO-02' }, headers)).status, 303);
  assert.match(await (await get('/admin', headers)).text(), /Unidades disponibles: 1/);
  assert.match(await (await get('/admin/models', headers)).text(), /Publicado · 1 ud\./);
  const balances = await (await get('/admin/inventory?sku=alpine', headers)).text();
  assert.match(balances, /alpine<\/p><dl[^>]*>[\s\S]*?Vendibles<\/dt><dd>1<\/dd>[\s\S]*?Devoluciones en revisión<\/dt><dd>1<\/dd>/u);
  assert.ok(balances.includes('/admin/inventory?sku=alpine#stock-history'));
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
  const serialHistory = await (await get('/admin/orders/' + shippedId, headers)).text();
  assert.match(serialHistory, /ALPINE-01<\/code> · Repuesto/);
  assert.match(serialHistory, /ALPINE-02<\/code> · En revisión/);
  const resold = await post('/de-CH/checkout', await fields('Visa', 'alpine'));
  const resoldId = resold.headers.get('location').split('/').at(-1);
  assert.equal((await get(checkout + '?model=alpine')).status, 409);
  assert.equal((await post(`/admin/${resoldId}/ship`, { tracking: 'CH-RESOLD', serial_alpine: 'ALPINE-02' }, headers)).status, 409);
  assert.equal((await post(`/admin/${resoldId}/ship`, { tracking: 'CH-RESOLD', serial_alpine: 'ALPINE-01' }, headers)).status, 303);
  assert.equal((await get('/admin/serials?serial=alpine-01')).status, 401);
  const serialLookup = await (await get('/admin/serials?serial=alpine-01', headers)).text();
  assert.match(serialLookup, /CH-RESOLD/);
  assert.match(serialLookup, /CH-STOCK-2/);
  assert.match(serialLookup, /Devuelto y repuesto/);
  const germanEmail = kind => '/admin/' + resoldId + '/email/' + kind;
  const germanReceipt = await (await get(germanEmail('paid'), headers)).text();
  assert.ok(germanReceipt.includes('Bestellstatus: https://movility.example/de-CH/orders/' + resoldId));
  assert.match(germanReceipt, /lang="de-CH">Mobility.*Bestellung best/);
  assert.match(germanReceipt, /Betrag:.*CHF/);
  const germanShipment = await (await get(germanEmail('shipped'), headers)).text();
  assert.match(germanShipment, /lang="de-CH">Mobility.*Bestellung versendet/);
  assert.match(germanShipment, /Betrag:.*CHF/);
  assert.match(germanShipment, /Sendungsnummer: CH-RESOLD/);
  const germanTracking = germanShipment.match(/href="(\/de-CH\/shipment\/[A-Za-z0-9_-]{43})"/)[1];
  assert.ok(germanShipment.includes('https://movility.example' + germanTracking));
  assert.match(await (await get(germanTracking)).text(), /CH-RESOLD/);
  for (let run = 0; run < 2; run++) assert.equal((await post('/admin/mail/process', {}, headers)).status, 303);
  for (const route of [germanEmail('paid'), germanEmail('shipped'), emailPath('paid'), emailPath('shipped')]) {
    assert.match(await (await get(route, headers)).text(), /Aceptado en simulaci.n.*1 intentos/);
  }
  const funnel = '/admin/analytics';
  const count = (html, stage, n) => assert.match(html, new RegExp('<th scope="row">' + stage + '</th><td>' + n + '</td>'));
  assert.equal((await get(funnel, support)).status, 403);
  count(await (await get(funnel, finance)).text(), 'Ficha de producto', 0);
  const visit = await get('/fr-CH/mobility-one');
  assert.equal(visit.headers.get('set-cookie'), null);
  assert.match(await visit.text(), /Seulement les cookies nécessaires/);
  const reject = await post('/fr-CH/analytics', { choice: 'decline', return: '//example.com' });
  assert.equal(reject.headers.get('location'), '/fr-CH');
  const rejected = reject.headers.get('set-cookie').split(';')[0];
  await get('/fr-CH/mobility-one', { Cookie: rejected });
  count(await (await get(funnel, finance)).text(), 'Ficha de producto', 0);
  const accepted = await post('/fr-CH/analytics', { choice: 'accept', return: '/fr-CH/mobility-one' });
  assert.equal(accepted.headers.get('location'), '/fr-CH/mobility-one');
  const analytics = accepted.headers.get('set-cookie').split(';')[0];
  await get('/fr-CH/mobility-one', { Cookie: analytics });
  await get('/de-CH/mobility-one', { Cookie: analytics });
  const add = await post('/de-CH/cart', { action: 'add', sku: 'one' }, { Cookie: analytics });
  const basketOnly = add.headers.get('set-cookie').split(';')[0];
  const journey = { Cookie: analytics + '; ' + basketOnly };
  const funnelCheckout = await (await get(basketCheckout, journey)).text();
  const analyticsPurchase = {
    id: funnelCheckout.match(/name="id" value="([^"]+)"/)[1],
    cartQuote: funnelCheckout.match(/name="cartQuote" value="([^"]+)"/)[1].replaceAll('&quot;', '"'),
    email: 'metrics@example.com', name: 'Client Demo', street: 'Rue de Test 1', country: 'CH', zip: '1201',
    city: 'Genève', method: 'Visa', result: 'paid',
  };
  const incompleteJourneys = [];
  for (const addToBasket of [false, true]) {
    const choice = await post('/fr-CH/analytics', { choice: 'accept', return: '/fr-CH/mobility-one' });
    const visitor = { Cookie: choice.headers.get('set-cookie').split(';')[0] };
    incompleteJourneys.push(visitor);
    await get('/fr-CH/mobility-one', visitor);
    if (addToBasket) {
      assert.equal((await post('/fr-CH/cart', { action: 'add', sku: 'one' }, visitor)).status, 303);
    }
  }
  assert.equal((await post(basketCheckout, analyticsPurchase, journey)).status, 303);
  assert.equal((await post(basketCheckout, analyticsPurchase, journey)).status, 303);
  for (const [language, label] of [['de-CH','Testverkäufe'], ['fr-CH','Ventes de test']]) {
    const report = await get(funnel + '?lang=' + language + '&from=2000-01-01&to=2000-01-01', finance);
    assert.equal(report.status, 200);
    const localized = await report.text();
    assert.ok(localized.includes('<h2 id="sales-title">' + label + '</h2>'));
    assert.match(localized, /<time datetime="2000-01-01">2000-01-01<\/time>/);
  }
  const french = await (await get(funnel + '?days=7&locale=fr-CH', finance)).text();
  count(french, 'Ficha de producto', 3);
  count(french, 'Carrito', 2);
  count(french, 'Inicio de pago', 1);
  count(french, 'Pedido confirmado', 1);
  assert.match(french, /Carrito<\/th><td>2<\/td>\s*<td>66,7\s*%<\/td><td>66,7\s*%<\/td>\s*<td>1<\/td>/);
  assert.match(french, /Inicio de pago<\/th><td>1<\/td>\s*<td>50\s*%<\/td><td>33,3\s*%<\/td>\s*<td>1<\/td>/);
  for (const visitor of incompleteJourneys) {
    assert.equal((await post('/fr-CH/analytics', { choice: 'decline' }, visitor)).status, 303);
  }
  assert.doesNotMatch(french, /metrics@example\.com|Genève/);
  count(await (await get(funnel + '?locale=de-CH', finance)).text(), 'Ficha de producto', 0);
  assert.equal((await post('/fr-CH/analytics', { choice: 'decline', return: '/fr-CH/analytics' }, journey)).status, 303);
  await get('/fr-CH/mobility-one', { Cookie: analytics });
  count(await (await get(funnel, finance)).text(), 'Ficha de producto', 0);
  for (const [sku, family] of [['test-accessory', 'accessory'], ['test-spare', 'spare']]) {
    assert.equal((await post('/admin/models', { ...model, sku, family, name: sku }, headers)).status, 303);

    for (const locale of ['de-CH', 'fr-CH']) {
      const path = '/' + locale;
      const pending = await (await get(path + '/models/' + sku)).text();
      const purchase = pending.split('class="product-purchase"')[1].split('class="product-notes"')[0];
      assert.match(purchase, /Compatibilité à confirmer|Kompatibilität noch offen/);
      assert.match(purchase, /class="button"[^>]*topic=compatibility[\s\S]*class="secondary" name="action" value="add"/);
      assert.doesNotMatch(pending, new RegExp('class="eyebrow">' + sku));
      const contact = await (await get(path + '/contact?model=' + sku + '&topic=compatibility')).text();
      assert.match(contact, /value="compatibility" selected/);
      assert.match(contact, new RegExp('value="' + sku + '" selected'));
    }
    assert.equal((await post('/admin/models/' + sku + '/compatibility', { chair: 'alpine' }, headers)).status, 303);
    for (const locale of ['de-CH', 'fr-CH']) {
      const chair = await (await get('/' + locale + '/models/alpine')).text();
      assert.ok(chair.includes('href="/' + locale + '/models/' + sku + '"'));
      const part = await (await get('/' + locale + '/models/' + sku)).text();
      assert.match(part, /product-no-gallery/);
      assert.doesNotMatch(part, /id="gallery"|<video /);
      assert.ok(part.split('class="product-purchase"')[1].split('class="product-notes"')[0].includes('href="/' + locale + '/models/alpine"'));
    }
  }
  for (const locale of ['de-CH', 'fr-CH']) {
    const root = '/' + locale;
    for (const [family, sku] of [['accessory', 'test-accessory'], ['spare', 'test-spare']]) {
      const filter = '?family=' + family + '&compatible=alpine';
      const filtered = await (await get(root + filter)).text();
      const article = root + '/models/' + sku + filter.replace('&', '&amp;');
      assert.match(filtered, /value="alpine" selected/);
      assert.equal((filtered.match(/class="catalog-product"/g) || []).length, 1);
      assert.ok(filtered.includes('href="' + article + '"'));
      const detail = await (await get(root + '/models/' + sku + filter)).text();
      assert.ok(detail.includes('href="' + root + filter.replace('&', '&amp;') + '#catalogue"'));
      const unverified = await (await get(root + '?family=' + family + '&compatible=one')).text();
      assert.doesNotMatch(unverified, /class="catalog-product"/);
      assert.match(unverified, /noch nicht bestätigen|pas encore vérifier/);
      assert.ok(unverified.includes('href="' + root + '?family=' + family + '#catalogue"'));
      assert.ok(unverified.includes('href="' + root + '/contact?model=one&amp;topic=compatibility"'));
      const contact = await (await get(root + '/contact?model=one&topic=compatibility')).text();
      assert.match(contact, /value="one" selected/);
      assert.match(contact, /value="compatibility" selected/);
    }
  }
  const draft = { ...model, sku: 'draft-qa', name: 'Draft QA', active: '0', description_de: '', description_fr: '' };
  assert.equal((await post('/admin/models', draft, headers)).status, 303);
  const draftEditor = '/admin/models/draft-qa';
  const draftCatalog = await (await get('/admin/models?q=draft-qa', headers)).text();
  assert.match(draftCatalog, /href="#draft-qa-description-de"/);
  assert.match(draftCatalog, /href="#draft-qa-description-fr"/);
  const unpublished = await post(draftEditor + '?q=draft-qa', { ...draft, revision: '0', active: '1', description_de: 'DE QA' }, headers);
  assert.equal(unpublished.status, 400);
  const errors = await unpublished.text();
  assert.match(errors, /href="#draft-qa-description-fr"/);
  assert.match(errors, />DE QA<\/textarea>/);
  assert.equal((await post(draftEditor, { ...draft, revision: '0', max_load: '-1' }, headers)).status, 400);
  const mediaPanel = await (await get(draftEditor + '/content', headers)).text();
  assert.match(mediaPanel, /href="#alt-side-de-CH"/);
  assert.match(mediaPanel, /href="#media-upload"/);
  assert.equal((await post(draftEditor + '/content/gallery', {
    order: 'side,front,rear', 'alt-side-de-CH': 'Seitenansicht QA', 'alt-side-fr-CH': 'Vue de profil QA',
  }, headers)).status, 303);
  for (const [locale, alt] of [['de-CH', 'Seitenansicht QA'], ['fr-CH', 'Vue de profil QA']]) {
    const path = draftEditor + '/preview/' + locale;
    assert.equal((await get(path)).status, 401);
    assert.equal((await get(path, warehouse)).status, 403);
    assert.equal((await get('/' + locale + '/models/draft-qa')).status, 404);
    const html = await (await get(path, headers)).text();
    assert.ok(html.includes('<html lang="' + locale + '">'));
    assert.ok(html.includes('alt="' + alt + '"'));
    assert.ok(html.includes(path + '?view=front#gallery'));
    assert.match(html, />0 km</);
    assert.ok(html.includes('/admin/assets/models/draft-qa.' + locale + '.vtt'));
    assert.ok(html.includes('/admin/assets/models/draft-qa.' + locale + '.txt'));
    assert.equal((await get('/admin/assets/models/draft-qa.side.jpg')).status, 403);
    assert.equal((await get('/assets/models/draft-qa.side.jpg')).status, 404);
    const image = await get('/admin/assets/models/draft-qa.side.jpg', headers);
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('cache-control'), 'private, no-store');
  }
  assert.equal((await post(draftEditor, { ...draft, revision: '0', active: '1', description_de: 'DE QA', description_fr: 'FR QA' }, headers)).status, 303);
  for (const [locale, alt] of [['de-CH', 'Seitenansicht QA'], ['fr-CH', 'Vue de profil QA']]) {
    const response = await get('/' + locale + '/models/draft-qa');
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes('alt="' + alt + '"'));
    assert.ok(html.includes('/assets/models/draft-qa.' + locale + '.vtt'));
  }
  const importPage = '/admin/catalog-import';
  assert.equal((await get(importPage)).status, 401);
  assert.equal((await get(importPage, warehouse)).status, 403);
  const templateResponse = await get(importPage + '/template.csv', headers);
  assert.equal(templateResponse.status, 200);
  assert.match(templateResponse.headers.get('content-type'), /text\/csv/);
  const supplierCsv = await templateResponse.text();
  const previewImport = async source => {
    const form = new FormData();
    form.set('file', new Blob([source], { type: 'text/csv' }), 'catalog.csv');
    return fetch(base + importPage, { method: 'POST', headers: { Origin: base, ...headers }, body: form });
  };
  const confirmImport = (source, html, update = '') => post(importPage + '/confirm', {
    csv: source, confirmation: html.match(/name="confirmation" value="([a-f0-9]+)"/)[1], update,
  }, headers);
  const duplicate = supplierCsv.replace('sample-wheel;spare', 'sample-bag;spare').replace('sample-chair|one', 'missing-chair');
  const invalidImport = await previewImport(duplicate);
  assert.equal(invalidImport.status, 400);
  const invalidPreview = await invalidImport.text();
  assert.match(invalidPreview, /<td>4<\/td>[\s\S]*SKU duplicado[\s\S]*missing-chair/);
  assert.doesNotMatch(invalidPreview, /Confirmar importaci.n/);
  const ready = await previewImport(supplierCsv);
  assert.equal(ready.status, 200);
  const importPreview = await ready.text();
  assert.equal((importPreview.match(/Nuevo borrador/g) || []).length, 3);
  assert.match(importPreview, /Cancelar importaci.n/);
  assert.equal((await get(importPage, headers)).status, 200);
  assert.doesNotMatch(await (await get('/admin/models?q=sample-', headers)).text(), /SKU sample-chair/);
  assert.equal((await confirmImport(supplierCsv.replace('2499.00', '2500.00'), importPreview)).status, 409);
  const imported = await confirmImport(supplierCsv, importPreview);
  assert.equal(imported.status, 200);
  const importedHtml = await imported.text();
  assert.match(importedHtml, /Creados: 3/);
  assert.match(importedHtml, /q=sample-chair&amp;edit=sample-chair#item-sample-chair/);
  assert.match(importedHtml, /sample-wheel\/preview\/fr-CH/);
  const review = await (await get('/admin/models?q=sample-chair&edit=sample-chair', headers)).text();
  assert.match(review, /<details open><summary>Editar art.culo/);
  assert.match(review, /Requisitos de publicaci.n[\s\S]*Avisos opcionales/);
  assert.match(review, /sample-chair\/content#media-upload/);
  for (const locale of ['de-CH', 'fr-CH']) {
    const route = '/admin/models/sample-chair/preview/' + locale;
    assert.equal((await get('/' + locale + '/models/sample-chair')).status, 404);
    const preview = await (await get(route, headers)).text();
    assert.ok(preview.includes('<html lang="' + locale + '">'));
    assert.match(preview, />0 km</);
    assert.ok(preview.includes('/admin/models/sample-bag/preview/' + locale));
  }
  const related = await (await get('/admin/models/sample-chair/compatibility', headers)).text();
  assert.match(related, /value="sample-bag" checked/);
  assert.match(related, /value="sample-wheel" checked/);
  const again = await (await previewImport(supplierCsv)).text();
  assert.equal((again.match(/Sin cambios/g) || []).length, 3);
  assert.match(await (await confirmImport(supplierCsv, again)).text(), /Creados: 0.*Actualizados: 0/);
  const receiving = '/admin/inventory/receive';
  const receiptForm = await (await get('/admin/inventory?sku=sample-chair', warehouse)).text();
  assert.match(receiptForm, /Recibir stock del proveedor/);
  const receipt = receiptForm.match(/name="receipt" value="([^"]+)"/)[1];
  const received = { sku: 'sample-chair', receipt, quantity: '2', serials: 'QA-CHAIR-01\nqa-chair-02' };
  assert.equal((await post(receiving, received, support)).status, 403);
  assert.equal((await post(receiving, { ...received, serials: 'QA-CHAIR-01\nqa-chair-01' }, warehouse)).status, 409);
  assert.equal((await post(receiving, received, warehouse)).status, 303);
  assert.equal((await post(receiving, received, warehouse)).status, 303);
  assert.equal((await post(receiving, { ...received, receipt: randomUUID() }, warehouse)).status, 409);
  assert.equal((await post(receiving, { sku: 'sample-bag', receipt: randomUUID(), quantity: '1' }, warehouse)).status, 303);
  const before = await (await get('/admin/inventory?sku=sample-chair', warehouse)).text();
  assert.match(before, /Unidades f.sicas sin publicar: 2/);
  assert.equal((before.match(/Recepci.n de proveedor/g) || []).length, 1);
  assert.match(before, /QA-CHAIR-02/);
  const serialPath = '/admin/serials?serial=qa-chair-01';
  assert.match(await (await get(serialPath, warehouse)).text(), /Recepci.n de proveedor[\s\S]*SKU sample-chair/);

  const chair = { ...model, name: 'Silla de prueba', price: '2499.00', units: '2', revision: '1',
    description_de: 'Fiktiver Elektrorollstuhl', description_fr: 'Fauteuil roulant électrique fictif',
    width: '60', weight: '27', range: '0', length: '95', height: '92', max_load: '120' };
  assert.equal((await post('/admin/models/sample-chair', chair, headers)).status, 303);
  assert.equal((await post('/admin/models/sample-bag', { ...chair, family: 'accessory', name: 'Bolsa de prueba',
    price: '49.00', units: '1', description_de: 'Fiktive Tasche', description_fr: 'Sac fictif' }, headers)).status, 303);
  assert.equal((await post('/admin/models/sample-wheel', { ...chair, family: 'spare', name: 'Rueda de prueba',
    price: '89.00', units: '0', revision: '0', description_de: 'Fiktives Ersatzrad',
    description_fr: 'Roue de rechange fictive' }, headers)).status, 303);
  for (const locale of ['de-CH', 'fr-CH']) {
    const chairPage = await (await get('/' + locale + '/models/sample-chair')).text();
    assert.match(chairPage, /itemprop="price" content="2499.00"/);
    assert.match(chairPage, /schema.org\/InStock/);
    for (const sku of ['sample-bag', 'sample-wheel']) assert.ok(chairPage.includes('/' + locale + '/models/' + sku));
    const exhausted = await (await get('/' + locale + '/models/sample-wheel')).text();
    assert.match(exhausted, /schema.org\/OutOfStock/);
    assert.equal((await get('/' + locale + '/checkout?model=sample-wheel')).status, 409);
    assert.equal((await post('/' + locale + '/checkout', { id: randomUUID(), quotedPrice: '8900', model: 'sample-wheel',
      email: 'demo@example.com', name: 'Test', street: 'Rue Test 1', country: 'CH', zip: '1201',
      city: 'Geneve', method: 'Visa', result: 'paid' })).status, 409);
  }
  const updatedCsv = supplierCsv.replace('2499.00', '2599.00').replace('Fiktiver Elektrorollstuhl', 'Neu beschriebener Rollstuhl')
    .replace('Fauteuil roulant électrique fictif', 'Fauteuil électrique révisé');
  const toUpdate = await (await previewImport(updatedCsv)).text();
  assert.match(toUpdate, /2499.00 → 2599.00/);
  assert.match(toUpdate, /Fiktiver Elektrorollstuhl → Neu beschriebener Rollstuhl/);
  assert.match(toUpdate, /Fauteuil roulant électrique fictif → Fauteuil électrique révisé/);
  assert.equal((await confirmImport(updatedCsv, toUpdate)).status, 400);
  assert.equal((await confirmImport(updatedCsv, toUpdate, 'yes')).status, 200);
  const preserved = await (await get('/admin/models?q=sample-chair', headers)).text();
  assert.match(preserved, /Publicado · 2 ud/);
  const publicModel = await (await get('/fr-CH/models/sample-chair')).text();
  assert.match(publicModel, /itemprop="price" content="2599.00"/);
  assert.match(publicModel, /Fauteuil électrique révisé/);
  assert.match(publicModel, /sample-bag[\s\S]*sample-wheel/);
  assert.match(await (await get(serialPath, warehouse)).text(), /Recepci.n de proveedor[\s\S]*SKU sample-chair/);
  const after = await (await get('/admin/inventory?sku=sample-chair', warehouse)).text();
  assert.equal((after.match(/Recepci.n de proveedor/g) || []).length, 1);
  const purchase = await post(checkout, await fields('Visa', 'sample-chair'));
  assert.equal(purchase.status, 303);
  const purchasedId = purchase.headers.get('location').split('/').at(-1);
  assert.equal((await post('/admin/' + purchasedId + '/ship', {
    tracking: 'QA-SUPPLIER-SHIPMENT', 'serial_sample-chair': 'qa-chair-01',
  }, warehouse)).status, 303);
  assert.match(await (await get(serialPath, warehouse)).text(), /Recepci.n de proveedor[\s\S]*QA-SUPPLIER-SHIPMENT/);
  let changingCart = {};
  for (const sku of ['sample-chair', 'sample-bag']) {
    const added = await post('/de-CH/cart', { sku, action: 'add' }, changingCart);
    assert.equal(added.headers.get('location'), '/de-CH/cart?added=' + sku);
    changingCart = { Cookie: added.headers.get('set-cookie').split(';')[0] };
  }
  assert.equal((await post(checkout, await fields('Visa', 'sample-chair'))).status, 303);
  const correction = await get('/de-CH/checkout/cart', changingCart);
  assert.equal(correction.status, 409);
  const correctionPage = await correction.text();
  assert.match(correctionPage, /basket-item-sample-chair[\s\S]*Verf.gbar: 0/);
  assert.match(correctionPage, /basket-item-sample-bag[\s\S]*stock available/);
  const removedLine = await post('/de-CH/cart', { sku: 'sample-chair', action: 'remove' }, changingCart);
  const remainingCart = { Cookie: removedLine.headers.get('set-cookie').split(';')[0] };
  const remaining = await (await get('/de-CH/checkout/cart', remainingCart)).text();
  assert.match(remaining, /1 × Bolsa de prueba/);
  assert.doesNotMatch(remaining, /1 × Silla de prueba/);
  assert.equal((await post('/admin/models', { ...model, sku: 'no-measure', name: 'QA Missing Data',
    units: '1', width: '', fold: '' }, headers)).status, 303);
  for (const locale of ['de-CH', 'fr-CH']) {
    const path = '/' + locale;
    const count = html => html.match(/chair-filter-toolbar[\s\S]*?<p>(\d+) /)?.[1];
    const broad = await (await get(path + '?family=wheelchair&max_price=999999')).text();
    assert.match(broad, /QA Missing Data/);
    assert.ok(Number(count(broad)) >= 3);
    for (const key of ['max_width=70','fold=1','fold=0']) {
      const limited = await (await get(path + '?family=wheelchair&' + key)).text();
      assert.doesNotMatch(limited, /QA Missing Data/);
    }
    const filtered = await (await get(path + '?family=wheelchair&first=one&second=alpine&max_width=60&max_price=2600&fold=1')).text();
    assert.ok(filtered.includes('max_price=2600&amp;fold=1#catalogue'));
    const compare = await (await get(path + '/compare?family=wheelchair&first=one&second=alpine&max_width=60&max_price=2600&fold=1')).text();
    assert.ok(compare.includes('href="' + path + '?family=wheelchair&amp;first=one&amp;second=alpine&amp;max_width=60&amp;max_price=2600&amp;fold=1#catalogue"'));
    const rescue = await (await get(path + '?family=wheelchair&max_width=0')).text();
    assert.equal(count(rescue), '0');
    assert.match(rescue, /chair-no-results/);
    assert.ok(rescue.includes('href="' + path + '?family=wheelchair#catalogue"'));
    assert.ok(rescue.includes('href="' + path + '/contact"'));
  }
  const oneContent = '/admin/models/one/content';
  const aboutFit = '/fit';
  for (const locale of ['de-CH','fr-CH']) {
    const unconfirmed = await (await get('/' + locale + '/mobility-one')).text();
    assert.match(unconfirmed, /class="one-fit"/);
    assert.doesNotMatch(unconfirmed, /Largeur d.assise|Sitzbreite|Batterie comprise|inklusive Akku|Masse und Transport|Dimensions et transport/i);
    const marker = locale === 'de-CH' ? 'Demowert' : 'Valeur de démonstration';
    const compare = await (await get('/' + locale + '/compare?first=one&second=')).text();
    for (const value of ['60 cm', '27 kg', '20 km']) {
      assert.ok(unconfirmed.includes(value + ' · ' + marker));
      assert.ok(compare.includes(value + ' · ' + marker));
    }
    assert.doesNotMatch(unconfirmed.match(/<section class="one-fit"[^>]*>[\s\S]*?<\/section>/)[0], /href="#product-video"/);
    assert.ok(unconfirmed.includes('/' + locale + '/contact?model=one'));
    assert.match(unconfirmed, /mobility-one\/3d/);
  }
  assert.equal((await post(oneContent + aboutFit, { folded_length: '60' }, headers)).status, 400);
  assert.equal((await post(oneContent + aboutFit, {
    total_width: '61,5', seat_width: '42', folded_length: '76', folded_width: '59', folded_height: '41',
    weight: '24', battery: 'included', included_de: 'QA Ladegerät', included_fr: 'QA chargeur',
    distinction_de: 'QA Merkmal', distinction_fr: 'QA particularité', folding_video: '1',
  }, headers)).status, 303);
  const frenchOne = await (await get('/fr-CH/mobility-one')).text();
  assert.match(frenchOne, /Largeur totale[\s\S]*61,5 cm[\s\S]*Largeur d.assise[\s\S]*42 cm/);
  assert.match(frenchOne, /76 cm × 59 cm × 41 cm[\s\S]*batterie comprise[\s\S]*QA chargeur/);
  assert.equal((frenchOne.match(/href="#product-video"/g) || []).length, 2);
  assert.match(frenchOne, /QA particularité/);
  const germanOne = await (await get('/de-CH/mobility-one')).text();
  assert.match(germanOne, /Gesamtbreite[\s\S]*Sitzbreite[\s\S]*inklusive Akku[\s\S]*QA Ladeger.t/);
  assert.doesNotMatch(germanOne, /href="#product-video"/);
  assert.match(await (await get('/fr-CH/contact?model=one')).text(), /value="one" selected>Mobility One/);

  const billingAdmin = '/admin/billing';
  const emptyBilling = await (await get(billingAdmin, headers)).text();
  assert.match(emptyBilling, /Activación comercial bloqueada/);
  assert.match(emptyBilling, /Tratamiento de IVA pendiente/);
  assert.equal((await get(billingAdmin, finance)).status, 403);
  const activeContact = await (await get('/admin/content/contact', headers)).text();
  const contactRevision = activeContact.match(/name="revision" value="(\d+)"/)[1];
  assert.equal((await post('/admin/content/contact', {
    ...contactChanges, revision: contactRevision, email: 'billing-contact@example.test',
  }, headers)).status, 303);
  const issuer = { revision: '0', name: 'Vendedor Ficticio A', street: 'Rue Fiscal 10', zip: '1201', city: 'Genève',
    country: 'CH', email: '', mode: 'included', vatId: 'IVA-FICTICIO-A', rate: '10', confirmed: '1' };
  assert.equal((await post(billingAdmin, { ...issuer, confirmed: '' }, headers)).status, 303);
  assert.match(await (await get(billingAdmin, headers)).text(), /Confirmación fiscal expresa/);
  assert.equal((await post(billingAdmin, { ...issuer, revision: '1' }, headers)).status, 303);
  assert.match(await (await get(billingAdmin, headers)).text(), /Perfil del emisor completo/);
  const fiscalProduct = { ...model, sku: 'fiscal-chair', name: 'Fiscal Fixture', units: '3', price: '110' };
  assert.equal((await post('/admin/models', fiscalProduct, headers)).status, 303);
  const issued = [];
  for (const locale of ['de-CH', 'fr-CH']) {
    const payload = await fields('Visa', fiscalProduct.sku);
    assert.equal((await post('/' + locale + '/checkout', payload)).status, 303);
    const path = '/admin/' + payload.id + '/document/';
    const invoice = await (await get(path + 'invoice', finance)).text();
    assert.match(invoice, /Vendedor Ficticio A/);
    assert.match(invoice, /IVA-FICTICIO-A/);
    assert.match(invoice, /billing-contact@example.test/);
    assert.match(invoice, /Enthaltene MWST|TVA comprise/);
    const chf = new Intl.NumberFormat(locale, { style: 'currency', currency: 'CHF' });
    for (const value of [110, 100, 10]) assert.ok(invoice.includes(chf.format(value)));
    const number = invoice.match(/TEST-\d{6}/)[0];
    issued.push({ path, invoice, number, chf, id: payload.id });
  }
  const nextIssuer = { ...issuer, revision: '2', name: 'Vendedor Ficticio B', mode: 'none', email: 'issuer-b@example.test',
    rate: '', vatId: '', noteDe: 'Bestätigter Testhinweis DE', noteFr: 'Mention fictive confirmée FR' };
  assert.equal((await post(billingAdmin, nextIssuer, headers)).status, 303);
  for (const { path, invoice, number, chf, id } of issued) {
    assert.equal((await post('/admin/' + id + '/refund', {}, finance)).status, 303);
    assert.equal(await (await get(path + 'invoice', finance)).text(), invoice);
    const credit = await (await get(path + 'credit', finance)).text();
    assert.match(credit, /Vendedor Ficticio A/);
    assert.match(credit, /IVA-FICTICIO-A/);
    assert.ok(credit.includes('href="' + path + 'invoice">' + number));
    for (const value of [-110, -100, -10]) assert.ok(credit.includes(chf.format(value)));
    assert.doesNotMatch(credit, /Vendedor Ficticio B/);
  }
  const nextOrder = await fields('Visa', fiscalProduct.sku);
  assert.equal((await post('/fr-CH/checkout', nextOrder)).status, 303);
  const nextInvoice = await (await get('/admin/' + nextOrder.id + '/document/invoice', finance)).text();
  assert.match(nextInvoice, /Vendedor Ficticio B/);
  assert.match(nextInvoice, /issuer-b@example.test/);
  assert.match(nextInvoice, /Mention fictive confirmée FR/);
  assert.doesNotMatch(nextInvoice, /IVA-FICTICIO-A|TVA comprise/);
  {
    const shippingAdmin = '/admin/shipping';
    assert.match(await (await get(shippingAdmin, headers)).text(), /Checkout comercial bloqueado/);
    assert.equal((await post('/admin/models', { ...model, sku: 'shipping-chair', price: '110', units: '12' }, headers)).status, 303);
    assert.equal((await post('/admin/models', { name: 'Shipping Bag', family: 'accessory', sku: 'shipping-bag',
      price: '25', units: '8', active: '1', description_de: 'Zubehör', description_fr: 'Accessoire' }, headers)).status, 303);
    cookie = '';
    await mutateCart('add', 'shipping-chair');
    await mutateCart('add', 'shipping-bag');
    const inspectQuote = async (locale, basket) => {
      const route = '/' + locale + '/checkout' + (basket ? '/cart' : '?model=shipping-chair');
      const response = await get(route, cartHeaders());
      assert.equal(response.status, 200);
      const html = await response.text();
      const hidden = key => html.match(new RegExp('name="' + key + '" value="([^"]*)"'))?.[1].replaceAll('&quot;', '"');
      assert.match(html, locale === 'de-CH' ? /Zwischensumme[\s\S]*Versand/ : /Sous-total[\s\S]*Livraison/);
      return { route: route.split('?')[0], payload: { ...failedPayment, result: 'paid', id: hidden('id'),
        model: basket ? '' : 'shipping-chair', quotedPrice: hidden('quotedPrice'),
        shippingQuote: hidden('shippingQuote'), cartQuote: hidden('cartQuote') || '' } };
    };
    let fixedOrder;
    for (const [mode, rate, rev] of [['pending', 0, null], ['free', 0, '0'], ['fixed', 1250, '1']]) {
      if (rev !== null) assert.equal((await post(shippingAdmin, { mode, revision: rev, amount: String(rate / 100) }, headers)).status, 303);
      for (const [locale, basket, subtotal] of [['de-CH', false, 11000], ['fr-CH', true, 13500]]) {
        const { route, payload } = await inspectQuote(locale, basket);
        assert.equal(Number(payload.quotedPrice), subtotal + rate);
        assert.equal(payload.shippingQuote, mode + ':' + rate);
        const payment = await post(route, payload, cartHeaders());
        assert.equal(payment.status, 303);
        const path = '/admin/' + payload.id + '/document/';
        const invoice = await (await get(path + 'invoice', finance)).text();
        const total = new Intl.NumberFormat(locale, { style: 'currency', currency: 'CHF' }).format((subtotal + rate) / 100);
        assert.ok(invoice.includes(total));
        if (mode === 'pending') assert.match(invoice, /Noch offen|À confirmer/);
        if (mode === 'fixed' && basket) fixedOrder = { path, invoice, id: payload.id, total };
        const buyerCookie = payment.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
        const confirmation = await (await get(payment.headers.get('location'), { Cookie: buyerCookie })).text();
        assert.ok(confirmation.includes(total));
        const emailPreview = await (await get('/admin/' + payload.id + '/email/paid', headers)).text();
        assert.ok(emailPreview.includes(total));
      }
    }
    const staleShipping = await inspectQuote('fr-CH', true);
    assert.equal((await post(shippingAdmin, { mode: 'fixed', revision: '2', amount: '18.50' }, headers)).status, 303);
    const revised = await post(staleShipping.route, staleShipping.payload, cartHeaders());
    assert.equal(revised.status, 409);
    assert.match(await revised.text(), /name="shippingQuote" value="fixed:1850"/);
    assert.equal(await (await get(fixedOrder.path + 'invoice', finance)).text(), fixedOrder.invoice);
    assert.equal((await post('/admin/' + fixedOrder.id + '/refund', {}, finance)).status, 303);
    const fixedCredit = await (await get(fixedOrder.path + 'credit', finance)).text();
    const swissFrench = new Intl.NumberFormat('fr-CH', { style: 'currency', currency: 'CHF' });
    assert.ok(fixedCredit.includes('Livraison · ' + swissFrench.format(-12.50)));
    assert.ok(fixedCredit.includes(swissFrench.format(-147.50)));
  }
  const currentAdmin = await (await get('/admin', headers)).text();
  const expectedUnits = currentAdmin.match(/name="expectedUnits" value="(\d+)"/)[1];
  const expectedPrice = currentAdmin.match(/name="expectedPrice" value="(\d+)"/)[1];
  assert.equal((await post('/admin/catalog-order', { kind: 'featured', sku: 'one' }, headers)).status, 303);
  const priorOrder = await (await get(orderPath, buyer)).text();
  assert.equal((await post('/admin/catalog', {
    expectedUnits, expectedPrice, price: String(Number(expectedPrice) / 100), units: expectedUnits, publication: '1',
  }, headers)).status, 303);
  for (const locale of ['de-CH', 'fr-CH']) {
    assert.match(await (await get('/' + locale)).text(), /home-hero-brand/);
    assert.equal((await get('/' + locale + '/mobility-one')).status, 404);
    assert.equal((await get('/' + locale + '/checkout?model=one')).status, 409);
    assert.doesNotMatch(await (await get('/' + locale + '/compare?first=one&second=')).text(), /Mobility One/);
  }
  assert.doesNotMatch(await (await get('/sitemap.xml')).text(), /mobility-one/);
  assert.equal(await (await get(orderPath, buyer)).text(), priorOrder);

});
