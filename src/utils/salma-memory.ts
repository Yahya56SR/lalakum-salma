/**
 * Durable notes the Salma persona can save about a server and its members.
 *
 * Stored in `data/salma-memory.json` so the character keeps continuity across
 * restarts. Writes are synchronous and best-effort:
 * a broken file must never stop the bot from answering messages.
 */
import fs from 'fs';
import path from 'path';

export interface SalmaMemoryNote {
  id: string;
  fact: string;
  /** Discord user id when the note is about one member. */
  aboutUserId?: string;
  /** Display name captured when the note was written. */
  aboutName?: string;
  createdAt: number;
}

interface MemoryDb {
  version: number;
  guilds: Record<string, SalmaMemoryNote[]>;
}

const memoryPath = path.join(__dirname, '..', '..', 'data', 'salma-memory.json');
const MAX_NOTES_PER_GUILD = 300;
const MAX_FACT_LENGTH = 400;

let cache: MemoryDb | null = null;
let sequence = 0;

function load(): MemoryDb {
  if (cache) return cache;

  try {
    if (fs.existsSync(memoryPath)) {
      const parsed = JSON.parse(fs.readFileSync(memoryPath, 'utf8')) as Partial<MemoryDb>;
      cache = {
        version: 1,
        guilds:
          parsed && typeof parsed.guilds === 'object' && parsed.guilds !== null
            ? (parsed.guilds as Record<string, SalmaMemoryNote[]>)
            : {},
      };
    } else {
      cache = { version: 1, guilds: {} };
    }
  } catch (err) {
    console.error('[Salma] Failed to load memory file, starting empty:', err);
    cache = { version: 1, guilds: {} };
  }

  return cache;
}

function save(db: MemoryDb): void {
  try {
    fs.mkdirSync(path.dirname(memoryPath), { recursive: true });
    fs.writeFileSync(memoryPath, `${JSON.stringify(db, null, 2)}\n`, 'utf8');
  } catch (err) {
    // Memory is a nice-to-have; never let a disk error break a reply.
    console.error('[Salma] Failed to save memory file:', err);
  }
}

function nextId(): string {
  sequence = (sequence + 1) % 1000;
  return `m${Date.now().toString(36)}${sequence.toString(36).padStart(2, '0')}`;
}

export interface AddMemoryInput {
  fact: string;
  aboutUserId?: string;
  aboutName?: string;
}

/** Save one fact. Identical facts about the same member are not duplicated. */
export function addMemory(guildId: string, input: AddMemoryInput): SalmaMemoryNote | null {
  const fact = String(input.fact || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_FACT_LENGTH);
  if (!fact) return null;

  const db = load();
  const notes = db.guilds[guildId] ?? [];

  const duplicate = notes.find(
    (note) =>
      note.fact.toLowerCase() === fact.toLowerCase() &&
      (note.aboutUserId ?? '') === (input.aboutUserId ?? ''),
  );
  if (duplicate) return duplicate;

  const note: SalmaMemoryNote = {
    id: nextId(),
    fact,
    aboutUserId: input.aboutUserId || undefined,
    aboutName: input.aboutName ? input.aboutName.slice(0, 80) : undefined,
    createdAt: Date.now(),
  };

  notes.push(note);
  if (notes.length > MAX_NOTES_PER_GUILD) {
    notes.splice(0, notes.length - MAX_NOTES_PER_GUILD);
  }
  db.guilds[guildId] = notes;
  save(db);

  return note;
}

export interface RecallOptions {
  /** Match a user id, display name or username. */
  about?: string;
  limit?: number;
}

/** Newest notes first. Without `about`, returns the most recent notes overall. */
export function recallMemories(guildId: string, options: RecallOptions = {}): SalmaMemoryNote[] {
  const db = load();
  const notes = db.guilds[guildId] ?? [];
  const limit = Math.min(Math.max(Math.floor(options.limit ?? 20), 1), 100);
  const about = options.about?.trim().toLowerCase();

  const filtered = about
    ? notes.filter(
        (note) =>
          note.aboutUserId?.toLowerCase() === about ||
          note.aboutName?.toLowerCase() === about ||
          note.aboutName?.toLowerCase().includes(about),
      )
    : notes;

  return [...filtered].sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

/** Delete every note for one guild. Returns how many were removed. */
export function clearMemories(guildId: string): number {
  const db = load();
  const notes = db.guilds[guildId] ?? [];
  const count = notes.length;
  delete db.guilds[guildId];
  save(db);
  return count;
}

/** Number of stored notes for one guild (used by the dashboard). */
export function countMemories(guildId: string): number {
  return (load().guilds[guildId] ?? []).length;
}
