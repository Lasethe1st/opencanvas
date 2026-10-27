/** What the user told the AI to remember, and how they rated its replies. Kept on this computer. */
export interface MemoryEntry {
  id: string;
  text: string;
  at: number;
}

const MEMORY_KEY = 'oc-ai-memory';
const FEEDBACK_KEY = 'oc-ai-feedback';
const MAX = 20;
const listeners = new Set<() => void>();

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked or full */
  }
  listeners.forEach((l) => l());
}

export function subscribeMemory(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function loadMemory(): MemoryEntry[] {
  const raw = read<unknown>(MEMORY_KEY, []);
  return Array.isArray(raw) ? raw.filter((m): m is MemoryEntry => typeof m?.id === 'string' && typeof m?.text === 'string').slice(0, MAX) : [];
}

export const isRemembered = (id: string) => loadMemory().some((m) => m.id === id);

/** Adds or removes a reply. Newest first; the oldest fall off past the limit. */
export function toggleRemember(id: string, text: string): boolean {
  const all = loadMemory();
  const has = all.some((m) => m.id === id);
  write(MEMORY_KEY, has ? all.filter((m) => m.id !== id) : [{ id, text: text.trim(), at: Date.now() }, ...all].slice(0, MAX));
  return !has;
}

/** The lines handed to the model at the start of each turn. */
export const memoryLines = () => loadMemory().map((m) => m.text);

export type Vote = 'up' | 'down';

export const getVote = (id: string): Vote | null => read<Record<string, Vote>>(FEEDBACK_KEY, {})[id] ?? null;

/** Choosing the same vote again clears it. */
export function setVote(id: string, vote: Vote): Vote | null {
  const all = read<Record<string, Vote>>(FEEDBACK_KEY, {});
  if (all[id] === vote) delete all[id];
  else all[id] = vote;
  write(FEEDBACK_KEY, all);
  return all[id] ?? null;
}
