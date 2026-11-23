import { closeSync, mkdirSync, mkdtempSync, openSync, readdirSync, rmdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const requiredTables = ['orders', 'stock', 'catalog', 'extra_models', 'payment_entries', 'stock_movements'];

function openReadOnly(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

export function verifyDatabase(path) {
  const db = openReadOnly(path);
  try {
    const integrity = db.prepare('PRAGMA integrity_check').all();
    if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('La integridad de SQLite no es válida.');
    if (db.prepare('PRAGMA foreign_key_check').get()) throw new Error('Hay referencias sin registro asociado.');
    const tables = new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type = 'table'").all().map(row => row.name));
    if (requiredTables.some(name => !tables.has(name))) throw new Error('Faltan tablas de Movility.');
  } finally {
    db.close();
  }
}

function copyDatabase(source, destination) {
  const db = openReadOnly(source);
  try {
    closeSync(openSync(destination, 'wx', 0o600));
    try {
      db.prepare('VACUUM INTO ?').run(destination);
      verifyDatabase(destination);
    } catch (error) {
      rmSync(destination, { force: true });
      throw error;
    }
  } finally {
    db.close();
  }
}

export function backupDatabase(source, directory) {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replaceAll(':', '-');
  const folder = mkdtempSync(join(directory, 'movility-' + stamp + '-'));
  const backup = join(folder, 'backup.sqlite');
  try {
    copyDatabase(source, backup);
    return backup;
  } catch (error) {
    if (!readdirSync(folder).length) rmdirSync(folder);
    throw error;
  }
}

export function restoreDatabase(backup, destination) {
  verifyDatabase(backup);
  mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
  copyDatabase(backup, destination);
  return destination;
}

function main([action, source, destination]) {
  if (action === 'backup' && !destination) {
    const active = process.env.MOVILITY_DB || 'data/demo.sqlite';
    if (active === ':memory:') throw new Error('La base en memoria no se puede copiar desde otro proceso.');
    console.log('Copia verificada: ' + backupDatabase(resolve(active), resolve(source || 'data/backups')));
  } else if (action === 'verify' && source && !destination) {
    verifyDatabase(resolve(source));
    console.log('Copia verificada.');
  } else if (action === 'restore' && source && destination) {
    console.log('Base recuperada y verificada: ' + restoreDatabase(resolve(source), resolve(destination)));
  } else {
    throw new Error('Uso: backup [carpeta], verify <copia>, restore <copia> <archivo-nuevo>');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
