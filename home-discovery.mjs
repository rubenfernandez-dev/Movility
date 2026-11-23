export const discoveryCompareImage = '/assets/discovery-compare.jpg';
export const discoveryAccessoriesImage = '/assets/discovery-accessories.jpg';

const copy = {
  'de-CH': {
    heading: 'Elektrorollstühle und Zubehör', previous: 'Vorheriges Bild', next: 'Nächstes Bild',
    pause: 'Automatischen Bildwechsel anhalten', play: 'Automatischen Bildwechsel starten',
    slides: ['Rollstühle vergleichen', 'Movility One in 3D ansehen', 'Passende Teile finden'],
  },
  'fr-CH': {
    heading: 'Fauteuils roulants électriques et accessoires', previous: 'Image précédente', next: 'Image suivante',
    pause: 'Mettre le défilement automatique en pause', play: 'Lancer le défilement automatique',
    slides: ['Comparer les fauteuils', 'Voir le Movility One en 3D', 'Trouver des pièces compatibles'],
  },
};

export function homeDiscovery(locale, detailImage) {
  const t = copy[locale];
  const images = [discoveryCompareImage, detailImage, discoveryAccessoriesImage];
  const destinations = ['/compare', '/movility-one/3d', '?family=spare#catalogue'];
  return `<section class="discovery-section" aria-labelledby="home-discovery-heading" data-home-discovery>
    <h1 class="visually-hidden" id="home-discovery-heading">${t.heading}</h1>
    <div class="discovery-controls" data-discovery-controls hidden>
      <button type="button" data-discovery-toggle data-pause="${t.pause}" data-play="${t.play}"
        aria-label="${t.pause}" aria-controls="home-discovery-track">Ⅱ</button>
      <button type="button" data-discovery-previous aria-label="${t.previous}" aria-controls="home-discovery-track" aria-disabled="true">←</button>
      <button type="button" data-discovery-next aria-label="${t.next}" aria-controls="home-discovery-track" aria-disabled="true">→</button>
    </div>
    <ul class="discovery-track" id="home-discovery-track" aria-labelledby="home-discovery-heading" tabindex="0">
      ${t.slides.map((label, index) => `<li class="discovery-card">
        <img class="discovery-photo" src="${images[index]}" alt="" ${index ? 'loading="lazy"' : 'fetchpriority="high"'} width="960" height="720">
        <a class="button discovery-action" href="/${locale}${destinations[index]}">${label}</a></li>`).join('')}
    </ul><div class="discovery-progress" aria-hidden="true"></div></section><script src="/assets/home-discovery.js" defer></script>`;
}
