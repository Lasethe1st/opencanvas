/** Requests started from the home prompt, kept on this computer so they can be picked up again. */
export interface HomeChat {
  id: string;
  text: string;
  at: number;
}

const KEY = 'oc-home-chats';
const MAX = 20;

export function loadHomeChats(): HomeChat[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((c): c is HomeChat => typeof c?.id === 'string' && typeof c?.text === 'string' && typeof c?.at === 'number').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Newest first. Starting the same request again moves it to the top instead of repeating it. */
export function addHomeChat(chats: HomeChat[], text: string): HomeChat[] {
  const clean = text.trim();
  if (!clean) return chats;
  const next = [{ id: `${Date.now()}`, text: clean, at: Date.now() }, ...chats.filter((c) => c.text !== clean)].slice(0, MAX);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked or full */
  }
  return next;
}
