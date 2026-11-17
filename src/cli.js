const path = require('node:path');
const { loadEnv } = require('./env');
loadEnv(path.join(__dirname, '..', '.env'));

const command = String(process.argv[2] || 'status').toLowerCase();
const token = process.env.ADMIN_TOKEN;
const base = `http://127.0.0.1:${process.env.PORT || '3000'}`;
async function call(pathname, options = {}) {
  const response = await fetch(`${base}${pathname}`, { ...options, headers: { 'x-admin-token': token, ...(options.headers || {}) }, signal: AbortSignal.timeout(5000) });
  const data = await response.json();
  if (!response.ok) throw new Error(response.status === 401 ? 'Wrong ADMIN_TOKEN.' : data.error || `Request failed (${response.status}).`);
  return data;
}
async function main() {
  if (!token) throw new Error('ADMIN_TOKEN is missing from .env');
  if (command === 'on' || command === 'off') {
    const result = await call('/api/toggle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: command === 'on' }) });
    console.log(`Nekz auto-replies ${result.enabled ? 'ON' : 'OFF'}.`);
  } else if (command === 'status') {
    const status = await call('/api/status');
    console.log(`Nekz: ${status.enabled ? 'ON' : 'OFF'}`);
    console.log(`WhatsApp: ${status.connection}${status.phone ? ` (+${status.phone})` : ''}`);
    console.log(`AI: ${status.provider}; replies sent: ${status.repliesSent}`);
  } else throw new Error('Usage: node src/cli.js on|off|status');
}
main().catch(error => { console.error(/fetch failed|ECONNREFUSED/i.test(error.message) ? 'Nekz is not running. Start it with: npm start' : error.message); process.exitCode = 1; });
