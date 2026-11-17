# Nekz WhatsApp AI

Nekz connects as a WhatsApp linked device using Baileys. It can answer private chats with Gemini or OpenAI, keep a short per-contact conversation history, and batch rapid messages into one AI reply. Keep the computer or persistent server running while you want the bot online.

## Setup

### Desktop app (Windows)

Install Node.js 20 or newer, then run:

```sh
npm install
npm run desktop
```

On first launch Nekz opens a setup window for the AI provider and API key, then opens the control dashboard in a desktop window. Use **Connect WhatsApp** and scan the QR code shown in the window from WhatsApp on your phone (**Settings → Linked Devices → Link a Device**). **Disconnect WhatsApp** closes the linked-device session; **Pause bot** only stops automated replies while leaving WhatsApp connected. Use **Setup** in the window to change AI settings later.

To build a Windows installer, run `npm run dist:win`. The installer output is written to `release/`.

The desktop app stores its `.env`, linked-device keys, and chat context in Electron's per-user application data folder. The terminal/server setup below continues to use `.env`, `auth_info/`, and `data/` in the project folder.

1. Install Node.js 20 or newer.
2. Copy `.env.example` to `.env` and set `ADMIN_TOKEN` plus an AI provider key. Gemini is selected by default:

   ```env
   AI_PROVIDER=gemini
   GEMINI_API_KEY=your_key
   GEMINI_MODEL=gemini-3.5-flash-lite
   OWNER_NAME=Nekz
   ```

   Or use OpenAI by setting `AI_PROVIDER=openai` and `OPENAI_API_KEY`.

3. Install dependencies and start Nekz:

   ```sh
   npm install
   npm start
   ```

4. Open `http://localhost:3000`, enter the `ADMIN_TOKEN`, and scan the QR with WhatsApp on your phone: **Settings → Linked Devices → Link a Device**.

The linked-device keys are stored in `auth_info/` and the dashboard state/context is stored in `data/`. Keep both folders private and persistent. Do not commit them. To re-link, stop the app and remove `auth_info/`, then start it and scan the new QR.

## Controls

- Dashboard: use **Pause bot** / **Resume bot**.
- From your own WhatsApp chat: send `!bot on`, `!bot off`, or `!bot status`.
- In a conversation: send `!clear` to erase that contact's stored context.
- To allow a second phone to control the bot, add its WhatsApp number (digits only) to `CONTROL_NUMBERS` and restart. Commands from your linked account are accepted automatically.
- Terminal: `npm run on`, `npm run off`, and `npm run status` control a running local instance.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Dashboard port |
| `HOST` | `0.0.0.0` | Bind address; keep the dashboard protected by `ADMIN_TOKEN` |
| `ADMIN_TOKEN` | required | Protects the dashboard API |
| `AI_PROVIDER` | `gemini` | `gemini` or `openai` |
| `GEMINI_API_KEY` | empty | Google AI Studio API key |
| `GEMINI_MODEL` | `gemini-3.5-flash-lite` | Gemini model name |
| `OPENAI_API_KEY` | empty | OpenAI API key |
| `OPENAI_MODEL` | `gpt-4o-mini` | OpenAI model name |
| `OWNER_NAME` | `Nekz` | Name in the assistant persona |
| `DEBOUNCE_DELAY_MS` | `2500` | Wait before answering a message burst |
| `ENABLE_TYPING_INDICATOR` | `true` | Show composing presence while answering |
| `AUTO_REPLY_GROUPS` | `false` | Allow group chat replies |
| `ALLOWED_NUMBERS` | empty | Optional comma-separated number allowlist |
| `BLOCKED_NUMBERS` | empty | Optional comma-separated number blocklist |
| `CONTROL_NUMBERS` | empty | Numbers allowed to run `!bot on/off/status` from another chat |

For 24/7 use, run this on an always-on computer or a persistent Node service with durable storage for both `auth_info/` and `data/`. Serverless functions do not keep the WhatsApp WebSocket or local session files alive between invocations.

Baileys is a community-maintained WhatsApp Web client and is not affiliated with WhatsApp. WhatsApp may change the protocol or restrict accounts that automate messages. Use this for opted-in, low-volume conversations; avoid spam and protect the linked-device keys as account credentials.
