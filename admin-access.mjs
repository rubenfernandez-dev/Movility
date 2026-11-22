import { timingSafeEqual } from 'node:crypto';

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

const orderAction = /^\/admin\/[0-9a-f-]{36}\/(ship|refund|return)$/;
const orderEmail = /^\/admin\/[0-9a-f-]{36}\/email\/(paid|shipped|refunded)$/;

export function adminRouteAllowed(role, method, path) {
  if (role === 'admin') return true;
  if (method === 'GET') {
    if (path === '/admin') return true;
    if (path === '/admin/serials') return can(role, 'serials');
    if (path === '/admin/inventory' || path === '/admin/inventory.csv') return can(role, 'stock');
    if (path === '/admin/accounting' || path === '/admin/accounting.csv') return can(role, 'finance');
    if (orderEmail.test(path)) return can(role, 'support');
  }
  if (method === 'POST') {
    const action = orderAction.exec(path)?.[1];
    if (action) return can(role, action === 'refund' ? 'finance' : 'shipping');
  }
  return false;
}
