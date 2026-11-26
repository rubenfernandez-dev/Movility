import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { linkSync, readFileSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';

const encodedPassword = /^scrypt\$([0-9a-f]{32})\$([0-9a-f]{64})$/;
const sameBytes = (left, right) => left.length === right.length && timingSafeEqual(left, right);

export function localAdminPassword(file) {
  const read = () => {
    const password = readFileSync(file, 'utf8').trim();
    if (!/^[A-Za-z0-9_-]{24,}$/.test(password) && !encodedPassword.test(password)) {
      throw new Error('Invalid local admin password file: ' + file);
    }
    return password;
  };
  try {
    return read();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const password = randomBytes(24).toString('base64url');
  const temp = file + '.' + randomBytes(8).toString('hex') + '.tmp';
  writeFileSync(temp, password + '\n', { flag: 'wx', mode: 0o600 });
  try {
    linkSync(temp, file);
    return password;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return read();
  } finally {
    unlinkSync(temp);
  }
}

export function verifyLocalAdminPassword(password, credential) {
  if (!password || Buffer.byteLength(password) > 256) return false;
  const encoded = encodedPassword.exec(credential);
  return encoded ? sameBytes(scryptSync(password, Buffer.from(encoded[1], 'hex'), 32), Buffer.from(encoded[2], 'hex'))
    : sameBytes(Buffer.from(password), Buffer.from(credential));
}

export function encodeAdminPassword(password) {
  const salt = randomBytes(16);
  return 'scrypt$' + salt.toString('hex') + '$' + scryptSync(password, salt, 32).toString('hex');
}

export function changeLocalAdminPassword(file, password) {
  const credential = encodeAdminPassword(password);
  const temp = file + '.' + randomBytes(8).toString('hex') + '.tmp';
  writeFileSync(temp, credential + '\n', { flag: 'wx', mode: 0o600 });
  try {
    renameSync(temp, file);
  } finally {
    rmSync(temp, { force: true });
  }
  return credential;
}

const permissions = {
  admin: ['catalog', 'stock', 'serials', 'shipping', 'address', 'support', 'finance'],
  warehouse: ['stock', 'serials', 'shipping', 'address'],
  support: ['serials', 'support'],
  finance: ['finance'],
};

export const roleNames = { admin: 'Administración', warehouse: 'Almacén', support: 'Atención al cliente', finance: 'Finanzas' };
export const can = (role, permission) => permissions[role]?.includes(permission) ?? false;

export function adminAuth(passwords, localCredential) {
  const credentials = Object.keys(permissions).filter(role => passwords[role]).map(role => [
    role, Buffer.from('Basic ' + Buffer.from(role + ':' + passwords[role]).toString('base64')),
  ]);
  return header => {
    const presented = Buffer.from(header || '');
    const role = credentials.find(([, expected]) => sameBytes(presented, expected))?.[0];
    if (role || !localCredential || !header?.startsWith('Basic ') || header.length > 370) return role;
    const value = Buffer.from(header.slice(6), 'base64').toString('utf8');
    return value.startsWith('admin:') && verifyLocalAdminPassword(value.slice(6), localCredential()) ? 'admin' : undefined;
  };
}

const orderAction = /^\/admin\/[0-9a-f-]{36}\/(ship|refund|stripe-refund|return|tracking)$/;
const orderEmail = /^\/admin\/[0-9a-f-]{36}\/email\/(paid|shipped|refunded|delivered)$/;

export function adminRouteAllowed(role, method, path) {
  if (role === 'admin') return true;
  if (path === '/admin/contact' && ['GET', 'POST'].includes(method)) return can(role, 'support');
  if (method === 'GET') {
    if (path === '/admin') return true;
    if (/^\/admin\/orders(?:\/[0-9a-f-]{36})?$/.test(path)) return true;
    if (path === '/admin/serials') return can(role, 'serials');
    if (path === '/admin/inventory' || path === '/admin/inventory.csv') return can(role, 'stock');
    if (['/admin/accounting', '/admin/accounting.csv', '/admin/analytics', '/admin/stripe'].includes(path)) return can(role, 'finance');
    if (path === '/admin/mail') return can(role, 'support');
    if (orderEmail.test(path)) return can(role, 'support');
    if (/^\/admin\/[0-9a-f-]{36}\/document\/(invoice|credit)$/.test(path)) return can(role, 'finance');
  }
  if (method === 'POST') {
    const action = orderAction.exec(path)?.[1];
    if (action) return can(role, ['refund', 'stripe-refund'].includes(action) ? 'finance' : 'shipping');
  }
  return false;
}
