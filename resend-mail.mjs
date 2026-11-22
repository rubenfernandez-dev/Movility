const resendEndpoint = 'https://api.resend.com/emails';
const email = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9.-]*[A-Z0-9])?\.[A-Z]{2,}$/i;

export function emailTestConfig(env, siteOrigin) {
  if (!env.MOVILITY_EMAIL_MODE || env.MOVILITY_EMAIL_MODE === 'simulated') return null;
  if (env.MOVILITY_EMAIL_MODE !== 'resend-test') throw new Error('Unknown MOVILITY_EMAIL_MODE.');
  const apiKey = env.MOVILITY_RESEND_API_KEY?.trim();
  const from = env.MOVILITY_EMAIL_FROM?.trim();
  const to = env.MOVILITY_EMAIL_TEST_TO?.trim();
  if (!apiKey || !email.test(from || '') || !email.test(to || '') || !siteOrigin) {
    throw new Error('Resend test mode needs a key, verified sender, one test recipient and an HTTPS public origin.');
  }
  return { apiKey, target: { from, to, origin: siteOrigin } };
}

export function resendTestProvider(config, request = fetch) {
  return async message => {
    const stored = message.testTarget;
    if (!config || !stored || ['to', 'from', 'origin'].some(field => stored[field] !== config.target[field])) {
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
          'Idempotency-Key': 'movility-test/' + message.key,
        },
        body: JSON.stringify({
          from: stored.from, to: [stored.to], subject: '[TEST] ' + message.subject,
          text: message.body + '\n\n' + orderUrl,
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
