import { mkdirSync, realpathSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { stripeMode } from '../stripe-payments.mjs';
import { emailTestConfig } from '../resend-mail.mjs';
import { pushConfig } from '../order-push.mjs';
import { publicOrigin } from '../seo.mjs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const localDatabase = fileURLToPath(new URL('../data/staging/staging.sqlite', import.meta.url));
const demoDatabase = fileURLToPath(new URL('../data/demo.sqlite', import.meta.url));

function stagingDatabase() {
  const requested = resolve(process.env.MOVILITY_STAGING_DB || localDatabase);
  const identify = file => {
    try { return realpathSync(file); }
    catch (error) { if (error.code === 'ENOENT') return file; throw error; }
  };
  const normalize = file => process.platform === 'win32' ? identify(file).toLowerCase() : identify(file);
  if (normalize(requested) === normalize(demoDatabase)) {
    throw new Error('MOVILITY_STAGING_DB debe estar separado de la base habitual data/demo.sqlite.');
  }
  return requested;
}

export function stagingEnvironment(database, port, inherited = process.env) {
  if (inherited.MOVILITY_ENABLE_LIVE === '1' || inherited.MOVILITY_STAGE === 'production') {
    throw new Error('Commercial activation is not allowed in the private pilot.');
  }
  const origin = publicOrigin(inherited.MOVILITY_STAGING_ORIGIN);
  const admin = inherited.MOVILITY_STAGING_ADMIN_PASSWORD || '';
  if (origin && !admin.trim()) throw new Error('Configura MOVILITY_STAGING_ADMIN_PASSWORD para el origen HTTPS.');
  const env = {
    ...inherited,
    PORT: String(port),
    MOVILITY_STAGE: 'staging',
    MOVILITY_DB: database,
    MOVILITY_PAYMENT_MODE: inherited.MOVILITY_STAGING_PAYMENT_MODE || 'simulated',
    MOVILITY_STRIPE_SECRET_KEY: inherited.MOVILITY_STAGING_STRIPE_SECRET_KEY || '',
    MOVILITY_STRIPE_WEBHOOK_SECRET: inherited.MOVILITY_STAGING_STRIPE_WEBHOOK_SECRET || '',
    MOVILITY_STRIPE_METHODS: inherited.MOVILITY_STAGING_STRIPE_METHODS || 'card',
    MOVILITY_EMAIL_MODE: inherited.MOVILITY_STAGING_EMAIL_MODE || 'simulated',
    MOVILITY_RESEND_API_KEY: inherited.MOVILITY_STAGING_RESEND_API_KEY || '',
    MOVILITY_EMAIL_FROM: inherited.MOVILITY_STAGING_EMAIL_FROM || '',
    MOVILITY_EMAIL_TEST_TO: inherited.MOVILITY_STAGING_EMAIL_TEST_TO || '',
    MOVILITY_EMAIL_WORKER: 'manual',
    MOVILITY_PUSH_MODE: inherited.MOVILITY_STAGING_PUSH_MODE || 'off',
    MOVILITY_PUSH_PUBLIC_KEY: inherited.MOVILITY_STAGING_PUSH_PUBLIC_KEY || '',
    MOVILITY_PUSH_PRIVATE_KEY: inherited.MOVILITY_STAGING_PUSH_PRIVATE_KEY || '',
    MOVILITY_PUSH_SUBJECT: inherited.MOVILITY_STAGING_PUSH_SUBJECT || '',
    MOVILITY_PUSH_WORKER: '',
    MOVILITY_CARRIER_SECRET: '',
    MOVILITY_PUBLIC_ORIGIN: origin,
    MOVILITY_CONTACT_EMAIL: '',
    MOVILITY_MEDIA_DIR: '',
    MOVILITY_ADMIN_PASSWORD: admin,
    MOVILITY_WAREHOUSE_PASSWORD: '',
    MOVILITY_SUPPORT_PASSWORD: '',
    MOVILITY_FINANCE_PASSWORD: '',
    CODESPACES: 'false',
  };
  stripeMode(env, origin);
  emailTestConfig(env, origin);
  if (env.MOVILITY_PUSH_MODE === 'web-push' && !origin) throw new Error('Web Push externo requiere el origen HTTPS de pruebas.');
  pushConfig(env);
  return env;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.MOVILITY_STAGING_PORT || 3040);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error('MOVILITY_STAGING_PORT debe ser un puerto entre 1024 y 65535.');
    process.exitCode = 1;
  } else {
    let env;
    let database;
    try {
      database = stagingDatabase();
      env = stagingEnvironment(database, port);
    }
    catch (error) { console.error(error.message); process.exitCode = 1; }
    if (!env) process.exit(1);
    mkdirSync(dirname(database), { recursive: true, mode: 0o700 });
    process.chdir(root);
    Object.assign(process.env, env);
    await import('../server.mjs');
  }
}
