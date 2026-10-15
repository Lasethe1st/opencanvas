import { Heart, House, Search, Settings, Star } from 'lucide-react';
import type { ReactNode } from 'react';
import type { IconPack } from '../../../shared/project-config';
import { cx } from '../../ui/primitives.jsx';

/** Phosphor isn't a dependency of OpenCanvas; these are static drawings in its regular style (256 grid, 16 stroke). */
function PhosphorPreview() {
  const props = { width: 18, height: 18, viewBox: '0 0 256 256', fill: 'none', stroke: 'currentColor', strokeWidth: 16, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <>
      <svg {...props}>
        <path d="M40 216V115.5a8 8 0 0 1 2.6-5.9l80-72.7a8 8 0 0 1 10.8 0l80 72.7a8 8 0 0 1 2.6 5.9V216" />
        <path d="M152 216v-56a8 8 0 0 0-8-8h-32a8 8 0 0 0-8 8v56M24 216h208" />
      </svg>
      <svg {...props}>
        <circle cx="112" cy="112" r="80" />
        <path d="M168.6 168.6 224 224" />
      </svg>
      <svg {...props}>
        <path d="M128 216S28 160 28 92a52 52 0 0 1 100-20 52 52 0 0 1 100 20c0 68-100 124-100 124Z" />
      </svg>
      <svg {...props}>
        <path d="m128 189.8 50.5 30.8a8 8 0 0 0 11.9-8.7l-13.7-57.9 44.9-38.9a8 8 0 0 0-4.5-14l-59-4.8-22.7-55a8 8 0 0 0-14.8 0l-22.7 55-59 4.8a8 8 0 0 0-4.5 14l44.9 38.9-13.7 57.9a8 8 0 0 0 11.9 8.7Z" />
      </svg>
      <svg {...props}>
        <circle cx="128" cy="128" r="40" />
        <path d="M128 24v32M128 200v32M54 54l22 22M180 180l22 22M24 128h32M200 128h32M54 202l22-22M180 76l22-22" />
      </svg>
    </>
  );
}

const PACKS: { id: IconPack; name: string; note: string; preview: () => ReactNode }[] = [
  {
    id: 'lucide',
    name: 'Lucide',
    note: 'Clean, consistent 2px strokes',
    preview: () => [House, Search, Heart, Star, Settings].map((I, i) => <I key={i} size={18} strokeWidth={1.75} />),
  },
  { id: 'phosphor', name: 'Phosphor', note: 'Rounder, friendlier, six weights', preview: PhosphorPreview },
];

/** Icon pack preference for new UI. Nothing in the project is replaced when this changes. */
export function IconPackPicker({ value, onChange }: { value: IconPack; onChange: (v: IconPack) => void }) {
  return (
    <div className="icon-packs" role="radiogroup" aria-label="Icon pack">
      {PACKS.map((p) => (
        <button
          key={p.id}
          type="button"
          role="radio"
          aria-checked={value === p.id}
          className={cx('icon-pack', value === p.id && 'is-active')}
          onClick={() => onChange(p.id)}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            const next = PACKS[(PACKS.findIndex((x) => x.id === value) + 1) % PACKS.length];
            onChange(next.id);
            (e.currentTarget.parentElement?.querySelector(`[data-pack="${next.id}"]`) as HTMLElement | null)?.focus();
          }}
          data-pack={p.id}
          tabIndex={value === p.id ? 0 : -1}
        >
          <span className="icon-pack__preview" aria-hidden>
            {p.preview()}
          </span>
          <span className="icon-pack__name">{p.name}</span>
          <span className="icon-pack__note">{p.note}</span>
        </button>
      ))}
    </div>
  );
}
