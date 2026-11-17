const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../src/server');
const { createStore } = require('../src/store');

function makeConfig(overrides = {}) {
  return {
    appSecret: 'test-secret',
    verifyToken: 'test-verify',
    adminToken: 'test-admin-token',
    ownerName: 'Sam',
    assistantName: 'NEKZ',
    autoSend: true,
    awayMode: true,
    awayStart: '',
    awayEnd: '',
    replyCooldownMs: 60000,
    ...overrides
  };
}

function makePayload({ id = 'wamid.1', from = '2348000000000', text = 'Hello there', name = 'Ada', type = 'text' } = {}) {
  const message = { from, id, timestamp: '1700000000', type };
  if (type === 'text') message.text = { body: text };

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '1',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550000000', phone_number_id: '123' },
              contacts: [{ profile: { name }, wa_id: from }],
              messages: [message]
            }
          }
        ]
      }
    ]
  };
}

function sign(body, secret) {
  return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
}

function waitFor(check, timeout = 2000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(() => {
      let done = false;
      try {
        done = Boolean(check());
      } catch {
        done = false;
      }
      if (done) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeout) {
        clearInterval(timer);
        reject(new Error('timed out waiting for condition'));
      }
    }, 20);
  });
}

function startServer(t, config, generate) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nekz-test-'));
  const store = createStore(dataDir, { away: config.awayMode, lastReplyAt: {} });
  const sent = [];
  const read = [];
  const whatsapp = {
    async sendText(to, body) {
      sent.push({ to, body });
    },
    async markRead(id) {
      read.push(id);
    }
  };
  const generator =
    generate ||
    (async () => 'Thanks for reaching out. Sam will follow up with you soon.');
  const app = createApp({ config, store, whatsapp, generateReply: generator });
  const server = http.createServer((req, res) => {
    app(req, res);
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      t.after(() => {
        server.close();
        fs.rmSync(dataDir, { recursive: true, force: true });
      });
      resolve({ port: server.address().port, sent, read, store, dataDir });
    });
  });
}

async function postWebhook(port, payload, secret = 'test-secret') {
  const body = JSON.stringify(payload);
  return fetch(`http://127.0.0.1:${port}/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-hub-signature-256': sign(body, secret)
    },
    body
  });
}

test('serves the local control panel', async (t) => {
  const ctx = await startServer(t, makeConfig());

  const response = await fetch(`http://127.0.0.1:${ctx.port}/panel`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /NEKZ control panel/);
});

test('GET /webhook verifies the token', async (t) => {
  const ctx = await startServer(t, makeConfig());

  const ok = await fetch(
    `http://127.0.0.1:${ctx.port}/webhook?hub.mode=subscribe&hub.verify_token=test-verify&hub.challenge=abc123`
  );
  assert.equal(ok.status, 200);
  assert.equal(await ok.text(), 'abc123');

  const bad = await fetch(
    `http://127.0.0.1:${ctx.port}/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=abc123`
  );
  assert.equal(bad.status, 403);
});

test('rejects webhooks without a valid signature', async (t) => {
  const ctx = await startServer(t, makeConfig());

  const unsigned = await fetch(`http://127.0.0.1:${ctx.port}/webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(makePayload())
  });
  assert.equal(unsigned.status, 401);

  const wrong = await postWebhook(ctx.port, makePayload(), 'wrong-secret');
  assert.equal(wrong.status, 401);

  await new Promise((resolve) => setTimeout(resolve, 100));
  assert.equal(ctx.sent.length, 0);
});

test('answers a new text message once and marks it read', async (t) => {
  const ctx = await startServer(t, makeConfig());

  const response = await postWebhook(ctx.port, makePayload());
  assert.equal(response.status, 200);

  await waitFor(() => ctx.sent.length === 1);
  assert.equal(ctx.sent[0].to, '2348000000000');
  assert.match(ctx.sent[0].body, /Thanks for reaching out/);
  assert.match(ctx.sent[0].body, /This is an automated assistant for Sam/);

  await waitFor(() => ctx.read.length === 1);
  assert.ok(ctx.store.state.lastReplyAt['2348000000000'] > 0);
});

test('ignores duplicate message ids and users inside the cooldown', async (t) => {
  const ctx = await startServer(t, makeConfig());

  await postWebhook(ctx.port, makePayload({ id: 'wamid.a' }));
  await waitFor(() => ctx.sent.length === 1);

  await postWebhook(ctx.port, makePayload({ id: 'wamid.a' }));
  await postWebhook(ctx.port, makePayload({ id: 'wamid.b', text: 'Second message' }));
  await new Promise((resolve) => setTimeout(resolve, 200));

  assert.equal(ctx.sent.length, 1);
});

test('ignores non-text messages', async (t) => {
  const ctx = await startServer(t, makeConfig());

  await postWebhook(ctx.port, makePayload({ id: 'wamid.img', type: 'image' }));
  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.equal(ctx.sent.length, 0);
  assert.equal(ctx.store.recentMessages(5).length, 1);
});

test('saves drafts instead of sending when autoSend is off', async (t) => {
  const ctx = await startServer(t, makeConfig({ autoSend: false }));

  await postWebhook(ctx.port, makePayload({ id: 'wamid.draft' }));
  await new Promise((resolve) => setTimeout(resolve, 150));

  assert.equal(ctx.sent.length, 0);
  const drafts = ctx.store.readLog('drafts', 5);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0].to, '2348000000000');
  assert.equal(drafts[0].text, 'Hello there');
});

test('admin can pause the assistant and inspect status', async (t) => {
  const ctx = await startServer(t, makeConfig());
  const adminHeader = { 'x-admin-token': 'test-admin-token' };

  await postWebhook(ctx.port, makePayload({ id: 'wamid.c' }));
  await waitFor(() => ctx.sent.length === 1);

  const paused = await fetch(`http://127.0.0.1:${ctx.port}/admin/away`, {
    method: 'POST',
    headers: { ...adminHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ away: false })
  });
  assert.equal(paused.status, 200);
  assert.equal(ctx.store.state.away, false);

  await postWebhook(ctx.port, makePayload({ id: 'wamid.d', from: '2348000000001' }));
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal(ctx.sent.length, 1);

  const status = await fetch(`http://127.0.0.1:${ctx.port}/admin/status`, { headers: adminHeader });
  assert.equal(status.status, 200);
  const data = await status.json();
  assert.equal(data.away, false);
  assert.ok(Array.isArray(data.recentMessages));
});

test('admin endpoints require the admin token', async (t) => {
  const ctx = await startServer(t, makeConfig());

  const noToken = await fetch(`http://127.0.0.1:${ctx.port}/admin/status`);
  assert.equal(noToken.status, 401);

  const wrongToken = await fetch(`http://127.0.0.1:${ctx.port}/admin/status`, {
    headers: { 'x-admin-token': 'wrong' }
  });
  assert.equal(wrongToken.status, 401);
});
