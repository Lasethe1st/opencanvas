/** Getting-started checklist progress — shared by home UI and loop actions. */

const KEY = 'oc-onboarding';

export interface OnboardingSaved {
  done: string[];
  dismissed: boolean;
}

const listeners = new Set<() => void>();

export function loadOnboarding(): OnboardingSaved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      done: Array.isArray(raw.done) ? raw.done.filter((x: unknown): x is string => typeof x === 'string') : [],
      dismissed: raw.dismissed === true,
    };
  } catch {
    return { done: [], dismissed: false };
  }
}

function persist(next: OnboardingSaved) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked */
  }
  listeners.forEach((l) => l());
}

export function subscribeOnboarding(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Mark a getting-started step done from anywhere (edits, AI turns, project birth). */
export function completeOnboardingTask(id: string) {
  const cur = loadOnboarding();
  if (cur.done.includes(id)) return;
  persist({ ...cur, done: [...cur.done, id] });
}

export function dismissOnboarding() {
  const cur = loadOnboarding();
  if (cur.dismissed) return;
  persist({ ...cur, dismissed: true });
}
