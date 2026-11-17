const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

function createConnection(dataDir, secret) {
  const file = path.join(dataDir, 'whatsapp-connection.json');
  const key = crypto.createHash('sha256').update(String(secret)).digest();

  function load() {
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(saved.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(saved.tag, 'base64'));
      const token = Buffer.concat([
        decipher.update(Buffer.from(saved.data, 'base64')),
        decipher.final()
      ]).toString('utf8');
      return {
        token,
        phoneNumberId: saved.phoneNumberId,
        messagingAccountId: saved.messagingAccountId,
        expiresAt: saved.expiresAt || null
      };
    } catch {
      return null;
    }
  }

  function save(connection) {
    fs.mkdirSync(dataDir, { recursive: true });
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([cipher.update(connection.token, 'utf8'), cipher.final()]);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify({
      phoneNumberId: connection.phoneNumberId,
      messagingAccountId: connection.messagingAccountId,
      expiresAt: connection.expiresAt || null,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64')
    }), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  function clear() {
    try { fs.unlinkSync(file); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  }

  return { load, save, clear };
}

module.exports = { createConnection };
