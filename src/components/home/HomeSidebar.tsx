import { Plus } from '../../lib/home-icons';
import { useId, type ComponentType, type CSSProperties, type ReactNode } from 'react';
import { LogoMark } from '../LogoMark';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { HomeContextMenu, type HomeMenuAction } from './HomeItemMenu';

export const HOME_NAV_WIDTH = 250;

/** A plain navigation row: icon, label, optional trailing text. */
export interface NavRow {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  shortcut?: string;
  disabled?: boolean;
}

/** A recent entry under a section: custom leading icon, name and a small second line. */
export interface NavEntry {
  id: string;
  label: string;
  meta?: string;
  icon: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  menu?: HomeMenuAction[];
}

export interface NavSection {
  id: string;
  title: string;
  /** "+" beside the title. */
  add?: { label: string; onSelect: () => void };
  entries: NavEntry[];
  empty: string;
  more?: { label: string; onSelect: () => void };
}

const rowCls =
  'flex h-8 w-full items-center gap-2.5 rounded-[var(--r-lg)] px-2 text-start text-[13px] text-[color:var(--fg-2)] transition-colors duration-150 hover:bg-secondary hover:text-foreground focus-visible:bg-secondary focus-visible:text-foreground disabled:pointer-events-none disabled:opacity-50';

/** Home navigation: actions, library, recents, then onboarding and account at the foot. */
export function HomeSidebar({
  label,
  open,
  actions,
  library,
  sections,
  footer,
}: {
  label: string;
  open: boolean;
  actions: NavRow[];
  library: NavRow[];
  sections: NavSection[];
  footer: ReactNode;
}) {
  const regionId = useId();
  const side = document.dir === 'rtl' ? 'left' : 'right';
  const renderRow = (row: NavRow) => (
    <li key={row.id}>
      <button type="button" className={rowCls} disabled={row.disabled} onClick={row.onSelect}>
        <span className="inline-flex size-4 shrink-0 items-center justify-center [&_svg]:size-4">{row.icon}</span>
        <span className="min-w-0 flex-1 truncate">{row.label}</span>
        {row.shortcut && <span className="shrink-0 text-[11px] text-muted-foreground">{row.shortcut}</span>}
      </button>
    </li>
  );

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
        <div className="flex h-14 shrink-0 items-center ps-4">
          <span className="flex h-9 shrink-0 items-center text-foreground">
            <LogoMark size={12} />
          </span>
        </div>

        <nav id={regionId} aria-label={label} className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overflow-x-hidden overscroll-contain px-2 pb-3 pt-1">
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">{actions.map(renderRow)}</ul>

          <section aria-labelledby={`${regionId}-library`} className="flex flex-col gap-1">
            <h2 id={`${regionId}-library`} className="m-0 px-2 text-xs font-medium text-muted-foreground">
              Library
            </h2>
            <ul className="m-0 flex list-none flex-col gap-0.5 p-0">{library.map(renderRow)}</ul>
          </section>

          {sections.map((section) => (
            <section key={section.id} aria-labelledby={`${regionId}-${section.id}`} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2 ps-2 pe-0.5">
                <h2 id={`${regionId}-${section.id}`} className="m-0 min-w-0 truncate text-xs font-medium text-muted-foreground">
                  {section.title}
                </h2>
                <div className="flex shrink-0 items-center gap-1">
                  {section.more && (
                    <button
                      type="button"
                      className="inline-flex h-5 items-center rounded-[var(--pill)] bg-[var(--surface-2)] px-2 text-[10px] font-medium text-muted-foreground transition-colors duration-150 hover:bg-secondary focus-visible:bg-secondary"
                      onClick={section.more.onSelect}
                    >
                      {section.more.label}
                    </button>
                  )}
                  {section.add && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" className="size-6 shrink-0 rounded-[6px] p-0 text-muted-foreground hover:bg-accent hover:text-foreground [&_svg]:size-3.5" aria-label={section.add.label} onClick={section.add.onSelect}>
                          <Plus />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side={side}>{section.add.label}</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              </div>
              <ul className="m-0 flex list-none flex-col gap-0 p-0">
                {section.entries.length === 0 ? (
                  <li className="px-2 py-1.5 text-xs text-muted-foreground">{section.empty}</li>
                ) : (
                  section.entries.map((entry) => {
                    const btn = (
                      <button
                        type="button"
                        title={entry.label}
                        disabled={entry.disabled}
                        className="flex w-full items-center gap-2.5 rounded-[var(--r-lg)] px-2 py-1.5 text-start text-[color:var(--fg-2)] transition-colors duration-150 hover:bg-secondary hover:text-foreground focus-visible:bg-secondary focus-visible:text-foreground disabled:pointer-events-none disabled:opacity-50"
                        onClick={entry.onSelect}
                      >
                        <span className="inline-flex shrink-0">{entry.icon}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] leading-4">{entry.label}</span>
                          {entry.meta && <span className="block truncate text-[11px] leading-4 text-muted-foreground">{entry.meta}</span>}
                        </span>
                      </button>
                    );
                    return (
                      <li key={entry.id}>
                        {entry.menu?.length ? <HomeContextMenu actions={entry.menu}>{btn}</HomeContextMenu> : btn}
                      </li>
                    );
                  })
                )}
              </ul>
            </section>
          ))}
        </nav>

        <div className="flex shrink-0 flex-col gap-2 border-t border-foreground/[0.06] p-2">{footer}</div>
      </div>
    </aside>
  );
}
