import type { AiChatItem } from '../../shared/ai';

/** A home conversation kept on this computer so it can be opened again. */
export interface HomeChat {
  id: string;
  /** First user prompt — used for titles and search. */
  text: string;
  at: number;
  /** Full transcript when we have it. Older entries may omit this. */
  items?: AiChatItem[];
}

const KEY = 'oc-home-chats';
const MAX = 20;

function isItem(value: unknown): value is AiChatItem {
  if (!value || typeof value !== 'object') return false;
  const kind = (value as { kind?: unknown }).kind;
  if (typeof kind !== 'string') return false;
  if (kind === 'user' || kind === 'assistant' || kind === 'error') {
    return typeof (value as { id?: unknown }).id === 'string' && typeof (value as { text?: unknown }).text === 'string';
  }
  if (kind === 'thinking') {
    return typeof (value as { id?: unknown }).id === 'string' && typeof (value as { text?: unknown }).text === 'string' && typeof (value as { done?: unknown }).done === 'boolean';
  }
  if (kind === 'tool') {
    const t = value as { id?: unknown; tool?: unknown; summary?: unknown; state?: unknown };
    return typeof t.id === 'string' && typeof t.tool === 'string' && typeof t.summary === 'string' && (t.state === 'running' || t.state === 'done' || t.state === 'failed');
  }
  if (kind === 'question' || kind === 'approval') {
    return typeof (value as { id?: unknown }).id === 'string';
  }
  return false;
}

function parseChat(raw: unknown): HomeChat | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as { id?: unknown; text?: unknown; at?: unknown; items?: unknown };
  if (typeof c.id !== 'string' || typeof c.text !== 'string' || typeof c.at !== 'number') return null;
  const items = Array.isArray(c.items) ? c.items.filter(isItem) : undefined;
  return { id: c.id, text: c.text, at: c.at, ...(items?.length ? { items } : {}) };
}

function write(chats: HomeChat[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(chats));
  } catch {
    /* storage blocked or full */
  }
}

export function loadHomeChats(): HomeChat[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.map(parseChat).filter((c): c is HomeChat => !!c).slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Newest first. Starting the same request again moves it to the top instead of repeating it. */
export function addHomeChat(chats: HomeChat[], text: string, items?: AiChatItem[]): HomeChat[] {
  const clean = text.trim();
  if (!clean) return chats;
  const entry: HomeChat = {
    id: `${Date.now()}`,
    text: clean,
    at: Date.now(),
    ...(items?.length ? { items } : {}),
  };
  const next = [entry, ...chats.filter((c) => c.text !== clean)].slice(0, MAX);
  write(next);
  return next;
}

/** Drop a saved chat by id. */
export function removeHomeChat(chats: HomeChat[], id: string): HomeChat[] {
  const next = chats.filter((c) => c.id !== id);
  write(next);
  return next;
}

/** Refresh the transcript for an open chat (and bump it to the top). */
export function updateHomeChatItems(chats: HomeChat[], id: string, items: AiChatItem[]): HomeChat[] {
  const cur = chats.find((c) => c.id === id);
  if (!cur) return chats;
  const firstUser = items.find((i) => i.kind === 'user');
  const entry: HomeChat = {
    ...cur,
    text: firstUser && firstUser.kind === 'user' ? firstUser.text.split('\n\nReferenced:\n')[0].trim() || cur.text : cur.text,
    at: Date.now(),
    items,
  };
  const next = [entry, ...chats.filter((c) => c.id !== id)].slice(0, MAX);
  write(next);
  return next;
}

/** Transcript shown when opening a recent chat (synthetic user bubble if we only stored the prompt). */
export function itemsForHomeChat(chat: HomeChat): AiChatItem[] {
  if (chat.items?.length) return chat.items;
  return [{ kind: 'user', id: `${chat.id}:user`, text: chat.text }];
}

/** User/assistant turns for the model when reopening a chat. */
export function historyTurnsForHomeChat(chat: HomeChat): { role: 'user' | 'assistant'; text: string }[] {
  const items = itemsForHomeChat(chat);
  const out: { role: 'user' | 'assistant'; text: string }[] = [];
  for (const item of items) {
    if (item.kind === 'user' && item.text.trim()) out.push({ role: 'user', text: item.text });
    if (item.kind === 'assistant' && item.text.trim()) out.push({ role: 'assistant', text: item.text });
  }
  return out;
}

const MAX_TITLE = 48;

/**
 * Short label for the chat pill / sidebar — prose only, no pasted SVG/code dumps.
 * Falls back to a kind hint when the message is mostly markup.
 */
export function titleFromPrompt(raw: string): string {
  let text = raw.split('\n\nReferenced:\n')[0] ?? raw;
  const hadMarkup = /<\/?[a-z][\s\S]*>/i.test(text) || /```/.test(text);
  text = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return hadMarkup ? 'Code snippet' : 'New chat';

  const clause = text.split(/(?<=[.!?])\s+|:\s+/)[0]?.trim() || text;
  let title = clause.length <= MAX_TITLE ? clause : `${clause.slice(0, MAX_TITLE - 1).replace(/\s+\S*$/, '').trimEnd()}…`;
  if (title.length < 3 && hadMarkup) return 'Code snippet';
  return title || 'New chat';
}
