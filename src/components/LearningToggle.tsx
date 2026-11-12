import { HugeiconsIcon } from '@hugeicons/react';
import { Flower01Icon, FlowerIcon, SakuraIcon } from '@hugeicons/core-free-icons';
import type { KeyboardEvent } from 'react';

const ICONS = [FlowerIcon, SakuraIcon, Flower01Icon];
const SIZES = [16, 18, 21];

/** A three-way toggle: each option has a flower that grows more elaborate from the first to the last. */
export function LearningToggle<T extends string>({ value, onChange, options, ariaLabel }: {
  value: T;
  onChange: (next: T) => void;
  options: readonly { id: T; label: string }[];
  ariaLabel: string;
}) {
  const index = Math.max(0, options.findIndex((o) => o.id === value));
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = Math.min(options.length - 1, Math.max(0, index + d));
    onChange(options[next].id);
    (e.currentTarget.children[next + 1] as HTMLElement | undefined)?.focus();
  };
  return (
    <div className="lt" role="radiogroup" aria-label={ariaLabel} onKeyDown={key} style={{ ['--i' as string]: index, ['--n' as string]: options.length }}>
      <span className="lt__pill" aria-hidden />
      {options.map((o, i) => (
        <button key={o.id} type="button" role="radio" aria-checked={i === index} tabIndex={i === index ? 0 : -1} className="lt__opt" onClick={() => onChange(o.id)}>
          <HugeiconsIcon icon={ICONS[i] ?? ICONS[0]} size={SIZES[i] ?? 15} strokeWidth={1.8} />
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  );
}
