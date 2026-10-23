# Lalakum Salma

A Discord bot that is one thing only: **Lalakum Salma** — a half-Moroccan,
half-Japanese Gemini Live persona with a catastrophic Gojo obsession, an MMA
ego, and a Moroccan mouth. She reads selected channels, follows the
conversation, and decides for herself whether to reply, drop a sticker, react,
or stay quiet.

There are no levels, XP, tickets, roles, automod, welcome messages, or slash
commands. Just the persona and its dashboard.

## What it does

- **Live conversation** — batches messages per channel, builds a rolling
  history, and asks a Gemini Live session what Salma would do next.
- **Real decisions** — the model calls `send_message`, `send_sticker` or
  `stay_silent`. Native replies are a model choice, not a fixed setting.
- **Darija in Arabizi** — enforced by the character prompt and the runtime
  contract. Arabic script is never used.
- **Multimodal input** — image and GIF attachments (plus Discord/Tenor/Giphy/
  Imgur GIF links) are sent to the model as visual input.
- **Tools** — recent messages, history search, member/server/channel/voice
  info, current time, emoji and sticker lists, reactions, and durable memory
  notes (`recall_facts` / `remember_fact`).
- **Safe pacing** — per-channel batching, a decision cooldown, a reply
  cooldown, an hourly reply cap, and a hard timeout. Every failure is silence,
  never a late message.
- **Dashboard** — a local control panel for the persona, prompt, channels,
  secrets, dry-run testing, and memory. Saving is live; no restart needed.

## Requirements

- Node.js 20+
- A Discord application with a bot token
- A Gemini API key with access to `gemini-3.8-live`
- **Server Members** and **Message Content** privileged intents enabled in the
  Developer Portal
- Permissions: View Channels, Send Messages, Read Message History, Add
  Reactions (used by the reaction tool)

## Setup

```bash
npm install
copy .env.example .env      # Windows
# cp .env.example .env      # macOS / Linux
```

Fill in `.env`:

```env
BOT_TOKEN=...
GEMINI_API_KEY=...
GUILD_ID=...                # optional; first server is used if empty
DASHBOARD_ENABLED=true
DASHBOARD_HOST=127.0.0.1
DASHBOARD_PORT=3000
DASHBOARD_PASSWORD=         # optional on loopback, required otherwise
```

Then run:

```bash
npm run dev
```

Open <http://127.0.0.1:3000>, go to **Salma Persona**, pick the channels she
should live in, and enable her. The first save writes `config.json`.

### Dashboard settings

- **Overview** — bot/guild status, uptime, memory count, quick toggles.
- **Salma Persona** — model, thinking level, temperature, timeout, channels,
  history size, batching, cooldowns, reply cap, prompt, dry-run test, memory
  reset.
- **Advanced** — write-only secret fields, raw JSON editor, environment info.

`config.json` is runtime state and is gitignored. `.env` overrides the token and
Gemini key (`BOT_TOKEN`, `GEMINI_API_KEY`). A token change needs a restart;
everything else applies on save.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | `tsx watch src/index.ts` |
| `npm start` | `tsx src/index.ts` (no build step) |
| `npm run build` | `tsc` → `dist/` |
| `npm run serve` | `node dist/index.js` |
| `npm run typecheck` | `tsc --noEmit` |

## Configuration reference

`config.example.json` lists every field. The important ones:

| Field | Meaning |
|-------|---------|
| `persona.enabled` | Master switch. Off = no channel is streamed. |
| `persona.displayName` | Name Salma uses for herself. |
| `persona.model` | `gemini-3.8-live` (or the `-extended-thinking` variant). |
| `persona.thinkingLevel` | Only used by the extended-thinking model. |
| `persona.systemPrompt` | Empty uses the built-in Salma prompt. |
| `persona.channelIds` | Channels she reads and answers in. Empty = nowhere. |
| `persona.historySize` | Earlier messages sent as context (1–100). |
| `persona.batchWindowMs` | Messages inside this window become one decision. |
| `persona.replyCooldownSeconds` | Minimum gap between two replies (0 = none). |
| `persona.decisionCooldownSeconds` | Minimum gap between model evaluations. |
| `persona.maxRepliesPerHour` | Rolling hourly cap (0 = unlimited). |
| `persona.maxMessageLength` | Hard cap per Discord message (max 2000). |
| `persona.showTyping` | Typing indicator while she decides. |
| `persona.toolsEnabled` | Information/action tools. |
| `persona.memoryEnabled` | Durable notes about members/server. |
| `persona.temperature` | Sampling temperature (0–2). |
| `persona.requestTimeoutMs` | Per-event timeout; timeout = silence. |

