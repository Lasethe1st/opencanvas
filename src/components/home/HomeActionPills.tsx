import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { BookOpen01Icon, Bug01Icon, CodeSquareIcon, Hammer01Icon } from '@hugeicons/core-free-icons';

const PILLS: { id: string; label: string; icon: IconSvgElement; starter: string }[] = [
  { id: 'debug', label: 'Debug', icon: Bug01Icon, starter: 'Help me debug ' },
  { id: 'build', label: 'Build', icon: Hammer01Icon, starter: 'Help me build ' },
  { id: 'review', label: 'Review', icon: CodeSquareIcon, starter: 'Review my code for ' },
  { id: 'explain', label: 'Explain', icon: BookOpen01Icon, starter: 'Explain how ' },
];

/** Four quick starts under the composer. Each puts the start of a request in the box and leaves the cursor at the end. */
export function HomeActionPills({ onPick, disabled }: { onPick: (starter: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-2" role="group" aria-label="Quick starts">
      {PILLS.map((pill) => (
        <button
          key={pill.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(pill.starter)}
          className="inline-flex h-8 items-center gap-1.5 rounded-[var(--pill)] border border-[color:var(--frost-border)] bg-muted/60 ps-2.5 pe-3 text-[13px] text-foreground outline-none transition-[background-color,scale] duration-150 hover:bg-secondary focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50"
        >
          <HugeiconsIcon icon={pill.icon} size={15} strokeWidth={1.75} className="text-muted-foreground" aria-hidden />
          {pill.label}
        </button>
      ))}
    </div>
  );
}
