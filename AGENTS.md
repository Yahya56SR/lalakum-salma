# Lalakum Salma — Agent Instructions

One bot, one purpose: the **Lalakum Salma** Gemini Live persona and its local
dashboard. There are no levels, XP, tickets, roles, automod, welcome messages,
auto-replies, logging, slash commands, or Minecraft tools. Do not reintroduce
them when copying changes from `l7aj-bot`.

## Commands
| Command | Purpose |
|---------|---------|
| `npm run dev` | `tsx watch src/index.ts` — restarts on source changes |
| `npm start` | `tsx src/index.ts` — no build step |
| `npm run build` | `tsc` → `dist/` |
| `npm run serve` | `node dist/index.js` |
| `npx tsc --noEmit` | The only verification in the repo — no tests, linter, or formatter |

## Config & secrets
- `config.json` is runtime state and holds live secrets; `.env` overrides it
  with `BOT_TOKEN`, `GEMINI_API_KEY`, `GUILD_ID`. Both files are gitignored —
  never commit or print their contents.
- Never write `config.json` directly. Use `updateConfig(mutator)` /
  `replaceConfig(raw)` from `src/config.ts`: they normalise, sanitise, persist,
  and swap the live object returned by `getConfig()`.
  `replaceConfig(..., { preserveSecrets: true })` keeps `__REDACTED__`
  placeholders and the current secrets when the dashboard sends a config
  without them.
- Adding or renaming a config field touches `BotConfig`, `DEFAULT_CONFIG`,
  `normalizeConfig`, `sanitizeConfig` (all in `src/config.ts`),
  `config.example.json`, and the field lists in `dashboard/app.js`.
- `token` and `guildId` shape startup; a token change needs a restart. Every
  other setting is live on save because the persona reads `getConfig()` per
  event.
- `data/salma-memory.json` holds Salma's durable notes (auto-created,
  gitignored).

## Architecture
- `src/index.ts`: `dotenv.config()` → `loadConfig()` → `startDashboard()` →
  `client.login()`. Intents: Guilds, GuildMembers, GuildMessages,
  MessageContent, GuildVoiceStates. Partials: Message, Channel.
- The ready handler is `clientReady` (not `ready`). It primes per-channel
  history once via `primeSalmaHistory(client)` so Salma has context immediately
  after a restart.
- `messageCreate` calls `handleSalmaMessage(message)` fire-and-forget. Never
  await the model on the gateway path.
- `src/utils/salma.ts` is the Discord side: channel filtering, per-channel
  batching (2.5s, max 12 messages), in-memory history, decision/reply
  cooldowns, hourly cap, tool execution and sending. `closeSalma()` tears down
  sessions on shutdown.
- `src/utils/gemini-persona.ts` is the Live transport. The reply/silent
  decision uses three always-on tools (`send_message`, `send_sticker`,
  `stay_silent`); both send tools take a model-chosen `reply` boolean, so
  native replies are not a static setting. Information/action tools are gated
  by `persona.toolsEnabled`, memory tools by `persona.memoryEnabled`.
- `src/prompts/salma.ts` stores the character prompt verbatim in
  `SALMA_DEFAULT_PROMPT` and appends a runtime contract via
  `buildSalmaRuntimePrompt`. The contract overrides any JSON-envelope wording
  in the character prompt and documents Discord formatting, mentions, custom
  emoji/sticker ids, media markers, and the Arabizi-only rule.
- `src/utils/salma-media.ts` turns image/GIF attachments and supported GIF
  links (Discord CDN, Tenor, Giphy, Imgur) into Live inline image parts. GIFs
  use the first frame; images are resized/capped. Failures leave the text
  marker only. Only the current batch is visual input.
- Every failure is silence: timeout, queue overflow, connection loss, or a
  malformed turn. A decision tears down/recycles the socket so trailing audio
  cannot leak into the next event.

## Persona tools
`get_recent_messages`, `search_history`, `get_member_info`, `get_server_info`,
`get_voice_members`, `get_channel_info`, `get_current_time`,
`react_to_message`, `get_server_emojis`, `get_server_stickers`,
`recall_facts`, `remember_fact`.

History lines include author IDs so `<@ID>` mentions use real IDs, and a
`[reply to ...]` marker (`[reply to your message]` when the reply targets
Salma). The runtime prompt treats a direct mention or a reply to Salma as a
strong signal, while leaving the final decision to the model.
`allowedMentions` enables users only (roles, `@everyone`, `@here` stay silent).
Tool declarations, executor branches, and the runtime prompt tool list must
stay in sync.

## Prompt policy
- Darija in **Arabizi only**. Never Arabic script. The character prompt, the
  runtime contract, and the examples all enforce this.
- Salma is socially active. Silence is allowed but is not the default framing:
  direct questions, jokes, insults, and Gojo debates are invitations. The
  runtime prompt says to speak when addressed or when there is something worth
  adding, and to stay silent only when she would interrupt or repeat herself.
- Keep the supplied character prompt verbatim when regenerating
  `SALMA_DEFAULT_PROMPT`. Use `JSON.stringify(promptText)` to embed it; do not
  hand-escape it.

## Model quirks (verified)
- `gemini-3.8-live` rejects `responseModalities: [TEXT]`; request `AUDIO` with
  `outputAudioTranscription` and read the transcript.
- `gemini-3.8-live` must **not** receive `thinkingConfig`; the
  `-extended-thinking` variant requires `thinkingLevel`.
- The transport ignores the tool-call turn's `turnComplete` until the follow-up
  round starts, and nudges the model once if a tool result is answered with
  prose instead of a decision tool.

## Dashboard
- `src/dashboard/server.ts` + plain HTML/CSS/JS in `dashboard/`. No build step:
  editing those files only needs a browser refresh, not a bot restart.
- CSP is strict: `default-src 'self'; script-src 'self'; style-src 'self'
  'unsafe-inline'; img-src 'self' data: https:`. No inline `<script>`, no CDN
  scripts/fonts — new JS must be a file under `dashboard/`.
- Sections: **Overview**, **Salma Persona**, **Advanced**.
- Routes: `GET /api/session`, `POST /api/login|logout`, `GET
  /api/health|guild|config`, `PUT /api/config`, `POST /api/secrets`, `POST
  /api/actions/reload-config|clear-salma-memory`, `POST /api/ai/persona-test`.
- `GET /api/config` omits `token` and returns the Gemini key as
  `__REDACTED__`. `PUT /api/config` requires the returned `revision` (sha256 of
  the live config, 16 chars) and returns `409` if the config changed elsewhere
  (for example, another browser tab). Secrets go only through
  `POST /api/secrets`.
- Auth is loopback-only by default; a non-loopback `DASHBOARD_HOST` refuses to
  start without `DASHBOARD_PASSWORD`. Sessions are in memory (12h HttpOnly,
  SameSite=Strict cookie), so a restart signs everyone out.
- Dashboard actions that need Discord (persona test) fail when the bot is not
  logged in, but the dashboard itself still starts — that is how a broken token
  gets fixed.

## Discord requirements
- Privileged intents (Developer Portal → Bot): **Server Members**, **Message
  Content**.
- Permissions: View Channels, Send Messages, Read Message History, Add
  Reactions (reaction tool).
- Login 401 = token reset/revoked or the client secret was used (both look like
  `xxx.yyy.zzz`). 403 = the bot is not in the guild.

## Repo notes
- `config.json`, `.env`, `data/`, `dist/`, and `node_modules/` are gitignored.
- Commits use `type(scope): summary` (e.g. `fix(persona): ...`).
  `.gitattributes` enforces LF — keep it when editing.
