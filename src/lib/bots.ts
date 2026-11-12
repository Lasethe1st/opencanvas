import { useCallback, useEffect, useState } from 'react';

/** A bot the user keeps. Global to the app for now; kept on this device. */
export interface Bot {
  id: string;
  name: string;
  /** What the bot is for, in a few words. */
  role: string;
  /** A line or two on what it does. */
  summary: string;
  at: number;
}

const KEY = 'oc.bots';

const load = (): Bot[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw)
      ? raw
          .filter((b) => !!b && typeof b.id === 'string' && typeof b.name === 'string' && typeof b.at === 'number')
          .map((b): Bot => ({ id: b.id, name: b.name, at: b.at, role: typeof b.role === 'string' ? b.role : '', summary: typeof b.summary === 'string' ? b.summary : '' }))
      : [];
  } catch {
    return [];
  }
};

const save = (bots: Bot[]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(bots));
  } catch {
    /* storage blocked: bots last until reload */
  }
};

/** "Bot 1", "Bot 2"… the first number not already taken. */
export function nextBotName(bots: Bot[]): string {
  const taken = new Set(bots.map((b) => b.name));
  let n = 1;
  while (taken.has(`Bot ${n}`)) n++;
  return `Bot ${n}`;
}

export function useBots() {
  const [bots, setBots] = useState<Bot[]>(load);
  useEffect(() => save(bots), [bots]);

  const add = useCallback((): Bot => {
    const bot: Bot = { id: `bot-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`, name: '', role: '', summary: '', at: Date.now() };
    setBots((cur) => {
      bot.name = nextBotName(cur);
      return [...cur, bot];
    });
    return bot;
  }, []);
  const update = useCallback((id: string, patch: Partial<Pick<Bot, 'name' | 'role' | 'summary'>>) => setBots((cur) => cur.map((b) => (b.id === id ? { ...b, ...patch } : b))), []);
  const remove = useCallback((id: string) => setBots((cur) => cur.filter((b) => b.id !== id)), []);
  return { bots, add, update, remove };
}
