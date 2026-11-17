const path = require('node:path');

function createWhatsApp({ config, store, authDir, onState = () => {}, generateReply }) {
  let socket = null;
  let connection = 'disconnected';
  let qr = null;
  let phone = null;
  let manualDisconnect = false;
  let starting = null;
  const pending = new Map();

  function update(extra = {}) { onState({ connection, qr, phone, ...extra }); }
  async function sendText(jid, text) {
    if (!socket || connection !== 'connected') throw new Error('WhatsApp is not connected');
    await socket.sendMessage(jid, { text });
  }
  async function handleBatch(jid, messages, senderNumber) {
    const text = messages.map(m => m.text).join('\n');
    if (!store.state.enabled) return;
    const number = senderNumber || jid.split('@')[0].split(':')[0];
    if (config.allowedNumbers.length && !config.allowedNumbers.includes(number)) return;
    if (config.blockedNumbers.includes(number)) return;
    try {
      if (config.enableTypingIndicator) {
        // Presence is cosmetic; a transient presence error must not prevent a reply.
        try { await socket.sendPresenceUpdate('composing', jid); }
        catch (error) { console.warn('[nekz] typing indicator failed:', error.message); }
        await new Promise(resolve => setTimeout(resolve, 900));
      }
      const answer = await generateReply(config, { text, history: store.getContext(jid) });
      await sendText(jid, answer);
      store.addContext(jid, 'user', text);
      store.addContext(jid, 'assistant', answer);
      store.addMessage({ from: jid, name: messages.at(-1).name || null, text, reply: answer, at: new Date().toISOString() });
    } catch (error) {
      console.error('[nekz] failed to reply:', error.message);
      store.addMessage({ from: jid, text, error: error.message, at: new Date().toISOString() });
    } finally {
      if (config.enableTypingIndicator && socket) socket.sendPresenceUpdate('paused', jid).catch(() => {});
      update();
    }
  }
  function extractText(message) {
    let m = message;
    while (m?.ephemeralMessage || m?.viewOnceMessage || m?.viewOnceMessageV2) m = m.ephemeralMessage?.message || m.viewOnceMessage?.message || m.viewOnceMessageV2?.message;
    const type = m && Object.keys(m).find(key => key.endsWith('Message'));
    const body = type && m[type];
    return m?.conversation || body?.text || body?.caption || body?.conversation || body?.selectedDisplayText || null;
  }
  async function start() {
    if (connection === 'connected' || connection === 'connecting') return;
    if (starting) return starting;
    manualDisconnect = false;
    connection = 'connecting';
    qr = null;
    update();
    starting = (async () => {
    const baileys = await import('@whiskeysockets/baileys');
    const makeWASocket = baileys.default;
    const { state, saveCreds } = await baileys.useMultiFileAuthState(path.resolve(authDir));
    const sock = makeWASocket({ auth: state, printQRInTerminal: false, markOnlineOnConnect: false, syncFullHistory: false, shouldIgnoreJid: jid => jid === 'status@broadcast' });
    socket = sock;
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', ({ connection: next, lastDisconnect, qr: nextQr }) => {
      if (socket !== sock) return;
      if (nextQr) qr = nextQr;
      if (next === 'open') { connection = 'connected'; qr = null; phone = sock.user?.id?.split(':')[0] || null; }
      if (next === 'close') {
        connection = 'disconnected';
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        if (!manualDisconnect && statusCode !== baileys.DisconnectReason.loggedOut) setTimeout(() => start().catch(err => console.error('[nekz] reconnect failed:', err.message)), 3000);
      }
      update();
    });
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        const jid = msg.key?.remoteJid;
        const text = extractText(msg.message);
        if (!jid || !text || jid === 'status@broadcast') continue;
        if (msg.key.fromMe) {
          const command = text.trim().toLowerCase();
          if (command === '!bot on') { store.setEnabled(true); await sendText(jid, 'Nekz auto-replies are ON.'); update(); }
          else if (command === '!bot off') { store.setEnabled(false); await sendText(jid, 'Nekz auto-replies are OFF.'); update(); }
          else if (command === '!bot status') await sendText(jid, `Nekz is ${store.state.enabled ? 'ON' : 'OFF'}. AI: ${config.aiProvider}. Replies sent: ${store.state.messages.filter(m => m.reply).length}.`);
          else if (command === '!clear') { const target = msg.key.remoteJid; store.clearContext(target); await sendText(jid, 'Conversation context cleared.'); }
          continue;
        }
        if (!config.autoReplyGroups && jid.endsWith('@g.us')) continue;
        const number = jid.split('@')[0].split(':')[0];
        const command = text.trim().toLowerCase();
        if (/^!bot (on|off|status)$/.test(command) && config.controlNumbers.includes(number)) {
          if (command === '!bot on' || command === '!bot off') {
            store.setEnabled(command === '!bot on');
            await sendText(jid, `Nekz auto-replies are ${store.state.enabled ? 'ON' : 'OFF'}.`);
            update();
          } else {
            await sendText(jid, `Nekz is ${store.state.enabled ? 'ON' : 'OFF'}. AI: ${config.aiProvider}. Replies sent: ${store.state.messages.filter(m => m.reply).length}.`);
          }
          continue;
        }
        const at = new Date().toISOString();
        store.addMessage({ from: jid, name: msg.pushName || null, text, at });
        if (text.trim().toLowerCase() === '!clear') { store.clearContext(jid); await sendText(jid, 'Conversation context cleared.'); continue; }
        const senderJid = msg.key.senderPn || msg.key.remoteJidAlt;
        const senderNumber = senderJid?.endsWith('@s.whatsapp.net') ? senderJid.split('@')[0].split(':')[0] : null;
        const batch = pending.get(jid) || { messages: [], timer: null, senderNumber };
        if (senderNumber) batch.senderNumber = senderNumber;
        batch.messages.push({ text, name: msg.pushName });
        clearTimeout(batch.timer);
        batch.timer = setTimeout(() => { pending.delete(jid); handleBatch(jid, batch.messages, batch.senderNumber); }, config.debounceDelayMs);
        pending.set(jid, batch);
        update();
      }
    });
    })();
    try { await starting; } finally { starting = null; }
  }
  async function stop() {
    manualDisconnect = true;
    for (const batch of pending.values()) clearTimeout(batch.timer);
    pending.clear();
    const old = socket;
    socket = null;
    qr = null;
    phone = null;
    connection = 'disconnected';
    if (old) { try { old.end(new Error('Disconnected from Nekz dashboard')); } catch {} }
    update();
  }
  return { start, stop, sendText, get connection() { return connection; }, get qr() { return qr; }, get phone() { return phone; }, get repliesSent() { return store.state.messages.filter(m => m.reply).length; } };
}
module.exports = { createWhatsApp };
