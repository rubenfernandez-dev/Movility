export const discoveryCompareImage = '/assets/discovery-compare.jpg';
export const discoveryAccessoriesImage = '/assets/discovery-accessories.jpg';

const copy = {
  'de-CH': {
    heading: 'Was möchtest du entdecken?', previous: 'Vorherige Karte', next: 'Nächste Karte',
    cards: [
      ['Den passenden Rollstuhl finden', 'Vergleiche Breite, Gewicht und Reichweite auf einen Blick.', 'Modelle vergleichen'],
      ['Movility One aus der Nähe', 'Sieh dir Rahmen, Räder und Bedienung im interaktiven 3D-Modell an.', '3D-Ansicht öffnen'],
      ['Zubehör und Ersatzteile', 'Finde Teile für deinen Rollstuhl über den Modellfilter.', 'Zubehör ansehen', 'Ersatzteile ansehen'],
    ],
  },
  'fr-CH': {
    heading: 'Que souhaitez-vous découvrir ?', previous: 'Carte précédente', next: 'Carte suivante',
    cards: [
      ['Trouver le fauteuil adapté', 'Comparez la largeur, le poids et l’autonomie en un coup d’œil.', 'Comparer les modèles'],
      ['Voir le Movility One de près', 'Explorez le châssis, les roues et les commandes dans le modèle 3D interactif.', 'Ouvrir la vue 3D'],
      ['Accessoires et pièces détachées', 'Trouvez les pièces adaptées à votre fauteuil grâce au filtre par modèle.', 'Voir les accessoires', 'Voir les pièces détachées'],
    ],
  },
};

export function homeDiscovery(locale, detailImage) {
  const t = copy[locale];
  const images = [discoveryCompareImage, detailImage, discoveryAccessoriesImage];
  const destinations = [['/compare'], ['/movility-one/3d'], ['?family=accessory#catalogue', '?family=spare#catalogue']];
  return `<section class="section discovery-section" aria-labelledby="home-discovery-heading" data-home-discovery>
    <div class="discovery-heading"><h2 id="home-discovery-heading">${t.heading}</h2>
      <div class="discovery-controls" data-discovery-controls hidden>
        <button class="secondary" type="button" data-discovery-previous aria-label="${t.previous}" aria-controls="home-discovery-track" aria-disabled="true">←</button>
        <button class="secondary" type="button" data-discovery-next aria-label="${t.next}" aria-controls="home-discovery-track" aria-disabled="true">→</button>
      </div></div>
    <ul class="discovery-track" id="home-discovery-track" aria-labelledby="home-discovery-heading" tabindex="0">
      ${t.cards.map(([title, description, ...links], index) => `<li class="discovery-card">
        <img src="${images[index]}" alt="" loading="lazy" width="960" height="720">
        <div class="discovery-card-body"><h3>${title}</h3><p>${description}</p>
          <div class="discovery-links">${links.map((label, link) =>
            `<a href="/${locale}${destinations[index][link]}">${label}</a>`).join('')}</div>
        </div></li>`).join('')}
    </ul></section><script src="/assets/home-discovery.js" defer></script>`;
}
