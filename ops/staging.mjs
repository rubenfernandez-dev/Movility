import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const localDatabase = fileURLToPath(new URL('../data/staging/staging.sqlite', import.meta.url));

export function stagingEnvironment(database, port, inherited = process.env) {
  return {
    ...inherited,
    PORT: String(port),
    MOVILITY_STAGE: 'staging',
    MOVILITY_DB: database,
    MOVILITY_PAYMENT_MODE: 'simulated',
    MOVILITY_EMAIL_MODE: 'simulated',
    MOVILITY_PUSH_MODE: 'off',
    MOVILITY_CARRIER_SECRET: '',
    MOVILITY_PUBLIC_ORIGIN: '',
    MOVILITY_MEDIA_DIR: '',
    MOVILITY_ADMIN_PASSWORD: inherited.MOVILITY_STAGING_ADMIN_PASSWORD || '',
    MOVILITY_WAREHOUSE_PASSWORD: '',
    MOVILITY_SUPPORT_PASSWORD: '',
    MOVILITY_FINANCE_PASSWORD: '',
    CODESPACES: 'false',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.MOVILITY_STAGING_PORT || 3040);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    console.error('MOVILITY_STAGING_PORT debe ser un puerto entre 1024 y 65535.');
    process.exitCode = 1;
  } else {
    mkdirSync(dirname(localDatabase), { recursive: true, mode: 0o700 });
    const child = spawn(process.execPath, ['server.mjs'], {
      cwd: root, env: stagingEnvironment(localDatabase, port), stdio: 'inherit',
    });
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code ?? 1; });
  }
}
