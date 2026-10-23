import fs from 'fs';
import path from 'path';
import { SALMA_DEFAULT_PROMPT } from './prompts/salma';

/**
 * The Salma persona: a Gemini Live client that reads a few channels and
 * decides on its own whether, and how, to join the conversation.
 */
export interface PersonaConfig {
  /** Master switch. When false nothing is streamed to the model. */
  enabled: boolean;
  /** Name the character uses for itself (also shown in logs). */
  displayName: string;
  /** Gemini Live model id. */
  model: string;
  /** Thinking level; only used by the `-extended-thinking` variant. */
  thinkingLevel?: string;
  /** Character prompt. Empty falls back to the built-in Salma prompt. */
  systemPrompt: string;
  /** Channels the persona listens in. Empty means it listens nowhere. */
  channelIds: string[];
  /** How many earlier messages are sent as conversation context (1-100). */
  historySize: number;
  /** How long messages are collected before one decision (ms). */
  batchWindowMs: number;
  /** Minimum seconds between two spoken replies (0 = no cooldown). */
  replyCooldownSeconds: number;
  /** Minimum seconds between two model evaluations, replies or not (0 = every batch). */
  decisionCooldownSeconds: number;
  /** Maximum replies in any rolling hour (0 = unlimited). */
  maxRepliesPerHour: number;
  /** Hard cap for one Discord message (1-2000). */
  maxMessageLength: number;
  /** Show the typing indicator while the model is thinking. */
  showTyping: boolean;
  /** Expose information/action tools (member info, emojis, stickers, ...). */
  toolsEnabled: boolean;
  /** Let the persona save and recall durable notes about the server. */
  memoryEnabled: boolean;
  /** Sampling temperature (0-2). */
  temperature: number;
  /** Per-event response timeout in milliseconds (5000-60000). */
  requestTimeoutMs: number;
}

export interface BotConfig {
  token: string;
  /** Fallback for GEMINI_API_KEY. Prefer the environment variable. */
  geminiApiKey: string;
  /** Server used by the dashboard. Empty falls back to the first server. */
  guildId: string;
  /** Social persona driven by a Gemini Live session. */
  persona: PersonaConfig;
}

const DEFAULT_CONFIG: BotConfig = {
  token: '',
  geminiApiKey: '',
  guildId: '',
  persona: {
    enabled: false,
    displayName: 'Lalakum Salma',
    model: 'gemini-3.8-live',
    thinkingLevel: 'low',
    systemPrompt: SALMA_DEFAULT_PROMPT,
    channelIds: [],
    historySize: 30,
    batchWindowMs: 2_500,
    replyCooldownSeconds: 25,
    decisionCooldownSeconds: 10,
    maxRepliesPerHour: 40,
    maxMessageLength: 500,
    showTyping: false,
    toolsEnabled: true,
    memoryEnabled: true,
    temperature: 1,
    requestTimeoutMs: 20_000,
  },
};

const configPath = path.join(__dirname, '..', 'config.json');

let config: BotConfig = JSON.parse(JSON.stringify(DEFAULT_CONFIG));

/** Marker used by the dashboard instead of real secrets in API responses. */
export const REDACTED_VALUE = '__REDACTED__';

/**
 * Merge a raw config object with the defaults and normalise every section.
 * Shared by the startup loader and the dashboard so a config saved from the
 * browser is byte-for-byte equivalent to one written by the bot itself.
 */
function normalizeConfig(parsed: any): BotConfig {
  const source = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  const rawPersona =
    source.persona && typeof source.persona === 'object' && !Array.isArray(source.persona)
      ? source.persona
      : {};

  return {
    ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)),
    token: typeof source.token === 'string' ? source.token : '',
    geminiApiKey: typeof source.geminiApiKey === 'string' ? source.geminiApiKey : '',
    guildId: typeof source.guildId === 'string' ? source.guildId : '',
    persona: {
      ...DEFAULT_CONFIG.persona,
      ...rawPersona,
      channelIds: Array.isArray(rawPersona.channelIds) ? rawPersona.channelIds : [],
    },
  };
}

export function loadConfig(): BotConfig {
  try {
    if (fs.existsSync(configPath)) {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config = normalizeConfig(parsed);
    }
  } catch (err) {
    console.error('Failed to load config.json:', err);
    console.warn('Using default configuration.');
  }
  return config;
}

