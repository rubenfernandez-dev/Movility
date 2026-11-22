import { createServer } from 'node:http';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { copy, page, money, methods, escapeHtml } from './views.mjs';

const port = Number(process.env.PORT || 3000);
const { CODESPACES, CODESPACE_NAME, GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN } = process.env;
const codespaceHost = CODESPACES === 'true' && CODESPACE_NAME && GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN
  ? `${CODESPACE_NAME}-${port}.${GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`
  : null;
const admin = process.env.MOVILITY_ADMIN_PASSWORD || randomBytes(18).toString('base64url');
const dbPath = process.env.MOVILITY_DB || 'data/demo.sqlite';
if (!process.env.MOVILITY_DB) mkdirSync('data', { recursive: true });
const db = new DatabaseSync(dbPath);
db.exec(`
  PRAGMA busy_timeout = 5000;
  CREATE TABLE IF NOT EXISTS stock (id INTEGER PRIMARY KEY, units INTEGER NOT NULL CHECK (units >= 0));
  INSERT OR IGNORE INTO stock VALUES (1, 1);
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY, email TEXT NOT NULL, locale TEXT NOT NULL, method TEXT NOT NULL,
    cents INTEGER NOT NULL, status TEXT NOT NULL, tracking TEXT
  );
  CREATE TABLE IF NOT EXISTS notices (
    order_id TEXT NOT NULL REFERENCES orders(id), kind TEXT NOT NULL,
    PRIMARY KEY (order_id, kind)
  );
`);

const cents = 249900;
const transaction = (work) => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
};
const stock = () => db.prepare('SELECT units FROM stock WHERE id = 1').get().units;
const notice = (id, kind) => db.prepare('INSERT INTO notices VALUES (?, ?)').run(id, kind);
const orderById = (id) => db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
const adminHeader = 'Basic ' + Buffer.from('admin:' + admin).toString('base64');

