import { isRecoveryMail } from './mail-queue.mjs';

const resendEndpoint = 'https://api.resend.com/emails';
const email = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}$/i;

export function resendConfig(env, siteOrigin) {
  const mode = env.MOVILITY_EMAIL_MODE || 'simulated';
  const live = mode === 'resend-live';
  const testSettings = [env.MOVILITY_RESEND_API_KEY, env.MOVILITY_EMAIL_FROM, env.MOVILITY_EMAIL_TEST_TO];
  const liveSettings = [env.MOVILITY_RESEND_LIVE_API_KEY, env.MOVILITY_EMAIL_LIVE_FROM];
  if (mode === 'simulated' && !liveSettings.some(Boolean)) return null;
  if (!['resend-test', 'resend-live'].includes(mode) || (live ? testSettings : liveSettings).some(Boolean)) {
    throw new Error('Resend test and commercial settings must not be mixed.');
  }
  const [apiKey, from, to] = (live ? liveSettings : testSettings).map(value => value?.trim());
  if (!apiKey || !email.test(from || '') || (!live && !email.test(to || '')) || !siteOrigin) {
    throw new Error('Resend needs an API key, verified sender, HTTPS public origin and, in test mode, one authorized recipient.');
  }
  if (live && (env.MOVILITY_STAGE !== 'production' || env.MOVILITY_ENABLE_LIVE !== '1')) {
    throw new Error('Resend live requires MOVILITY_STAGE=production and MOVILITY_ENABLE_LIVE=1.');
  }
  return { apiKey, live, target: live ? { mode: 'live', from, origin: siteOrigin } : { from, to, origin: siteOrigin } };
}

export function resendProvider(config, request = fetch) {
  return async message => {
    const stored = message.testTarget;
    if (!config || !stored || ['mode', 'to', 'from', 'origin'].some(field => stored[field] !== config.target[field]) ||
        (config.live && (!email.test(stored.recipient || '') || stored.recipient !== message.email))) {
      return { status: 'permanent' };
    }
    const orderUrl = new URL('/' + message.locale + '/orders/' + message.orderId, stored.origin).href;
    let response;
    try {
      response = await request(resendEndpoint, {
        method: 'POST',
        redirect: 'error',
        signal: AbortSignal.timeout(15000),
        headers: {
          Authorization: 'Bearer ' + config.apiKey,
          'Content-Type': 'application/json',
          'Idempotency-Key': (config.live ? 'movility-live/' : 'movility-test/') + message.key,
        },
        body: JSON.stringify({
          from: stored.from, to: [config.live ? stored.recipient : stored.to], subject: (config.live ? '' : '[TEST] ') + message.subject,
          text: isRecoveryMail(message.kind) ? message.body : message.body + '\n\n' + orderUrl,
        }),
      });
    } catch {
      return { status: 'temporary' };
    }
    const result = await response.json().catch(() => null);
    if (response.ok) return typeof result?.id === 'string' && result.id
      ? { status: 'accepted', reference: result.id } : { status: 'temporary' };
    if ([408, 429].includes(response.status) || response.status >= 500 ||
        (response.status === 409 && result?.name === 'concurrent_idempotent_requests')) return { status: 'temporary' };
    return { status: 'permanent' };
  };
}
