import { adminFragment, adminHtml, adminText } from './admin-language.mjs';
import { randomUUID } from 'node:crypto';
import { escapeHtml } from './views.mjs';

const now = () => Math.floor(Date.now() / 1000);
export function setupCampaigns(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS offer_campaigns (
    id INTEGER PRIMARY KEY, request_id TEXT UNIQUE NOT NULL, subject_de TEXT NOT NULL, body_de TEXT NOT NULL,
    subject_fr TEXT NOT NULL, body_fr TEXT NOT NULL, due_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS offer_deliveries (
    campaign_id INTEGER NOT NULL REFERENCES offer_campaigns(id), email TEXT NOT NULL,
    locale TEXT NOT NULL, consent_hash TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','simulated','excluded')),
    processed_at INTEGER, PRIMARY KEY(campaign_id,email)
  );
  CREATE INDEX IF NOT EXISTS offer_deliveries_state ON offer_deliveries(state,campaign_id);`);
}

const activeAudience = db => db.prepare(`SELECT email, locale, unsubscribe_hash FROM offer_subscriptions
  WHERE state='active' AND unsubscribe_hash IS NOT NULL ORDER BY email`).all();

function dueTime(value, time) {
  if (!value) return time;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value + ':00Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 16) === value && date.valueOf() >= time * 1000
    ? date.valueOf() / 1000 : null;
}

export function queueCampaign(db, fields, time = now()) {
  const request = fields?.get('request_id') || '';
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(request)) return false;
  if (db.prepare('SELECT 1 FROM offer_campaigns WHERE request_id=?').get(request)) return true;
  const text = ['subject_de', 'body_de', 'subject_fr', 'body_fr'].map(key => fields?.get(key)?.trim() || '');
  const due = dueTime(fields?.get('due') || '', time);
  if (due === null || text.some((value, i) => !value || value.length > (i % 2 ? 3000 : 160) ||
      (!(i % 2) && /[\r\n]/.test(value)))) return false;
  const mode = fields.get('audience');
  if (!['selected', 'all'].includes(mode)) return false;
  const selected = new Set(fields.getAll('recipient'));
  const recipients = activeAudience(db).filter(row => mode === 'all' || selected.has(row.email));
  if (!recipients.length) return false;
  const id = db.prepare('INSERT INTO offer_campaigns (request_id,subject_de,body_de,subject_fr,body_fr,due_at) VALUES (?,?,?,?,?,?)')
    .run(request, ...text, due).lastInsertRowid;
  const enqueue = db.prepare('INSERT INTO offer_deliveries (campaign_id,email,locale,consent_hash) VALUES (?,?,?,?)');
  for (const person of recipients) enqueue.run(id, person.email, person.locale, person.unsubscribe_hash);
  return true;
}

export function processCampaigns(db, time = now()) {
  const rows = db.prepare(`SELECT d.campaign_id,d.email,CASE WHEN s.state='active' AND
    s.unsubscribe_hash=d.consent_hash AND s.locale=d.locale THEN 'simulated' ELSE 'excluded' END AS outcome
    FROM offer_deliveries d JOIN offer_campaigns c ON c.id=d.campaign_id
    LEFT JOIN offer_subscriptions s ON s.email=d.email
    WHERE d.state='queued' AND c.due_at<=? ORDER BY c.due_at,c.id,d.email LIMIT 100`).all(time);
  const settle = db.prepare("UPDATE offer_deliveries SET state=?,processed_at=? WHERE campaign_id=? AND email=? AND state='queued'");
  for (const row of rows) settle.run(row.outcome, time, row.campaign_id, row.email);
  return rows.length;
}

export function campaignPage(db, result) {
  const audience = activeAudience(db);
  const campaigns = db.prepare(`SELECT c.*, SUM(d.state='queued') AS pending,SUM(d.state='simulated') AS simulated,
    SUM(d.state='excluded') AS excluded FROM offer_campaigns c JOIN offer_deliveries d ON d.campaign_id=c.id
    GROUP BY c.id ORDER BY c.id DESC LIMIT 30`).all();
  const date = time => new Date(time * 1000).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  return adminHtml`<h1>Campañas de ofertas</h1><p>Preproducción · Entrega simulada. Remitente de prueba: Movility.</p>
    ${result === 'queued' ? adminFragment('<p role="status">Campaña programada.</p>') : ''}
    ${result === 'invalid' ? adminFragment('<p class="form-error" role="alert">Completa ambos idiomas y elige una audiencia confirmada y una fecha válida.</p>') : ''}
    <form class="admin-catalog" method="post" action="/admin/campaigns">
      <input type="hidden" name="request_id" value="${randomUUID()}">
      ${[['de','Alemán'],['fr','Francés']].map(([code,label]) => adminHtml`<fieldset><legend>${adminText(label)}</legend>
        <label>Asunto<input name="subject_${code}" maxlength="160" required></label>
        <label>Mensaje<textarea name="body_${code}" maxlength="3000" required></textarea></label></fieldset>`).join('')}
      <label>Fecha y hora UTC (opcional)<input name="due" type="datetime-local"></label>
      <p>Si dejas la fecha vacía, la cola procesa la campaña en el siguiente ciclo.</p>
      <fieldset><legend>Suscripciones confirmadas (${audience.length})</legend>
      ${audience.map(row => adminHtml`<label><input type="checkbox" name="recipient" value="${escapeHtml(row.email)}"> ${escapeHtml(row.email)} · ${row.locale}</label>`).join('')}
      ${audience.length ? '' : adminFragment('<p>No hay suscripciones confirmadas.</p>')}</fieldset>
      <div class="product-actions"><button name="audience" value="selected">Programar para seleccionados</button>
        <button class="secondary" name="audience" value="all">Programar para todos los suscritos</button></div>
    </form>
    <h2>Historial de campañas</h2>${campaigns.map(c => adminHtml`<article><h3>${escapeHtml(c.subject_de)} / ${escapeHtml(c.subject_fr)}</h3>
      <p>${date(c.due_at)} · Pendientes: ${c.pending} · Simulados: ${c.simulated} · Excluidos: ${c.excluded}</p>
      <details><summary>Ver mensajes</summary><p lang="de-CH">${escapeHtml(c.body_de)}</p><p lang="fr-CH">${escapeHtml(c.body_fr)}</p>
      <p>Cada campaña real incluirá un enlace de baja.</p></details></article>`).join('')}
    <p><a href="/admin">Volver al panel</a></p>`;
}
