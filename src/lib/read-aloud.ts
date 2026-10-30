/** Reading chat replies aloud: one player at a time, optional auto-read, cloud voice first. */
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { api } from './api';
import { getState, useStore } from './store';
import { speakResult } from './voice';
import type { VoiceSpeakResult } from '../../shared/voice';

const KEY = 'oc.readAloud';
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** "Read replies aloud" preference, kept per device. */
export function getReadAloud(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}
export function setReadAloud(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0');
  } catch {
    /* storage blocked */
  }
  if (!on) stopSpeech();
  emit();
}
export function useReadAloud(): boolean {
  return useSyncExternalStore(subscribe, getReadAloud, () => false);
}

export type SpeechPhase = { id: string | null; phase: 'idle' | 'loading' | 'speaking'; error: string };
let current: SpeechPhase = { id: null, phase: 'idle', error: '' };
let abort: AbortController | null = null;
const set = (next: SpeechPhase) => {
  current = next;
  emit();
};
export const useSpeech = () => useSyncExternalStore(subscribe, () => current, () => current);

/** Plain, speakable text: no code, markdown marks or raw URLs. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/[^\s)]+/g, 'a link')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s*[-*•]\s+/gm, '')
    .replace(/(\*\*|__|\*|_|~~)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Sentences grouped to roughly `max` characters, so the first sound starts quickly. */
export function chunkForSpeech(text: string, max = 420): string[] {
  const sentences = text.match(/[^.!?\n]+[.!?]*\s*/g) ?? [text];
  const out: string[] = [];
  let buf = '';
  for (const s of sentences) {
    if (buf && buf.length + s.length > max) {
      out.push(buf.trim());
      buf = '';
    }
    buf += s;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export function stopSpeech() {
  abort?.abort();
  abort = null;
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  set({ id: null, phase: 'idle', error: '' });
}

/** Speak a reply. Starts with the first chunk and carries on, so long replies don't wait. */
export async function speakReply(id: string, text: string): Promise<void> {
  stopSpeech();
  const chunks = chunkForSpeech(cleanForSpeech(text));
  if (!chunks.length) return;
  const ac = new AbortController();
  abort = ac;
  set({ id, phase: 'loading', error: '' });
  try {
    const voiceUri = await api.ai.status().then((s) => s.settings.ttsVoices?.browser ?? null, () => null);
    // Fetch the next chunk while the current one plays, so there's no gap between sentences.
    const fetchChunk = (i: number): Promise<VoiceSpeakResult> => api.ai.voiceSpeak(chunks[i]);
    let next: Promise<VoiceSpeakResult> = fetchChunk(0);
    next.catch(() => undefined);
    for (let i = 0; i < chunks.length; i++) {
      const ready = await next;
      if (ac.signal.aborted) return;
      if (i + 1 < chunks.length) {
        next = fetchChunk(i + 1);
        next.catch(() => undefined);
      }
      set({ id, phase: 'speaking', error: '' });
      await speakResult(ready, ac.signal, voiceUri);
    }
  } catch (err) {
    if (ac.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return;
    set({ id, phase: 'idle', error: err instanceof Error ? err.message : 'Couldn’t read this aloud.' });
    return;
  }
  if (abort === ac) {
    abort = null;
    set({ id: null, phase: 'idle', error: '' });
  }
}

/** Mount once: reads each finished AI reply aloud while "Read replies aloud" is on. */
export function useAutoReadAloud() {
  const turnId = useStore((s) => s.aiTurnId);
  const prev = useRef<string | null>(turnId);
  useEffect(() => {
    const was = prev.current;
    prev.current = turnId;
    if (turnId || !was) return; // only when a turn has just finished
    if (!getReadAloud()) return;
    const items = getState().aiChat;
    const last = items[items.length - 1];
    if (last?.kind !== 'assistant' || !items.some((i) => i.kind === 'user')) return;
    if (last.id.startsWith('va-')) return; // spoken live by the voice session
    void speakReply(last.id, last.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turnId]);
  useEffect(() => () => stopSpeech(), []);
}
