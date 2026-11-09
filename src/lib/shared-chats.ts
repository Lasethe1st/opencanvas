import type { CollabRole } from '../../shared/collab';

/** A shared chat this computer has hosted or joined. Kept so the left lane can list it after the session ends. */
export interface SharedChatRecord {
  room: string;
  title: string;
  /** The project it was about, for the second line of its row. */
  project: string;
  /** Your role in it. */
  role: CollabRole;
  /** Last time it was live here. */
  at: number;
  /** The saved chat on this computer, when you were the host. Guests don't keep the conversation. */
  chatId?: string;
}

const KEY = 'oc.shared.chats';
const MAX = 30;

export function loadSharedChats(): SharedChatRecord[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((r) => r && typeof r.room === 'string' && typeof r.title === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function saveSharedChats(list: SharedChatRecord[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    /* storage blocked: the list just won't survive a restart */
  }
}

/** Add or refresh a chat and move it to the top. Returns the same array when nothing changed. */
export function upsertSharedChat(list: SharedChatRecord[], rec: SharedChatRecord): SharedChatRecord[] {
  const cur = list.find((r) => r.room === rec.room);
  if (cur && cur.title === rec.title && cur.project === rec.project && cur.role === rec.role && cur.chatId === rec.chatId && list[0] === cur) return list;
  return [rec, ...list.filter((r) => r.room !== rec.room)].slice(0, MAX);
}

export const removeSharedChat = (list: SharedChatRecord[], room: string) => list.filter((r) => r.room !== room);
