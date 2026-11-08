import { LaptopMinimal } from '../../lib/home-icons';
import { Gear as SettingsIcon } from '../../lib/home-icons';
import { ArrowDown01Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { USER_AVATAR_SRC, artAvatarSrc } from '../../lib/user-avatar';
import { useStore } from '../../lib/store';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** The account, as a pill at the top centre of the foreground card. There's no sign-in yet, so this is a local placeholder profile.
 *  The name hides when the card is narrow (the card is an `@container/card`), leaving just the photo. */
export function HomeAccount({ onSettings }: { onSettings: () => void }) {
  const collab = useStore((s) => s.collab);
  const people = collab.status === 'host' || collab.status === 'guest' ? collab.roster : [];
  const shared = people.length > 1;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={shared ? 'People in this chat' : 'Account'}
          className="group absolute top-3 z-20 inline-flex h-9 items-center gap-2 rounded-[var(--pill)] bg-muted ps-1.5 pe-1.5 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-secondary data-[state=open]:bg-secondary @3xl/card:pe-3.5"
          style={{ left: '50%', translate: '-50% 0' }}
        >
          {shared ? (
            <>
              <span className="flex items-center -space-x-2" aria-hidden>
                {people.slice(0, 3).map((p) => (
                  <span key={p.id} className="inline-flex size-6 shrink-0 overflow-hidden rounded-full ring-2 ring-muted" style={{ background: p.color }}>
                    <img src={artAvatarSrc(p.id)} alt="" width={24} height={24} className="size-full object-cover" draggable={false} referrerPolicy="no-referrer" />
                  </span>
                ))}
              </span>
              {people.length > 3 && <span className="text-xs tabular-nums text-muted-foreground">+{people.length - 3}</span>}
              <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className="size-3.5 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
              <span className="sr-only">{people.length} people in this chat</span>
            </>
          ) : (
            <>
          <span className="inline-flex size-6 shrink-0 overflow-hidden rounded-full border border-[color:var(--frost-border)] bg-[color:var(--surface-2)]" aria-hidden>
            <img src={USER_AVATAR_SRC} alt="" width={24} height={24} className="size-full object-cover" draggable={false} referrerPolicy="no-referrer" />
          </span>
          <span className="hidden truncate @3xl/card:inline">Your account</span>
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="center" sideOffset={6} data-presence-bloom={shared ? '' : undefined} className={cn('w-[226px] rounded-2xl p-1', shared && 'w-[260px] origin-top data-[state=open]:[animation:presence-bloom_340ms_cubic-bezier(0.34,1.4,0.64,1)]')}>
        {shared && (
          <>
            <div className="px-2.5 pb-1 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">In this chat · {people.length}</div>
            <ul className="m-0 flex list-none flex-col p-0">
              {people.map((p, i) => (
                <li key={p.id} data-presence-row="" className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 text-[13px] [animation:presence-row_260ms_cubic-bezier(0.2,0,0,1)_backwards]" style={{ animationDelay: `${60 + i * 40}ms` }}>
                  <span className="inline-flex size-7 shrink-0 overflow-hidden rounded-full" style={{ background: p.color }}>
                    <img src={artAvatarSrc(p.id)} alt="" width={28} height={28} className="size-full object-cover" draggable={false} referrerPolicy="no-referrer" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {p.name}
                    {p.id === collab.you?.id && <span className="text-muted-foreground"> (you)</span>}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{p.role === 'owner' ? 'Host' : p.role === 'editor' ? 'Can write' : 'View only'}</span>
                </li>
              ))}
            </ul>
            <DropdownMenuSeparator />
          </>
        )}
        <div className={cn('px-2.5 pb-1.5 pt-2', shared && 'hidden')}>
          <div className="text-[13px] font-medium leading-4 text-foreground">Your account</div>
          <div className="mt-0.5 flex items-center gap-1 text-[11px] leading-4 text-muted-foreground">
            <LaptopMinimal className="size-3 shrink-0" aria-hidden />
            Stored on this computer
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="rounded-xl" onSelect={onSettings}>
          <SettingsIcon className="size-4" aria-hidden />
          Settings
        </DropdownMenuItem>
        <DropdownMenuItem className="rounded-xl" disabled>
          Sign in (coming soon)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Plan and storage, at the top right of the left pane, level with the logo. */
export function HomePlan() {
  return (
    <span className="flex items-center gap-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex size-6 items-center justify-center text-muted-foreground" role="img" aria-label="Stored on this computer">
            <LaptopMinimal className="size-3.5" aria-hidden />
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">Stored on this computer</TooltipContent>
      </Tooltip>
      <span className="inline-flex h-[18px] shrink-0 items-center rounded-md bg-foreground/[0.08] px-1.5 text-[10px] font-semibold leading-none tracking-wide text-muted-foreground">Pro</span>
    </span>
  );
}