export function getConfig(): BotConfig {
  return config;
}

/** Absolute path of the JSON file the bot reads and writes. */
export function getConfigPath(): string {
  return configPath;
}

/* ------------------------------------------------------------------ */
/* Dashboard save sanitising                                           */
/* ------------------------------------------------------------------ */

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNumber(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function asInt(value: unknown, fallback: number, min: number, max: number): number {
  return Math.round(asNumber(value, fallback, min, max));
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const cleaned = value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  return [...new Set(cleaned)];
}

/**
 * Coerce values written by the dashboard into the shapes the bot expects.
 * The UI already produces correct types; this protects the raw JSON editor
 * (and hand-edited files saved through it) from breaking the running bot.
 */
function sanitizeConfig(cfg: BotConfig): void {
  cfg.token = asString(cfg.token);
  cfg.geminiApiKey = asString(cfg.geminiApiKey);
  cfg.guildId = asString(cfg.guildId);

  const persona = cfg.persona;
  persona.enabled = asBool(persona.enabled, false);
  persona.displayName =
    asString(persona.displayName, 'Lalakum Salma').trim().slice(0, 32) || 'Lalakum Salma';
  persona.model = asString(persona.model, 'gemini-3.8-live') || 'gemini-3.8-live';
  persona.thinkingLevel = asString(persona.thinkingLevel, 'low');
  persona.systemPrompt = asString(persona.systemPrompt, SALMA_DEFAULT_PROMPT);
  persona.channelIds = asStringArray(persona.channelIds);
  persona.historySize = asInt(persona.historySize, 30, 1, 100);
  persona.batchWindowMs = asInt(persona.batchWindowMs, 2_500, 250, 30_000);
  persona.replyCooldownSeconds = asInt(persona.replyCooldownSeconds, 25, 0, 86_400);
  persona.decisionCooldownSeconds = asInt(persona.decisionCooldownSeconds, 10, 0, 3_600);
  persona.maxRepliesPerHour = asInt(persona.maxRepliesPerHour, 40, 0, 1_000);
  persona.maxMessageLength = asInt(persona.maxMessageLength, 500, 1, 2_000);
  persona.showTyping = asBool(persona.showTyping, false);
  persona.toolsEnabled = asBool(persona.toolsEnabled, true);
  persona.memoryEnabled = asBool(persona.memoryEnabled, true);
  persona.temperature = asNumber(persona.temperature, 1, 0, 2);
  persona.requestTimeoutMs = asInt(persona.requestTimeoutMs, 20_000, 5_000, 60_000);
}

/**
 * Replace the in-memory config and persist it.
 *
 * The dashboard sends the config without secrets (`token`, Gemini API key).
 * When `preserveSecrets` is true (the default), missing/blank/redacted secret
 * values keep their current on-disk value instead of being wiped.
 *
 * Returns the normalised config that is now live. Changes made this way take
 * effect immediately — the bot reads `getConfig()` on every event.
 */
export function replaceConfig(raw: unknown, options: { preserveSecrets?: boolean } = {}): BotConfig {
  const source: any =
    raw && typeof raw === 'object' && !Array.isArray(raw) ? JSON.parse(JSON.stringify(raw)) : {};

  if (options.preserveSecrets !== false) {
    if (typeof source.token !== 'string' || source.token.trim() === '' || source.token === REDACTED_VALUE) {
      source.token = config.token;
    }
    if (
      typeof source.geminiApiKey !== 'string' ||
      source.geminiApiKey.trim() === '' ||
      source.geminiApiKey === REDACTED_VALUE
    ) {
      source.geminiApiKey = config.geminiApiKey;
    }
  }

  config = normalizeConfig(source);
  sanitizeConfig(config);
  saveConfig();
  return config;
}

export function saveConfig(): void {
  try {
    fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  } catch (err) {
    console.error('Failed to save config.json:', err);
    throw err;
  }
}

export function updateConfig(mutator: (cfg: BotConfig) => void): BotConfig {
  mutator(config);
  try {
    saveConfig();
  } catch (err) {
    console.error('Failed to persist config changes:', err);
    throw err;
  }
  return config;
}
