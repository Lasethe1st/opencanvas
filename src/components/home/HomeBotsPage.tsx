import { HugeiconsIcon } from '@hugeicons/react';
import { Delete02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import type { Bot } from '@/lib/bots';
import { timeAgo } from './AllProjectsPage';

/** A bot's own page. Bots aren't chatted with: this is where they're named and managed. */
export function HomeBotsPage({ bot, onRename, onRemove }: { bot: Bot; onRename: (name: string) => void; onRemove: () => void }) {
  return (
    <div className="absolute inset-0 z-[15] overflow-y-auto bg-[var(--home-card)] px-6 pb-16 pt-24">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-8">
        <div className="flex items-center gap-4">
          <span className="bot-dot size-14 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <input
              aria-label="Bot name"
              value={bot.name}
              maxLength={40}
              onChange={(e) => onRename(e.target.value)}
              onBlur={() => !bot.name.trim() && onRename('Untitled bot')}
              className="w-full truncate rounded-md border-0 bg-transparent p-0 text-2xl font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <p className="m-0 mt-1 text-xs text-muted-foreground">Created {timeAgo(bot.at)}</p>
          </div>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xs font-medium text-muted-foreground">What it does</h2>
          <p className="m-0 rounded-[var(--r-lg)] bg-muted px-4 py-3 text-[13px] leading-5 text-muted-foreground">
            Nothing yet. Bots aren&rsquo;t chatted with like normal chats; what they can do will be set up here.
          </p>
        </section>

        <div className="border-t border-foreground/[0.06] pt-6">
          <Button variant="ghost" className="gap-2 text-[13px] text-[color:var(--destructive)] hover:bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] hover:text-[color:var(--destructive)]" onClick={onRemove}>
            <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4" />
            Delete bot
          </Button>
        </div>
      </div>
    </div>
  );
}
