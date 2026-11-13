import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Delete02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import type { Bot } from '@/lib/bots';
import { timeAgo } from './AllProjectsPage';

const fieldCls = 'w-full rounded-md border-0 p-0 text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50';

/**
 * One bot, shown in the home right panel (the same docked column Sources uses): edit its name, role and summary
 * (saved as you type) and see what it's up to. Bots can't run anything yet, so the activity sections hold their empty states.
 */
export function HomeBotPanel({ bot, onChange, onClose, onRemove }: { bot: Bot; onChange: (patch: Partial<Pick<Bot, 'name' | 'role' | 'summary'>>) => void; onClose: () => void; onRemove: () => void }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col" aria-label={`${bot.name || 'Bot'} details`}>
      <header className="flex shrink-0 items-center justify-between gap-2 ps-3 pe-1 pt-1">
        <span className="bot-dot size-8 shrink-0" aria-hidden />
        <Button variant="ghost" className="size-8 shrink-0 rounded-full p-0 text-muted-foreground hover:text-foreground [&_svg]:size-4" aria-label="Close bot panel" onClick={onClose}>
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto ps-3 pe-1 pb-4 pt-3">
        <div>
          <input
            aria-label="Bot name"
            value={bot.name}
            maxLength={40}
            onChange={(e) => onChange({ name: e.target.value })}
            onBlur={() => !bot.name.trim() && onChange({ name: 'Untitled bot' })}
            className={`${fieldCls} truncate bg-transparent text-base font-semibold`}
          />
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">Created {timeAgo(bot.at)}</p>
        </div>

        <section className="flex flex-col gap-1.5">
          <h2 className="m-0 text-xs font-medium text-muted-foreground">Role</h2>
          <input aria-label="Role" value={bot.role} maxLength={60} placeholder="What is this bot for?" onChange={(e) => onChange({ role: e.target.value })} className={`${fieldCls} rounded-[var(--r-lg)] bg-muted px-3 py-2 text-[13px]`} />
        </section>

        <section className="flex flex-col gap-1.5">
          <h2 className="m-0 text-xs font-medium text-muted-foreground">What it does</h2>
          <textarea aria-label="What it does" value={bot.summary} maxLength={280} rows={4} placeholder="A short description of what it does." onChange={(e) => onChange({ summary: e.target.value })} className={`${fieldCls} resize-none rounded-[var(--r-lg)] bg-muted px-3 py-2.5 text-[13px] leading-5`} />
        </section>

        <section className="flex flex-col gap-1.5">
          <h2 className="m-0 text-xs font-medium text-muted-foreground">Doing now</h2>
          <p className="m-0 flex items-center gap-2 text-[13px] text-foreground">
            <span className="size-1.5 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />
            Idle
          </p>
        </section>

        <section className="flex flex-col gap-1.5">
          <h2 className="m-0 text-xs font-medium text-muted-foreground">Recent</h2>
          <p className="m-0 text-[13px] leading-5 text-muted-foreground">Nothing yet. What this bot does will show up here.</p>
        </section>
      </div>

      <footer className="shrink-0 border-t border-foreground/[0.06] py-2 ps-1 pe-0">
        <Button variant="ghost" className="h-9 w-full justify-start gap-2 text-[13px] text-[color:var(--destructive)] hover:bg-[color-mix(in_srgb,var(--destructive)_10%,transparent)] hover:text-[color:var(--destructive)]" onClick={onRemove}>
          <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="size-4" />
          Delete bot
        </Button>
      </footer>
    </div>
  );
}
