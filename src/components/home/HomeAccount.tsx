import { LaptopMinimal } from '../../lib/home-icons';
import { Gear as SettingsIcon } from '../../lib/home-icons';
import { USER_AVATAR_SRC } from '../../lib/user-avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

/** The account, as a pill at the top centre of the foreground card. There's no sign-in yet, so this is a local placeholder profile.
 *  The name hides when the card is narrow (the card is an `@container/card`), leaving just the photo. */
export function HomeAccount({ onSettings }: { onSettings: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Account"
          className="absolute top-3 z-20 inline-flex h-9 items-center gap-2 rounded-[var(--pill)] bg-muted ps-1.5 pe-1.5 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-secondary data-[state=open]:bg-secondary @3xl/card:pe-3.5"
          style={{ left: '50%', translate: '-50% 0' }}
        >
          <span className="inline-flex size-6 shrink-0 overflow-hidden rounded-full border border-[color:var(--frost-border)] bg-[color:var(--surface-2)]" aria-hidden>
            <img src={USER_AVATAR_SRC} alt="" width={24} height={24} className="size-full object-cover" draggable={false} referrerPolicy="no-referrer" />
          </span>
          <span className="hidden truncate @3xl/card:inline">Your account</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="center" sideOffset={6} className="w-[226px] rounded-2xl p-1">
        <div className="px-2.5 pb-1.5 pt-2">
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
