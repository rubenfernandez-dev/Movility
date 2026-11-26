import { adminHtml, adminText } from './admin-language.mjs';
import { informationSettings } from './information-admin.mjs';
import { validContactEmail } from './information.mjs';
import { escapeHtml } from './views.mjs';

const fields = {
  name: ['Razón social', 160], street: ['Calle y número del emisor', 160], zip: ['Código postal del emisor', 16],
  city: ['Localidad del emisor', 100], country: ['País del emisor (código ISO)', 2],
  email: ['Correo del emisor', 254], vatId: ['Número de IVA', 50], rate: ['Tasa de IVA (%)', 6],
  noteDe: ['Mención fiscal en alemán', 300], noteFr: ['Mención fiscal en francés', 300],
};
const modes = {
  pending: 'Tratamiento de IVA pendiente',
  included: 'IVA incluido en los precios (una tasa)',
  none: 'Sin IVA repercutido',
};
const path = '/admin/billing';
const ratePattern = /^(?:[0-9]|[1-9][0-9])(?:\.\d{1,2})?$/;

export function setupBillingSettings(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS billing_settings (
    id INTEGER PRIMARY KEY CHECK(id=1), content TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0
  ); INSERT OR IGNORE INTO billing_settings(id,content) VALUES (1,'{}');`);
}

export function billingSettings(db, configuredEmail) {
  const row = db.prepare('SELECT content, revision FROM billing_settings WHERE id=1').get();
  const contact = informationSettings(db, 'contact', configuredEmail);
  return { settings: { mode: 'pending', ...JSON.parse(row.content) }, revision: row.revision, publicEmail: contact.email };
}

export function billingReadiness({ settings, publicEmail }) {
  const missing = ['name', 'street', 'zip', 'city', 'country'].filter(key => !settings[key]).map(key => fields[key][0]);
  const email = settings.email || publicEmail;
  if (!validContactEmail(email)) missing.push(fields.email[0]);
  if (settings.mode === 'pending' || !Object.hasOwn(modes, settings.mode)) missing.push(modes.pending);
  else {
    if (settings.mode === 'included') {
      if (!settings.vatId) missing.push(fields.vatId[0]);
      if (!ratePattern.test(settings.rate || '') || Number(settings.rate) <= 0) missing.push(fields.rate[0]);
    }
    if (settings.mode === 'none') for (const key of ['noteDe', 'noteFr']) {
      if (!settings[key]) missing.push(fields[key][0]);
    }
    if (!settings.confirmed) missing.push('Confirmación fiscal expresa');
  }
  const seller = Object.fromEntries(['name', 'street', 'zip', 'city', 'country', 'vatId'].map(key => [key, settings[key] || '']));
  return { missing, seller: seller.name ? { ...seller, email } : null, tax: missing.length ? null : {
    mode: settings.mode, rateBps: settings.mode === 'included' ? Math.round(Number(settings.rate) * 100) : null,
    notes: settings.mode === 'none' ? { 'de-CH': settings.noteDe, 'fr-CH': settings.noteFr } : null,
  } };
}

export function saveBillingSettings(db, fieldsInput, current, commercial) {
  if (!fieldsInput) return 'invalid';
  const values = Object.fromEntries(Object.keys(fields).map(key => [key, fieldsInput.get(key)?.trim() || '']));
  values.country = values.country.toUpperCase();
  values.rate = values.rate.replace(',', '.');
  values.mode = fieldsInput.get('mode');
  values.confirmed = fieldsInput.get('confirmed') === '1' && values.mode !== 'pending';
  if (!Object.hasOwn(modes, values.mode) || Object.entries(fields).some(([key, [, max]]) => values[key].length > max) ||
      (values.country && !/^[A-Z]{2}$/.test(values.country)) || (values.email && !validContactEmail(values.email)) ||
      (values.rate && (!ratePattern.test(values.rate) || Number(values.rate) <= 0))) return 'invalid';
  if (fieldsInput.get('revision') !== String(current.revision)) return 'conflict';
  if (commercial && billingReadiness({ ...current, settings: values }).missing.length) return 'incomplete';
  return db.prepare('UPDATE billing_settings SET content=?,revision=revision+1 WHERE id=1 AND revision=?')
    .run(JSON.stringify(values), current.revision).changes ? 'saved' : 'conflict';
}

export function billingSettingsAdmin(current, result = '') {
  const { settings, revision, publicEmail } = current;
  const { missing } = billingReadiness(current);
  const error = { invalid: 'Revisa el formato de los datos del emisor.', conflict: 'Los datos cambiaron. Revisa los valores actuales.',
    incomplete: 'Completa el perfil fiscal antes de guardar en modo comercial.' }[result];
  const input = key => {
    const [label, max] = fields[key];
    return adminHtml`<label>${adminText(label)}<input name="${key}" maxlength="${max}" value="${escapeHtml(settings[key] || '')}"></label>`;
  };
  return adminHtml`<h1>Emisor y fiscalidad</h1>
    ${error ? `<p class="form-error" role="alert">${adminText(error)}</p>` : ''}
    ${result === 'saved' ? adminHtml`<p class="form-success" role="status">Emisor guardado.</p>` : ''}
    ${missing.length ? adminHtml`<section class="form-error"><h2>Activación comercial bloqueada</h2>
      <ul>${missing.map(label => `<li>${escapeHtml(adminText(label))}</li>`).join('')}</ul></section>`
      : adminHtml`<p>Perfil del emisor completo.</p>`}
    <form class="confirmation" action="${path}" method="post">
      <input type="hidden" name="revision" value="${revision}">
      <fieldset><legend>Datos del emisor</legend>
        ${['name','street','zip','city','country','email'].map(input).join('')}
        <p>Si dejas el correo vacío, se usa el correo público de contacto.</p>
        ${publicEmail ? `<p>${escapeHtml(publicEmail)}</p>` : ''}</fieldset>
      <fieldset><legend>IVA y documentos</legend>
        <label>Tratamiento fiscal<select name="mode">${Object.entries(modes).map(([value, label]) =>
          `<option value="${value}"${settings.mode === value ? ' selected' : ''}>${escapeHtml(adminText(label))}</option>`).join('')}</select></label>
        ${['vatId','rate','noteDe','noteFr'].map(input).join('')}
        <p>Para IVA incluido, indica la tasa confirmada y el número de IVA. Si no se desglosa IVA, introduce la mención aprobada en ambos idiomas.</p>
        <label><input type="checkbox" name="confirmed" value="1"> Confirmo el tratamiento fiscal para los productos y sus precios en CHF.</label>
      </fieldset>
      <button>Guardar emisor</button>
    </form>`;
}
