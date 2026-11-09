import { LaptopMinimal } from '../../lib/home-icons';
import { Gear as SettingsIcon } from '../../lib/home-icons';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  if (people.length > 1) return <HomePresence people={people} youId={collab.you?.id} onSettings={onSettings} />;
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

type Person = { id: string; name: string; role: string; color: string };
const ROLE: Record<string, string> = { owner: 'Host', editor: 'Can write' };
const OPEN_W = 264;
/**
 * The closed pill shows up to five circles in an uneven cluster, from tiny to large, none touching. A fixed set of
 * slots (centre x, centre y, diameter in px, inside a 30px-high box); who sits in which slot and whether the cluster is
 * flipped comes from the chat's first person, so it is stable but looks random from chat to chat.
 */
const MAX_CIRCLES = 5;
const CLUSTER_H = 30;
const SLOTS: ReadonlyArray<readonly [number, number, number]> = [
  [11, 15, 22],
  [30, 9, 14],
  [33, 24, 10],
  [46, 14, 8],
  [52, 23, 12],
];
function hashOf(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/** Everyone in a shared chat. The pill itself grows into the list (no menu hanging below it) and folds back on outside click or Esc. */
function HomePresence({ people, youId, onSettings }: { people: Person[]; youId?: string; onSettings: () => void }) {
  const [open, setOpen] = useState(false);
  const [closedW, setClosedW] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const shown = people.slice(0, MAX_CIRCLES);
  const extra = people.length - shown.length;
  const seed = hashOf(people[0]?.id ?? '');
  const slots = SLOTS.slice(0, shown.length);
  const clusterW = Math.max(...slots.map(([x, , d]) => x + d / 2));
  const flip = seed % 2 === 1;

  // The pill's natural width, so it can animate to the open width and back.
  useLayoutEffect(() => {
    if (measure.current) setClosedW(measure.current.offsetWidth + 12);
  }, [people.length]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div ref={root} className="absolute top-3 z-30" style={{ left: '50%', translate: '-50% 0' }}>
      <div
        className={cn(
          'overflow-hidden bg-muted transition-[width,border-radius,box-shadow,background-color] duration-[380ms] ease-[cubic-bezier(0.34,1.3,0.64,1)] motion-reduce:transition-none',
          open ? 'rounded-[22px] bg-secondary shadow-[0_12px_32px_-8px_rgb(0_0_0/0.28)]' : 'rounded-[var(--pill)] hover:bg-secondary',
        )}
        style={{ width: open ? OPEN_W : closedW || undefined }}
      >
        <button
          ref={trigger}
          type="button"
          aria-expanded={open}
          aria-controls="home-presence-list"
          aria-label="People in this chat"
          onClick={() => setOpen((v) => !v)}
          className="flex h-9 w-full items-center gap-2 ps-1.5 pe-2.5 text-xs font-medium text-foreground outline-offset-[-2px]"
        >
          <span ref={measure} className="inline-flex w-max items-center gap-2 whitespace-nowrap">
            <span className="relative block shrink-0" style={{ width: clusterW, height: CLUSTER_H }} aria-hidden>
              {shown.map((p, i) => {
                const [x, y, d] = slots[(i + seed) % slots.length];
                return (
                  <span key={p.id} className="absolute" style={{ left: x - d / 2, top: (flip ? CLUSTER_H - y : y) - d / 2 }}>
                    <Avatar p={p} size={d} />
                  </span>
                );
              })}
            </span>
            {extra > 0 && <span className="tabular-nums text-muted-foreground">+{extra}</span>}
            <HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} className={cn('size-3.5 text-muted-foreground transition-transform duration-300', open && 'rotate-180')} aria-hidden />
          </span>
          <span className={cn('ms-auto truncate text-[11px] uppercase tracking-wide text-muted-foreground transition-opacity duration-200', open ? 'opacity-100 delay-100' : 'opacity-0')} aria-hidden>
            In this chat · {people.length}
          </span>
        </button>
        <div id="home-presence-list" className={cn('grid transition-[grid-template-rows] duration-[380ms] ease-[cubic-bezier(0.34,1.2,0.64,1)] motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')} inert={!open}>
          <div className="min-h-0 overflow-hidden">
            <ul className="m-0 flex list-none flex-col p-1 pt-0">
              {people.map((p, i) => (
                <li key={p.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-[13px] transition-[opacity,translate] duration-300 motion-reduce:transition-none" style={{ opacity: open ? 1 : 0, translate: open ? '0' : '0 -6px', transitionDelay: open ? `${120 + i * 40}ms` : '0ms' }}>
                  <Avatar p={p} size={28} />
                  <span className="min-w-0 flex-1 truncate">
                    {p.name}
                    {p.id === youId && <span className="text-muted-foreground"> (you)</span>}
                  </span>
                  <span className="text-[11px] text-muted-foreground">{ROLE[p.role] ?? 'View only'}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-foreground/10 p-1">
              <button type="button" className="flex w-full items-center gap-2 rounded-xl px-2 py-1.5 text-[13px] hover:bg-foreground/[0.06]" onClick={() => { setOpen(false); onSettings(); }}>
                <SettingsIcon className="size-4" aria-hidden />
                Settings
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Avatar({ p, size, ring }: { p: Person; size: number; ring?: boolean }) {
  return (
    <span className={cn('inline-flex shrink-0 overflow-hidden rounded-full', ring && 'ring-2 ring-muted')} style={{ background: p.color, width: size, height: size }}>
      <img src={artAvatarSrc(p.id)} alt="" width={size} height={size} className="size-full object-cover" draggable={false} referrerPolicy="no-referrer" />
    </span>
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
