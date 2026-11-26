import { adminHtml, adminText } from './admin-language.mjs';
import { escapeHtml } from './views.mjs';

export const aboutImage = '/assets/about-editorial.jpg';
export const aboutDraftImage = '/admin/content/about/image';
export const aboutPreview = '/admin/content/about/preview';
const copy = {
  de: {
    alt: 'Eine ältere Frau steuert ihren Elektrorollstuhl. Neben ihr geht eine jüngere Frau, mit der sie sich unterhält.',
    caption: 'Fotorealistische Illustration mit erfundenen Personen und einem beispielhaften Rollstuhl.',
    story: 'Wie die Idee entsteht',
    fiction: 'Private Vorschau · fiktive Geschichte',
    today: 'Was wir heute machen',
    chairs: 'Elektrorollstühle ansehen', contact: 'Beratung anfragen', compare: 'Modelle vergleichen',
    paragraphs: [
      'Bei einem ruhigen Spaziergang steuert eine ältere Frau ihren Elektrorollstuhl. Eine jüngere Frau geht neben ihr. Als sie an einer engen Gartentür vorbeikommen, fragt die Ältere, ob ein anderer Rollstuhl wohl durch die Tür zu Hause passen würde. Sie gehen weiter und überlegen, wie sie ihn für einen Ausflug im Auto mitnehmen könnten.',
      'Den Preis eines Modells finden sie schnell. Für die anderen Fragen müssen sie länger suchen. Ist die angegebene Breite die Gesamtbreite? Wie schwer ist der Rollstuhl, wenn man ihn ins Auto hebt? Lässt er sich falten, und wie viel Platz braucht er dann? Beim Weitergehen wird ihnen klar, dass diese Fragen die Auswahl bestimmen.',
      'Aus diesem Gespräch entsteht die Idee für Mobility: Die Angaben zu jedem Modell sollen verständlich sein und sich nebeneinander vergleichen lassen. Wo eine Angabe fehlt, bleibt sie offen. Wer danach noch Fragen zur eigenen Tür, zum Transport oder zu einem passenden Zubehör hat, kann gezielt nachfragen.',
    ],
  },
  fr: {
    alt: 'Une femme âgée conduit son fauteuil roulant électrique et discute avec une femme plus jeune qui marche à ses côtés.',
    caption: 'Illustration photoréaliste avec des personnages fictifs et un fauteuil générique.',
    story: 'D’où vient l’idée',
    fiction: 'Aperçu privé · récit fictif',
    today: 'Ce que nous faisons aujourd’hui',
    chairs: 'Voir les fauteuils électriques', contact: 'Demander conseil', compare: 'Comparer les modèles',
    paragraphs: [
      'Au cours d’une promenade tranquille, une femme âgée conduit son fauteuil roulant électrique. Une femme plus jeune marche à ses côtés. En passant devant un portail étroit, l’aînée se demande si un autre fauteuil franchirait la porte de chez elle. Elles poursuivent leur chemin en imaginant comment elles pourraient le transporter en voiture pour une sortie.',
      'Elles trouvent vite le prix d’un modèle. Les autres réponses demandent plus de recherches. La largeur indiquée est-elle la largeur totale ? Quel poids faut-il soulever pour placer le fauteuil dans la voiture ? Peut-on le plier, et quelle place prend-il une fois plié ? Au fil de la promenade, elles réalisent que ce sont ces questions qui guident leur choix.',
      'De cette conversation naît l’idée de Mobility : présenter clairement les caractéristiques de chaque modèle et permettre de les comparer côte à côte. Lorsqu’une donnée manque, elle reste visible comme telle. Et si une question demeure sur un passage, le transport ou un accessoire, il est possible de demander conseil.',
    ],
  },
};

const draftKeys = ['de', 'fr'].flatMap(lang => ['alt', 'story_0', 'story_1', 'story_2'].map(key => lang + '_' + key));

export function aboutDraftSettings(db) {
  const row = db.prepare("SELECT content, revision FROM information_settings WHERE page='about-draft'").get();
  const defaults = {};
  for (const [lang, content] of Object.entries(copy)) {
    defaults[lang + '_alt'] = content.alt;
    content.paragraphs.forEach((paragraph, index) => { defaults[lang + '_story_' + index] = paragraph; });
  }
  return { ...defaults, ...JSON.parse(row.content), revision: row.revision };
}

