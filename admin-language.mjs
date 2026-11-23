import { AsyncLocalStorage } from 'node:async_hooks';
import { escapeHtml, page } from './views.mjs';
import { adminMessages } from './admin-messages.mjs';

const context = new AsyncLocalStorage();
const locales = { es: 'Español', 'de-CH': 'Deutsch', 'fr-CH': 'Français' };
export const adminLocale = () => context.getStore()?.locale || 'es';

export function adminLanguage(req, res, path, params, action) {
  const saved = /(?:^|;\s*)movility_admin_language=([^;]+)/.exec(req.headers.cookie || '')?.[1];
  const requested = req.method === 'GET' && params.get('lang');
  const locale = Object.hasOwn(locales, requested) ? requested : Object.hasOwn(locales, saved) ? saved : 'es';
  if (requested === locale) {
    const secure = req.headers.host !== 'localhost:' + req.socket.localPort &&
      req.headers.host !== '127.0.0.1:' + req.socket.localPort;
    res.setHeader('Set-Cookie', 'movility_admin_language=' + locale +
      '; Path=/admin; Max-Age=31536000; HttpOnly; SameSite=Lax' + (secure ? '; Secure' : ''));
  }
  return context.run({ locale, path, params }, action);
}

export function adminText(source) {
  const locale = adminLocale();
  return adminMessages.get(source)?.[locale] || source;
}

const literalPattern = new RegExp('(?<![\\p{L}])(?:' +
  [...adminMessages.keys()].sort((a, b) => b.length - a.length)
    .map(value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')(?![\\p{L}])', 'gu');

export const adminFragment = source => adminLocale() === 'es' ? source :
  source.replace(literalPattern, value => escapeHtml(adminText(value)));

// Translate static template segments only. Interpolated product and customer data stay intact.
export const adminHtml = (segments, ...values) => segments.reduce((html, segment, index) =>
  html + adminFragment(segment) + (index < values.length ? values[index] : ''), '');

export function adminPage(title, content) {
  const locale = adminLocale();
  const { path, params } = context.getStore() || { path: '/admin', params: new URLSearchParams() };
  const header = `<header class="top"><div class="top-inner"><a class="brand" href="/admin">Movility</a>
    <nav aria-label="${escapeHtml(adminText('Idioma del panel'))}">${Object.entries(locales).map(([code, label]) => {
      const query = new URLSearchParams(params);
      query.set('lang', code);
      return `<a href="${escapeHtml(path + '?' + query)}" lang="${code}"${code === locale ? ' aria-current="true"' : ''}>${label}</a>`;
    }).join('')}</nav></div></header>`;
  return page(locale, adminText(title), content, header, {}, { admin: true });
}
