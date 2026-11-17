const fs = require('node:fs');
const path = require('node:path');

class Store {
  constructor(dataDir) {
    this.dataDir = dataDir;
    this.file = path.join(dataDir, 'state.json');
    fs.mkdirSync(dataDir, { recursive: true });
    try { this.state = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.state = {}; }
    this.state.enabled = typeof this.state.enabled === 'boolean' ? this.state.enabled : true;
    this.state.messages = Array.isArray(this.state.messages) ? this.state.messages : [];
    this.state.contexts = this.state.contexts && typeof this.state.contexts === 'object' ? this.state.contexts : {};
  }
  save() { const tmp = `${this.file}.tmp`; fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2)); fs.renameSync(tmp, this.file); }
  setEnabled(value) { this.state.enabled = Boolean(value); this.save(); }
  addMessage(message) { this.state.messages.push(message); this.state.messages = this.state.messages.slice(-200); this.save(); }
  recentMessages(limit = 30) { return this.state.messages.slice(-limit); }
  getContext(jid) { return this.state.contexts[jid] || []; }
  addContext(jid, role, text) { const items = this.getContext(jid); items.push({ role, text }); this.state.contexts[jid] = items.slice(-20); this.save(); }
  clearContext(jid) { delete this.state.contexts[jid]; this.save(); }
}
function createStore(dataDir) { return new Store(dataDir); }
module.exports = { createStore };
