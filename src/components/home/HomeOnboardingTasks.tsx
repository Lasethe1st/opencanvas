import { Check, X } from '../../lib/home-icons';
import { useCallback, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

export interface OnboardingTask {
  id: string;
  label: string;
  /** True once the app can tell the task is done on its own (a key is set, a project exists). */
  done: boolean;
  onSelect: () => void;
}

const KEY = 'oc-onboarding';

interface Saved {
  done: string[];
  dismissed: boolean;
}

function load(): Saved {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { done: Array.isArray(raw.done) ? raw.done.filter((x: unknown): x is string => typeof x === 'string') : [], dismissed: raw.dismissed === true };
  } catch {
    return { done: [], dismissed: false };
  }
}

/** Remembers which first-run tasks were finished, even ones the app can't detect later (like trying `/`). */
export function useOnboarding() {
  const [saved, setSaved] = useState<Saved>(load);
  const update = useCallback((fn: (s: Saved) => Saved) => {
    setSaved((cur) => {
      const next = fn(cur);
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {
        /* storage blocked */
      }
      return next;
    });
  }, []);
  const complete = useCallback((id: string) => update((s) => (s.done.includes(id) ? s : { ...s, done: [...s.done, id] })), [update]);
  const dismiss = useCallback(() => update((s) => ({ ...s, dismissed: true })), [update]);
  return { done: saved.done, dismissed: saved.dismissed, complete, dismiss };
}

/** A short checklist for new users. Goes away when finished or dismissed. */
export function HomeOnboardingTasks({ tasks, onDismiss, onAutoDone }: { tasks: OnboardingTask[]; onDismiss: () => void; onAutoDone: (id: string) => void }) {
  // Tasks the app detects (key added, project created) are remembered so they stay ticked.
  useEffect(() => {
    tasks.forEach((t) => t.done && onAutoDone(t.id));
  }, [tasks, onAutoDone]);
  const finished = tasks.filter((t) => t.done).length;
  if (finished === tasks.length) return null;
  return (
    <section aria-label="Getting started" className="rounded-[10px] bg-muted/70 p-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-xs font-medium text-foreground">Getting started</h2>
        <span className="flex items-center gap-1">
          <span className="text-[11px] tabular-nums text-muted-foreground">
            {finished} of {tasks.length}
          </span>
          <button type="button" aria-label="Dismiss getting started" className="inline-flex size-5 items-center justify-center rounded-[5px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground" onClick={onDismiss}>
            <X className="size-3" />
          </button>
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuemin={0} aria-valuemax={tasks.length} aria-valuenow={finished} aria-label="Getting started progress">
        <div className="h-full rounded-full bg-foreground/70 motion-safe:transition-[width] motion-safe:duration-300" style={{ width: `${(finished / tasks.length) * 100}%` }} />
      </div>
      <ul className="m-0 mt-1.5 flex list-none flex-col p-0">
        {tasks.map((t) => (
          <li key={t.id}>
            <button type="button" disabled={t.done} className="flex w-full items-center gap-2 rounded-[6px] px-0.5 py-1 text-start text-xs transition-colors hover:text-foreground disabled:pointer-events-none" onClick={t.onSelect}>
              <span className={cn('inline-flex size-3.5 shrink-0 items-center justify-center rounded-full border', t.done ? 'border-transparent bg-foreground text-background' : 'border-foreground/30')} aria-hidden>
                {t.done && <Check className="size-2.5" />}
              </span>
              <span className={cn('min-w-0 truncate', t.done ? 'text-muted-foreground line-through' : 'text-[color:var(--fg-2)]')}>{t.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
