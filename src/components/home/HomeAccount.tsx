import { ChevronsUpDown, Settings as SettingsIcon, UserRound } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

/** Account row at the foot of the nav. There's no sign-in yet, so this is a local placeholder profile. */
export function HomeAccount({ onSettings }: { onSettings: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="flex h-11 w-full items-center gap-2.5 rounded-[var(--r-lg)] px-2 text-start transition-colors duration-150 hover:bg-secondary focus-visible:bg-secondary data-[state=open]:bg-secondary">
          <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-muted-foreground" aria-hidden>
            <UserRound className="size-4" strokeWidth={2} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium leading-4 text-foreground">Your account</span>
            <span className="block truncate text-[11px] leading-4 text-muted-foreground">Stored on this computer</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={2} aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" sideOffset={6} className="w-[226px] rounded-2xl p-1">
        <DropdownMenuItem className="rounded-xl" onSelect={onSettings}>
          <SettingsIcon className="size-4" strokeWidth={2} aria-hidden />
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
