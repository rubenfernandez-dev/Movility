import { escapeHtml, money } from './views.mjs';

export function setupDocuments(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS billing_addresses (
      order_id TEXT PRIMARY KEY REFERENCES orders(id), name TEXT NOT NULL,
      street TEXT NOT NULL, zip TEXT NOT NULL, city TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS billing_documents (
      number INTEGER PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
      kind TEXT NOT NULL CHECK(kind IN ('invoice','credit')), snapshot TEXT NOT NULL,
      issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      UNIQUE(order_id, kind)
    );
  `);
}

export function billingInput(fields) {
  const entries = ['name', 'street', 'zip', 'city'].map(key => [key, fields?.get('bill_' + key)?.trim() || '']);
  const values = Object.fromEntries(entries);
  if (!entries.some(([, value]) => value)) return { values, address: null, invalid: [] };
  return { values, address: values, invalid: entries.filter(([key, value]) => key === 'zip'
    ? !/^\d{4}$/.test(value) : !value || value.length > (key === 'street' ? 160 : 100)).map(([key]) => 'bill_' + key) };
}

export function saveBillingAddress(db, id, address) {
  if (address) db.prepare('INSERT INTO billing_addresses VALUES (?, ?, ?, ?, ?)').run(id, address.name, address.street, address.zip, address.city);
}

export function issueDocument(db, order, kind) {
  const invoice = db.prepare("SELECT number, snapshot FROM billing_documents WHERE order_id = ? AND kind = 'invoice'").get(order.id);
  if (kind === 'credit' && !invoice) return;
  const address = kind === 'invoice' && (db.prepare('SELECT name, street, zip, city FROM billing_addresses WHERE order_id = ?').get(order.id)
    || db.prepare('SELECT name, street, zip, city FROM delivery_addresses WHERE order_id = ?').get(order.id));
  if (kind === 'invoice' && !address) return;
  const snapshot = kind === 'credit' ? { ...JSON.parse(invoice.snapshot), invoice: invoice.number } : {
    locale: order.locale, address, cents: order.cents,
    seller: { name: 'Movility Demo', street: 'Rue Exemple 1', city: '1201 Genève', country: 'CH' },
    lines: order.lines.length ? order.lines.map(({ name, quantity, cents }) => ({ name, quantity, cents }))
      : [{ name: order.model_name || 'Movility One', quantity: 1, cents: order.cents }],
  };
  db.prepare('INSERT OR IGNORE INTO billing_documents (order_id, kind, snapshot) VALUES (?, ?, ?)').run(order.id, kind, JSON.stringify(snapshot));
}

const copy = {
  'de-CH': { invoice: 'Testrechnung', credit: 'Testgutschrift', label: 'Testdokument · Nicht für die Buchhaltung',
    date: 'Ausgestellt am', order: 'Bestellreferenz', reference: 'Zur Rechnung', seller: 'Aussteller (fiktiv)',
    billing: 'Rechnungsadresse', product: 'Produkt', quantity: 'Menge', unit: 'Einzelpreis', total: 'Gesamtbetrag',
    tax: 'Steuern werden in diesem Testdokument nicht ausgewiesen.', back: 'Zurück zur Verwaltung' },
  'fr-CH': { invoice: 'Facture de test', credit: 'Avoir de test', label: 'Document de test · Sans usage comptable',
    date: 'Date d’émission', order: 'Référence de commande', reference: 'Facture associée', seller: 'Émetteur fictif',
    billing: 'Adresse de facturation', product: 'Produit', quantity: 'Quantité', unit: 'Prix unitaire', total: 'Total',
    tax: 'Les taxes ne sont pas détaillées sur ce document de test.', back: 'Retour à l’administration' },
};

export function documentPage(doc) {
  const data = JSON.parse(doc.snapshot);
  const t = copy[data.locale];
  const number = n => 'TEST-' + String(n).padStart(6, '0');
  const address = data.address;
  const sign = doc.kind === 'credit' ? -1 : 1;
  const amount = cents => money(data.locale, cents);
  return { locale: data.locale, title: t[doc.kind], html: `<article class="billing-document">
    <p class="document-navigation"><a href="/admin#order-${doc.order_id}">${t.back}</a></p>
    <p class="eyebrow">${t.label}</p><h1 class="page-title">${t[doc.kind]} ${number(doc.number)}</h1>
    <p>${t.date} · <time datetime="${doc.issued_at}">${doc.issued_at.slice(0, 10)}</time><br>
    ${t.order} · ${doc.order_id}${data.invoice ? `<br>${t.reference} · <a href="/admin/${doc.order_id}/document/invoice">${number(data.invoice)}</a>` : ''}</p>
    <div class="address-row"><div><h2>${t.seller}</h2><p>${escapeHtml(data.seller.name)}<br>${escapeHtml(data.seller.street)}<br>${escapeHtml(data.seller.city)} · CH</p></div>
      <div><h2>${t.billing}</h2><p>${escapeHtml(address.name)}<br>${escapeHtml(address.street)}<br>${escapeHtml(address.zip)} ${escapeHtml(address.city)} · CH</p></div></div>
    <div class="inventory-table"><table><thead><tr><th scope="col">${t.product}</th><th scope="col">${t.quantity}</th><th scope="col">${t.unit}</th><th scope="col">${t.total}</th></tr></thead>
    <tbody>${data.lines.map(line => `<tr><th scope="row">${escapeHtml(line.name)}</th><td>${line.quantity}</td>
      <td>${amount(line.cents)}</td><td>${amount(line.cents * line.quantity * sign)}</td></tr>`).join('')}</tbody></table></div>
    <p class="price">${t.total} · ${amount(sign * data.cents)}</p><p>${t.tax}</p></article>` };
}
