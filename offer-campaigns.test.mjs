import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { setupOffers, requestOffers, confirmOffers, stopOffers } from './offers.mjs';
import { setupCampaigns, queueCampaign, processCampaigns } from './offer-campaigns.mjs';

test('campaigns capture confirmed audiences and exclude withdrawals before processing', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  setupOffers(db);
  setupCampaigns(db);
  const one = 'one@example.com';
  const two = 'two@example.com';
  const pending = 'pending@example.com';
  for (const [address, locale] of [[one, 'de-CH'], [two, 'fr-CH'], [pending, 'fr-CH']]) {
    requestOffers(db, address, locale, false);
    if (address !== pending) confirmOffers(db, address,
      db.prepare('SELECT challenge_preview FROM offer_subscriptions WHERE email=?').get(address).challenge_preview);
  }
  const template = { subject_de: 'Angebot', body_de: 'Testinhalt', subject_fr: 'Offre', body_fr: 'Contenu test',
    due: '2027-01-01T12:00' };
  const time = Date.parse(template.due + ':00Z') / 1000;
  const all = new URLSearchParams({ ...template, audience: 'all', request_id: randomUUID() });
  assert.equal(queueCampaign(db, all, time - 60), true);
  assert.equal(queueCampaign(db, all, time - 60), true);
  const selected = new URLSearchParams({ ...template, audience: 'selected', request_id: randomUUID() });
  selected.append('recipient', one);
  selected.append('recipient', pending);
  assert.equal(queueCampaign(db, selected, time - 60), true);
  assert.equal(processCampaigns(db, time - 1), 0);
  stopOffers(db, two, '');
  assert.equal(processCampaigns(db, time), 3);
  assert.equal(processCampaigns(db, time), 0);
  const rows = db.prepare('SELECT campaign_id,email,locale,state FROM offer_deliveries ORDER BY campaign_id,email').all();
  assert.deepEqual(rows.map(row => [row.campaign_id, row.email, row.locale, row.state]), [
    [1, one, 'de-CH', 'simulated'], [1, two, 'fr-CH', 'excluded'], [2, one, 'de-CH', 'simulated'],
  ]);
});
