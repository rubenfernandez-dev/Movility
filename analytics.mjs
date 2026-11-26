import { cookieDetails } from './legal.mjs';
import { adminHtml, adminText } from './admin-language.mjs';
import { randomUUID } from 'node:crypto';

const cookieName = 'movility_analytics';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const stages = ['view', 'cart', 'checkout', 'purchase'];
const retentionSeconds = 30 * 24 * 60 * 60;

export function setupFunnel(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS funnel_journeys (
      id TEXT PRIMARY KEY, locale TEXT CHECK (locale IN ('de-CH', 'fr-CH')),
      accepted_at INTEGER NOT NULL, started_at INTEGER,
      cart INTEGER NOT NULL DEFAULT 0, checkout INTEGER NOT NULL DEFAULT 0, purchase INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS funnel_started_at ON funnel_journeys(started_at);
  `);
}

export function purgeFunnel(db) {
  db.prepare('DELETE FROM funnel_journeys WHERE accepted_at <= unixepoch() - ?').run(retentionSeconds);
}

export function analyticsChoice(req) {
  const cookie = req.headers.cookie?.split(';').map(value => value.trim())
    .find(value => value.startsWith(cookieName + '='));
  const value = cookie?.slice(cookieName.length + 1) || '';
  return value === 'off' || uuid.test(value) ? value : '';
}

export function updateAnalytics(db, previous, accept, secure) {
  if (!accept && uuid.test(previous)) db.prepare('DELETE FROM funnel_journeys WHERE id = ?').run(previous);
  let value = 'off';
  let maxAge = retentionSeconds;
  if (accept) {
    const current = db.prepare('SELECT accepted_at + ? - unixepoch() AS remaining FROM funnel_journeys WHERE id = ?')
      .get(retentionSeconds, previous);
    if (current?.remaining > 0) {
      value = previous;
      maxAge = current.remaining;
    } else {
      value = randomUUID();
      db.prepare('INSERT INTO funnel_journeys (id, accepted_at) VALUES (?, unixepoch())').run(value);
    }
  }
  return `${cookieName}=${value}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

export function recordFunnel(db, choice, locale, stage) {
  if (!uuid.test(choice)) return;
  if (stage === 'view') {
    db.prepare(`UPDATE funnel_journeys SET locale = ?, started_at = unixepoch()
      WHERE id = ? AND started_at IS NULL AND accepted_at > unixepoch() - ?`).run(locale, choice, retentionSeconds);
    return;
  }
  const predecessor = { cart: '1', checkout: 'cart', purchase: 'checkout' }[stage];
  if (!predecessor || !stages.includes(stage)) return;
  db.prepare(`UPDATE funnel_journeys SET ${stage} = 1 WHERE id = ? AND ${stage} = 0
    AND ${predecessor} = 1 AND started_at IS NOT NULL AND accepted_at > unixepoch() - ?`).run(choice, retentionSeconds);
}

const labels = {
  'de-CH': {
    settings: 'Cookie-Einstellungen', heading: 'Optionale Besuchsstatistik',
    description: 'Mit deiner Zustimmung zählen wir die Schritte vom Produkt bis zur Bestellung. Die Statistik speichert keine Kontaktdaten. Die Einstellung kannst du jederzeit ändern.',
    accept: 'Statistik akzeptieren', decline: 'Nur notwendige', withdraw: 'Zustimmung widerrufen',
    active: 'Die Besuchsstatistik ist erlaubt.', inactive: 'Die Besuchsstatistik ist deaktiviert.',
  },
  'fr-CH': {
    settings: 'Réglages des cookies', heading: 'Mesure d’audience facultative',
    description: 'Avec votre accord, nous comptons les étapes entre la fiche produit et la commande. Les statistiques ne contiennent pas vos coordonnées. Vous pouvez modifier ce choix à tout moment.',
    accept: 'Accepter les statistiques', decline: 'Seulement les cookies nécessaires', withdraw: 'Retirer mon accord',
    active: 'La mesure d’audience est autorisée.', inactive: 'La mesure d’audience est désactivée.',
  },
};

const paths = /^\/(de-CH|fr-CH)(?:\/(?:movility-one(?:\/3d)?|models\/[a-z0-9][a-z0-9-]{1,23}(?:\/3d)?|compare|cart|checkout(?:\/cart)?|analytics|about|contact|delivery-returns-warranty|privacy|impressum|terms))?$/;
export function analyticsReturn(locale, path) {
  return paths.exec(path)?.[1] === locale ? path : `/${locale}`;
}

export function analyticsPrompt(locale, choice, returnPath, settings = false) {
  const l = labels[locale];
  const title = settings ? 'h1' : 'h2';
  return `<section class="analytics-choice${settings ? '' : ' cookie-banner'}" aria-labelledby="cookie-choice-title"><${title} id="cookie-choice-title">${settings ? l.settings : l.heading}</${title}>
    <p>${l.description}</p>
    ${settings && choice ? `<p>${choice === 'off' ? l.inactive : l.active}</p>` : ''}
    <form class="product-actions" method="post" action="/${locale}/analytics">
      <input type="hidden" name="return" value="${analyticsReturn(locale, returnPath)}">
      <button class="secondary" name="choice" value="accept">${l.accept}</button>
      <button class="secondary" name="choice" value="decline">${settings && uuid.test(choice) ? l.withdraw : l.decline}</button>
    </form>${settings ? cookieDetails(locale) : `<a href="/${locale}/analytics">${l.settings}</a>`}</section>`;
}

export const analyticsLink = locale => `<a href="/${locale}/analytics">${labels[locale].settings}</a>`;

export function funnelReport(db, query) {
  const days = query.get('days') === '7' ? 7 : 30;
  const selectedLanguage = query.get('locale');
  const language = selectedLanguage === 'de-CH' || selectedLanguage === 'fr-CH' ? selectedLanguage : '';
  const row = db.prepare(`SELECT COUNT(*) AS view, COALESCE(SUM(cart), 0) AS cart, COALESCE(SUM(checkout), 0) AS checkout,
    COALESCE(SUM(purchase), 0) AS purchase FROM funnel_journeys
    WHERE started_at >= unixepoch() - ? AND accepted_at > unixepoch() - ? AND (? = '' OR locale = ?)`)
    .get(days * 86400, retentionSeconds, language, language);
  const names = ['Ficha de producto', 'Carrito', 'Inicio de pago', 'Pedido confirmado'];
  const rate = (value, base) => base ? new Intl.NumberFormat('es', { style: 'percent', maximumFractionDigits: 1 }).format(value / base) : '—';
  return adminHtml`<a href="/admin">Volver a administración</a><h1 class="page-title">Embudo de compra</h1>
    <p>Recorridos con consentimiento que empiezan en una ficha. Se cuenta cada etapa una vez por recorrido, en orden.</p>
    <form class="order-filter accounting-filter" action="/admin/analytics" method="get">
      <label>Periodo<select name="days"><option value="7" ${days === 7 ? 'selected' : ''}>7 días</option>
      <option value="30" ${days === 30 ? 'selected' : ''}>30 días</option></select></label>
      <label>Idioma de inicio<select name="locale"><option value="">Todos</option>
      <option value="de-CH" ${language === 'de-CH' ? 'selected' : ''}>Alemán</option>
      <option value="fr-CH" ${language === 'fr-CH' ? 'selected' : ''}>Francés</option></select></label>
      <button>Filtrar</button></form>
    <div class="inventory-table"><table><thead><tr>
      <th scope="col">Etapa</th><th scope="col">Recorridos</th><th scope="col">Desde la etapa anterior</th><th scope="col">Desde la ficha</th>
    </tr></thead><tbody>${stages.map((stage, index) => adminHtml`<tr>
      <th scope="row">${adminText(names[index])}</th><td>${row[stage]}</td>
      <td>${index ? rate(row[stage], row[stages[index - 1]]) : '—'}</td><td>${rate(row[stage], row.view)}</td>
    </tr>`).join('')}</tbody></table></div>
    <p>Los recuentos corresponden a recorridos, no a todos los pedidos. Los datos se conservan hasta 30 días.</p>`;
}
