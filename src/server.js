const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { buildConfig } = require('./config');
const { createStore } = require('./store');
const { createWhatsApp } = require('./whatsapp');
const { generateReply } = require('./reply');

function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }
function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 8192) { reject(new Error('request too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { reject(new Error('invalid json')); } });
    req.on('error', reject);
  });
}
function tokenMatches(a, b) {
  if (!a || !b) return false;
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());
}
function createApp({ config, store, whatsapp, qrCode }) {
  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/panel')) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(fs.readFileSync(path.join(__dirname, 'panel.html')));
    }
    if (url.pathname === '/health' && req.method === 'GET') return json(res, 200, { ok: true });
    if (!url.pathname.startsWith('/api/')) return json(res, 404, { error: 'not found' });
    if (!tokenMatches(req.headers['x-admin-token'], config.adminToken)) return json(res, 401, { error: 'unauthorized' });
    if (req.method === 'GET' && url.pathname === '/api/status') {
      const qr = whatsapp.qr ? await qrCode.toDataURL(whatsapp.qr, { width: 260, margin: 1 }) : null;
      return json(res, 200, { enabled: store.state.enabled, connection: whatsapp.connection, connected: whatsapp.connection === 'connected', phone: whatsapp.phone, qr, provider: config.aiProvider, repliesSent: whatsapp.repliesSent, recentMessages: store.recentMessages(40) });
    }
    if (req.method === 'POST' && url.pathname === '/api/connection') {
      let body;
      try { body = await readJson(req); } catch { return json(res, 400, { error: 'invalid json' }); }
      if (typeof body.connected !== 'boolean') return json(res, 400, { error: 'connected must be true or false' });
      if (body.connected) await whatsapp.start();
      else await whatsapp.stop();
      return json(res, 200, { connection: whatsapp.connection });
    }
    if (req.method === 'POST' && url.pathname === '/api/toggle') {
      let body;
      try { body = await readJson(req); }
      catch { return json(res, 400, { error: 'invalid json' }); }
      if (typeof body.enabled !== 'boolean') return json(res, 400, { error: 'enabled must be true or false' });
      store.setEnabled(body.enabled);
      return json(res, 200, { enabled: store.state.enabled });
    }
    return json(res, 404, { error: 'not found' });
  };
}

function start() {
  const { config, missing } = buildConfig();
  if (missing.length) throw new Error(`Missing or invalid environment settings: ${missing.join(', ')}`);
  const dataDir = process.env.NEKZ_DATA_DIR || path.join(__dirname, '..', 'data');
  const authDir = process.env.NEKZ_AUTH_DIR || path.join(__dirname, '..', 'auth_info');
  const store = createStore(dataDir);
  const qrCode = require('qrcode');
  const whatsapp = createWhatsApp({ config, store, authDir, generateReply });
  const app = createApp({ config, store, whatsapp, qrCode });
  const server = http.createServer((req, res) => app(req, res).catch(err => { console.error('[nekz] request failed:', err.message); if (!res.headersSent) json(res, 500, { error: 'internal error' }); else res.end(); }));
  server.listen(config.port, config.host, () => console.log(`[nekz] dashboard at http://localhost:${config.port}`));
  whatsapp.start().catch(err => { console.error('[nekz] WhatsApp startup failed:', err.message); process.exitCode = 1; });
  return server;
}
if (require.main === module) start();
module.exports = { createApp, start };