function send(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  });
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(303, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

async function form(req) {
  if (!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded')) return null;
  let body = '';
  for await (const part of req) {
    body += part.toString('latin1');
    if (body.length > 4096) return null;
  }
  return new URLSearchParams(Buffer.from(body, 'latin1').toString('utf8'));
}

function adminView() {
  const orders = db.prepare('SELECT * FROM orders ORDER BY rowid DESC').all();
  const labels = { paid: 'Cobrado', shipped: 'Enviado', refunded: 'Reembolsado' };
  const totals = db.prepare(`SELECT COUNT(*) AS quantity, COALESCE(SUM(cents), 0) AS gross,
    COALESCE(SUM(CASE WHEN status = 'refunded' THEN cents ELSE 0 END), 0) AS refunds FROM orders`).get();
  const cards = orders.map((order) => {
    const events = db.prepare('SELECT kind FROM notices WHERE order_id = ? ORDER BY rowid').all(order.id);
    const notices = events.map(({ kind }) => `<li>${copy[order.locale][kind]}</li>`).join('');
    return `<article><h2>${order.id}</h2>
      <p>${escapeHtml(order.email)} · ${order.locale} · ${order.method} · ${labels[order.status]}</p>
      ${order.tracking ? `<p>Seguimiento: ${escapeHtml(order.tracking)}</p>` : ''}
      <h3>Bandeja de correo simulada</h3><ul>${notices}</ul>
      ${order.status === 'paid' ? `<form method="post" action="/admin/${order.id}/ship"><label>Referencia de seguimiento <input name="tracking" required maxlength="80"></label><button>Registrar envío</button></form>` : ''}
      ${order.status !== 'refunded' ? `<form method="post" action="/admin/${order.id}/refund"><button>Reembolsar en la simulación</button></form>` : ''}
    </article>`;
  }).join('');
  return page('es', 'Administración de prueba', `<h1>Administración de prueba</h1>
    <p>Unidades disponibles: ${stock()} · Pedidos: ${totals.quantity}</p>
    <p>Cobros: ${money('es', totals.gross)} · Reembolsos: ${money('es', totals.refunds)} · Neto: ${money('es', totals.gross - totals.refunds)}</p>
    ${cards || '<p>Todavía no hay pedidos.</p>'}`);
}

const server = createServer(async (req, res) => {
  try {
    const activePort = server.address().port;
    const localHosts = [`127.0.0.1:${activePort}`, `localhost:${activePort}`];
    if (!localHosts.includes(req.headers.host) && req.headers.host !== codespaceHost) {
      return send(res, 403, 'Forbidden');
    }
    const path = new URL(req.url, 'http://localhost').pathname;
    const [, first, second, third] = path.split('/');
    const locale = Object.hasOwn(copy, first) ? first : 'de-CH';
    const t = copy[locale];
    const render = (body, status = 200) => send(res, status, page(locale, t.title, body));
    const origin = req.headers.origin;
    const sameOrigin = localHosts.includes(req.headers.host) && origin === `http://${req.headers.host}`;
    const codespaceOrigin = codespaceHost && origin === `https://${codespaceHost}`;
    if (req.method === 'POST' && !sameOrigin && !codespaceOrigin) {
      return send(res, 403, 'Forbidden');
    }
    if (first === 'admin') {
      if (req.headers.authorization !== adminHeader) {
        res.setHeader('WWW-Authenticate', 'Basic realm="Movility local demo", charset="UTF-8"');
        return send(res, 401, 'Authentication required');
      }
      if (req.method === 'GET' && path === '/admin') return send(res, 200, adminView());
      if (req.method === 'POST' && /^\/admin\/[0-9a-f-]{36}\/(ship|refund)$/.test(path)) {
        const fields = await form(req);
        const tracking = fields?.get('tracking')?.trim();
        if (!fields || (third === 'ship' && (!tracking || tracking.length > 80))) return send(res, 400, 'Datos incorrectos');
        const found = transaction(() => {
          const order = orderById(second);
          if (!order) return false;
          if (third === 'ship' && order.status === 'paid') {
            db.prepare("UPDATE orders SET status = 'shipped', tracking = ? WHERE id = ?").run(tracking, second);
            notice(second, 'shipped');
          }
          if (third === 'refund' && order.status !== 'refunded') {
            db.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?").run(second);
            if (order.status === 'paid') db.exec('UPDATE stock SET units = units + 1 WHERE id = 1');
            notice(second, 'refunded');
          }
          return true;
        });
        return found ? redirect(res, '/admin') : send(res, 404, 'Pedido desconocido');
      }
    }
    if (req.method === 'GET' && path === '/') return redirect(res, '/de-CH');
    if (req.method === 'GET' && path === `/${locale}`) {
      return render(`<section class="product"><div class="specimen" aria-hidden="true"><span>M</span></div><div>
        <p class="eyebrow">${t.category}</p><h1>Movility One</h1><p>${t.description}</p>
        <p class="price">${money(locale, cents)}</p>
        ${stock() > 0 ? `<a class="button" href="/${locale}/checkout">${t.checkout}</a>` : `<p>${t.soldOut}</p>`}
        </div></section>`);
    }
    if (req.method === 'GET' && path === `/${locale}/checkout`) {
      const id = randomUUID();
      return render(`<h1>${t.checkout}</h1><p>Movility One · ${money(locale, cents)}</p>
        <form method="post" action="/${locale}/checkout">
          <input type="hidden" name="id" value="${id}">
          <label>${t.email}<input type="email" name="email" required maxlength="254" placeholder="demo@example.com"></label>
          <fieldset><legend>${t.method}</legend>${methods.map((method) => `<label class="option"><input type="radio" name="method" value="${method}" required> ${method}</label>`).join('')}</fieldset>
          <button name="result" value="paid">${t.pay}</button>
          <button class="secondary" name="result" value="failed">${t.fail}</button>
        </form>`);
    }
    if (req.method === 'POST' && path === `/${locale}/checkout`) {
      const fields = await form(req);
      const id = fields?.get('id') || '';
      const email = fields?.get('email')?.trim() || '';
      const method = fields?.get('method');
      const result = fields?.get('result');
      if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id) ||
          email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          !methods.includes(method) || !['paid', 'failed'].includes(result)) {
        return render(`<h1>${t.invalid}</h1><a href="/${locale}/checkout">${t.retry}</a>`, 400);
      }
      if (result === 'failed') return render(`<h1>${t.failed}</h1><a href="/${locale}/checkout">${t.retry}</a>`);
      const outcome = transaction(() => {
        const existing = orderById(id);
        if (existing) return existing.email === email && existing.method === method && existing.locale === locale ? 'ok' : 'conflict';
        const updated = db.prepare('UPDATE stock SET units = units - 1 WHERE id = 1 AND units > 0').run();
        if (!updated.changes) return 'out';
        db.prepare("INSERT INTO orders VALUES (?, ?, ?, ?, ?, 'paid', NULL)").run(id, email, locale, method, cents);
        notice(id, 'paid');
        return 'ok';
      });
      if (outcome === 'ok') return redirect(res, `/${locale}/orders/${id}`);
      return render(`<h1>${outcome === 'out' ? t.soldOut : t.invalid}</h1><a href="/${locale}">${t.catalog}</a>`, 409);
    }
    if (req.method === 'GET' && second === 'orders' && first === locale && path === `/${locale}/orders/${third}`) {
      const order = orderById(third);
      if (order) return render(`<h1>${t[order.status]}</h1><p>Movility One · ${money(locale, order.cents)}</p>
        ${order.tracking ? `<p>${t.tracking} ${escapeHtml(order.tracking)}</p>` : ''}
        <a href="/${locale}">${t.catalog}</a>`);
    }
    return render(`<h1>404</h1><a href="/${locale}">${t.catalog}</a>`, 404);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) send(res, 500, 'Internal server error');
    else res.end();
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Movility: http://127.0.0.1:${server.address().port}`);
  console.log('Administración local (/admin): admin / ' + admin);
});
