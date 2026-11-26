import { importPath, maxCsvBytes, catalogTemplate, catalogImportPlan, importConfirmation, applyCatalogImport, catalogImportPage } from './catalog-import.mjs';
import { adminFragment, adminHtml, adminLanguage, adminLocale, adminPage, adminText, setAdminNavigation } from './admin-language.mjs';
import { createServer } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { basename, join, resolve } from 'node:path';
import { coreDemoSpecs } from './product-specs.mjs';
import { setupOneDetails, oneDetails, oneDetailsEditor, saveOneDetails, resetOneVideoPurpose } from './movility-one-details.mjs';
import { deliveryCountries } from './delivery-countries.mjs';
import { copy, page, money, methods, escapeHtml } from './views.mjs';
import { navigation, homepage, homeHero, homeModelDetail, productPage, cartPage, checkoutPage, orderPage,
  productImage, sideImage, videoPath, captionsPath, transcriptPath } from './storefront.mjs';
import { comparisonPage, comparisonQuery, comparisonSelection, selectedModels, viewerPage, modelPath, viewerScript } from './discovery.mjs';
import { chairFilterValues, matchesChairFilters, chairFilterPanel, noChairMatches } from './chair-filters.mjs';
import { isPublicPage, pageMetadata, publicOrigin, sitemap } from './seo.mjs';
import { information, informationPage } from './information.mjs';
import { aboutImage, aboutDraftImage, aboutPreview, aboutDraftSettings, aboutDraftEditor, saveAboutDraft } from './about-editorial.mjs';
import { discoveryAccessoriesImage, discoveryCompareImage } from './home-discovery.mjs';
import { setupLegal, legalPaths, legalTitle, legalDraft, publishedLegal, saveLegal, legalAdmin, legalPage, footerGroups } from './legal.mjs';
import { informationAdmin, informationAdminTitles, informationSettings, saveInformation, setupInformation } from './information-admin.mjs';
import { contactInbox, readContact, saveContact, setupContact, updateContactStatus } from './contact.mjs';
import { faqAdmin, faqFeedback, setupFaq, shopFaqs, updateFaq } from './faq.mjs';
import { seedStagingCatalog } from './ops/staging-catalog.mjs';
import { orderEmail } from './postpurchase.mjs';
import { setupModels, modelAdmin, modelInput, insertModel, previewLinks, extraCatalog, extraProduct, isWheelchair,
  catalogFamilies, saveFamily, familiesAdmin, catalogFeatures, renderFeatures, catalogFilter, storefrontFamilyFilters,
  orderedProducts, saveCatalogPosition, catalogOrderAdmin } from './catalog.mjs';
import { contentAdmin, receiveMedia, receiveUpload, gallerySettings, saveGallery, mediaAvailability, videoFileKinds } from './catalog-media.mjs';
import { setupCatalogVideos, catalogVideos, catalogVideo, saveCatalogVideo, catalogVideosAdmin } from './catalog-videos.mjs';
import { setupCompatibility, isPart, compatibilityAdmin, compatibilityInput, compatibilityFilter, compatibilitySection, noConfirmedParts } from './compatibility.mjs';
import { basketPage, canCheckout, cartCookie, cartLines, cartQuote, cartText,
  changeCart, coreSKU, readCart, skuPattern } from './cart.mjs';
import { setupInventory, purchasedLines, returnControls, inventoryPage, inventoryCsv, inventoryBalances } from './inventory.mjs';
import { setupAccounting, recordPayment, accountingFilters, accountingData, accountingPage, accountingCsv } from './accounting.mjs';
import { setupSerials, shipmentSerials, readShipmentSerials, assignShipmentSerials, sameShipmentSerials,
  readReturnSerials, receiptMatches, validReturnSelection, markSerialsReceived, shipmentForm, serialSummary, serialLookup, readSupplierSerials, supplierSerialConflict } from './serials.mjs';
import { adminAuth, adminRouteAllowed, can, changeLocalAdminPassword, encodeAdminPassword, localAdminPassword, roleNames,
  verifyLocalAdminPassword } from './admin-access.mjs';
import { setupFunnel, purgeFunnel, analyticsChoice, updateAnalytics, recordFunnel,
  analyticsPrompt, analyticsReturn, analyticsLink, funnelReport } from './analytics.mjs';
import { setupMailQueue, queueEmail, deliverBatch, simulatedMailProvider, retryEmail, deliveryStatus, mailQueuePage,
  isRecoveryMail, retireRecoveryMail } from './mail-queue.mjs';
import { resendConfig, resendProvider } from './resend-mail.mjs';
import { setupTracking, trackingStart, trackingEvents, applyTrackingEvent, trackingHistory, trackingForm,
  manualTrackingEvent, normalizeTrackingEvent, carrierSignatureValid, readCarrierBody, shipmentFromToken,
  shipmentPage, shipmentPath, shipmentTokenPattern } from './tracking.mjs';
import { setupPush, purgePush, pushConfig, pushSubscription, pushState, addPushSubscription, removePushSubscription,
  queuePush, deliverPush, pushControls, pushAdmin } from './order-push.mjs';
import { stripeMode, createCheckout, verifyStripeEvent, stripeOutcome, setupStripePayments, paymentAttempt,
  reserveStripe, saveStripeSession, applyStripeOutcome, stripeStatus, stripeAdmin, stripeMethodsFor } from './stripe-payments.mjs';
import { setupStripeRefunds, stripeRefund, refundPending, refundRetryable, requestStripeRefund,
  sendStripeRefund, saveStripeRefundSubmission, applyStripeRefundEvent, refundControls } from './stripe-refunds.mjs';
import { setupDocuments, billingInput, saveBillingAddress, issueDocument, documentPage } from './billing-documents.mjs';
import { setupShipping, shippingSettings, saveShippingSettings, shippingAdmin, shippingBlock,
  checkoutTotals, shippingQuote, legacyShipping, orderShipping, saveOrderShipping } from './shipping.mjs';
import { setupBillingSettings, billingSettings, billingReadiness, saveBillingSettings, billingSettingsAdmin } from './billing-settings.mjs';
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
const resend = resendConfig(process.env, siteOrigin);
const commercial = Boolean(stripe?.live);
if (commercial !== Boolean(resend?.live) ||
    (process.env.MOVILITY_ENABLE_LIVE === '1' || process.env.MOVILITY_STAGE === 'production') && !commercial) {
  throw new Error('Commercial activation requires both stripe-live and resend-live. Keep the pilot separate.');
}
const shopBasket = (locale, lines, message, options) => basketPage(locale, lines, message, { ...options, live: commercial });
const externalMailMode = resend?.live ? 'live' : Boolean(resend);
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
if (commercial && (!process.env.MOVILITY_DB || dbPath === ':memory:' || !configuredAdmin?.trim())) {
  throw new Error('Commercial mode requires an explicit persistent MOVILITY_DB and MOVILITY_ADMIN_PASSWORD.');
}
const fixedLocalPassword = !configuredAdmin && !process.env.MOVILITY_DB && CODESPACES !== 'true' && !siteOrigin && !stripe
  ? resolve('data/admin-password.txt') : '';
