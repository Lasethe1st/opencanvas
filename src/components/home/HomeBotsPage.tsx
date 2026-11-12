import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, Delete02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import type { Bot } from '@/lib/bots';
import { timeAgo } from './AllProjectsPage';

const fieldCls = 'w-full rounded-md border-0 p-0 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50';

/** A bot's own page. Bots aren't chatted with: this is where they're named, given a role and a summary, and removed. */
export function HomeBotsPage({ bot, onChange, onBack, onRemove }: { bot: Bot; onChange: (patch: Partial<Pick<Bot, 'name' | 'role' | 'summary'>>) => void; onBack: () => void; onRemove: () => void }) {
  return (
    <div className="absolute inset-0 z-[15] overflow-y-auto bg-[var(--home-card)] px-6 pb-16 pt-24">
      <div className="mx-auto flex w-full max-w-[560px] flex-col gap-8">
        <Button variant="ghost" className="-ms-2 h-8 w-fit gap-1 px-2 text-xs text-muted-foreground hover:text-foreground [&_svg]:size-4" onClick={onBack}>
          <HugeiconsIcon icon={ArrowLeft01Icon} strokeWidth={2} />
          All bots
        </Button>
        <div className="flex items-center gap-4">
          <span className="bot-dot size-14 shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <input
              aria-label="Bot name"
              value={bot.name}
              maxLength={40}
              onChange={(e) => onChange({ name: e.target.value })}
              onBlur={() => !bot.name.trim() && onChange({ name: 'Untitled bot' })}
              className={`${fieldCls} bg-transparent truncate text-2xl font-semibold`}
            />
            <p className="m-0 mt-1 text-xs text-muted-foreground">Created {timeAgo(bot.at)}</p>
          </div>
        </div>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xs font-medium text-muted-foreground">Role</h2>
          <input aria-label="Role" value={bot.role} maxLength={60} placeholder="What is this bot for?" onChange={(e) => onChange({ role: e.target.value })} className={`${fieldCls} rounded-[var(--r-lg)] bg-muted px-4 py-2.5 text-[13px]`} />
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="m-0 text-xs font-medium text-muted-foreground">Summary</h2>
          <textarea aria-label="Summary" value={bot.summary} maxLength={280} rows={4} placeholder="A short description of what it does. Bots aren’t chatted with like normal chats." onChange={(e) => onChange({ summary: e.target.value })} className={`${fieldCls} resize-none rounded-[var(--r-lg)] bg-muted px-4 py-3 text-[13px] leading-5`} />
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