## How it works

```
messageCreate
   └─ handleSalmaMessage (src/utils/salma.ts)
        ├─ filter: monitored channel? bot? empty?
        ├─ append to per-channel history
        ├─ batch messages (2.5s window)
        ├─ cooldowns / hourly cap
        ├─ collect images & GIFs (src/utils/salma-media.ts)
        ├─ build event payload + runtime prompt
        └─ gemini-persona.ts (Live session)
             ├─ tool call: send_message / send_sticker / stay_silent
             ├─ tool call: info / memory tools
             └─ follow-up turn → final decision
```

- `src/utils/gemini-persona.ts` is the Live transport. It reuses one session,
  serialises turns, ignores the tool-call turn's `turnComplete`, and nudges the
  model once if it answers a tool result with prose instead of a decision tool.
- `src/prompts/salma.ts` holds the full character prompt verbatim and appends
  the runtime contract (decision tools, Discord formatting, mention/emoji/
  sticker/media rules). The contract overrides any JSON-envelope wording in the
  character prompt.
- `src/utils/salma-memory.ts` persists `data/salma-memory.json` (deduped, max
  300 notes per guild, best-effort writes).
- `src/config.ts` owns loading, normalising, sanitising, and saving config.
  Never edit `config.json` directly while the bot is running — use the
  dashboard, which swaps the live config immediately.

### Model quirks (verified)

- `gemini-3.8-live` rejects `responseModalities: [TEXT]`; request `AUDIO` with
  `outputAudioTranscription` and read the transcript.
- `gemini-3.8-live` must **not** receive `thinkingConfig`. The
  `-extended-thinking` variant requires `thinkingLevel`.
- A malformed turn, timeout, queue overflow, or connection loss resolves to
  "stay silent".

## Dashboard API

| Method | Route | Purpose |
|--------|-------|---------|
| `GET` | `/api/session` | Login state |
| `POST` | `/api/login` `/api/logout` | Session cookie |
| `GET` | `/api/health` | Bot, guild, persona and dashboard snapshot |
| `GET` | `/api/guild` | Channels and categories for pickers |
| `GET` | `/api/config` | Redacted config + revision + sources |
| `PUT` | `/api/config` | Save config (requires revision) |
| `POST` | `/api/secrets` | Write-only token / Gemini key |
| `POST` | `/api/actions/reload-config` | Re-read `config.json` from disk |
| `POST` | `/api/actions/clear-salma-memory` | Delete guild memory notes |
| `POST` | `/api/ai/persona-test` | Dry-run one message |

The server binds to loopback by default. A non-loopback `DASHBOARD_HOST`
refuses to start without `DASHBOARD_PASSWORD`. Sessions are in-memory (12h,
HttpOnly, SameSite=Strict), so a restart signs everyone out. `GET /api/config`
omits the token and replaces the Gemini key with `__REDACTED__`; saving
preserves both.

## Project layout

```
src/
  index.ts                 Discord client, startup, shutdown
  config.ts                config schema, defaults, save/sanitise
  prompts/salma.ts         character prompt + runtime contract
  dashboard/server.ts      local dashboard server
  utils/
    salma.ts               persona orchestration + tools
    gemini-persona.ts      Gemini Live transport
    gemini-live.ts         thinking-level helper
    salma-media.ts         image/GIF → inline parts
    salma-memory.ts        durable notes
dashboard/                 HTML/CSS/JS control panel (no build step)
data/salma-memory.json     runtime notes (created automatically)
```

## License

Private project.