export function saveAboutDraft(db, form) {
  const draft = Object.fromEntries(draftKeys.map(key => [key, form?.get(key)?.trim() || '']));
  const revision = form?.get('revision') || '';
  if (!/^\d{1,12}$/.test(revision) ||
      draftKeys.some(key => !draft[key] || draft[key].length > (key.endsWith('_alt') ? 250 : 1500))) return 400;
  return db.prepare("UPDATE information_settings SET content=?, revision=revision+1 WHERE page='about-draft' AND revision=?")
    .run(JSON.stringify(draft), Number(revision)).changes ? 303 : 409;
}

export function aboutDraftEditor(draft, image, status) {
  return adminHtml`<section class="section" aria-labelledby="about-draft-title"><h2 id="about-draft-title">Borrador editorial privado</h2>
    <p><a href="${aboutPreview}/de-CH">Vista previa · Deutsch</a> · <a href="${aboutPreview}/fr-CH">Vista previa · Français</a></p>
    ${status ? adminHtml`<p role="${status === 'Borrador guardado.' ? 'status' : 'alert'}">${adminText(status)}</p>` : ''}
    <form class="admin-catalog" method="post" action="/admin/content/about/draft">
      <input type="hidden" name="revision" value="${draft.revision}">
      ${['de', 'fr'].map(lang => adminHtml`<fieldset><legend lang="${lang}-CH">${lang === 'de' ? 'Deutsch' : 'Français'}</legend>
        <label>Texto alternativo<input lang="${lang}-CH" name="${lang}_alt" maxlength="250" required value="${escapeHtml(draft[lang + '_alt'])}"></label>
        ${[0, 1, 2].map(index => adminHtml`<label>Párrafo ${index + 1}<textarea lang="${lang}-CH" name="${lang}_story_${index}" maxlength="1500" rows="4" required>${escapeHtml(draft[lang + '_story_' + index])}</textarea></label>`).join('')}
      </fieldset>`).join('')}
      <button>Guardar borrador privado</button></form>
    <form class="confirmation" method="post" enctype="multipart/form-data" action="${aboutDraftImage}">
      <h3>Imagen de la vista previa privada</h3>
      <img src="${image}" alt="" width="320" style="max-width:100%;height:auto">
      <input name="kind" type="hidden" value="front">
      <label>Imagen JPG<input type="file" name="file" accept=".jpg,.jpeg,image/jpeg" required></label>
      <button>Reemplazar imagen del borrador</button></form></section>`;
}

export function aboutEditorial(locale, title, intro, blocks, draft) {
  const lang = locale === 'fr-CH' ? 'fr' : 'de';
  const t = copy[lang];
  return `<article class="about-editorial">
    ${draft ? `<p class="about-preview-note">${t.fiction} · <a href="/admin/content/about#about-draft-title">${lang === 'fr' ? 'Modifier le brouillon' : 'Entwurf bearbeiten'}</a></p>` : ''}
    <section class="about-editorial-hero">
      <h1 class="page-title">${escapeHtml(title)}</h1><figure>
      <img src="${draft?.image || aboutImage}" alt="${escapeHtml(draft?.[lang + '_alt'] || t.alt)}" width="1536" height="1024" fetchpriority="high">
      <figcaption>${t.caption}</figcaption>
    </figure><p class="about-editorial-intro lead information-text">${escapeHtml(intro)}</p></section>
    ${draft ? `<section class="about-story"><h2>${t.story}</h2>
      ${[0, 1, 2].map(index => `<p class="information-text">${escapeHtml(draft[lang + '_story_' + index])}</p>`).join('')}</section>` : ''}
    <section class="about-today"><h2>${t.today}</h2>
      ${blocks.map(([heading, body]) => `<div class="about-today-row"><h3>${escapeHtml(heading)}</h3><p class="information-text">${escapeHtml(body)}</p></div>`).join('')}
      <p><a href="/${locale}/compare">${t.compare}</a></p>
      <div class="product-actions"><a class="button" href="/${locale}?family=wheelchair#catalogue">${t.chairs}</a>
        <a class="button secondary" href="/${locale}/contact">${t.contact}</a></div>
    </section></article>`;
}
