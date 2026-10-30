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

const STOP = new Set([
  'a', 'an', 'the', 'i', 'me', 'my', 'we', 'our', 'you', 'your', 'to', 'of', 'in', 'on', 'for', 'and', 'or',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'do', 'does', 'did', 'can', 'could', 'would', 'should',
  'will', 'with', 'from', 'about', 'into', 'that', 'this', 'it', 'its', 'at', 'as', 'by', 'am', 'have', 'has',
  'had', 'currently', 'please', 'just', 'also', 'any', 'some', 'there', 'here', 'so', 'if', 'then', 'than',
  'too', 'very', 'really', 'like', 'get', 'got', 'make', 'made', 'want', 'need', 'help', 'tell', 'show',
  'give', 'let', 'know', 'thanks', 'thank',
]);

function titleCaseWord(word: string): string {
  if (/^[A-Z0-9]{2,}$/.test(word)) return word;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function contentWords(text: string): string[] {
  return text
    .split(/[^a-zA-Z0-9+#-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 1 && !STOP.has(w.toLowerCase()));
}

/**
 * Short human label for the chat pill / sidebar — derived from the first prompt,
 * not a truncated copy of it (e.g. “what are the projects…” → “Number of Projects Enquiry”).
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

  const question = /\?$/.test(text) || /^(what|how|why|when|where|who|which|can|could|do|does|is|are|should|would)\b/i.test(text);
  const lower = text.toLowerCase();

  // “what are / how many …” → “Number of X Enquiry”
  if (/^(how many|what(?:'s| is| are)(?: the)?)\b/.test(lower)) {
    const rest = text
      .replace(/^(how many|what(?:'s| is| are)(?: the)?)\s+/i, '')
      .replace(/\b(i|we|you)\b[\s\S]*$/i, '')
      .replace(/[?.!]+$/g, '')
      .trim();
    const words = contentWords(rest).slice(0, 3).map(titleCaseWord);
    if (words.length) {
      const title = `Number of ${words.join(' ')} Enquiry`;
      return title.length <= MAX_TITLE ? title : `${title.slice(0, MAX_TITLE - 1).trimEnd()}…`;
    }
  }

  // Strip common ask/command openers, then keep a few content words.
  let body = text
    .replace(/^(can you|could you|would you|please|hey|hi|hello)[,!]?\s+/i, '')
    .replace(/^(what|how|why|when|where|who|which|tell me|show me|explain|describe|list|find|help me(?: to)?)\b[\s,]*/gi, '')
    .replace(/\b(i currently have|i have|for me|please|thanks|thank you)\b[?.!]*$/i, '')
    .replace(/[?.!]+$/g, '')
    .trim();

  let words = contentWords(body);
  if (!words.length) words = contentWords(text);
  if (!words.length) return hadMarkup ? 'Code snippet' : 'New chat';

  words = words.slice(0, question ? 4 : 5).map(titleCaseWord);
  let title = words.join(' ');
  if (question && !/\b(enquiry|question|help|request)\b/i.test(title)) title = `${title} Enquiry`;
  if (title.length > MAX_TITLE) title = `${title.slice(0, MAX_TITLE - 1).replace(/\s+\S*$/, '').trimEnd()}…`;
  if (title.length < 3 && hadMarkup) return 'Code snippet';
  return title || 'New chat';
}