let localCredential = fixedLocalPassword ? localAdminPassword(fixedLocalPassword) : null;
const profile = process.env.MOVILITY_CATALOG_PROFILE || 'demo';
if (!['demo', 'commercial'].includes(profile)) throw new Error('Unknown catalog profile.');
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA busy_timeout = 5000;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS stock (id INTEGER PRIMARY KEY, units INTEGER NOT NULL CHECK (units >= 0));
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, email TEXT NOT NULL, locale TEXT NOT NULL, method TEXT NOT NULL,
    cents INTEGER NOT NULL, status TEXT NOT NULL, tracking TEXT
  );
  CREATE TABLE IF NOT EXISTS core_order_names (
    order_id TEXT PRIMARY KEY REFERENCES orders(id), name TEXT NOT NULL
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
  CREATE TABLE IF NOT EXISTS storefront_catalog (
    id INTEGER PRIMARY KEY CHECK(id=1), profile TEXT NOT NULL,
    core_published INTEGER NOT NULL CHECK(core_published IN (0,1)), featured TEXT NOT NULL
  );
`);

const hasLegacyCatalog = Boolean(db.prepare('SELECT 1 FROM catalog WHERE id=1').get());
const initialProfile = hasLegacyCatalog ? 'demo' : profile;
db.prepare('INSERT OR IGNORE INTO storefront_catalog VALUES (1,?,?,?)')
  .run(initialProfile, Number(initialProfile === 'demo'), initialProfile === 'demo' ? 'one' : '');
const storefrontCatalog = () => db.prepare('SELECT * FROM storefront_catalog WHERE id=1').get();
const demoCatalog = storefrontCatalog().profile === 'demo';
if (commercial && demoCatalog) throw new Error('Commercial integrations require a separate commercial catalog database.');
const corePublished = () => Boolean(storefrontCatalog().core_published);
db.prepare('INSERT OR IGNORE INTO stock VALUES (1,?)').run(Number(demoCatalog));
if (demoCatalog) db.exec('INSERT OR IGNORE INTO catalog (id,cents) VALUES (1,249900)');

setupModels(db);
setupOneDetails(db);
setupCatalogVideos(db);
setupCompatibility(db);
const catalog = () => db.prepare('SELECT * FROM catalog WHERE id = 1').get() || { cents: 0 };
const extraModel = sku => db.prepare('SELECT * FROM extra_models WHERE sku = ?').get(sku);
const liveModels = () => db.prepare('SELECT * FROM extra_models WHERE active = 1 ORDER BY name, sku').all();
const coreCatalogProduct = () => {
  if (!demoCatalog) return null;
  const details = oneDetails(db);
  const confirmed = { width: details.total_width, weight: details.weight, range: details.range };
  return { ...catalog(), name: 'Mobility One', units: stock(), sku: coreSKU, family: 'wheelchair', active: Number(corePublished()), ...coreDemoSpecs,
    ...Object.fromEntries(Object.entries(confirmed).filter(([, value]) => value != null)),
    demoSpecs: Object.keys(coreDemoSpecs).filter(key => confirmed[key] == null) };
};
const compatibilityForPart = sku => db.prepare('SELECT * FROM catalog_compatibility WHERE part=?').all(sku);
const compatibilityForChair = sku => new Map(db.prepare('SELECT * FROM catalog_compatibility WHERE chair=?').all(sku)
  .map(entry => [entry.part, entry]));
const publicModels = () => [...(corePublished() ? [coreCatalogProduct()] : []), ...liveModels()];
const activeChairs = () => publicModels().filter(isWheelchair);
const featuredChair = () => activeChairs().find(model => model.sku === storefrontCatalog().featured);
const clearFeatured = sku => db.prepare("UPDATE storefront_catalog SET featured='' WHERE featured=?").run(sku);
const relatedParts = (locale, sku, preview = false) => {
  const matches = compatibilityForChair(sku);
  return compatibilitySection(locale, orderedProducts(db, (preview ? adminCatalogProducts() : liveModels()).filter(model => isPart(model) && matches.has(model.sku)))
    .map(model => ({ ...matches.get(model.sku), ...model })), false, preview);
};
const partCompatibility = (locale, sku, preview = false) => {
  const entries = new Map(compatibilityForPart(sku).map(entry => [entry.chair, entry]));
  const chairs = (preview ? adminCatalogProducts().filter(isWheelchair) : activeChairs())
    .filter(chair => entries.has(chair.sku)).map(chair => ({ ...entries.get(chair.sku), ...chair }));
  return { html: compatibilitySection(locale, chairs, true, preview), pending: !chairs.length };
};
const familyLabel = (locale, family) => catalogFamilies(db).find(item => item.id === family)?.[locale] || '';
const adminCatalogProducts = () => orderedProducts(db, [...(demoCatalog ? [coreCatalogProduct()] : []),
  ...db.prepare('SELECT * FROM extra_models ORDER BY active DESC, name, sku').all()]);
const displayModelAdmin = (message, params, attempted) => adminPage('Artículos del catálogo', modelAdmin(
  adminCatalogProducts(), catalogFamilies(db), message, params, attempted));
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
const draftImageSku = '__about-editorial';
const draftImageFile = join(uploadFolder, draftImageSku + '.jpg');
const editorialImageFile = new URL('.' + aboutImage, import.meta.url);
const editorialDraftSource = () => existsSync(draftImageFile) ? aboutDraftImage : aboutImage;
function mediaFile(path) {
  const managed = join(uploadFolder, basename(path));
  if (path.startsWith('/assets/models/') && existsSync(managed)) return managed;
  return process.env.MOVILITY_MEDIA_DIR
    ? join(process.env.MOVILITY_MEDIA_DIR, basename(path)) : new URL('.' + path, import.meta.url);
}
function modelVideo(sku, locale, id) {
  const base = `/assets/models/${sku}${id ? '.video-' + id : ''}`;
  const bundle = { video: base + '.mp4', captions: base + '.' + locale + '.vtt', transcript: base + '.' + locale + '.txt' };
  if (!Object.values(bundle).every(path => existsSync(mediaFile(path)))) return null;
  const captions = readFileSync(mediaFile(bundle.captions), 'utf8');
  const transcript = readFileSync(mediaFile(bundle.transcript), 'utf8');
  return captions.replace(/^\uFEFF/, '').startsWith('WEBVTT') && transcript.trim() ? bundle : null;
}

function modelPhotos(sku) {
  const base = `/assets/models/${sku}`;
  const find = extension => existsSync(mediaFile(base + extension)) ? base + extension : '';
  const photos = { front: find('.jpg'), side: find('.side.jpg'), rear: find('.rear.jpg') };
  return Object.fromEntries(gallerySettings(db, sku).order.map(slot => [slot, photos[slot]]));
}
function modelMedia(sku, locale, preview = false) {
  const settings = gallerySettings(db, sku);
  const asset = path => preview && path.startsWith('/assets/models/') ? '/admin' + path : path;
  const files = modelPhotos(sku);
  const demoPhotos = sku === coreSKU && !Object.values(files).some(Boolean);
  const fallback = { front: productImage, side: sideImage };
  const photos = Object.fromEntries(settings.order.map(slot => [slot, asset(demoPhotos ? fallback[slot] || '' : files[slot])]));
  const photo = Object.values(photos).find(Boolean);
  const video = modelVideo(sku, locale);
  const model = `/assets/models/${sku}.glb`;
  const videoAssets = bundle => Object.fromEntries(Object.entries(bundle).map(([key, path]) => [key, asset(path)]));
  const videos = catalogVideos(db, sku).filter(item => item.published).flatMap(item => {
    const bundle = modelVideo(sku, locale, item.id);
    return bundle && modelVideo(sku, locale === 'de-CH' ? 'fr-CH' : 'de-CH', item.id) ? [{ ...videoAssets(bundle), poster: photo, id: 'model-video-' + item.id,
      title: item['title_' + locale.slice(0, 2)], purpose: item.purpose }] : [];
  });
  return { photo, photos, demoPhotos, alts: settings.alts[locale], model: existsSync(mediaFile(model)) ? asset(model) : '',
    videos, video: video ? { ...videoAssets(video), poster: photo } : null };
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
const pilotPasswordChange = accountsEnabled && Boolean(configuredAdmin);
if (pilotPasswordChange) {
  db.exec(`CREATE TABLE IF NOT EXISTS pilot_admin_credential (
    id INTEGER PRIMARY KEY CHECK (id = 1), credential TEXT NOT NULL
  )`);
}
const readPilotCredential = pilotPasswordChange
  ? db.prepare('SELECT credential FROM pilot_admin_credential WHERE id = 1') : null;
const currentAdminCredential = () => pilotPasswordChange
  ? readPilotCredential.get()?.credential ?? configuredAdmin : localCredential;
const admin = configuredAdmin || (localCredential ? undefined : randomBytes(24).toString('base64url'));
const adminRole = adminAuth({ admin: pilotPasswordChange ? undefined : admin,
  warehouse: process.env.MOVILITY_WAREHOUSE_PASSWORD, support: process.env.MOVILITY_SUPPORT_PASSWORD,
  finance: process.env.MOVILITY_FINANCE_PASSWORD },
  pilotPasswordChange || fixedLocalPassword ? currentAdminCredential : undefined);

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
  if (demoCatalog && accountsEnabled && process.env.MOVILITY_STAGING_SEED === '1') seedStagingCatalog(db);
  db.exec(`UPDATE extra_models SET name='Mobility ' || substr(name, 10), revision=revision+1
    WHERE (sku GLOB 'demo-*' OR sku IN ('qa-chair','qa-bag')) AND name GLOB 'Movility *'`);
  setupInventory(db);
  setupAccounting(db);
  setupSerials(db);
  setupFunnel(db);
  setupMailQueue(db);
  setupTracking(db);
  setupPush(db);
  db.exec(`UPDATE push_jobs SET path = (
    SELECT '/' || sub.locale || '/shipment/' || links.token
    FROM push_subscriptions AS sub JOIN shipment_links AS links ON links.order_id = sub.order_id
    WHERE sub.id = push_jobs.subscription_id
  ) WHERE path IS NULL AND status IN ('queued', 'sending')`);
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
  setupLegal(db);
  setupBillingSettings(db);
  setupShipping(db);
  purgePush(db);
  purgeFunnel(db);
});
const currentBilling = () => billingSettings(db, process.env.MOVILITY_CONTACT_EMAIL);
const billingProfile = () => billingReadiness(currentBilling());
if (commercial) {
  const { missing } = billingProfile();
  if (missing.length) throw new Error('Activación comercial bloqueada. Completa /admin/billing en simulación: ' + missing.join(', '));
}
if (accountsEnabled) {
  setInterval(() => {
    try { transaction(() => processCampaigns(db)); }
    catch (error) { console.error('Campaign simulation failed', error); }
  }, 3000).unref();
}
setInterval(() => {
  try { purgeFunnel(db); transaction(() => purgePush(db)); }
  catch (error) { console.error('Could not purge expired analytics and push state', error); }
}, 3600000).unref();
const sendSimulated = simulatedMailProvider(db);
const sendResend = resendProvider(resend);
const mailProvider = message => message.testTarget ? sendResend(message) : sendSimulated(message);
let mailRun;
const processMail = () => mailRun ??= deliverBatch(db, transaction, mailProvider, undefined, 12, externalMailMode)
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
  if (sku === coreSKU) return corePublished() ? coreCatalogProduct() : null;
  const model = extraModel(sku);
  return model?.active ? { ...model, requires_serial: Number(isWheelchair(model)) } : null;
}
const orderLines = id => db.prepare('SELECT sku, name, quantity, cents, requires_serial FROM order_lines WHERE order_id = ? ORDER BY rowid').all(id);
function orderById(id) {
  const order = db.prepare(`SELECT orders.*, order_models.sku AS model_sku, COALESCE(order_models.name, core_order_names.name) AS model_name, order_models.requires_serial
    FROM orders LEFT JOIN order_models ON orders.id = order_models.order_id
    LEFT JOIN core_order_names ON orders.id = core_order_names.order_id WHERE orders.id = ?`).get(id);
  return order ? { ...order, lines: orderLines(id), shipping: orderShipping(db, id) } : null;
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
  return db.prepare('INSERT INTO stock_movements (sku, delta, balance, reason, order_id) VALUES (?, ?, ?, ?, ?)')
    .run(sku, delta, balance, reason, orderId).lastInsertRowid;
}
function orderStock(sku, quantity, reason, orderId) {
  if (!changeStock(sku, quantity)) throw new Error('Stock changed during order operation');
  recordMovement(sku, quantity, reason, orderId);
}
const termsVersion = () => publishedLegal(db, '/terms')?.version;
function saveOrderTerms(id, locale, version) {
  if (version) db.prepare('INSERT INTO order_terms VALUES (?,?,?)').run(id, version, locale);
}
function createPaidOrder(id, method, locale, email, address, items, billing, shipping) {
  db.prepare("INSERT INTO orders VALUES (?, ?, ?, ?, ?, 'paid', NULL)").run(id, email, locale, method, checkoutTotals(items, shipping).total);
  saveOrderShipping(db, id, shipping);
  const insertLine = db.prepare('INSERT INTO order_lines VALUES (?, ?, ?, ?, ?, ?)');
  for (const line of items) insertLine.run(id, line.sku, line.name, line.quantity, line.cents, line.requires_serial ?? 1);
  db.prepare('INSERT INTO delivery_addresses VALUES (?, ?, ?, ?, ?)').run(id, address.name, address.street, address.zip, address.city);
  saveBillingAddress(db, id, billing);
}
async function stripeRedirect(res, attempt, locale, render) {
  if (Boolean(attempt.livemode) !== stripe.live) return render('<h1>404</h1>', 404);
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
const inventoryRows = (sku, limit) => db.prepare(`SELECT stock_movements.*,
    (SELECT json_group_array(serial) FROM supplier_receipts JOIN supplier_serials ON receipt_id = supplier_receipts.id
      WHERE movement_id = stock_movements.id) AS received_serials FROM stock_movements
  WHERE (? = '' OR sku = ?) ORDER BY id DESC LIMIT ?`).all(sku, sku, limit)
  .map(move => ({ ...move, serials: JSON.parse(move.received_serials) }));
const noticeKinds = ['paid', 'shipped', 'delivered', 'refunded'];
const emailShipmentPath = (order, kind) => ['shipped', 'delivered'].includes(kind)
  ? shipmentPath(db, order.locale, order.id) : '';

const orderIsLive = id => paymentAttempt(db, id)?.livemode === 1;
const mailTarget = order => resend?.live
  ? (orderIsLive(order.id) ? { ...resend.target, recipient: order.email } : null)
  : resend?.target;
const storeEmail = (order, kind) => {
  const path = emailShipmentPath(order, kind);
  const { subject, body } = orderEmail(order, kind, path && (siteOrigin ? new URL(path, siteOrigin).href : path), siteOrigin, orderIsLive(order.id));
  db.prepare('INSERT INTO email_previews VALUES (?, ?, ?, ?)').run(order.id, kind, subject, body);
};
const notice = (id, kind, sellerProfile) => {
  db.prepare('INSERT INTO notices VALUES (?, ?)').run(id, kind);
  const order = orderById(id);
  if (kind === 'paid' || kind === 'refunded') issueDocument(db, order, kind === 'paid' ? 'invoice' : 'credit',
    kind === 'paid' ? sellerProfile || billingProfile() : null, orderIsLive(id));
  storeEmail(order, kind);
  queueEmail(db, id, kind, undefined, mailTarget(order));
  queuePush(db, id, kind, emailShipmentPath(order, kind));
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

function sendVideo(req, res, file = videoFile, privateAsset = false) {
  const size = statSync(file).size;
  const headers = { 'Content-Type': 'video/mp4', 'Accept-Ranges': 'bytes', 'X-Content-Type-Options': 'nosniff' };
  if (privateAsset) headers['Cache-Control'] = 'private, no-store';
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

function adminOrderDetails(order, role, error, params = new URLSearchParams()) {
  const serialAccess = can(role, 'serials');
  const shippingAccess = can(role, 'shipping');
  const addressAccess = can(role, 'address');
  const supportAccess = can(role, 'support');
  const financeAccess = can(role, 'finance');
  const address = addressAccess ? db.prepare('SELECT * FROM delivery_addresses WHERE order_id=?').get(order.id) : null;
  const documents = financeAccess ? db.prepare('SELECT kind FROM billing_documents WHERE order_id = ? ORDER BY number').all(order.id) : [];
  const refund = stripeRefund(db, order.id);
  const acceptedTerms = financeAccess && db.prepare('SELECT version,locale FROM order_terms WHERE order_id=?').get(order.id);
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
    ${supportAccess && push ? adminHtml`<p><a href="/admin/push?order=${order.id}">Avisos push</a></p>` : ''}
    ${acceptedTerms ? adminHtml`<p><a href="/${acceptedTerms.locale}/terms?version=${acceptedTerms.version}">Condiciones de venta · ${acceptedTerms.version}</a></p>` : ''}
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
    ${stripeOrder ? refundControls(order, refund, Boolean(stripe) && Boolean(stripeOrder.livemode) === stripe.live, stripeOrder.livemode)
      : financeAccess && order.status !== 'refunded' ? adminHtml`<form method="post" action="/admin/${order.id}/refund"><button>Reembolsar en la simulación</button></form>` : ''}
    ${shippingAccess ? returnControls({ ...order, lines }, orderReceipts(order.id), serials) : ''}
  </article>`;
  return adminPage('Detalle del pedido', adminHtml`<p><a href="/admin/orders${orderListQuery(params)}">Volver a pedidos</a></p>
    <h1>Detalle del pedido</h1>${error ? adminHtml`<p class="form-error" role="alert">${adminText(error)}</p>` : ''}${card}`);
}

