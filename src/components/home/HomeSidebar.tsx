import { Plus, Search } from 'lucide-react';
import { useId, useState, type ComponentType, type ReactNode } from 'react';
import homeMark from '../../assets/home-mark.png';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface SidebarItem {
  id: string;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Runs when the item is chosen (opens a right panel, starts a chat, etc.). */
  onSelect?: () => void;
  /** Plus button at the row's far end (start a new chat, new project…). */
  add?: { label: string; onSelect: () => void };
  /** Makes the row a dropdown of recent entries. */
  recents?: {
    toggleLabel: string;
    items: { id: string; label: string; meta?: string; icon?: ReactNode; onSelect: () => void }[];
    empty: string;
    viewAll?: { label: string; onSelect: () => void };
  };
}

const SECTIONS_KEY = 'oc-home-nav-sections';

function loadSections(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export const HOME_NAV_WIDTH = 200;

/** Home nav. Panel items highlight via `active`; no flyout overlays. */
export function HomeSidebar({
  label,
  items,
  active,
  onSearch,
  busy,
  open,
}: {
  label: string;
  items: SidebarItem[];
  active: string | null;
  onSearch: () => void;
  busy?: boolean;
  open: boolean;
}) {
  const regionId = useId();
  const [expanded, setExpanded] = useState<string[]>(loadSections);
  const toggle = (id: string) =>
    setExpanded((cur) => {
      const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
      try {
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(next));
      } catch {
        /* storage blocked */
      }
      return next;
    });

  const side = document.dir === 'rtl' ? 'left' : 'right';
  return (
    <aside
      data-tw=""
      aria-label={label}
      aria-hidden={!open}
      inert={!open}
      className="relative z-0 h-full shrink-0 overflow-hidden motion-safe:transition-[width] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]"
      style={{ width: open ? HOME_NAV_WIDTH : 0 }}
    >
      <div className="flex h-full flex-col" style={{ width: HOME_NAV_WIDTH }}>
      <div className="flex h-14 shrink-0 items-center gap-1 ps-2 pe-0">
        <img src={homeMark} alt="" width={28} height={28} className="home-mark box-border size-9 shrink-0 object-contain p-1.5 opacity-90" aria-hidden />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" className="hidden size-9 shrink-0 rounded-[8px] text-muted-foreground hover:text-foreground [&_svg]:size-[18px]" aria-label="Search" onClick={onSearch}>
              <Search strokeWidth={2} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side={side}>Search</TooltipContent>
        </Tooltip>
      </div>

      <nav
        id={regionId}
        aria-label={label}
        className={cn(
          'flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden overscroll-contain pb-2 ps-2 pe-0 pt-1',
        )}
      >
        {items.map((item) => {
          const isActive = active === item.id;
          const open = !!item.recents && expanded.includes(item.id);
          const listId = `${regionId}-${item.id}`;
          const iconBtn = 'size-6 shrink-0 rounded-[6px] px-0 py-0 text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-4';
          return (
            <div key={item.id}>
              <div
                className={cn(
                  'flex items-center rounded-[var(--r-lg)] ps-1 pe-1 text-[color:var(--fg-2)] transition-colors duration-150 hover:bg-secondary hover:text-foreground',
                  isActive && 'bg-secondary text-foreground',
                )}
              >
                <Button
                  variant="ghost"
                  aria-current={isActive ? 'page' : undefined}
                  aria-expanded={item.recents ? open : undefined}
                  aria-controls={item.recents ? listId : undefined}
                  disabled={busy && item.id !== 'chat'}
                  className="h-9 min-w-0 flex-1 justify-start gap-1.5 rounded-[var(--r-lg)] px-1.5 text-current hover:bg-transparent focus-visible:bg-transparent [&_svg]:shrink-0 [&_svg]:text-current"
                  onClick={() => (item.recents ? toggle(item.id) : item.onSelect?.())}
                >
                  <item.icon strokeWidth={2} className="size-[1.5cap] [block-size:1.5cap] [inline-size:1.5cap]" />
                  <span className="truncate text-xs font-medium leading-none">{item.label}</span>
                </Button>
                {item.add && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" className={iconBtn} aria-label={item.add.label} disabled={busy && item.id !== 'chat'} onClick={item.add.onSelect}>
                        <Plus strokeWidth={2} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side={side}>{item.add.label}</TooltipContent>
                  </Tooltip>
                )}
              </div>
              {item.recents && (
                <div
                  id={listId}
                  inert={!open}
                  className="grid motion-safe:transition-[grid-template-rows] motion-safe:duration-200 motion-safe:ease-[cubic-bezier(0.2,0,0,1)]"
                  style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
                >
                  <ul className="m-0 flex min-h-0 list-none flex-col gap-px overflow-hidden ps-0 pe-0">
                    {item.recents.items.length === 0 ? (
                      <li className="px-2.5 py-1.5 text-xs text-muted-foreground">{item.recents.empty}</li>
                    ) : (
                      item.recents.items.map((entry) => (
                        <li key={entry.id}>
                          <button
                            type="button"
                            title={entry.label}
                            className="block w-full rounded-[6px] px-2.5 py-1.5 text-start text-[color:var(--fg-2)] transition-colors duration-150 hover:bg-secondary hover:text-foreground focus-visible:bg-secondary focus-visible:text-foreground"
                            onClick={entry.onSelect}
                          >
                            <span className="flex items-center gap-2">
                              {entry.icon && <span className="inline-flex shrink-0">{entry.icon}</span>}
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-xs leading-4">{entry.label}</span>
                                {entry.meta && <span className="block truncate text-[11px] leading-4 text-muted-foreground">{entry.meta}</span>}
                              </span>
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                    {item.recents.viewAll && (
                      <li>
                        <button type="button" className="block w-full rounded-[6px] px-2.5 py-1.5 text-start text-xs text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground focus-visible:bg-secondary focus-visible:text-foreground" onClick={item.recents.viewAll.onSelect}>
                          {item.recents.viewAll.label}
                        </button>
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          );
        })}
      </nav>
      </div>
    </aside>
  );
}
