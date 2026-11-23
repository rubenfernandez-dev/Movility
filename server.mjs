import { adminFragment, adminHtml, adminLanguage, adminLocale, adminPage, adminText, setAdminNavigation } from './admin-language.mjs';
import { createServer } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { basename, join, resolve } from 'node:path';
import { copy, page, money, methods, escapeHtml } from './views.mjs';
import { navigation, homepage, productPage, cartPage, checkoutPage, orderPage,
  productImage, sideImage, videoPath, captionsPath, transcriptPath } from './storefront.mjs';
import { comparisonPage, viewerPage, modelPath, viewerScript } from './discovery.mjs';
import { isPublicPage, pageMetadata, publicOrigin, sitemap } from './seo.mjs';
import { information, informationLinks, informationPage } from './information.mjs';
import { discoveryAccessoriesImage, discoveryCompareImage } from './home-discovery.mjs';
import { informationAdmin, informationAdminTitles, informationSettings, saveInformation, setupInformation } from './information-admin.mjs';
import { contactInbox, readContact, saveContact, setupContact, updateContactStatus } from './contact.mjs';
import { faqAdmin, faqFeedback, setupFaq, shopFaqs, updateFaq } from './faq.mjs';
import { orderEmail } from './postpurchase.mjs';
import { setupModels, modelAdmin, modelInput, extraCatalog, extraProduct, isWheelchair,
  catalogFamilies, saveFamily, familiesAdmin, catalogFeatures, renderFeatures, catalogFilter, storefrontFamilyFilters,
  orderedProducts, saveCatalogPosition, catalogOrderAdmin } from './catalog.mjs';
import { contentAdmin, receiveMedia } from './catalog-media.mjs';
import { setupCompatibility, isPart, compatibilityAdmin, compatibilityInput, compatibilityFilter, compatibilitySection } from './compatibility.mjs';
import { basketPage, canCheckout, cartCookie, cartLines, cartQuote, cartText, cartTotal,
  changeCart, coreSKU, readCart, skuPattern } from './cart.mjs';
import { setupInventory, purchasedLines, returnControls, inventoryPage, inventoryCsv } from './inventory.mjs';
import { setupAccounting, recordPayment, accountingFilters, accountingData, accountingPage, accountingCsv } from './accounting.mjs';
import { setupSerials, shipmentSerials, readShipmentSerials, assignShipmentSerials, sameShipmentSerials,
  readReturnSerials, receiptMatches, validReturnSelection, markSerialsReceived, shipmentForm, serialSummary, serialLookup } from './serials.mjs';
import { adminAuth, adminRouteAllowed, can, changeLocalAdminPassword, localAdminPassword, roleNames,
  verifyLocalAdminPassword } from './admin-access.mjs';
import { setupFunnel, purgeFunnel, analyticsChoice, updateAnalytics, recordFunnel,
  analyticsPrompt, analyticsReturn, analyticsLink, funnelReport } from './analytics.mjs';
import { setupMailQueue, queueEmail, deliverBatch, simulatedMailProvider, retryEmail, deliveryStatus, mailQueuePage,
  isRecoveryMail, retireRecoveryMail } from './mail-queue.mjs';
import { emailTestConfig, resendTestProvider } from './resend-mail.mjs';
import { setupTracking, trackingStart, trackingEvents, applyTrackingEvent, trackingHistory, trackingForm,
  manualTrackingEvent, normalizeTrackingEvent, carrierSignatureValid, readCarrierBody, shipmentFromToken,
  shipmentPage, shipmentPath, shipmentTokenPattern } from './tracking.mjs';
import { setupPush, purgePush, pushConfig, pushSubscription, pushState, addPushSubscription, removePushSubscription,
  queuePush, deliverPush, pushControls } from './order-push.mjs';
import { stripeMode, createCheckout, verifyStripeEvent, stripeOutcome, setupStripePayments, paymentAttempt,
  reserveStripe, saveStripeSession, applyStripeOutcome, stripeStatus, stripeAdmin, stripeMethodsFor } from './stripe-payments.mjs';
import { setupStripeRefunds, stripeRefund, refundPending, refundRetryable, requestStripeRefund,
  sendStripeRefund, saveStripeRefundSubmission, applyStripeRefundEvent, refundControls } from './stripe-refunds.mjs';
import { setupDocuments, billingInput, saveBillingAddress, issueDocument, documentPage } from './billing-documents.mjs';
import { setupGuestProof, issueGuestCode, redeemGuestCode, revokeGuestCode, guestProofCookie,
  verifiedGuestOrder, guestAccessPage, codePage, issueCheckoutAccess, checkoutAccessCookie, hasCheckoutAccess,
  revokeCheckoutAccess, orderAccessPage, requestOrderRecovery, orderRecoveryEmail } from './guest-proof.mjs';
import { setupAccounts, accountEmail, issueAccountCode, verifyAccountCode, signedInCustomer, endCustomerSession,
  customerCookie, linkGuestOrder, customerPage, accountMailbox, customerOwnsOrder } from './customer-accounts.mjs';
import { setupOffers, requestOffers, confirmOffers, stopOffers, offersPage, offerMailbox } from './offers.mjs';
import { setupCampaigns, queueCampaign, processCampaigns, campaignPage } from './offer-campaigns.mjs';

