import { copy, escapeHtml } from './views.mjs';
import { information } from './information.mjs';

const locales = Object.keys(copy);
const routes = {
  ...information,
  '': {
    'de-CH': ['Elektrorollstühle für die Schweiz', 'Entdecke und vergleiche elektrische Rollstühle auf Deutsch.'],
    'fr-CH': ['Fauteuils roulants électriques en Suisse', 'Découvrez et comparez les fauteuils roulants électriques en français.'],
  },
  '/mobility-one': {
    'de-CH': ['Mobility One – Elektrorollstuhl', 'Sieh dir Bilder, Details und das interaktive 3D-Modell des Mobility One an.'],
    'fr-CH': ['Mobility One – Fauteuil roulant électrique', 'Explorez les photos, la fiche et le modèle 3D interactif du Mobility One.'],
  },
  '/compare': {
    'de-CH': ['Elektrorollstühle vergleichen', 'Vergleiche Preis, Masse, Gewicht, Reichweite und maximale Belastung der Modelle.'],
    'fr-CH': ['Comparer les fauteuils roulants électriques', 'Comparez le prix, les dimensions, le poids, l’autonomie et la charge maximale des modèles.'],
  },
  '/mobility-one/3d': {
    'de-CH': ['Mobility One in 3D', 'Drehe das Modell, um Rahmen, Räder und Bedienelemente zu erkunden.'],
    'fr-CH': ['Mobility One en 3D', 'Faites tourner le modèle pour observer le châssis, les roues et les commandes.'],
  },
};

export const isPublicPage = suffix => Object.hasOwn(routes, suffix);

export function publicOrigin(value) {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('MOVILITY_PUBLIC_ORIGIN must be a bare HTTPS origin.');
  }
  return url.origin;
}

function alternates(suffix, origin) {
  return [...locales.map(locale => [locale, `${origin}/${locale}${suffix}`]), ['x-default', `${origin}/de-CH${suffix}`]];
}

export function pageMetadata(locale, suffix, origin, text) {
  if (!text && !isPublicPage(suffix)) return {};
  const [title, description] = text || routes[suffix][locale];
  const path = `/${locale}${suffix}`;
  const canonical = origin ? `<link rel="canonical" href="${escapeHtml(origin + path)}">` : '';
  return { title: `${title} | Mobility`, description, links: canonical + alternates(suffix, origin)
    .map(([language, url]) => `<link rel="alternate" hreflang="${language}" href="${escapeHtml(url)}">`).join('') };
}

export function sitemap(origin, modelPaths = [], includeCore = true) {
  const entries = [...Object.keys(routes).filter(path => includeCore || !path.startsWith('/mobility-one')), ...modelPaths].flatMap(suffix => locales.map(locale => {
    const links = alternates(suffix, origin).map(([code, url]) =>
      `<xhtml:link rel="alternate" hreflang="${code}" href="${escapeHtml(url)}"/>`).join('');
    return `<url><loc>${escapeHtml(`${origin}/${locale}${suffix}`)}</loc>${links}</url>`;
  }));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>`;
}
