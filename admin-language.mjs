import { AsyncLocalStorage } from 'node:async_hooks';
import { escapeHtml, page } from './views.mjs';
import { adminMessages } from './admin-messages.mjs';
import { adminRouteAllowed } from './admin-access.mjs';

const context = new AsyncLocalStorage();
const locales = { es: 'Español', 'de-CH': 'Deutsch', 'fr-CH': 'Français' };
export const adminLocale = () => context.getStore()?.locale || 'es';

export function setAdminNavigation(role, accountsEnabled) {
  Object.assign(context.getStore(), { role, accountsEnabled });
}

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

const navigationGroups = [
  ['Catálogo', [
    ['/admin/models', 'Artículos del catálogo'],
    ['/admin/families', 'Familias'],
    ['/admin/catalog-order', 'Ordenar catálogo'],
    ['/admin/models?family=accessory', 'Accesorios'],
    ['/admin/models?family=spare', 'Recambios'],
  ]],
  ['Almacén', [
    ['/admin/inventory', 'Movimientos de stock'],
    ['/admin/serials', 'Buscar número de serie'],
  ]],
  ['Atención al cliente', [
    ['/admin/contact', 'Bandeja de contacto'],
    ['/admin/mail', 'Cola de correos'],
  ]],
  ['Finanzas e informes', [
    ['/admin/accounting', 'Conciliación de pedidos'],
    ['/admin/stripe', 'Pagos de prueba con Stripe'],
    ['/admin/analytics', 'Embudo de compra'],
  ]],
  ['Contenido', [
    ['/admin/faqs', 'Preguntas frecuentes'],
    ['/admin/legal/impressum', 'Contenidos legales'],
    ['/admin/content/about', 'Quiénes somos'],
    ['/admin/content/contact', 'Datos públicos de contacto'],
    ['/admin/content/delivery-returns-warranty', 'Envíos, devoluciones y garantía'],
  ]],
  ['Configuración', [['/admin/security', 'Seguridad del panel']]],
];

function adminSidebar({ role, accountsEnabled, path, params }) {
  if (!role) return '';
  const text = label => escapeHtml(adminText(label));
  const groups = accountsEnabled && role === 'admin' ? [...navigationGroups, ['Clientes y ofertas', [
    ['/admin/customer-codes', 'Buzón simulado de clientes'],
    ['/admin/offer-codes', 'Buzón de ofertas de prueba'],
    ['/admin/campaigns', 'Campañas de ofertas'],
  ]]] : navigationGroups;
  const orders = path === '/admin/orders' || path.startsWith('/admin/orders/') ||
    path === '/admin' && (params.has('status') || params.get('view') === 'orders');
  const active = href => {
    if (href === '/admin') return path === href && !orders;
    if (href === '/admin/orders') return orders;
    if (path === '/admin/models' && ['accessory', 'spare'].includes(params.get('family'))) {
      return href === '/admin/models?family=' + params.get('family');
    }
    return path === href || path.startsWith(href + '/');
  };
  const link = (href, label) => `<li><a href="${href}"${active(href) ? ' aria-current="page"' : ''}>${text(label)}</a></li>`;
  const current = orders ? 'Pedidos' : path === '/admin' ? 'Inicio' :
    groups.flatMap(([, items]) => items).find(([href]) => active(href))?.[1] || 'Menú del panel';
  const nav = `<nav class="admin-nav" aria-label="${text('Menú del panel')}">
    <ul>${link('/admin', 'Inicio')}${link('/admin/orders', 'Pedidos')}</ul>
    ${groups.map(([label, items]) => {
      const allowed = items.filter(([href]) => adminRouteAllowed(role, 'GET', href.split('?')[0]));
      return allowed.length ? `<h2>${text(label)}</h2><ul>${allowed.map(([href, name]) => link(href, name)).join('')}</ul>` : '';
    }).join('')}</nav>`;
  return `<aside class="admin-sidebar"><div class="admin-nav-desktop">${nav}</div>
    <details class="admin-nav-mobile"><summary>${text('Menú')} · ${text(current)}</summary>${nav}</details></aside>`;
}

export function adminPage(title, content) {
  const locale = adminLocale();
  const { path, params } = context.getStore() || { path: '/admin', params: new URLSearchParams() };
  const header = `<a class="skip" href="#content">${escapeHtml(adminText('Ir al contenido'))}</a>
    <header class="top"><div class="top-inner"><a class="brand" href="/admin">Movility</a>
    <nav aria-label="${escapeHtml(adminText('Idioma del panel'))}">${Object.entries(locales).map(([code, label]) => {
      const query = new URLSearchParams(params);
      query.set('lang', code);
      return `<a href="${escapeHtml(path + '?' + query)}" lang="${code}"${code === locale ? ' aria-current="true"' : ''}>${label}</a>`;
    }).join('')}</nav></div></header>`;
  return page(locale, adminText(title), content, header, {}, { admin: true, sidebar: adminSidebar(context.getStore() || {}) });
}