const port = Number(process.env.PORT || 3000);
const accountsEnabled = process.env.MOVILITY_STAGE === 'staging';
const siteOrigin = publicOrigin(process.env.MOVILITY_PUBLIC_ORIGIN);
const publicHost = siteOrigin ? new URL(siteOrigin).host : '';
const stripe = stripeMode(process.env, siteOrigin);
const stripeHost = stripe ? new URL(stripe.origin).host : '';
const emailTest = emailTestConfig(process.env, siteOrigin);
const push = pushConfig(process.env);
const carrierSecret = process.env.MOVILITY_CARRIER_SECRET || '';
if (carrierSecret && carrierSecret.length < 32) throw new Error('MOVILITY_CARRIER_SECRET needs at least 32 characters.');
const { CODESPACES, CODESPACE_NAME, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN } = process.env;
const codespaceHost = CODESPACES === 'true' && CODESPACE_NAME && GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
  ? `${CODESPACE_NAME}-${port}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
  : null;
const dbPath = process.env.MOVILITY_DB || 'data/demo.sqlite';
if (!process.env.MOVILITY_DB) mkdirSync('data', { recursive: true });
const configuredAdmin = process.env.MOVILITY_ADMIN_PASSWORD;
const fixedLocalPassword = !configuredAdmin && !process.env.MOVILITY_DB && CODESPACES !== 'true' && !siteOrigin && !stripe
  ? resolve('data/admin-password.txt') : '';
let localCredential = fixedLocalPassword ? localAdminPassword(fixedLocalPassword) : null;
const admin = configuredAdmin || (localCredential ? undefined : randomBytes(24).toString('base64url'));
const adminRole = adminAuth({ admin, warehouse: process.env.MOVILITY_WAREHOUSE_PASSWORD,
  support: process.env.MOVILITY_SUPPORT_PASSWORD, finance: process.env.MOVILITY_FINANCE_PASSWORD },
  fixedLocalPassword ? () => localCredential : undefined);
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
setupCompatibility(db);
const catalog = () => db.prepare('SELECT * FROM catalog WHERE id = 1').get();
const extraModel = sku => db.prepare('SELECT * FROM extra_models WHERE sku = ?').get(sku);
const liveModels = () => db.prepare('SELECT * FROM extra_models WHERE active = 1 ORDER BY name, sku').all();
const coreCatalogProduct = () => ({ ...purchaseModel(coreSKU), sku: coreSKU, family: 'wheelchair', active: 1 });
const compatibilityForPart = sku => db.prepare('SELECT * FROM catalog_compatibility WHERE part=?').all(sku);
const compatibilityForChair = sku => new Map(db.prepare('SELECT * FROM catalog_compatibility WHERE chair=?').all(sku)
  .map(entry => [entry.part, entry]));
const activeChairs = () => [coreCatalogProduct(), ...liveModels().filter(isWheelchair)];
const relatedParts = (locale, sku) => {
  const matches = compatibilityForChair(sku);
  return compatibilitySection(locale, orderedProducts(db, liveModels().filter(model => isPart(model) && matches.has(model.sku)))
    .map(model => ({ ...matches.get(model.sku), ...model })));
};
const adminCatalogProducts = () => orderedProducts(db, [coreCatalogProduct(),
  ...db.prepare('SELECT * FROM extra_models ORDER BY active DESC, name, sku').all()]);
const displayModelAdmin = (message, params) => adminPage('Artículos del catálogo', modelAdmin(
  adminCatalogProducts(), catalogFamilies(db), message, params));
const assets = new Map([
  ['/site.css', ['text/css; charset=utf-8', readFileSync(new URL('./site.css', import.meta.url))]],
  [productImage, ['image/jpeg', readFileSync(new URL('./assets/movility-one.jpg', import.meta.url))]],
  [sideImage, ['image/jpeg', readFileSync(new URL('.' + sideImage, import.meta.url))]],
  [discoveryCompareImage, ['image/jpeg', readFileSync(new URL('.' + discoveryCompareImage, import.meta.url))]],
  [discoveryAccessoriesImage, ['image/jpeg', readFileSync(new URL('.' + discoveryAccessoriesImage, import.meta.url))]],
  ['/assets/home-discovery.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./assets/home-discovery.js', import.meta.url))]],
  [modelPath, ['model/gltf-binary', readFileSync(new URL('./assets/movility-one.glb', import.meta.url))]],
  [viewerScript, ['text/javascript; charset=utf-8', readFileSync(new URL('./node_modules/@google/model-viewer/dist/model-viewer.min.js', import.meta.url))]],
  ['/assets/order-push.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./assets/order-push.js', import.meta.url))]],
  ['/assets/compatibility-search.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./assets/compatibility-search.js', import.meta.url))]],
  ['/push-worker.js', ['text/javascript; charset=utf-8', readFileSync(new URL('./assets/push-worker.js', import.meta.url))]],
]);
const uploadFolder = resolve((dbPath === ':memory:' ? 'data/in-memory-' + randomUUID() : dbPath) + '.media');
function mediaFile(path) {
  const managed = join(uploadFolder, basename(path));
  if (path.startsWith('/assets/models/') && existsSync(managed)) return managed;
  return process.env.MOVILITY_MEDIA_DIR
    ? join(process.env.MOVILITY_MEDIA_DIR, basename(path)) : new URL('.' + path, import.meta.url);
}
function modelVideo(sku, locale) {
  const base = `/assets/models/${sku}`;
  const bundle = { video: base + '.mp4', captions: base + '.' + locale + '.vtt', transcript: base + '.' + locale + '.txt' };
  if (!Object.values(bundle).every(path => existsSync(mediaFile(path)))) return null;
  const captions = readFileSync(mediaFile(bundle.captions), 'utf8');
  const transcript = readFileSync(mediaFile(bundle.transcript), 'utf8');
  return captions.replace(/^\uFEFF/, '').startsWith('WEBVTT') && transcript.trim() ? bundle : null;
}

function modelPhotos(sku) {
  const base = `/assets/models/${sku}`;
  const find = extension => existsSync(mediaFile(base + extension)) ? base + extension : '';
  return { front: find('.jpg'), side: find('.side.jpg'), rear: find('.rear.jpg') };
}
function modelMedia(sku, locale) {
  const photos = modelPhotos(sku);
  const photo = photos.front || photos.side || photos.rear;
  const video = modelVideo(sku, locale);
  const model = `/assets/models/${sku}.glb`;
  return { photo, photos, model: existsSync(mediaFile(model)) ? model : '', video: video ? { ...video, poster: photo } : null };
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
transaction(() => {
  setupInventory(db);
  setupAccounting(db);
  setupSerials(db);
  setupFunnel(db);
  setupMailQueue(db);
  setupTracking(db);
  setupPush(db);
  setupStripePayments(db);
  setupStripeRefunds(db);
  setupDocuments(db);
  setupGuestProof(db);
  setupAccounts(db);
  setupOffers(db);
  setupCampaigns(db);
  setupContact(db);
  setupFaq(db);
  setupInformation(db);
  purgePush(db);
  purgeFunnel(db);
});
if (accountsEnabled) {
  setInterval(() => {
    try { transaction(() => processCampaigns(db)); }
    catch (error) { console.error('Campaign simulation failed', error); }
  }, 3000).unref();
}
setInterval(() => {
  try { purgeFunnel(db); purgePush(db); }
  catch (error) { console.error('Could not purge expired analytics and push state', error); }
}, 3600000).unref();
const sendSimulated = simulatedMailProvider(db);
const sendResendTest = resendTestProvider(emailTest);
const mailProvider = message => message.testTarget ? sendResendTest(message) : sendSimulated(message);
let mailRun;
const processMail = () => mailRun ??= deliverBatch(db, transaction, mailProvider, undefined, 12, Boolean(emailTest))
  .finally(() => { mailRun = null; });
if (process.env.MOVILITY_EMAIL_WORKER !== 'manual') {
  setInterval(() => {
    processMail().catch(error => console.error('Could not process mail queue', error));
  }, 3000).unref();
}
if (push && process.env.MOVILITY_PUSH_WORKER !== 'manual') {
  let running = false;
  setInterval(async () => {
    if (running) return;
    running = true;
    try { await deliverPush(db, transaction, push); }
    catch (error) { console.error('Could not process push queue', error); }
    finally { running = false; }
  }, 3000).unref();
}
function purchaseModel(sku) {
  if (sku === coreSKU) return { name: 'Movility One', cents: catalog().cents, units: stock() };
  const model = extraModel(sku);
  return model?.active ? { ...model, requires_serial: Number(isWheelchair(model)) } : null;
}
const orderLines = id => db.prepare('SELECT sku, name, quantity, cents, requires_serial FROM order_lines WHERE order_id = ? ORDER BY rowid').all(id);
function orderById(id) {
  const order = db.prepare(`SELECT orders.*, order_models.sku AS model_sku, order_models.name AS model_name, order_models.requires_serial
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
function recordMovement(sku, delta, reason, orderId = null) {
  const balance = sku === coreSKU ? stock() : extraModel(sku).units;
  db.prepare('INSERT INTO stock_movements (sku, delta, balance, reason, order_id) VALUES (?, ?, ?, ?, ?)')
    .run(sku, delta, balance, reason, orderId);
}
function orderStock(sku, quantity, reason, orderId) {
  if (!changeStock(sku, quantity)) throw new Error('Stock changed during order operation');
  recordMovement(sku, quantity, reason, orderId);
}
function createPaidOrder(id, method, locale, email, address, items, billing) {
  db.prepare("INSERT INTO orders VALUES (?, ?, ?, ?, ?, 'paid', NULL)").run(id, email, locale, method, cartTotal(items));
  const insertLine = db.prepare('INSERT INTO order_lines VALUES (?, ?, ?, ?, ?, ?)');
  for (const line of items) insertLine.run(id, line.sku, line.name, line.quantity, line.cents, line.requires_serial ?? 1);
  db.prepare('INSERT INTO delivery_addresses VALUES (?, ?, ?, ?, ?)').run(id, address.name, address.street, address.zip, address.city);
  saveBillingAddress(db, id, billing);
}
async function stripeRedirect(res, attempt, locale, render) {
  if (attempt.state === 'paid') return redirect(res, `/${locale}/orders/${attempt.id}`);
  if (attempt.expires_at <= Math.floor(Date.now() / 1000)) return render(stripeStatus(locale, attempt));
  if (attempt.state === 'open' && attempt.checkout_url) return redirect(res, attempt.checkout_url);
  if (attempt.state !== 'preparing') return render(stripeStatus(locale, attempt));
  try {
    const session = await createCheckout(stripe, attempt);
    if (!saveStripeSession(db, attempt.id, session)) return render(stripeStatus(locale, attempt, true), 502);
    const current = paymentAttempt(db, attempt.id);
    if (current.state === 'open' && current.checkout_url) return redirect(res, current.checkout_url);
    if (current.state === 'paid') return redirect(res, `/${locale}/orders/${attempt.id}`);
    return render(stripeStatus(locale, current));
  } catch {
    return render(stripeStatus(locale, paymentAttempt(db, attempt.id), true), 502);
  }
}
const orderReceipts = id => db.prepare('SELECT sku, quantity, restocked FROM return_receipts WHERE order_id = ?').all(id);
const orderIdPattern = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const inventoryRows = (sku, limit) => db.prepare(`SELECT * FROM stock_movements
  WHERE (? = '' OR sku = ?) ORDER BY id DESC LIMIT ?`).all(sku, sku, limit);
const noticeKinds = ['paid', 'shipped', 'delivered', 'refunded'];
const emailShipmentPath = (order, kind) => ['shipped', 'delivered'].includes(kind)
  ? shipmentPath(db, order.locale, order.id) : '';

const storeEmail = (order, kind) => {
  const path = emailShipmentPath(order, kind);
  const { subject, body } = orderEmail(order, kind, path && (siteOrigin ? new URL(path, siteOrigin).href : path));
  db.prepare('INSERT INTO email_previews VALUES (?, ?, ?, ?)').run(order.id, kind, subject, body);
};
const notice = (id, kind) => {
  db.prepare('INSERT INTO notices VALUES (?, ?)').run(id, kind);
  const order = orderById(id);
  if (kind === 'paid' || kind === 'refunded') issueDocument(db, order, kind === 'paid' ? 'invoice' : 'credit');
  storeEmail(order, kind);
  queueEmail(db, id, kind, undefined, emailTest?.target);
  queuePush(db, id, kind);
  if (kind === 'paid' || kind === 'refunded') recordPayment(db, order, kind === 'paid' ? 'capture' : 'refund');
};
const applyCarrierEvent = event => transaction(() => applyTrackingEvent(db, event, id => notice(id, 'delivered')));
function finishRefund(id) {
  const order = orderById(id);
  if (!order || order.status === 'refunded') return;
  db.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?").run(id);
  if (order.status === 'paid') {
    for (const line of purchasedLines(order)) orderStock(line.sku, line.quantity, 'refund', id);
  }
  notice(id, 'refunded');
}
transaction(() => {
  const previousEvents = db.prepare(`SELECT orders.*, notices.kind FROM notices
    JOIN orders ON orders.id = notices.order_id
    LEFT JOIN email_previews ON email_previews.order_id = notices.order_id AND email_previews.kind = notices.kind
    WHERE email_previews.order_id IS NULL AND notices.kind IN ('paid', 'shipped', 'delivered', 'refunded')`).all();
  for (const event of previousEvents) storeEmail(orderById(event.id), event.kind);
});

function send(res, status, body, withViewer = false, withPush = false, withLocalScript = false) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': res.getHeader('Referrer-Policy') || 'same-origin',
    'Content-Security-Policy': withViewer
      ? "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' blob:; form-action 'self'; frame-ancestors 'none'; base-uri 'none'"
      : "default-src 'none'; style-src 'self'; img-src 'self'; media-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'" +
        (withPush ? "; script-src 'self'; connect-src 'self'; worker-src 'self'"
          : withLocalScript ? "; script-src 'self'" : ''),
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

function carrierResponse(res, status, result) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify({ result }));
}

async function form(req, limit = 16384) {
  if (!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) return null;
  let body = '';
  for await (const part of req) {
    body += part.toString('latin1');
    if (body.length > limit) return null;
  }
  return new URLSearchParams(Buffer.from(body, 'latin1').toString('utf8'));
}

const orderLabels = { paid: 'Cobrado', shipped: 'Enviado', refunded: 'Reembolsado' };

