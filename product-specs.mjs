export const coreDemoSpecs = { width: 60, weight: 27, range: 20, fold: 1 };

const names = {
  'de-CH': ['Breite', 'Länge', 'Höhe', 'Gewicht', 'Reichweite', 'Maximale Belastung', 'Faltbar', 'Ja', 'Nein'],
  'fr-CH': ['Largeur', 'Longueur', 'Hauteur', 'Poids', 'Autonomie', 'Charge maximale', 'Pliable', 'Oui', 'Non'],
};
const fields = [
  ['width', 'cm'], ['length', 'cm'], ['height', 'cm'], ['weight', 'kg'], ['range', 'km'], ['max_load', 'kg'], ['fold', ''],
];

export function productSpecs(locale, model, showUnknown = false, selectedFields) {
  const labels = names[locale];
  const format = new Intl.NumberFormat(locale);
  const unknown = locale === 'de-CH' ? 'Keine Angabe' : 'Non renseigné';
  return fields.flatMap(([key, unit], index) => {
    if (selectedFields && !selectedFields.includes(key)) return [];
    const value = model[key];
    if (!Number.isFinite(value) || value < 0) return showUnknown ? [[labels[index], unknown]] : [];
    const formatted = key === 'fold' ? labels[value ? 7 : 8] : format.format(value) + ' ' + unit;
    const demo = locale === 'de-CH' ? 'Demowert' : 'Valeur de démonstration';
    return [[labels[index], formatted + (model.demoSpecs?.includes(key) ? ' · ' + demo : ''), value]];
  });
}

export function productOffer(cents, available) {
  return `<span itemprop="offers" itemscope itemtype="https://schema.org/Offer">
    <meta itemprop="priceCurrency" content="CHF"><meta itemprop="price" content="${(cents / 100).toFixed(2)}">
    <link itemprop="availability" href="https://schema.org/${available ? 'InStock' : 'OutOfStock'}">
  </span>`;
}
