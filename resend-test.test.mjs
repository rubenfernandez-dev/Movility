import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emailTestConfig, resendTestProvider } from './resend-mail.mjs';

const env = {
  MOVILITY_EMAIL_MODE: 'resend-test', MOVILITY_RESEND_API_KEY: 'fixture-key',
  MOVILITY_EMAIL_FROM: 'demo@example.com', MOVILITY_EMAIL_TEST_TO: 'test@example.net',
};
const config = emailTestConfig(env, 'https://movility.example');
const message = { key: 'one', subject: 'Commande confirmée', body: 'Corps en français',
  locale: 'fr-CH', orderId: 'test-order', email: 'customer@example.org', testTarget: config.target };

test('external test mail targets only the configured address and uses a stable request key', async () => {
  const calls = [];
  const send = resendTestProvider(config, (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ id: 'provider-fixture' }), { status: 200 });
  });
  assert.equal(emailTestConfig({}, 'https://movility.example'), null);
  assert.throws(() => emailTestConfig({ ...env, MOVILITY_EMAIL_TEST_TO: 'one@test.net,two@test.net' }, 'https://movility.example'));
  assert.equal((await send({ ...message, testTarget: { ...config.target, to: 'other@example.net' } })).status, 'permanent');
  assert.equal(calls.length, 0);
  assert.deepEqual(await send(message), { status: 'accepted', reference: 'provider-fixture' });
  await send(message);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers['Idempotency-Key'], calls[1].options.headers['Idempotency-Key']);
  assert.equal(calls[0].options.body, calls[1].options.body);
  assert.doesNotMatch(calls[0].options.body, /customer@example\.org/);
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    from: 'demo@example.com', to: ['test@example.net'], subject: '[TEST] Commande confirmée',
    text: 'Corps en français\n\nhttps://movility.example/fr-CH/orders/test-order',
  });
});

test('Resend adapter distinguishes retryable errors from rejected requests', async () => {
  for (const [code, name, expected] of [
    [429, '', 'temporary'], [500, '', 'temporary'], [401, '', 'permanent'],
    [409, 'concurrent_idempotent_requests', 'temporary'], [409, 'invalid_idempotent_request', 'permanent'],
  ]) {
    const send = resendTestProvider(config, () => new Response(JSON.stringify({ name }), { status: code }));
    assert.equal((await send(message)).status, expected);
  }
  const broken = resendTestProvider(config, () => { throw new Error('test network error'); });
  assert.equal((await broken(message)).status, 'temporary');
});