function adminOrderDetails(order, role, error) {
  const serialAccess = can(role, 'serials');
  const shippingAccess = can(role, 'shipping');
  const addressAccess = can(role, 'address');
  const supportAccess = can(role, 'support');
  const financeAccess = can(role, 'finance');
  const address = addressAccess ? db.prepare('SELECT * FROM delivery_addresses WHERE order_id=?').get(order.id) : null;
  const documents = financeAccess ? db.prepare('SELECT kind FROM billing_documents WHERE order_id = ? ORDER BY number').all(order.id) : [];
  const refund = stripeRefund(db, order.id);
  const stripeOrder = financeAccess && paymentAttempt(db, order.id);
  const lines = order.lines;
  const serials = serialAccess ? shipmentSerials(db, order.id) : [];
  const productNames = lines.length ? lines.map(line => `${line.quantity} × ${line.name}`).join(' · ') : order.model_name || 'Movility One';
  const events = supportAccess ? db.prepare(`SELECT kind FROM email_previews WHERE order_id = ?
    AND kind IN ('paid','shipped','delivered','refunded') ORDER BY rowid`).all(order.id) : [];
  const notices = events.map(({ kind }) => adminHtml`<li><a lang="${order.locale}" href="/admin/${order.id}/email/${kind}">${copy[order.locale][kind]}</a></li>`).join('');
  const card = adminHtml`<article id="order-${order.id}"><h2>${order.id}</h2>
    <p>${escapeHtml(productNames)} · ${supportAccess ? escapeHtml(order.email) + ' · ' : ''}${order.locale} ·
      ${financeAccess ? escapeHtml(order.method) + ' · ' + money(adminLocale(), order.cents) + ' · ' : ''}${adminText(orderLabels[order.status])}</p>
    ${address ? adminHtml`<p>${escapeHtml(address.name)} · ${escapeHtml(address.street)} · ${escapeHtml(address.zip)} ${escapeHtml(address.city)} · Suiza</p>` : ''}
    ${(shippingAccess || supportAccess) && order.tracking ? adminHtml`<p>Seguimiento: ${escapeHtml(order.tracking)}</p>` : ''}
    ${(shippingAccess || supportAccess) ? trackingHistory(adminLocale(), trackingEvents(db, order.id)) : ''}
    ${shippingAccess ? trackingForm(order) : ''}
    ${supportAccess ? adminHtml`<h3>Bandeja de correo simulada</h3><ul>${notices}</ul>` : ''}
    ${shippingAccess && order.status === 'paid' ? refundPending(refund)
      ? adminFragment('<p>Expedición en pausa por reembolso pendiente.</p>') : shipmentForm({ ...order, lines }) : ''}
    ${serialSummary(serials)}
    ${role === 'admin' ? adminHtml`<details><summary>Verificación de pedido invitado</summary>
      <form method="post" action="/admin/${order.id}/guest-code">
        <button class="secondary" name="action" value="issue">Generar código</button>
        <button class="secondary" name="action" value="revoke">Revocar código y verificación</button>
      </form></details>` : ''}
    ${documents.length ? adminHtml`<p>${documents.map(({ kind }) =>
      `<a href="/admin/${order.id}/document/${kind}">${adminText(kind === 'invoice' ? 'Factura de prueba' : 'Abono de prueba')}</a>`).join(' · ')}</p>` : ''}
    ${stripeOrder ? refundControls(order, refund, Boolean(stripe))
      : financeAccess && order.status !== 'refunded' ? adminHtml`<form method="post" action="/admin/${order.id}/refund"><button>Reembolsar en la simulación</button></form>` : ''}
    ${shippingAccess ? returnControls({ ...order, lines }, orderReceipts(order.id), serials) : ''}
  </article>`;
  return adminPage('Detalle del pedido', adminHtml`<p><a href="/admin/orders">Volver a pedidos</a></p>
    <h1>Detalle del pedido</h1>${error ? adminHtml`<p class="form-error" role="alert">${adminText(error)}</p>` : ''}${card}`);
}

function adminOrdersPage(role, params) {
  const status = Object.hasOwn(orderLabels, params.get('status')) ? params.get('status') : '';
  const search = (params.get('q') || '').trim().slice(0, 80);
  const trackingAccess = can(role, 'shipping') || can(role, 'support');
  const financeAccess = can(role, 'finance');
  const where = `WHERE (? = '' OR status = ?) AND
    (instr(lower(id), lower(?)) > 0 OR (? = 1 AND instr(lower(coalesce(tracking, '')), lower(?)) > 0))`;
  const binding = [status, status, search, Number(trackingAccess), search];
  const total = db.prepare('SELECT count(*) AS total FROM orders ' + where).get(...binding).total;
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rawPage = params.get('page') || '';
  const currentPage = /^\d+$/.test(rawPage) ? Math.max(1, Math.min(Number(rawPage), pageCount)) : 1;
  const rows = db.prepare(`SELECT id, status, tracking, cents,
    COALESCE((SELECT name FROM order_lines WHERE order_id=orders.id ORDER BY rowid LIMIT 1),
      (SELECT name FROM order_models WHERE order_id=orders.id), 'Movility One') AS product
    FROM orders ${where}
    ORDER BY rowid DESC LIMIT ? OFFSET ?`).all(...binding, pageSize, (currentPage - 1) * pageSize);
  const pageLink = number => {
    const query = new URLSearchParams();
    if (status) query.set('status', status);
    if (search) query.set('q', search);
    if (number > 1) query.set('page', String(number));
    return '/admin/orders' + (query.size ? '?' + escapeHtml(query.toString()) : '');
  };
  return adminPage('Pedidos', adminHtml`<h1>Pedidos</h1>
    <form class="catalog-filters" method="get" action="/admin/orders">
      <label>${adminText(trackingAccess ? 'Referencia o número de seguimiento' : 'Referencia del pedido')}
        <input type="search" name="q" value="${escapeHtml(search)}" maxlength="80"></label>
      <label>Estado del pedido <select name="status"><option value="">Todos</option>
        ${Object.entries(orderLabels).map(([value, label]) => `<option value="${value}" ${status === value ? 'selected' : ''}>${adminText(label)}</option>`).join('')}
      </select></label><button>Buscar</button>
      ${status || search ? adminFragment('<a href="/admin/orders">Limpiar búsqueda y filtros</a>') : ''}</form>
    ${rows.length ? adminHtml`<ul class="admin-orders-list">${rows.map(row => adminHtml`<li>
      <a href="/admin/orders/${row.id}"><strong>${escapeHtml(row.product)}</strong><small>${row.id}</small></a>
      <span>${adminText(orderLabels[row.status])}</span>
      ${trackingAccess && row.tracking ? `<span>${escapeHtml(row.tracking)}</span>` : ''}
      ${financeAccess ? `<span>${money(adminLocale(), row.cents)}</span>` : ''}</li>`).join('')}</ul>`
      : adminHtml`<p>${adminText(status ? 'No hay pedidos con este estado.' : search ?
        'No hay pedidos que coincidan con la búsqueda.' : 'Todavía no hay pedidos.')}</p>`}
    ${pageCount > 1 ? adminHtml`<nav class="product-actions" aria-label="Páginas de pedidos">
      ${currentPage > 1 ? adminHtml`<a class="button secondary" href="${pageLink(currentPage - 1)}">Anterior</a>` : ''}
      <span>Página ${currentPage} de ${pageCount}</span>
      ${currentPage < pageCount ? adminHtml`<a class="button secondary" href="${pageLink(currentPage + 1)}">Siguiente</a>` : ''}
    </nav>` : ''}`);
}
function adminView({ role, error, saved, draft }) {
  const catalogAccess = can(role, 'catalog');
  const stockAccess = can(role, 'stock');
  const supportAccess = can(role, 'support');
  const financeAccess = can(role, 'finance');
  const model = catalog();
  const units = stock();
  const pendingOrders = db.prepare("SELECT count(*) AS total FROM orders WHERE status='paid'").get().total;
  const pendingContacts = supportAccess && db.prepare('SELECT count(*) AS total FROM contact_messages WHERE resolved=0').get().total;
  const failedMail = supportAccess && db.prepare("SELECT count(*) AS total FROM mail_jobs WHERE status='failed'").get().total;
  const totals = db.prepare(`SELECT COUNT(*) AS quantity, COALESCE(SUM(cents), 0) AS gross,
    COALESCE(SUM(CASE WHEN status = 'refunded' THEN cents ELSE 0 END), 0) AS refunds FROM orders`).get();
  const breakdown = db.prepare(`SELECT method, COUNT(*) AS quantity, SUM(cents) AS gross,
    SUM(CASE WHEN status = 'refunded' THEN cents ELSE 0 END) AS refunds
    FROM orders GROUP BY method ORDER BY method`).all();
  return adminPage('Administración de prueba', adminHtml`<h1>Administración de prueba</h1>
    <p>Perfil: ${adminText(roleNames[role])}</p>
    <section aria-labelledby="admin-work"><h2 id="admin-work">Pendientes de atención</h2>
      <div class="admin-overview-links">
        <a href="/admin/orders?status=paid"><strong>${pendingOrders}</strong>Pedidos por expedir</a>
        ${supportAccess ? adminHtml`<a href="/admin/contact"><strong>${pendingContacts}</strong>Consultas sin resolver</a>
          <a href="/admin/mail"><strong>${failedMail}</strong>Correos con errores</a>` : ''}
      </div></section>
    <p>${stockAccess ? adminHtml`Unidades disponibles: ${units} · ` : ''}Pedidos: ${totals.quantity}</p>
    ${financeAccess ? adminHtml`<dl class="admin-metrics"><div><dt>Cobros</dt><dd>${money('es', totals.gross)}</dd></div>
      <div><dt>Reembolsos</dt><dd>${money('es', totals.refunds)}</dd></div>
      <div><dt>Neto</dt><dd>${money('es', totals.gross - totals.refunds)}</dd></div></dl>
    <details class="payment-breakdown"><summary>Desglose por forma de pago</summary>
      ${breakdown.length ? adminHtml`<div class="compare-table"><table><thead><tr>
        <th scope="col">Método</th><th scope="col">Pedidos</th><th scope="col">Neto</th></tr></thead>
        <tbody>${breakdown.map(row => adminHtml`<tr><th scope="row">${escapeHtml(row.method)}</th><td>${row.quantity}</td>
          <td>${money('es', row.gross - row.refunds)}</td></tr>`).join('')}</tbody></table></div>` : adminFragment('<p>El desglose aparecerá con el primer pedido.</p>')}
    </details>` : ''}
    ${error ? adminHtml`<p class="form-error" role="alert">${adminText(error)}</p>` : ''}
    ${catalogAccess && saved ? adminFragment('<p class="form-success" role="status">Cambios guardados. Ya están visibles en la tienda.</p>') : ''}
    ${catalogAccess ? adminHtml`<form id="catalog-editor" class="admin-catalog" method="post" action="/admin/catalog">
      <fieldset><legend>Catálogo · Movility One</legend>
        <input type="hidden" name="expectedUnits" value="${units}">
        <input type="hidden" name="expectedPrice" value="${model.cents}">
        <div class="address-row"><label>Precio en CHF <input name="price" inputmode="decimal" required value="${escapeHtml(draft?.price ?? (model.cents / 100).toFixed(2))}"></label>
        <label>Unidades disponibles <input type="number" name="units" min="0" max="999" step="1" required value="${escapeHtml(draft?.units ?? String(units))}"></label></div>
        <label>Descripción en alemán<textarea name="descriptionDe" rows="3" maxlength="500" lang="de-CH">${escapeHtml(draft?.descriptionDe ?? (model.description_de || copy['de-CH'].description))}</textarea></label>
        <label>Descripción en francés<textarea name="descriptionFr" rows="3" maxlength="500" lang="fr-CH">${escapeHtml(draft?.descriptionFr ?? (model.description_fr || copy['fr-CH'].description))}</textarea></label>
        <button>Guardar cambios en la tienda</button>
      </fieldset>
    </form>` : ''}
    ${catalogAccess && units === 0 ? adminFragment('<form method="post" action="/admin/restock"><button>Reponer una unidad de prueba</button></form>') : ''}
`);
}

