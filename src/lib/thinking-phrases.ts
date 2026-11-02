import { useEffect, useState } from 'react';

/** Rotating labels while the model is working — playful, short enough for shimmer + pills. */
export const THINKING_PHRASES = [
  'Thinking',
  'Canoodling',
  'Brainblasting',
  'Debunking the Big Bang',
  'Solving Quantum Entanglement',
  'Outrunning the Flash',
  'Consulting the hive mind',
  'Untangling the spaghetti',
  'Summoning a better idea',
  'Sharpening the crayons',
  'Asking the rubber duck',
  'Polishing the plot twist',
  'Herding the tokens',
  'Negotiating with entropy',
  'Warming up the neurons',
  'Flipping through the multiverse',
  'Bribing the muse',
  'Checking under the couch',
  'Rehearsing the punchline',
  'Calibrating the vibes',
] as const;

export function pickThinkingPhrase(except?: string): string {
  const pool = except ? THINKING_PHRASES.filter((p) => p !== except) : THINKING_PHRASES;
  return pool[Math.floor(Math.random() * pool.length)] ?? THINKING_PHRASES[0];
}

/** Stable phrase for a wait spell; rotates while `active` so long waits stay lively. */
export function useThinkingPhrase(active = true, rotateMs = 3500): string {
  const [phrase, setPhrase] = useState(() => pickThinkingPhrase());
  useEffect(() => {
    if (!active) return;
    setPhrase(pickThinkingPhrase());
    if (rotateMs <= 0) return;
    const id = window.setInterval(() => {
      setPhrase((prev) => pickThinkingPhrase(prev));
    }, rotateMs);
    return () => clearInterval(id);
  }, [active, rotateMs]);
  return phrase;
}

export function withEllipsis(phrase: string): string {
  return /…$|\.\.\.$/u.test(phrase) ? phrase : `${phrase}…`;
}
