const articles = [
  ['qa-chair', 'Mobility QA Compact', 'wheelchair', 189000, 1,
    'Fiktiver Elektrorollstuhl für Bestell- und Versandtests.',
    'Fauteuil roulant électrique fictif pour tester la commande et l’expédition.', 58, 24, 18, 1],
  ['qa-bag', 'Mobility QA Bag', 'accessory', 3900, 3,
    'Fiktives Zubehör für Bestelltests.',
    'Accessoire fictif pour tester la commande.', -1, -1, -1, 0],
];

export function seedStagingCatalog(db) {
  const insert = db.prepare(`INSERT OR IGNORE INTO extra_models
    (sku, name, family, cents, units, description_de, description_fr, width, weight, range, fold, active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`);
  for (const article of articles) insert.run(...article);
}