function orderListQuery(params, page = params.get('page')) {
  const { from, to } = accountingFilters(params);
  const query = new URLSearchParams();
  const status = params.get('status');
  const search = params.get('q')?.trim().slice(0, 80);
  if (Object.hasOwn(orderLabels, status)) query.set('status', status);
  if (search) query.set('q', search);
  if (from) query.set('from', from);
  if (to) query.set('to', to);
  if (/^\d+$/.test(page || '') && Number(page) > 1) query.set('page', page);
  return query.size ? '?' + escapeHtml(query.toString()) : '';
}

function adminOrdersPage(role, params) {
  const dates = new URLSearchParams();
  for (const key of ['from', 'to']) if (params.has(key)) dates.set(key, params.get(key));
  const { from, to, invalid } = accountingFilters(dates);
  const status = Object.hasOwn(orderLabels, params.get('status')) ? params.get('status') : '';
  const search = (params.get('q') || '').trim().slice(0, 80);
  const trackingAccess = can(role, 'shipping') || can(role, 'support');
  const financeAccess = can(role, 'finance');
  const source = `FROM orders LEFT JOIN payment_entries AS capture ON capture.order_id = orders.id AND capture.kind = 'capture'`;
  const where = `WHERE (? = '' OR status = ?) AND
    (instr(lower(id), lower(?)) > 0 OR (? = 1 AND instr(lower(coalesce(tracking, '')), lower(?)) > 0))
    AND (? = '' OR capture.occurred_at >= ?) AND (? = '' OR capture.occurred_at < ? || 'T24')`;
  const binding = [status, status, search, Number(trackingAccess), search, from, from, to, to];
  const total = invalid ? 0 : db.prepare('SELECT count(*) AS total ' + source + ' ' + where).get(...binding).total;
  const pageSize = 25;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rawPage = params.get('page') || '';
  const currentPage = /^\d+$/.test(rawPage) ? Math.max(1, Math.min(Number(rawPage), pageCount)) : 1;
  const rows = invalid ? [] : db.prepare(`SELECT orders.id, status, tracking, orders.cents, capture.occurred_at,
    COALESCE((SELECT name FROM order_lines WHERE order_id=orders.id ORDER BY rowid LIMIT 1),
      (SELECT name FROM order_models WHERE order_id=orders.id),
      (SELECT name FROM core_order_names WHERE order_id=orders.id), 'Movility One') AS product
    ${source} ${where}
    ORDER BY orders.rowid DESC LIMIT ? OFFSET ?`).all(...binding, pageSize, (currentPage - 1) * pageSize);
  const pageLink = number => '/admin/orders' + orderListQuery(params, number);
  return adminPage('Pedidos', adminHtml`<h1>Pedidos</h1>
    <form class="catalog-filters" method="get" action="/admin/orders">
      <label>${adminText(trackingAccess ? 'Referencia o número de seguimiento' : 'Referencia del pedido')}
        <input type="search" name="q" value="${escapeHtml(search)}" maxlength="80"></label>
      <label>Estado del pedido <select name="status"><option value="">Todos</option>
        ${Object.entries(orderLabels).map(([value, label]) => `<option value="${value}" ${status === value ? 'selected' : ''}>${adminText(label)}</option>`).join('')}
      </select></label>
      <label>Desde (UTC)<input type="date" name="from" value="${from}"></label>
      <label>Hasta (UTC)<input type="date" name="to" value="${to}"></label><button>Buscar</button>
      ${status || search || dates.size ? adminFragment('<a href="/admin/orders">Limpiar búsqueda y filtros</a>') : ''}</form>
    ${invalid ? adminFragment('<p class="form-error" role="alert">Revisa el intervalo de fechas.</p>') : rows.length ? adminHtml`<ul class="admin-orders-list">${rows.map(row => adminHtml`<li>
      <a href="/admin/orders/${row.id}${orderListQuery(params, currentPage)}"><strong>${escapeHtml(row.product)}</strong><small>${row.id}</small></a>
      <span>${adminText(orderLabels[row.status])}</span>
      ${row.occurred_at ? adminHtml`<time datetime="${row.occurred_at}">${row.occurred_at.slice(0, 10)}</time>` : adminText('Sin fecha registrada')}
      ${trackingAccess && row.tracking ? `<span>${escapeHtml(row.tracking)}</span>` : ''}
      ${financeAccess ? `<span>${money(adminLocale(), row.cents)}</span>` : ''}</li>`).join('')}</ul>`
      : adminHtml`<p>${adminText(status ? 'No hay pedidos con este estado.' : search ?
        'No hay pedidos que coincidan con la búsqueda.' : from || to ? 'No hay pedidos en este intervalo.' : 'Todavía no hay pedidos.')}</p>`}
    ${pageCount > 1 ? adminHtml`<nav class="product-actions" aria-label="Páginas de pedidos">
      ${currentPage > 1 ? adminHtml`<a class="button secondary" href="${pageLink(currentPage - 1)}">Anterior</a>` : ''}
      <span>Página ${currentPage} de ${pageCount}</span>
      ${currentPage < pageCount ? adminHtml`<a class="button secondary" href="${pageLink(currentPage + 1)}">Siguiente</a>` : ''}
    </nav>` : ''}`);
}
function adminView({ role, error, saved, draft }) {
  const catalogAccess = demoCatalog && can(role, 'catalog');
  const stockAccess = can(role, 'stock');
  const supportAccess = can(role, 'support');
  const financeAccess = can(role, 'finance');
  const model = catalog();
  const units = stock();
  const counter = (path, label, sql) => {
    let total;
    try { total = db.prepare(sql).get().total; }
    catch (error) { console.error('Could not load admin counter', path, error); }
    return adminHtml`<a href="${path}"><strong>${total ?? '—'}</strong>${adminText(label)}
      ${total == null ? adminFragment('<small>Error de carga</small>') : ''}</a>`;
  };
  const totals = db.prepare(`SELECT COUNT(*) AS quantity, COALESCE(SUM(cents), 0) AS gross,
    COALESCE(SUM(CASE WHEN status = 'refunded' THEN cents ELSE 0 END), 0) AS refunds FROM orders`).get();
  const breakdown = db.prepare(`SELECT method, COUNT(*) AS quantity, SUM(cents) AS gross,
    SUM(CASE WHEN status = 'refunded' THEN cents ELSE 0 END) AS refunds
    FROM orders GROUP BY method ORDER BY method`).all();
  return adminPage('Administración de prueba', adminHtml`<h1>Administración de prueba</h1>
    <p>Perfil: ${adminText(roleNames[role])}</p>
    <section aria-labelledby="admin-work"><h2 id="admin-work">Pendientes de atención</h2>
      <div class="admin-overview-links">
        ${counter('/admin/orders?status=paid', 'Pedidos por expedir', "SELECT count(*) AS total FROM orders WHERE status='paid'")}
        ${financeAccess ? counter('/admin/stripe?status=open', 'Reservas abiertas', "SELECT count(*) AS total FROM stripe_attempts WHERE state IN ('preparing','open')") : ''}
        ${supportAccess ? counter('/admin/contact', 'Consultas sin resolver', 'SELECT count(*) AS total FROM contact_messages WHERE resolved=0') +
          counter('/admin/mail?status=failed', 'Correos con errores', "SELECT count(*) AS total FROM mail_jobs WHERE status='failed'") : ''}
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
      <fieldset><legend>Catálogo · Mobility One</legend>
        <input type="hidden" name="expectedUnits" value="${units}">
        <input type="hidden" name="expectedPrice" value="${model.cents}">
        <div class="address-row"><label>Precio en CHF <input name="price" inputmode="decimal" required value="${escapeHtml(draft?.price ?? (model.cents / 100).toFixed(2))}"></label>
        <label>Unidades disponibles <input type="number" name="units" min="0" max="999" step="1" required value="${escapeHtml(draft?.units ?? String(units))}"></label></div>
        <label>Descripción en alemán<textarea name="descriptionDe" rows="3" maxlength="500" lang="de-CH">${escapeHtml(draft?.descriptionDe ?? (model.description_de || copy['de-CH'].description))}</textarea></label>
        <label>Descripción en francés<textarea name="descriptionFr" rows="3" maxlength="500" lang="fr-CH">${escapeHtml(draft?.descriptionFr ?? (model.description_fr || copy['fr-CH'].description))}</textarea></label>
        <input type="hidden" name="publication" value="1">
        <label><input type="checkbox" name="active" value="1" ${corePublished() ? 'checked' : ''}> Publicado en la tienda</label>
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
    const { pathname: path, search, searchParams } = new URL(req.url, 'http://localhost');
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
      const outcome = stripeOutcome(event, stripe.live);
      if (!outcome) return carrierResponse(res, 200, 'ignored');
      const result = transaction(() => applyStripeOutcome(db, outcome, {
        release: line => orderStock(line.sku, line.quantity, 'release', null),
        fulfill: (attempt, data) => {
          createPaidOrder(attempt.id, attempt.method, data.locale, data.email, data.address, data.lines, data.billing, data.shipping);
          saveOrderTerms(attempt.id, data.locale, data.terms);
          notice(attempt.id, 'paid', data.sellerProfile);
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
    const privateAsset = path.startsWith('/admin/assets/models/');
    const assetPath = privateAsset ? path.slice('/admin'.length) : path;
    const videoAsset = /^\/assets\/models\/([a-z0-9][a-z0-9-]{1,23})\.video-([1-9]\d{0,11})\.(mp4|(de-CH|fr-CH)\.(vtt|txt))$/.exec(assetPath);
    if (videoAsset && ['GET', 'HEAD'].includes(req.method)) {
      if (privateAsset && adminRole(req.headers.authorization) !== 'admin') return send(res, 403, 'Acceso restringido');
      const [, sku, id, suffix, language, extension] = videoAsset;
      const item = catalogVideo(db, sku, id);
      const complete = item && (privateAsset
        ? (language ? modelVideo(sku, language, id) : Object.keys(copy).some(locale => modelVideo(sku, locale, id)))
        : item.published && Object.keys(copy).every(locale => modelVideo(sku, locale, id)));
      if (!complete || (sku !== coreSKU && !(privateAsset ? extraModel(sku) : extraModel(sku)?.active))) {
        return send(res, 404, 'Vídeo no disponible');
      }
      if (suffix === 'mp4') return sendVideo(req, res, mediaFile(assetPath), privateAsset);
      const data = readFileSync(mediaFile(assetPath));
      res.writeHead(200, { 'Content-Type': (extension === 'vtt' ? 'text/vtt' : 'text/plain') + '; charset=utf-8',
        'Content-Length': data.length, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': privateAsset ? 'private, no-store' : 'no-cache' });
      return res.end(req.method === 'HEAD' ? undefined : data);
    }
    const modelAsset = /^\/assets\/models\/([a-z0-9][a-z0-9-]{1,23})\.(?:(side\.|rear\.)?jpg|glb|mp4|(de-CH|fr-CH)\.(?:vtt|txt))$/.exec(assetPath);
    if (modelAsset && privateAsset && adminRole(req.headers.authorization) !== 'admin') return send(res, 403, 'Acceso restringido');
    if (modelAsset && ['GET', 'HEAD'].includes(req.method) && (modelAsset[1] === coreSKU || (privateAsset ? extraModel(modelAsset[1]) : extraModel(modelAsset[1])?.active)) && existsSync(mediaFile(assetPath))) {
      const [, sku, , trackLocale] = modelAsset;
      if (path.endsWith('.mp4')) {
        if (Object.keys(copy).some(language => modelVideo(sku, language))) return sendVideo(req, res, mediaFile(assetPath), privateAsset);
      } else if (!trackLocale || modelVideo(sku, trackLocale)) {
        const types = { jpg: 'image/jpeg', glb: 'model/gltf-binary', vtt: 'text/vtt; charset=utf-8', txt: 'text/plain; charset=utf-8' };
        const extension = path.split('.').at(-1);
        const data = readFileSync(mediaFile(assetPath));
        res.writeHead(200, { 'Content-Type': types[extension], 'Content-Length': data.length,
          'X-Content-Type-Options': 'nosniff', 'Cache-Control': privateAsset ? 'private, no-store' : 'no-cache' });
        return res.end(req.method === 'HEAD' ? undefined : data);
      }
    }
    if (req.method === 'GET' && path === '/robots.txt') {
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('User-agent: *\nDisallow: /admin\n');
    }
    if (req.method === 'GET' && path === aboutImage && existsSync(editorialImageFile)) {
      res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      return res.end(readFileSync(editorialImageFile));
    }
    if (req.method === 'GET' && path === '/sitemap.xml' && siteOrigin) {
      res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'X-Robots-Tag': 'noindex' });
      return res.end(sitemap(siteOrigin, liveModels().map(model => '/models/' + model.sku), corePublished()));
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
    if (['GET', 'HEAD'].includes(req.method) && ['/movility-one', '/movility-one/3d'].includes(suffix)) {
      res.writeHead(308, { Location: '/' + locale + suffix.replace('/movility-one', '/mobility-one') + search,
        'X-Robots-Tag': 'noindex, nofollow' });
      return res.end();
    }
    const modelRoute = /^\/models\/([a-z0-9][a-z0-9-]{1,23})(\/3d)?$/.exec(suffix);
    const languagePath = legalPaths.includes(suffix) || isPublicPage(suffix) || ['/cart', '/checkout', '/checkout/cart', '/analytics', '/account', '/guest-access', '/offers'].includes(suffix) ||
      modelRoute || shipmentRoute || /^\/orders\/[0-9a-f-]{36}$/.test(suffix)
      ? suffix : '';
    const view = searchParams.get('view');
    const galleryView = ['front', 'side', 'rear'].includes(view) ? view : '';
    const selectedSKU = searchParams.get('model') || '';
    const context = comparisonQuery(searchParams);
    const productRoute = languagePath === '/mobility-one' || modelRoute && !modelRoute[2];
    const alternate = !suffix || productRoute || languagePath === '/compare' ? comparisonQuery(context) : new URLSearchParams();
    if (languagePath === '/terms' && /^[1-9]\d{0,8}$/.test(searchParams.get('version') || '')) alternate.set('version', searchParams.get('version'));
    if (languagePath === '/compare' && searchParams.get('differences') === '1') alternate.set('differences', '1');
    if (productRoute && galleryView) alternate.set('view', galleryView);
    if (['/cart', '/checkout', '/contact'].includes(languagePath) && skuPattern.test(selectedSKU)) alternate.set('model', selectedSKU);
    if (languagePath === '/contact' && searchParams.get('topic') === 'compatibility') alternate.set('topic', 'compatibility');
    const languageQuery = alternate.size ? '?' + alternate.toString() +
      (productRoute && galleryView ? '#gallery' : !suffix ? '#catalogue' : '') : '';
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
    const render = (body, status = 200, feature = '', metadata) => send(res, status,
      page(locale, t.title, body, navigation(locale, languagePath, languageQuery, cartUnits, context),
        (discoverable || metadata) && status === 200 ? pageMetadata(locale, suffix, siteOrigin, metadata || (editorial &&
          [editorial['title_' + editorialLocale], editorial['intro_' + editorialLocale]])) : {}, {
          feature,
          storefront: true,
          commercial,
          footer: footerGroups(locale, analyticsLink(locale), accountsEnabled),
          prompt: !consent && !settings && req.method === 'GET' && status === 200 && (discoverable || modelRoute || legalPaths.includes(suffix))
            ? analyticsPrompt(locale, consent, path) : '',
        }), languagePath === '/mobility-one/3d' || Boolean(modelRoute?.[2]), Boolean(push && orderPageRoute),
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
          addPushSubscription(db, third, sub, order.locale, push.mode);
          return true;
        });
      } else if (input?.action === 'unsubscribe' || input?.action === 'status') {
        if (input.action === 'unsubscribe') transaction(() => removePushSubscription(db, third, input.endpoint));
        active = pushState(db, third, input.endpoint, push.mode);
      } else return carrierResponse(res, 400, 'invalid');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify({ active }));
    }
    if (first === 'admin') return await adminLanguage(req, res, path, searchParams, async () => {
      const role = adminRole(req.headers.authorization);
      if (!role) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Mobility local demo", charset="UTF-8"');
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
      if (role === 'admin') {
        const previewLocale = path.startsWith(aboutPreview + '/') ? path.slice(aboutPreview.length + 1) : '';
        if (req.method === 'GET' && ['de-CH', 'fr-CH'].includes(previewLocale)) {
          const other = previewLocale === 'de-CH' ? 'fr-CH' : 'de-CH';
          const body = informationPage(previewLocale, '/about', informationSettings(db, 'about'), undefined,
            { ...aboutDraftSettings(db), image: editorialDraftSource() });
          return send(res, 200, page(previewLocale, 'Mobility', body,
            navigation(previewLocale, '/about', '', 0, undefined, aboutPreview + '/' + other), {}, { storefront: true }));
        }
        if (path === aboutDraftImage && req.method === 'GET' && existsSync(draftImageFile)) {
          res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, no-store',
            'X-Robots-Tag': 'noindex, nofollow', 'X-Content-Type-Options': 'nosniff' });
          return res.end(readFileSync(draftImageFile));
        }
        if (req.method === 'POST' && path === aboutDraftImage) {
          const valid = await receiveMedia(req, uploadFolder, draftImageSku, 'front');
          return redirect(res, '/admin/content/about?draft=' + (valid ? 'saved' : 'invalid') + '#about-draft-title');
        }
        if (req.method === 'POST' && path === '/admin/content/about/draft') {
          const status = saveAboutDraft(db, await form(req, 60000));
          return redirect(res, '/admin/content/about?draft=' + (status === 303 ? 'saved' : status === 409 ? 'conflict' : 'invalid') + '#about-draft-title');
        }
      }
      if (role === 'admin' && path === '/admin/legal') return redirect(res, '/admin/legal/impressum');
      const legalEditor = /^\/admin\/legal(\/(?:impressum|privacy|terms))(?:\/preview\/(de-CH|fr-CH))?$/.exec(path);
      if (role === 'admin' && legalEditor) {
        const [, legalPath, previewLocale] = legalEditor;
        const seller = billingProfile().seller;
        if (req.method === 'GET' && previewLocale) {
          res.setHeader('Referrer-Policy', 'no-referrer');
          return send(res, 200, page(previewLocale, legalTitle(previewLocale, legalPath),
            legalPage(previewLocale, legalPath, legalDraft(db, legalPath), seller)));
        }
        if (req.method === 'GET') return send(res, 200, adminPage('Contenidos legales',
          legalAdmin(db, legalPath, seller, searchParams.has('saved') ? 'saved' : '')));
        if (req.method === 'POST' && !previewLocale) {
          const fields = await form(req, 300000);
          const result = transaction(() => saveLegal(db, legalPath, fields, billingProfile().seller));
          return result === 'saved' ? redirect(res, path + '?saved=1') : send(res, result === 'invalid' ? 400 : 409,
            adminPage('Contenidos legales', legalAdmin(db, legalPath, seller, result, fields)));
        }
      }
      const contentRouteMatch = /^\/admin\/content\/([a-z-]+)$/.exec(path);
      if (contentRouteMatch && Object.hasOwn(informationAdminTitles, contentRouteMatch[1]) && ['GET', 'POST'].includes(req.method)) {
        const key = contentRouteMatch[1];
        const draftMessages = { saved: 'Borrador guardado.', invalid: 'Revisa los campos del borrador o el formato JPG.',
          conflict: 'El borrador cambió mientras lo editabas.' };
        const panel = (result, warning = '') => adminPage(informationAdminTitles[key],
          warning + informationAdmin(key, informationSettings(db, key, process.env.MOVILITY_CONTACT_EMAIL), result) +
          (key === 'about' ? aboutDraftEditor(aboutDraftSettings(db), editorialDraftSource(),
            Object.hasOwn(draftMessages, searchParams.get('draft')) ? draftMessages[searchParams.get('draft')] : '') : ''));
        if (req.method === 'GET') return send(res, 200, panel(searchParams.has('saved') ? { status: 'saved' } : {}));
        const fields = await form(req, 100000);
        if (commercial && key === 'contact' && !currentBilling().settings.email && !fields?.get('email')?.trim()) {
          return send(res, 409, panel({},
            adminFragment('<p role="alert">El emisor usa el correo público. Añade un correo propio en Emisor y fiscalidad antes de eliminarlo.</p>')));
        }
        const result = saveInformation(db, key, fields);
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
        if (!fixedLocalPassword && !pilotPasswordChange) return security(
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
          password.trim() === password && password !== current && password === fields.get('confirm');
        const updatePassword = () => {
          if (!verifyLocalAdminPassword(current, currentAdminCredential())) return false;
          if (pilotPasswordChange) {
            db.prepare(`INSERT INTO pilot_admin_credential (id, credential) VALUES (1, ?)
              ON CONFLICT(id) DO UPDATE SET credential = excluded.credential`).run(encodeAdminPassword(password));
          } else {
            localCredential = changeLocalAdminPassword(fixedLocalPassword, password);
          }
          return true;
        };
        if (!allowed || !(pilotPasswordChange ? transaction(updatePassword) : updatePassword())) return security(editor(adminFragment('<p class="form-error" role="alert">Comprueba la contraseña actual y que la nueva sea distinta y coincida en ambos campos.</p>')), 400);
        return security(adminFragment('<p class="form-success" role="status">Contraseña actualizada. Vuelve a entrar con la nueva clave.</p>'));
      }
      if (role === 'admin' && path === '/admin/shipping') {
        const panel = (result = '', status = 200) => send(res, status, adminPage('Tarifa de envío en Suiza',
          shippingAdmin(shippingSettings(db), billingProfile().tax, result)));
        if (req.method === 'GET') return panel(searchParams.has('saved') ? 'saved' : '');
        if (req.method === 'POST') {
          const fields = await form(req);
          const result = transaction(() => saveShippingSettings(db, fields, billingProfile().tax));
          return result === 'saved' ? redirect(res, '/admin/shipping?saved=1') : panel(result, result === 'invalid' ? 400 : 409);
        }
      }
      if (role === 'admin' && path === '/admin/billing') {
        const panel = (result = '', status = 200) => send(res, status,
          adminPage('Emisor y fiscalidad', billingSettingsAdmin(currentBilling(), result)));
        if (req.method === 'GET') return panel(searchParams.has('saved') ? 'saved' : '');
        if (req.method === 'POST') {
          const fields = await form(req);
          const result = transaction(() => saveBillingSettings(db, fields, currentBilling(), commercial));
          return result === 'saved' ? redirect(res, '/admin/billing?saved=1')
            : panel(result, result === 'invalid' ? 400 : 409);
        }
      }
      const docPath = /^\/admin\/([0-9a-f-]{36})\/document\/(invoice|credit)$/.exec(path);
      if (role === 'admin' && path === '/admin/catalog-order') {
        const orderPanel = message => adminPage('Orden del catálogo',
          catalogOrderAdmin(catalogFamilies(db), adminCatalogProducts(), message, activeChairs(), featuredChair()?.sku));
        if (req.method === 'POST') {
          const fields = await form(req);
          if (fields?.get('kind') === 'featured') {
            const sku = fields.get('sku');
            if (sku !== '' && !activeChairs().some(model => model.sku === sku)) return send(res, 400, orderPanel(
              adminFragment('<p role="alert">Selecciona una silla publicada.</p>')));
            db.prepare('UPDATE storefront_catalog SET featured=? WHERE id=1').run(sku);
            return redirect(res, '/admin/catalog-order?saved=featured');
          }
          if (!saveCatalogPosition(db, fields)) return send(res, 400,
            orderPanel(adminFragment('<p role="alert">Introduce una posición válida para una familia o un artículo existente.</p>')));
          return redirect(res, '/admin/catalog-order?saved=1');
        }
        if (req.method === 'GET') return send(res, 200, orderPanel(searchParams.has('saved')
          ? adminFragment(searchParams.get('saved') === 'featured' ? '<p role="status">Portada guardada.</p>' : '<p role="status">Posición guardada.</p>') : ''));
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
      const previewRoute = /^\/admin\/models\/([a-z0-9][a-z0-9-]{1,23})\/preview\/(de-CH|fr-CH)$/.exec(path);
      if (role === 'admin' && req.method === 'GET' && previewRoute) {
        const [, sku, language] = previewRoute;
        const model = sku === coreSKU ? coreCatalogProduct() : extraModel(sku);
        if (!model) return send(res, 404, 'Artículo no encontrado');
        const media = modelMedia(sku, language, true);
        const features = catalogFeatures(db, sku);
        const compatibility = isWheelchair(model) ? relatedParts(language, sku, true) : isPart(model) ? partCompatibility(language, sku, true) : '';
        const body = sku === coreSKU
          ? productPage(language, model.cents, stock() > 0, model, { ...media, view: galleryView, previewPath: path,
            video: media.video || videoLocales.has(language), features: renderFeatures(language, features), compatibility, details: oneDetails(db) })
          : extraProduct(language, model, media, galleryView, features, compatibility, path, undefined, familyLabel(language, model.family));
        return send(res, 200, page(language, 'Mobility · ' + language, previewLinks(sku) + body, '', {}, { storefront: true }));
      }
      const videosRoute = /^\/admin\/models\/([a-z0-9][a-z0-9-]{1,23})\/content\/videos(?:\/([1-9]\d{0,11})(\/upload)?)?$/.exec(path);
      if (role === 'admin' && req.method === 'POST' && videosRoute) {
        const [, sku, id, upload] = videosRoute;
        const model = sku === coreSKU ? coreCatalogProduct() : extraModel(sku);
        if (!model || !isWheelchair(model) || id && !catalogVideo(db, sku, id)) return send(res, 404, 'Vídeo no disponible');
        const back = '/admin/models/' + sku + '/content';
        if (upload) {
          const kind = await receiveMedia(req, uploadFolder, sku + '.video-' + id, videoFileKinds);
          if (!kind) return redirect(res, back + '?video=invalid#model-videos');
          if (kind === 'video') db.prepare('UPDATE catalog_videos SET published=0 WHERE sku=? AND id=?').run(sku, id);
        } else {
          const fields = await form(req, 8192);
          if (!transaction(() => saveCatalogVideo(db, sku, id, fields, modelVideo))) {
            return redirect(res, back + '?video=invalid#model-videos');
          }
        }
        return redirect(res, back + '?saved=1#model-videos');
      }
      const contentRoute = /^\/admin\/models\/([a-z0-9][a-z0-9-]{1,23})\/content(\/(?:upload|gallery|fit))?$/.exec(path);
      if (role === 'admin' && contentRoute) {
        const [, sku, upload] = contentRoute;
        const model = sku === coreSKU ? coreCatalogProduct() : extraModel(sku);
        if (!model) return send(res, 404, 'Artículo no encontrado');
        const target = '/admin/models/' + sku + '/content';
        const contentPage = (invalid = false) => adminPage('Contenido del artículo',
          contentAdmin(sku, model.name, catalogFeatures(db, sku), searchParams.has('saved'), isPart(model) || isWheelchair(model),
            gallerySettings(db, sku), mediaAvailability(sku, path => existsSync(mediaFile(path)), locale => modelVideo(sku, locale)),
            previewLinks(sku), sku === coreSKU ? oneDetailsEditor(oneDetails(db), invalid) : '',
            isWheelchair(model) ? (searchParams.get('video') === 'invalid'
              ? adminFragment('<p role="alert">Revisa los títulos, el uso y los archivos en ambos idiomas.</p>') : '') +
              catalogVideosAdmin(sku, catalogVideos(db, sku), modelVideo) : ''));
        if (req.method === 'GET' && !upload) return send(res, 200, contentPage());
        if (req.method === 'POST' && upload === '/fit') {
          if (sku !== coreSKU) return send(res, 404, 'Artículo no encontrado');
          if (!saveOneDetails(db, await form(req, 16384))) return send(res, 400, contentPage(true));
          return redirect(res, target + '?saved=1#one-fit');
        }
        if (req.method === 'POST' && upload === '/gallery') {
          if (!saveGallery(db, sku, await form(req, 8192))) return send(res, 400, 'Orden o textos alternativos no válidos');
          return redirect(res, target + '?saved=1');
        }
        if (req.method === 'POST' && upload === '/upload') {
          const kind = await receiveMedia(req, uploadFolder, sku);
          if (!kind) return send(res, 400, adminPage('Archivo no válido',
            adminFragment('<p role="alert">Comprueba el formato y el tamaño del archivo.</p><a href="') + target + '">Volver al artículo</a>'));
          if (sku === coreSKU && kind === 'video') resetOneVideoPurpose(db);
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
        return send(res, 200, page(locale, title, html, '', {}, { commercial: JSON.parse(doc.snapshot).test === false }));
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
        return order ? send(res, 200, adminOrderDetails(order, role, null, searchParams)) :
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
        return send(res, 200, adminPage('Estadísticas de la tienda', funnelReport(db, searchParams)));
      }
      if (req.method === 'GET' && path === '/admin/stripe') {
        const openOnly = searchParams.get('status') === 'open';
        const attempts = db.prepare(`SELECT * FROM stripe_attempts WHERE (? = 0 OR state IN ('preparing','open'))
          ORDER BY rowid DESC LIMIT 200`).all(Number(openOnly));
        return send(res, 200, adminPage(commercial ? 'Pagos con Stripe' : 'Pagos de prueba con Stripe', stripeAdmin(attempts, openOnly, commercial)));
      }
      if (req.method === 'GET' && path === '/admin/mail') {
        const state = searchParams.get('result');
        const message = state === 'processed' ? 'Procesamiento de la cola solicitado.'
          : state === 'retried' ? 'Correo programado para reintento.' : '';
        return send(res, 200, adminPage('Cola de correos', mailQueuePage(db, role === 'admin', message, externalMailMode, searchParams.get('status') === 'failed')));
      }
      if (req.method === 'GET' && path === '/admin/push') {
        const id = searchParams.get('order') || '';
        return send(res, 200, adminPage('Avisos push', pushAdmin(db, push, orderIdPattern.test(id) ? id : '')));
      }
      if (role === 'admin' && req.method === 'POST' && path === '/admin/mail/process') {
        await processMail();
        return redirect(res, '/admin/mail?result=processed');
      }
      const retryRoute = /^\/admin\/mail\/([0-9a-f-]{36})\/retry$/.exec(path);
      if (role === 'admin' && req.method === 'POST' && retryRoute) {
        if (!retryEmail(db, retryRoute[1], undefined, externalMailMode)) return send(res, 409, 'El correo no está pendiente de revisión.');
        return redirect(res, '/admin/mail?result=retried');
      }
      const inventoryPanel = (sku, message, status = 200) => {
        const { reserved, review } = inventoryBalances(db);
        const models = [...(demoCatalog ? [coreCatalogProduct()] : []),
          ...db.prepare('SELECT sku, name, units, active, family FROM extra_models ORDER BY name, sku').all()]
          .map(model => ({ ...model, onHand: model.units, units: model.active ? model.units : 0, tracked: isWheelchair(model),
            reserved: reserved.get(model.sku) ?? 0, review: review.get(model.sku) ?? 0 }));
        return send(res, status, adminPage('Movimientos de stock', inventoryPage(models, inventoryRows(sku, 200), sku, message, status >= 400)));
      };
      if (req.method === 'POST' && path === '/admin/inventory/receive') {
        const fields = await form(req, 262144);
        const sku = fields?.get('sku') || '';
        const id = fields?.get('receipt') || '';
        const quantity = fields?.get('quantity') || '';
        const model = sku === coreSKU ? coreCatalogProduct() : skuPattern.test(sku) && extraModel(sku);
        const serials = model && readSupplierSerials(fields.get('serials') || '', Number(quantity), isWheelchair(model));
        if (!model || !orderIdPattern.test(id) || !/^[1-9]\d{0,2}$/.test(quantity) || !serials) {
          return inventoryPanel(model ? sku : '', 'Revisa la cantidad y los números de serie de la entrada.', 400);
        }
        const receipt = transaction(() => {
          const existing = db.prepare('SELECT sku, quantity FROM supplier_receipts WHERE id = ?').get(id);
          if (existing) {
            const recorded = db.prepare('SELECT serial FROM supplier_serials WHERE receipt_id = ? ORDER BY serial').all(id);
            return existing.sku === sku && existing.quantity === Number(quantity) &&
              JSON.stringify(recorded.map(row => row.serial)) === JSON.stringify(serials) ? 'saved' : 'conflict';
          }
          if (supplierSerialConflict(db, serials)) return 'duplicate';
          const units = sku === coreSKU ? stock() : extraModel(sku).units;
          if (units + Number(quantity) > 999 || !changeStock(sku, Number(quantity))) return 'conflict';
          const movement = recordMovement(sku, Number(quantity), 'supplier');
          db.prepare('INSERT INTO supplier_receipts (id, sku, quantity, movement_id) VALUES (?, ?, ?, ?)').run(id, sku, Number(quantity), movement);
          const insert = db.prepare('INSERT INTO supplier_serials (serial, receipt_id) VALUES (?, ?)');
          for (const serial of serials) insert.run(serial, id);
          return 'saved';
        });
        if (receipt === 'saved') return redirect(res, '/admin/inventory?sku=' + sku + '&received=1#stock-history');
        return inventoryPanel(sku, receipt === 'duplicate' ? 'Hay un número de serie duplicado o ya registrado.' :
          'No se puede registrar la entrada con estos datos.', 409);
      }
      if (req.method === 'GET' && ['/admin/inventory', '/admin/inventory.csv'].includes(path)) {
        const requested = searchParams.get('sku') || '';
        const sku = requested === coreSKU || skuPattern.test(requested) ? requested : '';
        if (path.endsWith('.csv')) {
          res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
            'Content-Disposition': 'attachment; filename="movility-stock.csv"', 'X-Content-Type-Options': 'nosniff' });
          return res.end(inventoryCsv(inventoryRows(sku, -1)));
        }
        return inventoryPanel(sku, searchParams.get('received') === '1' ? 'Entrada de stock registrada.' : '');
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
      if (role === 'admin' && path === importPath + '/template.csv' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'attachment; filename="movility-catalogo-proveedor.csv"' });
        return res.end(catalogTemplate);
      }
      if (role === 'admin' && [importPath, importPath + '/confirm'].includes(path)) {
        const renderImport = (status, input) => send(res, status, adminPage('Importar catálogo CSV', catalogImportPage(input)));
        const planFor = csv => catalogImportPlan(db, csv, catalogFamilies(db));
        if (req.method === 'GET' && path === importPath) return renderImport(200);
        if (req.method === 'POST' && path === importPath) {
          const fields = await receiveUpload(req, maxCsvBytes + 16384);
          const file = fields?.get('file');
          let csv;
          if (file && typeof file.arrayBuffer === 'function' && file.size <= maxCsvBytes) {
            try { csv = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
            catch { /* Invalid encoding is handled by the planner. */ }
          }
          const plan = planFor(csv);
          const invalid = plan.error || plan.invalid;
          return renderImport(invalid ? 400 : 200, { plan, csv, confirmation: invalid ? null : importConfirmation(plan) });
        }
        if (req.method === 'POST' && path === importPath + '/confirm') {
          const fields = await form(req, maxCsvBytes * 4 + 16384);
          const csv = fields?.get('csv');
          const outcome = transaction(() => {
            const plan = planFor(csv);
            if (plan.error || plan.invalid) return { plan, status: 400 };
            const confirmation = importConfirmation(plan);
            if (fields.get('confirmation') !== confirmation) return { plan, csv, confirmation, stale: true, status: 409 };
            if (fields.get('update') !== 'yes' && plan.rows.some(row => row.revision !== null && (row.changes.length || row.additions.length))) {
              return { plan, csv, confirmation, needsUpdate: true, status: 400 };
            }
            return { result: applyCatalogImport(db, plan, sku => recordMovement(sku, 0, 'opening')), status: 200 };
          });
          return renderImport(outcome.status, outcome);
        }
      }
      const modelEdit = /^\/admin\/models(?:\/([a-z0-9][a-z0-9-]{1,23}))?$/.exec(path);
      if (req.method === 'POST' && modelEdit) {
        const fields = await form(req);
        const sku = modelEdit[1] || fields?.get('sku')?.trim() || '';
        const input = modelInput(fields, sku, catalogFamilies(db));
        if (!input) {
          const current = modelEdit[1] ? extraModel(sku) : null;
          const submitted = Object.fromEntries(fields || []);
          const draft = { ...submitted, sku: current?.sku || '', skuInput: sku, name: submitted.name || '',
            price: submitted.price || '', active: submitted.active === '1', fold: submitted.fold === '' || submitted.fold == null ? -1 : Number(submitted.fold) };
          return send(res, 400, displayModelAdmin(adminFragment('<p class="form-error" role="alert">Revisa el SKU, el precio, las traducciones y las características.</p>'),
            searchParams, { model: draft, editing: Boolean(current) }));
        }
        const saved = transaction(() => {
          const current = extraModel(sku);
          if (modelEdit[1] ? !current || String(current.revision) !== fields.get('revision') : current) return false;
          if (current) {
            db.prepare(`UPDATE extra_models SET name = ?, cents = ?, units = ?, active = ?, description_de = ?,
              description_fr = ?, width = ?, weight = ?, range = ?, fold = ?, family = ?, length = ?, height = ?, max_load = ?, revision = revision + 1 WHERE sku = ?`).run(...input, sku);
            if (!input[3] || input[10] !== 'wheelchair') clearFeatured(sku);
            if (input[2] !== current.units) recordMovement(sku, input[2] - current.units, 'adjustment');
          } else {
            insertModel(db, sku, input);
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
        if (!demoCatalog) return send(res, 404, 'Artículo no encontrado');
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
          if (fields.has('publication')) {
            const published = fields.get('active') === '1';
            db.prepare('UPDATE storefront_catalog SET core_published=? WHERE id=1').run(Number(published));
            if (!published) clearFeatured(coreSKU);
          }
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
        if (!demoCatalog) return send(res, 404, 'Artículo no encontrado');
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
        if (!stripe) return send(res, 409, rolePanel({ error: 'Activa Stripe en el modo del pedido para solicitar este reembolso.' }));
        const attempt = paymentAttempt(db, second);
        const refund = transaction(() => {
          const order = orderById(second);
          if (!order || order.status === 'refunded' || attempt?.state !== 'paid' || Boolean(attempt.livemode) !== stripe.live) return null;
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
    if (req.method === 'GET' && legalPaths.includes(suffix)) {
      const version = suffix === '/terms' ? searchParams.get('version') : null;
      const content = version === null || /^[1-9]\d{0,8}$/.test(version) ? publishedLegal(db, suffix, version) : null;
      return render(legalPage(locale, suffix, content), content ? 200 : 404, '', [legalTitle(locale, suffix), legalTitle(locale, suffix)]);
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
      const models = publicModels();
      const contactPage = state => informationPage(locale, suffix, editorial, { ...state, models });
      if (req.method === 'GET') {
        const model = models.find(item => item.sku === selectedSKU);
        return render(contactPage({ sent: searchParams.get('sent') === '1', values: model ? { model: model.sku, topic: searchParams.get('topic') === 'compatibility' ? 'compatibility' : 'advice' } : {} }));
      }
      const submission = readContact(await form(req, 40000), models);
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
      const models = orderedProducts(db, publicModels());
      const chair = featuredChair();
      const featured = chair ? modelMedia(chair.sku, locale) : null;
      const featuredPhoto = featured?.photo;
      const families = catalogFamilies(db).filter(row => row.id === 'wheelchair' ||
        models.some(model => model.family === row.id));
      const chairFilters = chairFilterValues(searchParams);
      const family = catalogFilter(searchParams, families) || (chairFilters.size ? 'wheelchair' : '');
      const visible = family ? families.filter(row => row.id === family) : families;
      const partFamily = isPart({ family });
      const chairs = partFamily ? models.filter(isWheelchair) : [];
      const selected = chairs.find(chair => chair.sku === searchParams.get('compatible'));
      if (!selected) context.delete('compatible');
      const matches = selected ? compatibilityForChair(selected.sku) : null;
      const results = matches ? models.filter(model => model.family === family && matches.has(model.sku))
        : family === 'wheelchair' ? models.filter(model => isWheelchair(model) && matchesChairFilters(model, chairFilters)) : models;
      const products = extraCatalog(locale, results, visible, sku => sku === coreSKU
        ? modelMedia(coreSKU, locale).photo : Object.values(modelPhotos(sku)).find(Boolean), context);
      return render(homepage(locale, {
        filters: storefrontFamilyFilters(locale, families, family, context) +
          (partFamily ? compatibilityFilter(locale, family, chairs, selected?.sku, context) : '') +
          (!family || family === 'wheelchair' ? chairFilterPanel(locale, context, chairFilters, results.filter(isWheelchair).length) : ''),
        selection: comparisonSelection(locale, context, selectedModels(context, activeChairs()), false),
        detail: chair?.sku === coreSKU && featured.demoPhotos && featured.photos.side !== featuredPhoto
          ? homeModelDetail(locale, featured.photos.side, context) : '',
        faqs: shopFaqs(db, locale),
        products: products || (selected ? noConfirmedParts(locale, selected, context) : family === 'wheelchair' ? noChairMatches(locale, context)
          : locale === 'fr-CH' ? '<p>Aucun article à afficher.</p>' : '<p>Keine Artikel vorhanden.</p>'),
      }), 200, homeHero(locale, chair, featuredPhoto,
        featured?.alts?.[Object.keys(featured.photos).find(slot => featured.photos[slot] === featuredPhoto)],
        featured?.demoPhotos, context));
    }
    if (corePublished() && req.method === 'GET' && path === `/${locale}/mobility-one`) {
      const model = coreCatalogProduct();
      track('view');
      const media = modelMedia(coreSKU, locale);
      return render(productPage(locale, model.cents, stock() > 0, model, { view: galleryView,
        photos: media.photos, demoPhotos: media.demoPhotos, alts: media.alts, video: media.video || videoLocales.has(locale), videos: media.videos,
        features: renderFeatures(locale, catalogFeatures(db, coreSKU)), compatibility: relatedParts(locale, coreSKU), context, details: oneDetails(db) }),
      200, '', ['Mobility One – ' + t.category, model['description_' + editorialLocale] || t.description]);
    }
    if (req.method === 'GET' && path === `/${locale}/compare`) {
      return render(comparisonPage(locale, searchParams, activeChairs()));
    }
    if (req.method === 'GET' && modelRoute) {
      const model = extraModel(modelRoute[1]);
      if (model?.active) {
        const media = modelMedia(model.sku, locale);
        if (!modelRoute[2]) {
          track('view');
          let compatibility = '';
          if (isWheelchair(model)) compatibility = relatedParts(locale, model.sku);
          if (isPart(model)) compatibility = partCompatibility(locale, model.sku);
          return render(extraProduct(locale, model, media, galleryView, catalogFeatures(db, model.sku), compatibility, '', context, familyLabel(locale, model.family)),
            200, '', [model.name, model['description_' + editorialLocale]]);
        }
        if (media.model) return render(viewerPage(locale, media.photo,
          { name: model.name, url: media.model, productPath: '/models/' + model.sku }));
      }
    }
    if (corePublished() && req.method === 'GET' && path === `/${locale}/mobility-one/3d`) {
      const media = modelMedia(coreSKU, locale);
      return render(viewerPage(locale, media.photo || productImage, { url: media.model || modelPath }));
    }
    if (req.method === 'GET' && path === `/${locale}/cart`) {
      if (selectedSKU) {
        const model = purchaseModel(selectedSKU);
        if (model && model.units) track('cart');
        return model ? render(cartPage(locale, model.cents, model.units > 0, model, commercial)) : render(`<h1>${t.soldOut}</h1>`, 404);
      }
      const lines = cartLines(readCart(req), purchaseModel);
      if (canCheckout(lines)) track('cart');
      return render(shopBasket(locale, lines, '', { added: searchParams.get('added') }));
    }
    if (req.method === 'POST' && path === `/${locale}/cart`) {
      const cart = readCart(req);
      const fields = await form(req);
      const sku = fields?.get('sku') || '';
      if (!changeCart(cart, fields, purchaseModel)) {
        return render(shopBasket(locale, cartLines(cart, purchaseModel), cartText(locale).unavailable,
          { rejected: purchaseModel(sku)?.name || (skuPattern.test(sku) ? sku : '') }), 409);
      }
      if (canCheckout(cartLines(cart, purchaseModel))) track('cart');
      res.setHeader('Set-Cookie', cartCookie(cart, secureRequest));
      return redirect(res, `/${locale}/cart${fields.get('action') === 'add' ? '?added=' + sku : ''}`);
    }
    const checkoutUnavailable = () => render(`<h1>${locale === 'de-CH'
      ? 'Bestellungen sind vorübergehend nicht möglich.' : 'Les commandes sont temporairement indisponibles.'}</h1>`, 503);
    const totalsFor = (lines, model) => checkoutTotals(lines || [{ quantity: 1, cents: model?.cents ?? catalog().cents }], shippingSettings(db));
    const checkoutForm = (totals, id, values, message, model, lines, invalid, status = 200) => render(
      checkoutPage(locale, totals, id, values, message, model, lines, stripeMethodsFor(stripe, totals.total), invalid, commercial, termsVersion()),
      status);
    const deliveryBlocked = shipping => commercial && (shippingBlock(shipping, billingProfile().tax) || !termsVersion());
    const termsChanged = locale === 'de-CH' ? 'Bitte bestätige die aktuellen Verkaufsbedingungen.' : 'Veuillez accepter les conditions de vente en vigueur.';
    if (req.method === 'GET' && basketCheckout) {
      const lines = cartLines(readCart(req), purchaseModel);
      if (!canCheckout(lines)) return render(shopBasket(locale, lines, lines.length ? cartText(locale).unavailable : ''), 409);
      const totals = totalsFor(lines);
      if (deliveryBlocked(totals.shipping)) return checkoutUnavailable();
      track('checkout');
      return checkoutForm(totals, randomUUID(), {}, '', null, lines);
    }
    if (req.method === 'GET' && path === `/${locale}/checkout`) {
      if (!searchParams.has('model')) return redirect(res, `/${locale}/checkout/cart`);
      const model = purchaseModel(selectedSKU);
      if (!model?.units) return render(`<h1>${t.soldOut}</h1><a href="/${locale}#catalogue">${locale === 'de-CH' ? 'Zum Katalog' : 'Voir le catalogue'}</a>`, 409);
      const totals = totalsFor(null, model);
      if (deliveryBlocked(totals.shipping)) return checkoutUnavailable();
      track('checkout');
      return checkoutForm(totals, randomUUID(), {}, '', { ...model, sku: selectedSKU });
    }
    if (stripe && first === locale && second === 'payment' && orderIdPattern.test(third) && path === `/${locale}/payment/${third}`) {
      res.setHeader('Referrer-Policy', 'strict-origin');
      if (!canViewOrder(third)) return render(orderAccessPage(locale, accountsEnabled, third), 403);
      const attempt = paymentAttempt(db, third);
      if (!attempt || Boolean(attempt.livemode) !== stripe.live || JSON.parse(attempt.payload).locale !== locale) return render('<h1>404</h1>', 404);
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
      const requestedSKU = fields?.get('model') || '';
      if (!basketCheckout && !requestedSKU) return render(shopBasket(locale, cartLines(readCart(req), purchaseModel)), 409);
      const sku = basketCheckout || requestedSKU === coreSKU ? '' : requestedSKU;
      if (!basketCheckout && !purchaseModel(requestedSKU) && !orderById(id) && !paymentAttempt(db, id)) {
        return render(shopBasket(locale, []), 409);
      }
      const cart = basketCheckout ? readCart(req) : null;
      const lines = cart ? cartLines(cart, purchaseModel) : null;
      const selected = sku ? extraModel(sku) : null;
      const totals = totalsFor(lines, selected);
      const matchesShipping = shipping => (fields.get('shippingQuote') || shippingQuote(legacyShipping)) === shippingQuote(shipping);
      const address = Object.fromEntries(['name', 'street', 'zip', 'city'].map(key => [key, fields?.get(key)?.trim() || '']));
      const validId = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id);
      const billing = billingInput(fields);
      const country = fields?.get('country');
      const values = { ...address, country, email, method, billing: billing.values };
      let checkoutAccess;
      if (sku && !selected) return render(`<h1>${t.soldOut}</h1>`, 409);
      const invalid = [...billing.invalid];
      if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid.push('email');
      for (const key of ['name', 'street', 'city']) {
        if (!address[key] || address[key].length > (key === 'street' ? 160 : 100)) invalid.push(key);
      }
      if (!Object.hasOwn(deliveryCountries, country)) invalid.push('country');
      else if (!deliveryCountries[country].postalCode.test(address.zip)) invalid.push('zip');
      const offered = stripeMethodsFor(stripe, totals.total) || methods;
      if (offered.length && !offered.includes(method)) invalid.push('method');
      if (!validId || !offered.length || invalid.length || !(stripe ? ['stripe'] : ['paid', 'failed']).includes(result)) {
        if (deliveryBlocked(totals.shipping)) return checkoutUnavailable();
        return checkoutForm(totals, validId ? id : randomUUID(), values, t.invalid, selected, lines, invalid, 400);
      }
      const acceptedTerms = version => version
        ? fields.get('termsVersion') === String(version) && fields.get('acceptTerms') === '1'
        : !commercial;
      const matchesQuote = (items, quote) => matchesShipping(quote.shipping) && (basketCheckout
        ? fields.get('cartQuote') === cartQuote(items) && (!quotedPrice || quotedPrice === String(quote.total))
        : quotedPrice === String(quote.total));
      if (stripe) {
        const reservation = transaction(() => {
          const existing = paymentAttempt(db, id);
          if (existing) {
            if (!canViewOrder(id) || Boolean(existing.livemode) !== stripe.live) return 'conflict';
            const previous = JSON.parse(existing.payload);
            return existing.method === method && previous.email === email && previous.locale === locale &&
              JSON.stringify(previous.address) === JSON.stringify(address) &&
              JSON.stringify(previous.billing ?? null) === JSON.stringify(billing.address) && (basketCheckout || previous.lines.length === 1 && previous.lines[0].sku === requestedSKU) &&
              matchesQuote(previous.lines, checkoutTotals(previous.lines, previous.shipping)) ? existing : 'conflict';
          }
          if (orderById(id)) return 'conflict';
          const terms = termsVersion();
          if (!acceptedTerms(terms)) return terms || !commercial ? 'terms' : 'billing';
          const items = cartLines(cart || new Map([[sku || coreSKU, 1]]), purchaseModel);
          if (!canCheckout(items)) return 'out';
          const quote = checkoutTotals(items, shippingSettings(db));
          const sellerProfile = stripe.live ? billingProfile() : null;
          if (stripe.live && (sellerProfile.missing.length || shippingBlock(quote.shipping, sellerProfile.tax))) return 'billing';
          if (!matchesQuote(items, quote)) return 'price';
          if (!stripeMethodsFor(stripe, quote.total).includes(method)) return 'method';
          const snapshot = items.map(({ sku, name, quantity, cents, requires_serial }) => ({ sku, name, quantity, cents, requires_serial }));
          const attempt = reserveStripe(db, id, method, { locale, email, address, billing: billing.address, lines: snapshot, sellerProfile, shipping: quote.shipping, terms }, quote.total,
            line => orderStock(line.sku, -line.quantity, 'reservation', null), undefined, stripe.live);
          checkoutAccess = issueCheckoutAccess(db, id);
          return attempt;
        });
        if (reservation === 'billing') return checkoutUnavailable();
        if (reservation === 'terms') return checkoutForm(totals, id, values, termsChanged, selected, lines, [], 409);
        if (reservation === 'price' || reservation === 'method') {
          return checkoutForm(totalsFor(lines, selected), id, values, t.priceChanged, selected, lines, [], 409);
        }
        if (typeof reservation === 'string') {
          return render(basketCheckout && reservation === 'out'
            ? shopBasket(locale, cartLines(cart, purchaseModel), cartText(locale).unavailable)
            : `<h1>${reservation === 'out' ? t.soldOut : t.invalid}</h1><a href="/${locale}">${t.catalog}</a>`, 409);
        }
        if (checkoutAccess) res.appendHeader('Set-Cookie', checkoutAccessCookie(id, checkoutAccess, secureRequest));
        return stripeRedirect(res, reservation, locale, render);
      }
      if (result === 'failed') return checkoutForm(totals, id, values, t.failed, selected, lines);
      const outcome = transaction(() => {
        const existing = orderById(id);
        if (existing) {
          const sameItems = basketCheckout ? existing.lines.length && cartQuote(existing.lines) === fields.get('cartQuote')
            : !existing.lines.length && (existing.model_sku || coreSKU) === requestedSKU;
          return existing.email === email && existing.method === method && existing.locale === locale && sameItems ? 'repeat' : 'conflict';
        }
        const terms = termsVersion();
        if (!acceptedTerms(terms)) return 'terms';
        if (basketCheckout) {
          const currentLines = cartLines(cart, purchaseModel);
          if (!canCheckout(currentLines)) return 'out';
          const quote = totalsFor(currentLines);
          if (!matchesQuote(currentLines, quote)) return 'price';
          createPaidOrder(id, method, locale, email, address, currentLines, billing.address, quote.shipping);
          for (const line of currentLines) {
            orderStock(line.sku, -line.quantity, 'order', id);
          }
          saveOrderTerms(id, locale, terms);
          notice(id, 'paid');
          checkoutAccess = issueCheckoutAccess(db, id);
          return 'ok';
        }
        const currentModel = sku ? extraModel(sku) : null;
        if (sku ? !currentModel?.active : !corePublished()) return 'out';
        const quote = totalsFor(null, currentModel);
        if (!matchesQuote(null, quote)) return 'price';
        if (!changeStock(sku || coreSKU, -1)) return 'out';
        db.prepare("INSERT INTO orders VALUES (?, ?, ?, ?, ?, 'paid', NULL)").run(id, email, locale, method, quote.total);
        saveOrderShipping(db, id, quote.shipping);
        recordMovement(sku || coreSKU, -1, 'order', id);
        if (currentModel) db.prepare('INSERT INTO order_models VALUES (?, ?, ?, ?)')
          .run(id, requestedSKU, currentModel.name, Number(isWheelchair(currentModel)));
        else db.prepare('INSERT INTO core_order_names VALUES (?, ?)').run(id, coreCatalogProduct().name);
        db.prepare('INSERT INTO delivery_addresses VALUES (?, ?, ?, ?, ?)').run(id, address.name, address.street, address.zip, address.city);
        saveBillingAddress(db, id, billing.address);
        saveOrderTerms(id, locale, terms);
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
      if (outcome === 'terms') return checkoutForm(totals, id, values, termsChanged, selected, lines, [], 409);
      if (basketCheckout && (outcome === 'out' || outcome === 'price')) {
        const currentLines = cartLines(cart, purchaseModel);
        return render(canCheckout(currentLines)
          ? checkoutPage(locale, totalsFor(currentLines), id, values, cartText(locale).changed, null, currentLines, undefined, [], false, termsVersion())
          : shopBasket(locale, currentLines, cartText(locale).unavailable), 409);
      }
      if (outcome === 'price') {
        const current = sku ? extraModel(sku) : null;
        return checkoutForm(totalsFor(null, current), id, values, t.priceChanged, current, undefined, [], 409);
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
        queueEmail(db, third, kind, undefined, mailTarget(orderById(third)), access.expires);
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
        return render(orderPage(locale, order, events, pushControls(locale, order, push, maySubscribe),
          order.tracking ? shipmentPath(db, locale, order.id) : '', orderIsLive(order.id)));
      }
    }
    return render(`<section class="confirmation"><h1 class="page-title">${locale === 'de-CH' ? 'Seite nicht gefunden' : 'Page introuvable'}</h1>
      <a class="button secondary" href="/${locale}#catalogue">${locale === 'de-CH' ? 'Zum Katalog' : 'Voir le catalogue'}</a></section>`, 404);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) send(res, 500, 'Internal server error');
    else res.end();
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Mobility: http://127.0.0.1:${server.address().port}`);
  if (configuredAdmin) console.log('Administración (/admin): usuario admin, contraseña configurada.');
  else if (fixedLocalPassword) console.log('Administración local (/admin/security): usuario admin. Archivo de credencial: ' + fixedLocalPassword);
  else console.log('Administración temporal (/admin): admin / ' + admin);
});
