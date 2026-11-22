import { copy, escapeHtml } from './views.mjs';

const locales = Object.keys(copy);
const routes = {
  '': {
    'de-CH': ['Elektrorollstühle für die Schweiz', 'Entdecke den Movility One und vergleiche elektrische Rollstühle auf Deutsch.'],
    'fr-CH': ['Fauteuils roulants électriques en Suisse', 'Découvrez le Movility One et comparez les fauteuils roulants électriques en français.'],
  },
  '/movility-one': {
    'de-CH': ['Movility One – Elektrorollstuhl', 'Sieh dir Bilder, Details und das interaktive 3D-Modell des Movility One an.'],
    'fr-CH': ['Movility One – Fauteuil roulant électrique', 'Explorez les photos, la fiche et le modèle 3D interactif du Movility One.'],
  },
  '/compare': {
    'de-CH': ['Elektrorollstühle vergleichen', 'Vergleiche Breite, Gewicht, Reichweite und Faltbarkeit.'],
    'fr-CH': ['Comparer les fauteuils roulants électriques', 'Comparez la largeur, le poids, l’autonomie et le pliage.'],
  },
  '/movility-one/3d': {
    'de-CH': ['Movility One in 3D', 'Drehe das Modell, um Rahmen, Räder und Bedienelemente zu erkunden.'],
    'fr-CH': ['Movility One en 3D', 'Faites tourner le modèle pour observer le châssis, les roues et les commandes.'],
  },
};

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

export function pageMetadata(locale, suffix, origin) {
  if (!Object.hasOwn(routes, suffix)) return {};
  const [title, description] = routes[suffix][locale];
  const path = `/${locale}${suffix}`;
  const canonical = origin ? `<link rel="canonical" href="${escapeHtml(origin + path)}">` : '';
  return { title: `${title} | Movility`, description, links: canonical + alternates(suffix, origin)
    .map(([language, url]) => `<link rel="alternate" hreflang="${language}" href="${escapeHtml(url)}">`).join('') };
}

export function sitemap(origin) {
  const entries = Object.keys(routes).flatMap(suffix => locales.map(locale => {
    const links = alternates(suffix, origin).map(([code, url]) =>
      `<xhtml:link rel="alternate" hreflang="${code}" href="${escapeHtml(url)}"/>`).join('');
    return `<url><loc>${escapeHtml(`${origin}/${locale}${suffix}`)}</loc>${links}</url>`;
  }));
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join('\n')}
</urlset>`;
}