function emailView(order, preview) {
  const { orderPath, statusLabel } = isRecoveryMail(preview.kind) ? {
    orderPath: `/${order.locale}/guest-access`,
    statusLabel: order.locale === 'de-CH' ? 'Einmalcode eingeben' : 'Saisir le code',
  } : orderEmail(order, preview.kind, emailShipmentPath(order, preview.kind));
  const state = deliveryStatus(db, order.id, preview.kind);
  return adminPage('Vista previa de correo', adminHtml`<a href="/admin/orders">Volver a pedidos</a>
    <h1 class="page-title">Vista previa de correo</h1>
    <p>${state || 'Aviso histórico disponible como vista previa.'}</p>
    <p><a href="/admin/mail">Ver cola de correos</a></p>
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
    if (!req.headers.host || ![...localHosts, codespaceHost, stripeHost, publicHost].includes(req.headers.host)) {
      return send(res, 403, 'Forbidden');
    }
    const { pathname: path, searchParams } = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && path === '/healthz') {
      try {
        if (db.prepare('SELECT id FROM stock WHERE id = 1').get()) return carrierResponse(res, 200, 'ok');
      } catch {
        // Keep database errors out of the public response.
      }
      return carrierResponse(res, 503, 'unavailable');
    }
    if (req.method === 'POST' && path === '/integrations/stripe/events') {
      if (!stripe) return carrierResponse(res, 404, 'disabled');
      const body = await readCarrierBody(req, 131072);
      if (!body) return carrierResponse(res, 400, 'invalid');
      const event = verifyStripeEvent(stripe, body, req.headers['stripe-signature']);
      if (!event) return carrierResponse(res, 401, 'unauthorized');
      if (['refund.created', 'refund.updated', 'refund.failed'].includes(event.type)) {
        return carrierResponse(res, 200, transaction(() => applyStripeRefundEvent(db, event, finishRefund)));
      }
      const outcome = stripeOutcome(event);
      if (!outcome) return carrierResponse(res, 200, 'ignored');
      const result = transaction(() => applyStripeOutcome(db, outcome, {
        release: line => orderStock(line.sku, line.quantity, 'release', null),
        fulfill: (attempt, data) => {
          createPaidOrder(attempt.id, attempt.method, data.locale, data.email, data.address, data.lines, data.billing);
          notice(attempt.id, 'paid');
        },
      }));
      return carrierResponse(res, 200, result);
    }
    if (req.method === 'POST' && path === '/integrations/carrier/events') {
      if (!carrierSecret) return carrierResponse(res, 404, 'disabled');
      const body = await readCarrierBody(req);
      if (!body) return carrierResponse(res, 400, 'invalid');
      if (!carrierSignatureValid(carrierSecret, req.headers['x-movility-timestamp'], req.headers['x-movility-signature'], body)) {
        return carrierResponse(res, 401, 'unauthorized');
      }
      let event;
      try { event = normalizeTrackingEvent(JSON.parse(body.toString('utf8')), 'carrier'); }
      catch { return carrierResponse(res, 400, 'invalid'); }
      if (!event) return carrierResponse(res, 400, 'invalid');
      const outcome = applyCarrierEvent(event);
      return carrierResponse(res, { applied: 200, duplicate: 200, conflict: 409, unmatched: 422 }[outcome], outcome);
    }
    const modelAsset = /^\/assets\/models\/([a-z0-9][a-z0-9-]{1,23})\.(?:(side\.|rear\.)?jpg|glb|mp4|(de-CH|fr-CH)\.(?:vtt|txt))$/.exec(path);
    if (modelAsset && ['GET', 'HEAD'].includes(req.method) && (modelAsset[1] === coreSKU || extraModel(modelAsset[1])?.active) && existsSync(mediaFile(path))) {
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
    const orderPageRoute = first === locale && second === 'orders' && orderIdPattern.test(third) && path === `/${locale}/orders/${third}`;
    const shipmentRoute = first === locale && second === 'shipment' && shipmentTokenPattern.test(third) &&
      path === `/${locale}/shipment/${third}`;
    const pushRoute = first === locale && second === 'orders' && orderIdPattern.test(third) && path === `/${locale}/orders/${third}/push`;
    const suffix = first === locale ? path.slice(locale.length + 1) : '';
    const modelRoute = /^\/models\/([a-z0-9][a-z0-9-]{1,23})(\/3d)?$/.exec(suffix);
    const languagePath = isPublicPage(suffix) || ['/cart', '/checkout', '/checkout/cart', '/analytics', '/account', '/guest-access', '/offers'].includes(suffix) ||
      modelRoute || shipmentRoute || /^\/orders\/[0-9a-f-]{36}$/.test(suffix)
      ? suffix : '';
    const view = searchParams.get('view');
    const galleryView = ['side', 'rear'].includes(view) ? view : 'front';
    const selectedSKU = searchParams.get('model') || '';
    const catalogueQuery = new URLSearchParams();
    if (!suffix && searchParams.has('family')) catalogueQuery.set('family', searchParams.get('family'));
    if (catalogueQuery.size && searchParams.has('compatible')) catalogueQuery.set('compatible', searchParams.get('compatible'));
    const languageQuery = catalogueQuery.size ? `?${catalogueQuery}#catalogue`
      : ['/cart', '/checkout'].includes(languagePath) && skuPattern.test(selectedSKU) ? `?model=${selectedSKU}`
      : languagePath === '/compare' && searchParams.size ? `?${searchParams}`
      : (languagePath === '/movility-one' || modelRoute && !modelRoute[2]) && galleryView !== 'front'
        ? `?view=${galleryView}#gallery` : '';
    const discoverable = first === locale && isPublicPage(suffix);
    const editorial = first === locale && suffix === '/' + second && Object.hasOwn(informationAdminTitles, second)
      ? informationSettings(db, second, process.env.MOVILITY_CONTACT_EMAIL) : null;
    const editorialLocale = locale === 'de-CH' ? 'de' : 'fr';
    const cartUnits = [...readCart(req).values()].reduce((sum, quantity) => sum + quantity, 0);
    const consent = analyticsChoice(req);
    const settings = path === `/${locale}/analytics`;
    const track = stage => {
      try { recordFunnel(db, consent, locale, stage); }
      catch (error) { console.error('Could not record analytics stage', error); }
    };
    const render = (body, status = 200) => send(res, status,
      page(locale, t.title, body, navigation(locale, languagePath, languageQuery, cartUnits),
        discoverable && status === 200 ? pageMetadata(locale, suffix, siteOrigin, editorial &&
          [editorial['title_' + editorialLocale], editorial['intro_' + editorialLocale]]) : {}, {
          footer: informationLinks(locale) + ' · ' + analyticsLink(locale) + (accountsEnabled
            ? ` · <a href="/${locale}/account">${locale === 'de-CH' ? 'Mein Konto' : 'Mon compte'}</a>
              · <a href="/${locale}/offers">${locale === 'de-CH' ? 'Angebote' : 'Offres'}</a>` : ''),
          prompt: !consent && !settings && req.method === 'GET' && status === 200 && (discoverable || modelRoute)
            ? analyticsPrompt(locale, consent, path) : '',
        }), languagePath === '/movility-one/3d' || Boolean(modelRoute?.[2]), Boolean(push && orderPageRoute),
        path === `/${locale}`);
    const origin = req.headers.origin;
    const secureRequest = !localHosts.includes(req.headers.host);
    const sameOrigin = origin === `${secureRequest ? 'https' : 'http'}://${req.headers.host}`;
    const cookies = req.headers.cookie;
    const canViewOrder = id => hasCheckoutAccess(db, id, cookies) || verifiedGuestOrder(db, cookies) === id ||
      (accountsEnabled && customerOwnsOrder(db, cookies, id));
    const basketCheckout = path === `/${locale}/checkout/cart`;
    if (req.method === 'POST' && !sameOrigin) {
      return send(res, 403, 'Forbidden');
    }
    if (req.method === 'POST' && pushRoute) {
      if (!push) return carrierResponse(res, 404, 'disabled');
      if (!canViewOrder(third)) return carrierResponse(res, 403, 'forbidden');
      const body = await readCarrierBody(req);
      let input;
      try { input = body ? JSON.parse(body.toString('utf8')) : null; }
      catch { return carrierResponse(res, 400, 'invalid'); }
      const order = orderById(third);
      if (!order) return carrierResponse(res, 404, 'unknown');
      let active = false;
      if (input?.action === 'subscribe') {
        const sub = pushSubscription(input.subscription);
        if (!sub) return carrierResponse(res, 400, 'invalid');
        active = transaction(() => {
          if (orderById(third).status === 'refunded' || trackingEvents(db, third).some(event => event.event_status === 'delivered')) return false;
          addPushSubscription(db, third, sub, locale, push.mode);
          return true;
        });
      } else if (input?.action === 'unsubscribe' || input?.action === 'status') {
        if (input.action === 'unsubscribe') removePushSubscription(db, third, input.endpoint);
        active = pushState(db, third, input.endpoint, push.mode);
      } else return carrierResponse(res, 400, 'invalid');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ active }));
    }
    if (first === 'admin') return await adminLanguage(req, res, path, searchParams, async () => {
      const role = adminRole(req.headers.authorization);
      if (!role) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Movility local demo", charset="UTF-8"');
        return send(res, 401, 'Authentication required');
      }
      setAdminNavigation(role, accountsEnabled);
      if (!adminRouteAllowed(role, req.method, path)) {
        return send(res, 403, adminPage('Acceso restringido', adminFragment('<h1>Acceso restringido</h1><p>Tu perfil no tiene acceso a esta operación.</p><a href="/admin">Volver al panel</a>')));
      }
      const faqRoute = /^\/admin\/faqs(?:\/([1-9]\d{0,11}))?$/.exec(path);
      if (faqRoute) {
        const panel = (message, attempt) => adminPage('Preguntas frecuentes', faqAdmin(db, message, attempt));
        if (req.method === 'GET' && !faqRoute[1]) return send(res, 200, panel(searchParams.has('saved') ? faqFeedback('saved') : ''));
        if (req.method === 'POST') {
          const id = faqRoute[1] ? Number(faqRoute[1]) : undefined;
          const fields = await form(req, 100000);
          const result = updateFaq(db, id, fields);
          if (result === 'saved') return redirect(res, '/admin/faqs?saved=1');
          return send(res, result === 'conflict' ? 409 : 400, panel(faqFeedback(result),
            result === 'invalid' ? { id, fields } : undefined));
        }
      }
      const contentRouteMatch = /^\/admin\/content\/([a-z-]+)$/.exec(path);
      if (contentRouteMatch && Object.hasOwn(informationAdminTitles, contentRouteMatch[1]) && ['GET', 'POST'].includes(req.method)) {
        const key = contentRouteMatch[1];
        const panel = result => adminPage(informationAdminTitles[key],
          informationAdmin(key, informationSettings(db, key, process.env.MOVILITY_CONTACT_EMAIL), result));
        if (req.method === 'GET') return send(res, 200, panel(searchParams.has('saved') ? { status: 'saved' } : {}));
        const result = saveInformation(db, key, await form(req, 100000));
        return result.status === 'saved' ? redirect(res, path + '?saved=1') :
          send(res, result.status === 'conflict' ? 409 : 400, panel(result));
      }
      if (path === '/admin/contact') {
        if (req.method === 'GET') return send(res, 200, adminPage('Bandeja de contacto',
          contactInbox(db, searchParams.get('resolved') === '1')));
        if (req.method === 'POST') {
          const fields = await form(req, 2048);
          if (!fields || !updateContactStatus(db, fields.get('id') || '', fields.get('status'))) {
            return send(res, 400, adminPage('Bandeja de contacto', adminFragment('<p role="alert">Consulta no disponible.</p>')));
          }
          return redirect(res, '/admin/contact');
        }
      }
      if (path === '/admin/security' && ['GET', 'POST'].includes(req.method)) {
        const security = (body, status = 200) => send(res, status, adminPage('Seguridad del panel',
          adminFragment('<p><a href="/admin">Volver a administración</a></p><h1>Seguridad del panel</h1>') + body));
        if (!fixedLocalPassword) return security(
          adminFragment('<p>La contraseña de este entorno se gestiona en la configuración del servidor.</p>'), req.method === 'GET' ? 200 : 403);
        const editor = (message = '') => adminHtml`${message}<form class="confirmation" method="post" action="/admin/security">
          <label>Contraseña actual <input type="password" name="current" autocomplete="current-password" maxlength="256" required></label>
          <label>Nueva contraseña <input type="password" name="password" autocomplete="new-password" minlength="14" maxlength="128" required></label>
          <label>Repite la nueva contraseña <input type="password" name="confirm" autocomplete="new-password" minlength="14" maxlength="128" required></label>
          <p>Usa al menos 14 caracteres.</p><button>Cambiar contraseña</button></form>`;
        if (req.method === 'GET') return security(editor());
        const fields = await form(req, 4096);
        const current = fields?.get('current');
        const password = fields?.get('password');
        const allowed = password && password.length >= 14 && password.length <= 128 && Buffer.byteLength(password) <= 256 &&
          password.trim() === password && password !== current && password === fields.get('confirm') &&
          verifyLocalAdminPassword(current, localCredential);
        if (!allowed) return security(editor(adminFragment('<p class="form-error" role="alert">Comprueba la contraseña actual y que la nueva sea distinta y coincida en ambos campos.</p>')), 400);
        localCredential = changeLocalAdminPassword(fixedLocalPassword, password);
        return security(adminFragment('<p class="form-success" role="status">Contraseña actualizada. Vuelve a entrar con la nueva clave.</p>'));
      }
      const docPath = /^\/admin\/([0-9a-f-]{36})\/document\/(invoice|credit)$/.exec(path);
      if (role === 'admin' && path === '/admin/catalog-order') {
        const orderPanel = message => adminPage('Orden del catálogo',
          catalogOrderAdmin(catalogFamilies(db), adminCatalogProducts(), message));
        if (req.method === 'POST') {
          if (!saveCatalogPosition(db, await form(req))) return send(res, 400,
            orderPanel(adminFragment('<p role="alert">Introduce una posición válida para una familia o un artículo existente.</p>')));
          return redirect(res, '/admin/catalog-order?saved=1');
        }
        if (req.method === 'GET') return send(res, 200, orderPanel(searchParams.has('saved')
          ? adminFragment('<p role="status">Posición guardada.</p>') : ''));
      }
      const familyRoute = /^\/admin\/families(?:\/([a-z0-9][a-z0-9-]{1,23}))?$/.exec(path);
      if (role === 'admin' && familyRoute) {
        const familyPanel = message => adminPage('Familias', familiesAdmin(catalogFamilies(db), message));
        if (req.method === 'GET' && !familyRoute[1]) return send(res, 200, familyPanel(searchParams.has('saved')
          ? adminFragment('<p role="status">Familia guardada.</p>') : ''));
        if (req.method === 'POST') {
          if (!saveFamily(db, await form(req), familyRoute[1])) return send(res, 400, familyPanel(
            adminFragment('<p role="alert">Completa los nombres y usa un identificador disponible de 2 a 24 caracteres, con minúsculas, cifras o guiones.</p>')));
          return redirect(res, '/admin/families?saved=1');
        }
      }
      const compatibilityRoute = /^\/admin\/models\/([a-z0-9][a-z0-9-]{1,23})\/compatibility$/.exec(path);
      if (role === 'admin' && compatibilityRoute && ['GET', 'POST'].includes(req.method)) {
        const sku = compatibilityRoute[1];
        const model = sku === coreSKU ? coreCatalogProduct() : extraModel(sku);
        if (!model || (!isPart(model) && !isWheelchair(model))) return send(res, 404, 'Artículo no encontrado');
        const editingPart = isPart(model);
        const candidates = adminCatalogProducts().filter(editingPart ? isWheelchair : isPart);
        const entriesForModel = () => editingPart ? compatibilityForPart(sku) : [...compatibilityForChair(sku).values()];
        const panel = (message, status = 200) => send(res, status, adminPage('Compatibilidad',
          compatibilityAdmin(model, candidates, entriesForModel(), message)), false, false, true);
        if (req.method === 'GET') return panel(searchParams.has('saved') ? adminFragment('<p role="status">Compatibilidad guardada.</p>') : '');
        const entries = compatibilityInput(await form(req, 262144), candidates, editingPart ? 'chair' : 'part');
        if (!entries) return panel(adminFragment('<p role="alert">Revisa la selección y escribe cada condición en los dos idiomas.</p>'), 400);
        transaction(() => {
          db.prepare(editingPart ? 'DELETE FROM catalog_compatibility WHERE part=?' :
            'DELETE FROM catalog_compatibility WHERE chair=?').run(sku);
          const insert = db.prepare('INSERT INTO catalog_compatibility (part, chair, note_de, note_fr) VALUES (?,?,?,?)');
          for (const [other, de, fr] of entries) {
            insert.run(editingPart ? sku : other, editingPart ? other : sku, de, fr);
          }
        });
        return redirect(res, path + '?saved=1');
      }
      const contentRoute = /^\/admin\/models\/([a-z0-9][a-z0-9-]{1,23})\/content(\/upload)?$/.exec(path);
      if (role === 'admin' && contentRoute) {
        const [, sku, upload] = contentRoute;
        const model = sku === coreSKU ? coreCatalogProduct() : extraModel(sku);
        if (!model) return send(res, 404, 'Artículo no encontrado');
        const target = '/admin/models/' + sku + '/content';
        if (req.method === 'GET' && !upload) return send(res, 200, adminPage('Contenido del artículo',
          contentAdmin(sku, model.name, catalogFeatures(db, sku), searchParams.has('saved'), isPart(model) || isWheelchair(model))));
        if (req.method === 'POST' && upload) {
          if (!await receiveMedia(req, uploadFolder, sku)) return send(res, 400, adminPage('Archivo no válido',
            adminFragment('<p role="alert">Comprueba el formato y el tamaño del archivo.</p><a href="') + target + '">Volver al artículo</a>'));
          return redirect(res, target + '?saved=1');
        }
        if (req.method === 'POST') {
          const fields = await form(req, 65536);
          const entries = ['de', 'fr'].map(lang => fields?.get(lang)?.trim() || '');
          if (!fields || entries.some(value => value.length > 2500)) return send(res, 400, 'Características no válidas');
          db.prepare(`INSERT INTO catalog_features VALUES (?,?,?) ON CONFLICT(sku) DO UPDATE SET de=excluded.de,fr=excluded.fr`).run(sku, ...entries);
          return redirect(res, target + '?saved=1');
        }
      }
      if (accountsEnabled && role === 'admin' && req.method === 'GET' && path === '/admin/customer-codes') {
        return send(res, 200, adminPage('Buzón simulado de clientes', accountMailbox(db)));
      }
      if (accountsEnabled && role === 'admin' && req.method === 'GET' && path === '/admin/offer-codes') {
        return send(res, 200, adminPage('Buzón de ofertas de prueba', offerMailbox(db)));
      }
      if (accountsEnabled && role === 'admin' && path === '/admin/campaigns') {
        const panel = result => adminPage('Campañas de ofertas', campaignPage(db, result));
        if (req.method === 'GET') return send(res, 200, panel(searchParams.get('result')));
        if (req.method === 'POST') {
          const fields = await form(req, 262144);
          if (!transaction(() => queueCampaign(db, fields))) return send(res, 400, panel('invalid'));
          return redirect(res, '/admin/campaigns?result=queued');
        }
      }
      if (req.method === 'POST' && role === 'admin' && third === 'guest-code' && orderIdPattern.test(second) &&
          path === `/admin/${second}/guest-code`) {
        const fields = await form(req);
        const order = orderById(second);
        if (!order) return send(res, 404, 'Pedido desconocido');
        if (fields?.get('action') === 'revoke') {
          transaction(() => {
            revokeGuestCode(db, second);
            revokeCheckoutAccess(db, second);
            retireRecoveryMail(db, second);
          });
          return redirect(res, '/admin/orders/' + second);
        }
        if (fields?.get('action') !== 'issue') return send(res, 400, 'Acción inválida');
        const code = transaction(() => {
          retireRecoveryMail(db, second);
          return issueGuestCode(db, second);
        });
        return send(res, 200, adminPage('Código de pedido invitado', codePage(order, code)));
      }
      if (req.method === 'GET' && docPath && can(role, 'finance')) {
        res.setHeader('Referrer-Policy', 'no-referrer');
        const doc = db.prepare('SELECT * FROM billing_documents WHERE order_id = ? AND kind = ?').get(docPath[1], docPath[2]);
        if (!doc) return send(res, 404, 'Documento no disponible');
        const { locale, title, html } = documentPage(doc);
        return send(res, 200, page(locale, title, html));
      }
      const rolePanel = options => {
        const order = orderIdPattern.test(second) ? orderById(second) : null;
        return order ? adminOrderDetails(order, role, options.error) : adminView({ ...options, role });
      };
      if (req.method === 'GET' && path === '/admin') {
        if (searchParams.has('status') || searchParams.get('view') === 'orders') {
          return send(res, 200, adminOrdersPage(role, searchParams));
        }
        return send(res, 200, rolePanel({ saved: searchParams.get('saved') === 'catalog' }));
      }
      if (req.method === 'GET' && path === '/admin/orders') {
        return send(res, 200, adminOrdersPage(role, searchParams));
      }
      if (req.method === 'GET' && second === 'orders' && orderIdPattern.test(third) && path === `/admin/orders/${third}`) {
        const order = orderById(third);
        return order ? send(res, 200, adminOrderDetails(order, role)) :
          send(res, 404, adminPage('Pedidos', adminFragment('<p>Pedido desconocido</p><a href="/admin/orders">Volver a pedidos</a>')));
      }
      if (req.method === 'GET' && path === '/admin/models') {
        return send(res, 200, displayModelAdmin(searchParams.has('saved')
          ? adminFragment('<p class="form-success" role="status">Modelo guardado.</p>') : '', searchParams));
      }
      if (req.method === 'GET' && path === '/admin/serials') {
        return send(res, 200, adminPage('Historial por número de serie', serialLookup(db, searchParams.get('serial') || '')));
      }
      if (req.method === 'GET' && path === '/admin/analytics') {
        return send(res, 200, adminPage('Embudo de compra', funnelReport(db, searchParams)));
      }
      if (req.method === 'GET' && path === '/admin/stripe') {
        const attempts = db.prepare('SELECT * FROM stripe_attempts ORDER BY rowid DESC LIMIT 200').all();
        return send(res, 200, adminPage('Pagos de prueba con Stripe', stripeAdmin(attempts)));
      }
      if (req.method === 'GET' && path === '/admin/mail') {
        const state = searchParams.get('result');
        const message = state === 'processed' ? 'Procesamiento de la cola solicitado.'
          : state === 'retried' ? 'Correo programado para reintento.' : '';
        return send(res, 200, adminPage('Cola de correos', mailQueuePage(db, role === 'admin', message, Boolean(emailTest))));
      }
      if (role === 'admin' && req.method === 'POST' && path === '/admin/mail/process') {
        await processMail();
        return redirect(res, '/admin/mail?result=processed');
      }
      const retryRoute = /^\/admin\/mail\/([0-9a-f-]{36})\/retry$/.exec(path);
      if (role === 'admin' && req.method === 'POST' && retryRoute) {
        if (!retryEmail(db, retryRoute[1])) return send(res, 409, 'El correo no está pendiente de revisión.');
        return redirect(res, '/admin/mail?result=retried');
      }
      if (req.method === 'GET' && ['/admin/inventory', '/admin/inventory.csv'].includes(path)) {
        const requested = searchParams.get('sku') || '';
        const sku = requested === coreSKU || skuPattern.test(requested) ? requested : '';
        if (path.endsWith('.csv')) {
          res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
            'Content-Disposition': 'attachment; filename="movility-stock.csv"', 'X-Content-Type-Options': 'nosniff' });
          return res.end(inventoryCsv(inventoryRows(sku, -1)));
        }
        const models = [{ sku: coreSKU, name: 'Movility One', units: stock() },
          ...db.prepare('SELECT sku, name, units FROM extra_models ORDER BY name, sku').all()];
        return send(res, 200, adminPage('Movimientos de stock', inventoryPage(models, inventoryRows(sku, 200), sku)));
      }
      if (req.method === 'GET' && ['/admin/accounting', '/admin/accounting.csv'].includes(path)) {
        const filters = accountingFilters(searchParams);
        if (!filters.invalid && path.endsWith('.csv')) {
          res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
            'Content-Disposition': 'attachment; filename="movility-conciliacion.csv"', 'X-Content-Type-Options': 'nosniff' });
          return res.end(accountingCsv(db, filters));
        }
        return send(res, filters.invalid ? 400 : 200, adminPage('Conciliación de pedidos',
          accountingPage(accountingData(db, filters), filters)));
      }
      const modelEdit = /^\/admin\/models(?:\/([a-z0-9][a-z0-9-]{1,23}))?$/.exec(path);
      if (req.method === 'POST' && modelEdit) {
        const fields = await form(req);
        const sku = modelEdit[1] || fields?.get('sku')?.trim() || '';
        const input = modelInput(fields, sku, catalogFamilies(db));
        if (!input) return send(res, 400, displayModelAdmin(adminFragment('<p class="form-error" role="alert">Revisa el SKU, el precio, las traducciones y las características.</p>'), searchParams));
        const saved = transaction(() => {
          const current = extraModel(sku);
          if (modelEdit[1] ? !current || String(current.revision) !== fields.get('revision') : current) return false;
          if (current) {
            db.prepare(`UPDATE extra_models SET name = ?, cents = ?, units = ?, active = ?, description_de = ?,
              description_fr = ?, width = ?, weight = ?, range = ?, fold = ?, family = ?, revision = revision + 1 WHERE sku = ?`).run(...input, sku);
            if (input[2] !== current.units) recordMovement(sku, input[2] - current.units, 'adjustment');
          } else {
            db.prepare(`INSERT INTO extra_models (name, cents, units, active, description_de, description_fr,
              width, weight, range, fold, family, sku) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(...input, sku);
            recordMovement(sku, input[2], 'opening');
          }
          return true;
        });
        searchParams.set('saved', '1');
        return saved ? redirect(res, '/admin/models?' + searchParams) : send(res, 409, displayModelAdmin(
          adminFragment('<p class="form-error" role="alert">El SKU ya existe o el artículo cambió mientras editabas.</p>'), searchParams));
      }
      const emailRoute = /^\/admin\/([0-9a-f-]{36})\/email\/([a-z0-9-]+)$/.exec(path);
      if (req.method === 'GET' && emailRoute && (noticeKinds.includes(emailRoute[2]) || isRecoveryMail(emailRoute[2]))) {
        const [, id, kind] = emailRoute;
        if (isRecoveryMail(kind)) {
          const job = db.prepare('SELECT expires_at, test_payload FROM mail_jobs WHERE order_id=? AND kind=?').get(id, kind);
          if (role !== 'admin' || !job || job.test_payload || job.expires_at <= Math.floor(Date.now() / 1000)) {
            return send(res, 404, 'Correo no disponible');
          }
        }
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
          return send(res, 400, rolePanel({
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
          const delta = Number(rawUnits) - Number(fields.get('expectedUnits'));
          if (delta) recordMovement(coreSKU, delta, 'adjustment');
          return true;
        });
        return saved ? redirect(res, '/admin?saved=catalog') : send(res, 409, rolePanel({
          error: 'El precio o el stock cambió mientras editabas. Revisa los valores actuales y vuelve a guardar.',
        }));
      }
      if (req.method === 'POST' && path === '/admin/restock') {
        transaction(() => {
          if (stock() === 0) orderStock(coreSKU, 1, 'adjustment', null);
        });
        return redirect(res, '/admin');
      }
      if (req.method === 'POST' && third === 'tracking' && orderIdPattern.test(second) && path === `/admin/${second}/tracking`) {
        const fields = await form(req);
        const eventId = fields?.get('eventId') || '';
        if (!orderIdPattern.test(eventId)) return send(res, 400, rolePanel({ error: 'Selecciona un evento de seguimiento válido.' }));
        const order = orderById(second);
        if (!order?.tracking) return send(res, 409, rolePanel({ error: 'Registra el envío antes del evento de seguimiento.' }));
        const event = manualTrackingEvent(db, order, eventId, fields.get('status'));
        if (!event) return send(res, 400, rolePanel({ error: 'Selecciona un evento de seguimiento válido.' }));
        const outcome = applyCarrierEvent(event);
        return ['applied', 'duplicate'].includes(outcome) ? redirect(res, `/admin/orders/${second}`)
          : send(res, 409, rolePanel({ error: 'El evento no coincide con el envío registrado.' }));
      }
      if (req.method === 'POST' && third === 'return' && orderIdPattern.test(second) && path === `/admin/${second}/return`) {
        const fields = await form(req, 32768);
        const receipt = fields?.get('receipt') || '';
        const sku = fields?.get('sku') || '';
        const serials = fields ? readReturnSerials(fields) : null;
        const rawQuantity = fields?.get('quantity') || String(serials?.length || 0);
        const quantity = Number(rawQuantity);
        const disposition = fields?.get('disposition');
        if (!orderIdPattern.test(receipt) || !serials || !/^[1-9]\d{0,2}$/.test(rawQuantity) || !['restock', 'hold'].includes(disposition)) {
          return send(res, 400, rolePanel({ error: 'Indica las unidades o los números de serie recibidos y su estado.' }));
        }
        const restocked = Number(disposition === 'restock');
        const received = transaction(() => {
          const order = orderById(second);
          if (!order?.tracking) return false;
          const duplicate = db.prepare('SELECT * FROM return_receipts WHERE id = ?').get(receipt);
          if (duplicate) return duplicate.order_id === second && duplicate.sku === sku &&
            duplicate.quantity === quantity && duplicate.restocked === restocked && receiptMatches(db, receipt, serials);
          const line = purchasedLines(order).find(item => item.sku === sku);
          const alreadyReceived = orderReceipts(second).filter(item => item.sku === sku).reduce((sum, item) => sum + item.quantity, 0);
          if (!line || quantity > line.quantity - alreadyReceived ||
              !validReturnSelection(shipmentSerials(db, second), sku, quantity, serials)) return false;
          db.prepare('INSERT INTO return_receipts (id, order_id, sku, quantity, restocked) VALUES (?, ?, ?, ?, ?)')
            .run(receipt, second, sku, quantity, restocked);
          markSerialsReceived(db, second, receipt, serials, restocked);
          if (restocked) orderStock(sku, quantity, 'return', second);
          return true;
        });
        return received ? redirect(res, `/admin/orders/${second}`)
          : send(res, 409, rolePanel({ error: 'Revisa las unidades pendientes y que los números de serie correspondan a este modelo y pedido.' }));
      }
      if (req.method === 'POST' && third === 'stripe-refund' && orderIdPattern.test(second) && path === `/admin/${second}/stripe-refund`) {
        if (!stripe) return send(res, 409, rolePanel({ error: 'Activa Stripe en modo de prueba para solicitar este reembolso.' }));
        const attempt = paymentAttempt(db, second);
        const refund = transaction(() => {
          const order = orderById(second);
          if (!order || order.status === 'refunded' || attempt?.state !== 'paid') return null;
          return requestStripeRefund(db, second);
        });
        if (!refund || !refundRetryable(refund)) return redirect(res, `/admin/orders/${second}`);
        try {
          const result = await sendStripeRefund(stripe, attempt);
          if (!saveStripeRefundSubmission(db, attempt, result)) throw new Error('Unexpected refund');
          return redirect(res, `/admin/orders/${second}`);
        } catch {
          return send(res, 502, rolePanel({ error: 'No se pudo verificar la solicitud. Revisa Stripe o reintenta desde el pedido.' }));
        }
      }
      if (req.method === 'POST' && /^\/admin\/[0-9a-f-]{36}\/(ship|refund)$/.test(path)) {
        const fields = await form(req, third === 'ship' ? 262144 : undefined);
        const tracking = fields?.get('tracking')?.trim();
        if (!fields || (third === 'ship' && (!tracking || tracking.length > 80))) return send(res, 400, 'Datos incorrectos');
        const found = transaction(() => {
          const order = orderById(second);
          if (!order) return 'missing';
          if (third === 'ship') {
            if (order.status === 'paid' && refundPending(stripeRefund(db, second))) return 'refund-pending';
            const serials = readShipmentSerials(order, fields);
            if (!serials) return 'invalid';
            if (order.status !== 'paid') return order.tracking === tracking &&
              sameShipmentSerials(shipmentSerials(db, second), serials) ? 'ok' : 'invalid';
            if (!assignShipmentSerials(db, second, serials)) return 'invalid';
            db.prepare("UPDATE orders SET status = 'shipped', tracking = ? WHERE id = ?").run(tracking, second);
            trackingStart(db, second);
            notice(second, 'shipped');
          }
          if (third === 'refund' && order.status !== 'refunded') {
            if (paymentAttempt(db, second)) return 'stripe-refund';
            finishRefund(second);
          }
          return 'ok';
        });
        if (found === 'invalid') return send(res, 409, rolePanel({
          error: 'Indica un número de serie distinto por unidad. Las series enviadas o en revisión no se pueden volver a asignar.',
        }));
        if (found === 'stripe-refund') return send(res, 409, rolePanel({
          error: 'El reembolso de Stripe se conciliará desde la integración de pagos. La simulación no cambia ese pedido.',
        }));
        if (found === 'refund-pending') return send(res, 409, rolePanel({ error: 'Espera la confirmación de Stripe antes de expedir este pedido.' }));
        return found === 'ok' ? redirect(res, '/admin/orders/' + second) : send(res, 404, 'Pedido desconocido');
      }
      return send(res, 404, adminPage('404', adminFragment('<h1>404</h1>')));
    });
    if (accountsEnabled && path === `/${locale}/offers`) {
      const customer = signedInCustomer(db, req.headers.cookie);
      if (req.method === 'GET') return render(offersPage(locale, customer, searchParams.get('result')));
      if (req.method === 'POST') {
        const fields = await form(req);
        const action = fields?.get('action');
        const email = customer || accountEmail(fields?.get('email')?.trim());
        const code = fields?.get('code')?.trim() || '';
        if (action === 'request' && email && fields.get('consent') === 'yes') {
          transaction(() => requestOffers(db, email, locale, Boolean(customer)));
          return redirect(res, path + '?result=requested');
        }
        if (action === 'confirm' && email && transaction(() => confirmOffers(db, email, code))) {
          return redirect(res, path + '?result=active');
        }
        if (action === 'stop' && transaction(() => stopOffers(db, customer, code))) {
          return redirect(res, path + '?result=off');
        }
        return render(offersPage(locale, customer, 'error'), 400);
      }
    }
    if (accountsEnabled && path === `/${locale}/account`) {
      const email = signedInCustomer(db, req.headers.cookie);
      if (req.method === 'GET') {
        const state = searchParams.get('result');
        return render(customerPage(db, locale, email, ['linked', 'requested'].includes(state) ? state : ''));
      }
      if (req.method === 'POST') {
        const fields = await form(req);
        const action = fields?.get('action');
        if (email && action === 'logout') {
          endCustomerSession(db, req.headers.cookie);
          res.setHeader('Set-Cookie', customerCookie(''));
          return redirect(res, path);
        }
        if (email && action === 'link' && transaction(() => linkGuestOrder(db, email, req.headers.cookie))) {
          return redirect(res, path + '?result=linked');
        }
        const submitted = accountEmail(fields?.get('email')?.trim());
        if (!email && submitted && action === 'request') {
          issueAccountCode(db, submitted);
          return redirect(res, path + '?result=requested');
        }
        if (!email && submitted && action === 'verify') {
          const session = transaction(() => verifyAccountCode(db, submitted, fields.get('code')?.trim() || ''));
          if (session) {
            res.setHeader('Set-Cookie', customerCookie(session));
            return redirect(res, path);
          }
        }
        return render(customerPage(db, locale, email, 'invalid'), 400);
      }
    }
    if (path === `/${locale}/guest-access`) {
      if (req.method === 'GET') return render(guestAccessPage(locale, false, verifiedGuestOrder(db, req.headers.cookie),
        searchParams.get('requested') === '1'));
      if (req.method === 'POST') {
        const fields = await form(req);
        const proof = transaction(() => {
          const result = redeemGuestCode(db, fields?.get('code')?.trim() || '', fields?.get('email')?.trim() || '');
          if (result) retireRecoveryMail(db, result.orderId);
          return result;
        });
        if (!proof) return render(guestAccessPage(locale, true), 400);
        res.setHeader('Set-Cookie', guestProofCookie(proof.proof, secureRequest));
        return redirect(res, path);
      }
    }
    if (req.method === 'GET' && settings) return render(analyticsPrompt(locale, consent, path, true));
    if (req.method === 'POST' && settings) {
      const fields = await form(req);
      const choice = fields?.get('choice');
      if (!['accept', 'decline'].includes(choice)) return render(analyticsPrompt(locale, consent, path, true), 400);
      res.setHeader('Set-Cookie', updateAnalytics(db, consent, choice === 'accept', secureRequest));
      return redirect(res, analyticsReturn(locale, fields.get('return') || ''));
    }
    if (req.method === 'GET' && path === '/') return redirect(res, '/de-CH');
    if (first === locale && suffix === '/contact' && ['GET', 'POST'].includes(req.method)) {
      const contactPage = state => informationPage(locale, suffix, editorial, state);
      if (req.method === 'GET') return render(contactPage({ sent: searchParams.get('sent') === '1' }));
      const submission = readContact(await form(req, 40000));
      if (submission.trap) return redirect(res, path + '?sent=1');
      if (submission.invalid.length) return render(contactPage(submission), 400);
      if (!transaction(() => saveContact(db, locale, submission.values))) {
        return render(contactPage({ values: submission.values, limited: true }), 429);
      }
      return redirect(res, path + '?sent=1');
    }
    if (req.method === 'GET' && first === locale && Object.hasOwn(information, suffix)) {
      return render(informationPage(locale, suffix, editorial || {}));
    }
    if (req.method === 'GET' && path === `/${locale}`) {
      const models = orderedProducts(db, [coreCatalogProduct(), ...liveModels()]);
      const featured = modelPhotos(coreSKU);
      const featuredPhoto = featured.front || productImage;
      const families = catalogFamilies(db).filter(row => row.id === 'wheelchair' ||
        models.some(model => model.family === row.id));
      const family = catalogFilter(searchParams, families);
      const visible = family ? families.filter(row => row.id === family) : families;
      const partFamily = isPart({ family });
      const chairs = partFamily ? models.filter(isWheelchair) : [];
      const selected = chairs.find(chair => chair.sku === searchParams.get('compatible'))?.sku;
      const matches = selected ? compatibilityForChair(selected) : null;
      const results = matches ? models.filter(model => model.family === family && matches.has(model.sku)) : models;
      const products = extraCatalog(locale, results, visible, sku => sku === coreSKU
        ? featuredPhoto : Object.values(modelPhotos(sku)).find(Boolean));
      return render(homepage(locale, {
        filters: storefrontFamilyFilters(locale, families, family) + (partFamily ? compatibilityFilter(locale, family, chairs, selected) : ''),
        featuredPhoto,
        detailPhoto: featured.side || sideImage,
        faqs: shopFaqs(db, locale),
        products: products || (locale === 'fr-CH' ? '<p>Aucun article compatible trouvé.</p>' : '<p>Keine passenden Artikel gefunden.</p>'),
      }));
    }
    if (req.method === 'GET' && path === `/${locale}/movility-one`) {
      const model = catalog();
      track('view');
      const media = modelMedia(coreSKU, locale);
      return render(productPage(locale, model.cents, stock() > 0, model, { view: galleryView,
        photos: media.photo ? media.photos : undefined, video: media.video || videoLocales.has(locale),
        features: renderFeatures(locale, catalogFeatures(db, coreSKU)) }) + relatedParts(locale, coreSKU));
    }
    if (req.method === 'GET' && path === `/${locale}/compare`) {
      return render(comparisonPage(locale, searchParams, catalog().cents, liveModels().filter(isWheelchair)));
    }
    if (req.method === 'GET' && modelRoute) {
      const model = extraModel(modelRoute[1]);
      if (model?.active) {
        const media = modelMedia(model.sku, locale);
        if (!modelRoute[2]) {
          track('view');
          let compatibility = '';
          if (isWheelchair(model)) compatibility = relatedParts(locale, model.sku);
          if (isPart(model)) {
            const entries = new Map(compatibilityForPart(model.sku).map(entry => [entry.chair, entry]));
            compatibility = compatibilitySection(locale, activeChairs().filter(chair => entries.has(chair.sku))
              .map(chair => ({ ...entries.get(chair.sku), ...chair })), true);
          }
          return render(extraProduct(locale, model, media, galleryView, catalogFeatures(db, model.sku), compatibility));
        }
        if (media.model) return render(viewerPage(locale, media.photo,
          { name: model.name, url: media.model, productPath: '/models/' + model.sku }));
      }
    }
    if (req.method === 'GET' && path === `/${locale}/movility-one/3d`) {
      const media = modelMedia(coreSKU, locale);
      return render(viewerPage(locale, media.photo || productImage, { url: media.model || modelPath }));
    }
    if (req.method === 'GET' && path === `/${locale}/cart`) {
      if (selectedSKU) {
        const model = extraModel(selectedSKU);
        if (model?.active && model.units) track('cart');
        return model?.active ? render(cartPage(locale, model.cents, model.units > 0, model)) : render(`<h1>${t.soldOut}</h1>`, 404);
      }
      const lines = cartLines(readCart(req), purchaseModel);
      if (canCheckout(lines)) track('cart');
      return render(basketPage(locale, lines));
    }
    if (req.method === 'POST' && path === `/${locale}/cart`) {
      const cart = readCart(req);
      if (!changeCart(cart, await form(req), purchaseModel)) {
        return render(basketPage(locale, cartLines(cart, purchaseModel), cartText(locale).unavailable), 409);
      }
      if (canCheckout(cartLines(cart, purchaseModel))) track('cart');
      res.setHeader('Set-Cookie', cartCookie(cart, secureRequest));
      return redirect(res, `/${locale}/cart`);
    }
    if (req.method === 'GET' && basketCheckout) {
      const lines = cartLines(readCart(req), purchaseModel);
      if (!canCheckout(lines)) return render(basketPage(locale, lines, cartText(locale).unavailable), 409);
      track('checkout');
      const amount = cartTotal(lines);
      return render(checkoutPage(locale, amount, randomUUID(), {}, '', null, lines, stripeMethodsFor(stripe, amount)));
    }
    if (req.method === 'GET' && path === `/${locale}/checkout`) {
      if (selectedSKU) {
        const model = extraModel(selectedSKU);
        if (!model?.active || !model.units) return render(`<h1>${t.soldOut}</h1>`, 409);
        track('checkout');
        return render(checkoutPage(locale, model.cents, randomUUID(), {}, '', model, undefined, stripeMethodsFor(stripe, model.cents)));
      }
      const model = catalog();
      if (!stock()) return render(productPage(locale, model.cents, false, model), 409);
      track('checkout');
      return render(checkoutPage(locale, model.cents, randomUUID(), {}, '', null, undefined, stripeMethodsFor(stripe, model.cents)));
    }
    if (stripe && first === locale && second === 'payment' && orderIdPattern.test(third) && path === `/${locale}/payment/${third}`) {
      res.setHeader('Referrer-Policy', 'strict-origin');
      if (!canViewOrder(third)) return render(orderAccessPage(locale, accountsEnabled, third), 403);
      const attempt = paymentAttempt(db, third);
      if (!attempt || JSON.parse(attempt.payload).locale !== locale) return render('<h1>404</h1>', 404);
      if (attempt.state === 'paid' && ['GET', 'POST'].includes(req.method)) {
        track('purchase');
        const currentCart = readCart(req);
        const snapshot = JSON.parse(attempt.payload).lines;
        if (currentCart.size === snapshot.length && snapshot.every(line => currentCart.get(line.sku) === line.quantity)) {
          res.setHeader('Set-Cookie', cartCookie(new Map(), secureRequest));
        }
        return redirect(res, `/${locale}/orders/${third}`);
      }
      if (req.method === 'GET') return render(stripeStatus(locale, attempt));
      if (req.method === 'POST') return stripeRedirect(res, attempt, locale, render);
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
      const billing = billingInput(fields);
      const values = { ...address, email, method, billing: billing.values };
      let checkoutAccess;
      if (sku && !selected) return render(`<h1>${t.soldOut}</h1>`, 409);
      const invalid = [...billing.invalid];
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid.push('email');
      for (const key of ['name', 'street', 'city']) {
        if (!address[key] || address[key].length > (key === 'street' ? 160 : 100)) invalid.push(key);
      }
      if (!/^\d{4}$/.test(address.zip)) invalid.push('zip');
      const offered = stripeMethodsFor(stripe, cents) || methods;
      if (offered.length && !(stripe?.methods || methods).includes(method)) invalid.push('method');
      if (!validId || !offered.length || invalid.length || !(stripe ? ['stripe'] : ['paid', 'failed']).includes(result)) {
        return render(checkoutPage(locale, cents, validId ? id : randomUUID(), values, t.invalid, selected, lines,
          stripeMethodsFor(stripe, cents), invalid), 400);
      }
      if (stripe) {
        const matchesQuote = items => basketCheckout ? fields.get('cartQuote') === cartQuote(items)
          : items.length === 1 && items[0].sku === (sku || coreSKU) && quotedPrice === String(items[0].cents);
        const reservation = transaction(() => {
          const existing = paymentAttempt(db, id);
          if (existing) {
            if (!canViewOrder(id)) return 'conflict';
            const previous = JSON.parse(existing.payload);
            return existing.method === method && previous.email === email && previous.locale === locale &&
              JSON.stringify(previous.address) === JSON.stringify(address) &&
              JSON.stringify(previous.billing ?? null) === JSON.stringify(billing.address) && matchesQuote(previous.lines) ? existing : 'conflict';
          }
          if (orderById(id)) return 'conflict';
          const items = cartLines(cart || new Map([[sku || coreSKU, 1]]), purchaseModel);
          if (!canCheckout(items)) return 'out';
          if (!matchesQuote(items)) return 'price';
          if (!stripeMethodsFor(stripe, cartTotal(items)).includes(method)) return 'method';
          const snapshot = items.map(({ sku, name, quantity, cents, requires_serial }) => ({ sku, name, quantity, cents, requires_serial }));
          const attempt = reserveStripe(db, id, method, { locale, email, address, billing: billing.address, lines: snapshot }, cartTotal(snapshot),
            line => orderStock(line.sku, -line.quantity, 'reservation', null));
          checkoutAccess = issueCheckoutAccess(db, id);
          return attempt;
        });
        if (reservation === 'price' || reservation === 'method') {
          const refreshed = basketCheckout ? cartLines(cart, purchaseModel) : null;
          const selection = sku ? extraModel(sku) : null;
          const amount = refreshed ? cartTotal(refreshed) : selection?.cents ?? catalog().cents;
          return render(checkoutPage(locale, amount, id, values, reservation === 'price' ? t.priceChanged : t.invalid,
            selection, refreshed, stripeMethodsFor(stripe, amount)), 409);
        }
        if (typeof reservation === 'string') {
          return render(basketCheckout && reservation === 'out'
            ? basketPage(locale, cartLines(cart, purchaseModel), cartText(locale).unavailable)
            : `<h1>${reservation === 'out' ? t.soldOut : t.invalid}</h1><a href="/${locale}">${t.catalog}</a>`, 409);
        }
        if (checkoutAccess) res.appendHeader('Set-Cookie', checkoutAccessCookie(id, checkoutAccess, secureRequest));
        return stripeRedirect(res, reservation, locale, render);
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
          createPaidOrder(id, method, locale, email, address, currentLines, billing.address);
          for (const line of currentLines) {
            orderStock(line.sku, -line.quantity, 'order', id);
          }
          notice(id, 'paid');
          checkoutAccess = issueCheckoutAccess(db, id);
          return 'ok';
        }
        const currentModel = sku ? extraModel(sku) : null;
        if (sku && !currentModel?.active) return 'out';
        const currentPrice = currentModel?.cents ?? catalog().cents;
        if (quotedPrice !== String(currentPrice)) return 'price';
        if (!changeStock(sku || coreSKU, -1)) return 'out';
        db.prepare("INSERT INTO orders VALUES (?, ?, ?, ?, ?, 'paid', NULL)").run(id, email, locale, method, currentPrice);
        recordMovement(sku || coreSKU, -1, 'order', id);
        if (currentModel) db.prepare('INSERT INTO order_models VALUES (?, ?, ?, ?)').run(id, sku, currentModel.name, Number(isWheelchair(currentModel)));
        db.prepare('INSERT INTO delivery_addresses VALUES (?, ?, ?, ?, ?)').run(id, address.name, address.street, address.zip, address.city);
        saveBillingAddress(db, id, billing.address);
        notice(id, 'paid');
        checkoutAccess = issueCheckoutAccess(db, id);
        return 'ok';
      });
      if (outcome === 'ok' || outcome === 'repeat') {
        if (outcome === 'ok') track('purchase');
        if (basketCheckout && (outcome === 'ok' || cartQuote(lines) === fields.get('cartQuote'))) {
          res.setHeader('Set-Cookie', cartCookie(new Map(), secureRequest));
        }
        if (checkoutAccess) res.appendHeader('Set-Cookie', checkoutAccessCookie(id, checkoutAccess, secureRequest));
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
    if (req.method === 'GET' && shipmentRoute) {
      res.setHeader('Referrer-Policy', 'no-referrer');
      const shipment = shipmentFromToken(db, third);
      return render(shipmentPage(locale, shipment, shipment ? trackingEvents(db, shipment.id) : []), shipment ? 200 : 404);
    }
    if (req.method === 'POST' && orderPageRoute) {
      const fields = await form(req, 2048);
      const email = fields?.get('email')?.trim() || '';
      transaction(() => {
        const access = requestOrderRecovery(db, third, email);
        if (!access) return;
        const kind = 'access-' + randomUUID();
        const { subject, body } = orderRecoveryEmail(access.locale, access.code, siteOrigin);
        db.prepare('INSERT INTO notices VALUES (?, ?)').run(third, kind);
        db.prepare('INSERT INTO email_previews VALUES (?, ?, ?, ?)').run(third, kind, subject, body);
        queueEmail(db, third, kind, undefined, emailTest?.target, access.expires);
      });
      res.setHeader('Referrer-Policy', 'no-referrer');
      return redirect(res, `/${locale}/guest-access?requested=1`);
    }
    if (req.method === 'GET' && orderPageRoute) {
      // Keep the order path out of referrers while allowing Chrome to send Origin on form POSTs.
      res.setHeader('Referrer-Policy', 'strict-origin');
      if (!canViewOrder(third)) return render(orderAccessPage(locale, accountsEnabled, third), 403);
      const order = orderById(third);
      if (order) {
        const events = trackingEvents(db, order.id);
        const maySubscribe = order.status !== 'refunded' && !events.some(event => event.event_status === 'delivered');
        return render(orderPage(locale, order, events, pushControls(locale, order, push, maySubscribe)));
      }
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
  if (configuredAdmin) console.log('Administración (/admin): usuario admin, contraseña configurada.');
  else if (fixedLocalPassword) console.log('Administración local (/admin/security): usuario admin. Archivo de credencial: ' + fixedLocalPassword);
  else console.log('Administración temporal (/admin): admin / ' + admin);
});
