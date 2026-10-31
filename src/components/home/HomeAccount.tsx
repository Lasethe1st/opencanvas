import { CaretUpDown, Gear as SettingsIcon, LaptopMinimal } from '../../lib/home-icons';
import { USER_AVATAR_SRC } from '../../lib/user-avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

/** Account row at the foot of the nav. There's no sign-in yet, so this is a local placeholder profile. */
export function HomeAccount({ onSettings }: { onSettings: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex h-11 w-full items-center gap-2.5 rounded-[var(--r-lg)] px-2 text-start transition-colors duration-150 hover:bg-secondary focus-visible:bg-secondary data-[state=open]:bg-secondary">
          <span className="inline-flex size-7 shrink-0 overflow-hidden rounded-full border border-[color:var(--frost-border)] bg-[color:var(--surface-2)]" aria-hidden>
            <img src={USER_AVATAR_SRC} alt="" width={28} height={28} className="size-full object-cover" draggable={false} referrerPolicy="no-referrer" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-[13px] font-medium leading-4 text-foreground">Your account</span>
              <span className="inline-flex h-[18px] shrink-0 items-center rounded-md bg-foreground/[0.08] px-1.5 text-[10px] font-semibold leading-none tracking-wide text-muted-foreground">
                Pro
              </span>
            </span>
            <span className="flex min-w-0 items-center gap-1 text-[11px] leading-4 text-muted-foreground">
              <LaptopMinimal className="size-3 shrink-0" aria-hidden />
              <span className="truncate">Stored on this computer</span>
            </span>
          </span>
          <CaretUpDown className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={6} className="w-[226px] rounded-2xl p-1">
        <DropdownMenuItem className="rounded-xl" onSelect={onSettings}>
          <SettingsIcon className="size-4" aria-hidden />
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="rounded-xl" disabled>
          Sign in (coming soon)
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
