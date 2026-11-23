import { randomBytes, timingSafeEqual } from 'node:crypto';
import { linkSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

export function localAdminPassword(file) {
  const read = () => {
    const password = readFileSync(file, 'utf8').trim();
    if (!/^[A-Za-z0-9_-]{24,}$/.test(password)) throw new Error('Invalid local admin password file: ' + file);
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

const permissions = {
  admin: ['catalog', 'stock', 'serials', 'shipping', 'address', 'support', 'finance'],
  warehouse: ['stock', 'serials', 'shipping', 'address'],
  support: ['serials', 'support'],
  finance: ['finance'],
};

export const roleNames = { admin: 'Administración', warehouse: 'Almacén', support: 'Atención al cliente', finance: 'Finanzas' };
export const can = (role, permission) => permissions[role]?.includes(permission) ?? false;

export function adminAuth(passwords) {
  const credentials = Object.keys(permissions).filter(role => passwords[role]).map(role => [
    role, Buffer.from('Basic ' + Buffer.from(role + ':' + passwords[role]).toString('base64')),
  ]);
  return header => {
    const presented = Buffer.from(header || '');
    return credentials.find(([, expected]) => presented.length === expected.length &&
      timingSafeEqual(presented, expected))?.[0];
  };
}

const orderAction = /^\/admin\/[0-9a-f-]{36}\/(ship|refund|stripe-refund|return|tracking)$/;
const orderEmail = /^\/admin\/[0-9a-f-]{36}\/email\/(paid|shipped|refunded|delivered)$/;

export function adminRouteAllowed(role, method, path) {
  if (role === 'admin') return true;
  if (method === 'GET') {
    if (path === '/admin') return true;
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
