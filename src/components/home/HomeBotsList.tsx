import { HugeiconsIcon } from '@hugeicons/react';
import { PlusSignIcon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import type { Bot } from '@/lib/bots';
import { BotAvatar } from './BotAvatar';

/** Every bot as a card in the main pane: its circle, name, role and a short summary. Three to a row when there is room. */
export function HomeBotsList({ bots, activeId, onOpen, onNew }: { bots: Bot[]; activeId?: string | null; onOpen: (id: string) => void; onNew: () => void }) {
  return (
    <section aria-label="Bots" className="absolute inset-0 z-[15] overflow-y-auto bg-[var(--home-card)] px-6 pb-10 pt-[68px]">
      <div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
        <header className="flex items-center justify-between gap-3">
          <h1 className="m-0 text-xl font-semibold text-foreground">Bots</h1>
          <Button variant="ghost" className="h-8 gap-1.5 rounded-[var(--pill)] bg-muted px-3 text-xs font-medium text-foreground hover:bg-secondary [&_svg]:size-3.5" onClick={onNew}>
            <HugeiconsIcon icon={PlusSignIcon} strokeWidth={2} />
            New bot
          </Button>
        </header>
        {bots.length === 0 ? (
          <p className="m-0 py-16 text-center text-sm text-muted-foreground">No bots yet. Create one to get started.</p>
        ) : (
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 @2xl/card:grid-cols-2 @4xl/card:grid-cols-3">
            {bots.map((b) => (
              <li key={b.id} className="min-w-0">
                <button
                  type="button"
                  aria-pressed={activeId === b.id}
                  onClick={() => onOpen(b.id)}
                  className="flex h-full w-full flex-col items-start gap-3 rounded-2xl border border-foreground/[0.08] bg-[var(--home-bg)] p-4 text-start transition-colors duration-150 hover:border-foreground/[0.16] focus-visible:border-foreground/[0.16] aria-pressed:border-foreground/[0.28]"
                >
                  <BotAvatar shape={b.shape} size={52} />
                  <span className="min-w-0 max-w-full">
                    <span className="block truncate text-sm font-medium text-foreground">{b.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{b.role || 'No role yet'}</span>
                  </span>
                  <span className="line-clamp-3 text-[13px] leading-5 text-[color:var(--fg-2)]">{b.summary || 'No summary yet.'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
