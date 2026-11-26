const stripeTest = process.argv.includes('--stripe-test');
const raw = process.argv.slice(2).find(value => value !== '--stripe-test') || 'http://127.0.0.1:3040';

async function verify() {
  const origin = new URL(raw);
  if (!['127.0.0.1', 'localhost'].includes(origin.hostname) || origin.protocol !== 'http:' ||
      origin.pathname !== '/' || origin.search || origin.hash || origin.username || origin.password) {
    throw new Error('Usa el origen HTTP local de la instancia de preproducción.');
  }
  const request = (path, options) => fetch(new URL(path, origin), {
    redirect: 'manual', signal: AbortSignal.timeout(5000), ...options,
  });
  const check = (condition, label) => {
    if (!condition) throw new Error('No se cumple: ' + label);
    console.log('OK ' + label);
  };
  const health = await request('/healthz');
  check(health.ok && (await health.json()).result === 'ok', 'servidor y consulta de inventario disponibles');
  for (const locale of ['de-CH', 'fr-CH']) {
    const page = await request('/' + locale);
    const html = await page.text();
    check(page.ok && html.includes('lang="' + locale + '"') && html.includes('qa-chair') &&
      html.includes(locale === 'de-CH' ? 'Nur fiktive Daten' : 'Données fictives uniquement'), 'preproducción ' + locale);
    check(page.headers.get('x-robots-tag')?.includes('noindex'), 'protección contra indexación ' + locale);
  }
  for (const integration of ['stripe', 'carrier']) {
    const endpoint = await request('/integrations/' + integration + '/events', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    const expectsSignature = integration === 'stripe' && stripeTest;
    check(endpoint.status === (expectsSignature ? 401 : 404) &&
      (await endpoint.json()).result === (expectsSignature ? 'unauthorized' : 'disabled'),
    integration + (expectsSignature ? ' rechaza avisos sin firma' : ' desactivado'));
  }
  const admin = await request('/admin');
  check(admin.status === 401 && admin.headers.has('www-authenticate'), 'panel protegido sin credenciales');
}

verify().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
