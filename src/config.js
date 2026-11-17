const path = require('node:path');
const { loadEnv } = require('./env');

loadEnv(path.join(__dirname, '..', '.env'));
function env(name, fallback = '') { return process.env[name] === undefined || process.env[name] === '' ? fallback : process.env[name]; }
function buildConfig() {
  const port = Number(env('PORT', '3000'));
  const provider = env('AI_PROVIDER', 'gemini').toLowerCase();
  const missing = [];
  if (!process.env.ADMIN_TOKEN) missing.push('ADMIN_TOKEN');
  if (provider === 'gemini' && !process.env.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
  if (provider === 'openai' && !process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if (!['gemini', 'openai'].includes(provider)) missing.push('AI_PROVIDER must be gemini or openai');
  return { config: {
    port: Number.isFinite(port) && port > 0 ? port : 3000,
    host: env('HOST', '0.0.0.0'),
    adminToken: env('ADMIN_TOKEN'),
    aiProvider: provider,
    geminiApiKey: env('GEMINI_API_KEY'),
    geminiModel: env('GEMINI_MODEL', 'gemini-3.5-flash-lite'),
    openaiApiKey: env('OPENAI_API_KEY'),
    openaiModel: env('OPENAI_MODEL', 'gpt-4o-mini'),
    openaiBaseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com/v1'),
    ownerName: env('OWNER_NAME', 'Nekz'),
    debounceDelayMs: Math.max(250, Number(env('DEBOUNCE_DELAY_MS', '2500')) || 2500),
    enableTypingIndicator: env('ENABLE_TYPING_INDICATOR', 'true') !== 'false',
    autoReplyGroups: env('AUTO_REPLY_GROUPS', 'false') === 'true',
    allowedNumbers: env('ALLOWED_NUMBERS').split(',').map(x => x.trim()).filter(Boolean),
    blockedNumbers: env('BLOCKED_NUMBERS').split(',').map(x => x.trim()).filter(Boolean),
    controlNumbers: env('CONTROL_NUMBERS').split(',').map(x => x.trim()).filter(Boolean)
  }, missing };
}
module.exports = { buildConfig };
