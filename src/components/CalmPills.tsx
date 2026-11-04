import { HugeiconsIcon } from '@hugeicons/react';
import { FilterHorizontalIcon, Home04Icon, LayoutAlignLeftIcon, LayoutAlignRightIcon, RulerDimensionLineIcon, RulerIcon, Search02Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { Menu } from 'bloom-menu';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { setLeafPage } from '../../shared/workspace-layout';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { toggleCalmPanel, useCalmPanels } from '../lib/calm';
import { focusPage } from '../lib/pages';
import { closeProject, selectElement } from '../lib/actions';
import { setMeasure, useMeasure } from '../lib/measure';
import { setRulers, useRulers } from '../lib/rulers';
import { getState, setState } from '../lib/store';
import { scheduleWorkspaceSave } from '../lib/workspace';
import { USER_AVATAR_SRC } from '../lib/user-avatar';
import { SearchOverlay } from './home/SearchOverlay';
import { mentionables, type Mentionable } from './assistant-shapes';

/** Corner and centre pills of the calm canvas: the same shapes as the home page's toggles, plus search. */
export function CalmPills() {
  const { left, right } = useCalmPanels();
  const measuring = useMeasure();
  const rulers = useRulers();
  const [searching, setSearching] = useState(false);
  return (
    <TooltipProvider>
      <div data-tw="" className={`calm-pills${rulers ? ' calm-pills--rulers' : ''}`}>
        <div className="calm-pill-pair absolute start-3 top-3 z-20 flex items-center gap-1.5">
          <Button variant="ghost" className="calm-circle calm-pill calm-pill--round relative size-9 rounded-full p-0 text-foreground [&_svg]:size-[18px]" aria-label={left ? 'Close left panel' : 'Open left panel'} aria-expanded={left} onClick={() => toggleCalmPanel('left')}>
            <HugeiconsIcon icon={left ? LayoutAlignRightIcon : LayoutAlignLeftIcon} strokeWidth={2} />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" className="calm-circle calm-pill calm-pill--round relative size-9 rounded-full p-0 text-foreground [&_svg]:size-[18px]" aria-label="Go home" onClick={() => void closeProject()}>
                <HugeiconsIcon icon={Home04Icon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Home</TooltipContent>
          </Tooltip>
        </div>
        <Button variant="ghost" className="calm-pill calm-pill--search absolute top-3 z-20 h-9 gap-2 rounded-full bg-muted px-4 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground [&_svg]:size-4" aria-label="Search layers and pages" style={{ left: '50%', translate: '-50% 0' }} onClick={() => setState({ canvasSearchOpen: true })}>
          <HugeiconsIcon icon={Search02Icon} strokeWidth={2} />
          <span>Search</span>
        </Button>
        <div className="calm-pill-pair calm-pill-pair--right absolute end-3 top-3 z-20 flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" className="calm-circle calm-pill calm-pill--round calm-pill--user relative size-9 overflow-hidden rounded-full p-2" aria-label="Account and settings" onClick={() => setState({ settingsOpen: true })}>
                <img src={USER_AVATAR_SRC} alt="" width={36} height={36} className="avatar size-full rounded-[var(--r-pill)] object-cover" draggable={false} referrerPolicy="no-referrer" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Account</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" className="calm-circle calm-pill calm-pill--right calm-pill--round relative size-9 rounded-full p-0 text-foreground [&_svg]:size-[18px]" aria-label={right ? 'Close right panel' : 'Open right panel'} aria-expanded={right} onClick={() => toggleCalmPanel('right')}>
                <HugeiconsIcon icon={right ? LayoutAlignLeftIcon : LayoutAlignRightIcon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">{right ? 'Close right panel' : 'Open right panel'}</TooltipContent>
          </Tooltip>
        </div>
        <div className="calm-pill-stack absolute end-3 z-20 flex flex-col gap-1.5" style={{ bottom: 12 }}>
          <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" className={`calm-circle calm-pill calm-pill--round calm-pill--ruler relative size-9 rounded-full p-0 text-foreground [&_svg]:size-[18px]`} aria-label={rulers ? 'Hide rulers' : 'Show rulers'} aria-pressed={rulers} onClick={() => setRulers(!rulers)}>
              <HugeiconsIcon icon={RulerIcon} strokeWidth={2} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{rulers ? 'Hide rulers' : 'Show rulers'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" className={`calm-circle calm-pill calm-pill--round calm-pill--measure relative size-9 rounded-full p-0 text-foreground [&_svg]:size-[18px]`} aria-label="Measure distances" aria-pressed={measuring} onClick={() => setMeasure(!measuring)}>
              <HugeiconsIcon icon={RulerDimensionLineIcon} strokeWidth={2} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{measuring ? 'Stop measuring' : 'Measure distances'}</TooltipContent>
        </Tooltip>
        </div>
      </div>
      {searching && <CalmSearch onClose={() => setSearching(false)} />}
    </TooltipProvider>
  );
}

function open(item: Mentionable) {
  if (item.kind === 'layer' && item.id) {
    selectElement(item.id, item.uid);
    return;
  }
  if (!item.id) return;
  focusPage(item.id);
  const ws = getState().workspace;
  const paneId = ws.focusedPaneId;
  setState({ workspace: { ...ws, layout: paneId ? setLeafPage(ws.layout, paneId, item.id) : ws.layout, activePageId: item.id } });
  scheduleWorkspaceSave();
}

/** Filter pills in the search: each one is a set of tags (or pages). Pick several to widen; none picked means everything. */
type Filter = { id: string; label: string; hint: string; match: (i: Mentionable) => boolean };
const tagIn = (tags: string[]) => (i: Mentionable) => i.kind === 'layer' && !!i.tag && tags.includes(i.tag.toLowerCase());
const FILTERS: Filter[] = [
  { id: 'pages', label: 'Pages', hint: 'Pages of the project', match: (i) => i.kind === 'page' },
  { id: 'headings', label: 'Headings', hint: 'h1 – h6', match: tagIn(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']) },
  { id: 'text', label: 'Text', hint: 'p, span, strong, em, blockquote, code…', match: tagIn(['p', 'span', 'strong', 'em', 'b', 'i', 'small', 'blockquote', 'code', 'pre', 'label']) },
  { id: 'links', label: 'Links', hint: 'a', match: tagIn(['a']) },
  { id: 'buttons', label: 'Buttons', hint: 'button', match: tagIn(['button']) },
  { id: 'images', label: 'Media', hint: 'img, picture, svg, video, audio, canvas', match: tagIn(['img', 'picture', 'svg', 'video', 'audio', 'canvas']) },
  { id: 'forms', label: 'Forms', hint: 'form, input, textarea, select', match: tagIn(['form', 'input', 'textarea', 'select']) },
  { id: 'boxes', label: 'Divs', hint: 'div, section, header, footer, nav, main, article, aside, ul, ol, li, figure', match: tagIn(['div', 'section', 'header', 'footer', 'nav', 'main', 'article', 'aside', 'ul', 'ol', 'li', 'figure']) },
];

const FILTER_BTN = 32;
const FILTER_MENU_W = 200;
/** Matches Menu.Root visualDuration so the close morph finishes before unmount. */
const FILTER_CLOSE_MS = 320;

function CalmSearch({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const [on, setOn] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const all = useMemo(() => mentionables().filter((i) => i.name), []);
  // Only offer a filter when the project has something it would show.
  const counts = useMemo(() => FILTERS.map((f) => ({ f, n: all.filter(f.match).length })).filter((c) => c.n > 0), [all]);
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    const active = FILTERS.filter((f) => on.includes(f.id));
    return all.filter((i) => (!s || i.name.toLowerCase().includes(s)) && (!active.length || active.some((f) => f.match(i)))).slice(0, 40);
  }, [q, on, all]);
  const toggle = (id: string) => { setOn((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])); setAt(0); };
  const go = (i?: Mentionable) => {
    if (!i) return;
    open(i);
    onClose();
  };
  return (
    <SearchOverlay onClose={() => (filtersOpen ? setFiltersOpen(false) : onClose())}>
      <div className="sticky top-0 z-10 -mx-2 rounded-t-[24px] bg-[var(--orb-pill-bg)] px-2 backdrop-blur-[20px] backdrop-saturate-150">
        <div className="flex items-center gap-2 px-3 py-3">
          <HugeiconsIcon icon={Search02Icon} size={18} strokeWidth={2} className="text-muted-foreground" />
          <input
            data-autofocus=""
            value={q}
            onChange={(e) => { setQ(e.target.value); setAt(0); }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') { e.preventDefault(); setAt((a) => Math.min(a + 1, items.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setAt((a) => Math.max(a - 1, 0)); }
              else if (e.key === 'Enter') { e.preventDefault(); go(items[at]); }
            }}
            placeholder="Search layers and pages"
            aria-label="Search layers and pages"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {counts.length > 0 && (
            <SearchFilterBloom
              counts={counts}
              active={on}
              open={filtersOpen}
              onOpenChange={setFiltersOpen}
              onToggle={toggle}
            />
          )}
        </div>
      </div>
      <ul role="listbox" aria-label="Results" className="m-0 list-none p-0">
        {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">{q.trim() ? `Nothing matches “${q}”.` : 'Nothing in those filters.'}</li>}
        {items.map((i, n) => (
          <li key={`${i.kind}:${i.id}:${n}`} role="option" aria-selected={n === at}>
            <button type="button" onMouseEnter={() => setAt(n)} onClick={() => go(i)} className={`flex w-full items-center justify-between gap-3 rounded-[10px] px-3 py-2 text-start text-sm ${n === at ? 'bg-muted' : ''}`}>
              <span className="truncate">{i.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{i.kind === 'page' ? `Page ${i.path ?? ''}` : i.tag ?? 'Layer'}</span>
            </button>
          </li>
        ))}
      </ul>
    </SearchOverlay>
  );
}

/** Filter icon that blooms into the tag filters. */
function SearchFilterBloom({
  counts,
  active,
  open,
  onOpenChange,
  onToggle,
}: {
  counts: { f: Filter; n: number }[];
  active: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggle: (id: string) => void;
}) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);
  const closeTimer = useRef<number | null>(null);
  const [origin, setOrigin] = useState<{ top: number; left: number } | null>(null);
  // 'opening' mounts the menu closed for one frame so the morph has a start state.
  const [phase, setPhase] = useState<'closed' | 'opening' | 'open'>('closed');

  useEffect(() => {
    if (phase !== 'opening') return;
    const id = requestAnimationFrame(() => setPhase('open'));
    return () => cancelAnimationFrame(id);
  }, [phase]);

  useEffect(() => () => {
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
  }, []);

  // Parent Escape (or overlay dismiss) asks us to close while the portal is up.
  useEffect(() => {
    if (open || phase === 'closed') return;
    const token = generation.current;
    setPhase('closed');
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      if (generation.current === token) setOrigin(null);
    }, FILTER_CLOSE_MS);
  }, [open, phase]);

  const openAt = (point: { top: number; left: number }) => {
    generation.current += 1;
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    setOrigin(point);
    setPhase('opening');
    onOpenChange(true);
  };

  const close = () => {
    const token = generation.current;
    setPhase('closed');
    onOpenChange(false);
    if (closeTimer.current != null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      if (generation.current === token) setOrigin(null);
    }, FILTER_CLOSE_MS);
  };

  return (
    <div className="relative z-10 shrink-0">
      <button
        ref={anchorRef}
        type="button"
        aria-label="Filter results"
        aria-haspopup="menu"
        aria-expanded={phase === 'open'}
        className={cn(
          'relative flex size-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
          phase !== 'closed' && 'invisible',
        )}
        onClick={() => {
          const rect = anchorRef.current?.getBoundingClientRect();
          if (!rect) return;
          openAt({ top: rect.top, left: rect.left });
        }}
      >
        <HugeiconsIcon icon={FilterHorizontalIcon} size={18} strokeWidth={2} aria-hidden />
        {active.length > 0 && (
          <span className="absolute -end-0.5 -top-0.5 flex size-3.5 items-center justify-center rounded-full bg-foreground text-[9px] font-medium leading-none text-background">
            {active.length}
          </span>
        )}
      </button>
      {origin &&
        createPortal(
          <div
            data-tw=""
            data-bloom-menu=""
            style={{ position: 'fixed', top: origin.top, left: origin.left, width: FILTER_BTN, height: FILTER_BTN, zIndex: 400 }}
          >
            <Menu.Root
              open={phase === 'open'}
              onOpenChange={(next) => (next ? setPhase('open') : close())}
              direction="bottom"
              anchor="end"
              closeOnEscape={false}
              bounce={0.12}
              visualDuration={0.28}
            >
              <Menu.Container
                buttonSize={FILTER_BTN}
                menuWidth={FILTER_MENU_W}
                menuRadius={14}
                buttonRadius={FILTER_BTN / 2}
                className="border border-border bg-card text-foreground"
                style={{ boxShadow: phase === 'open' ? 'var(--shadow-md)' : 'none' }}
              >
                <Menu.Trigger className="text-muted-foreground [&_svg]:size-[18px]">
                  <span className="sr-only">Filter results</span>
                  <HugeiconsIcon icon={FilterHorizontalIcon} strokeWidth={2} aria-hidden />
                </Menu.Trigger>
                <Menu.Content className="flex flex-col gap-0.5 p-1.5" style={{ width: FILTER_MENU_W - 2, boxSizing: 'border-box' }}>
                  {counts.map(({ f, n }) => {
                    const isOn = active.includes(f.id);
                    return (
                      <Menu.Item
                        key={f.id}
                        closeOnSelect={false}
                        className={cn(
                          'flex w-full cursor-pointer select-none items-center gap-2 rounded-[10px] px-2.5 py-1.5 text-sm outline-none transition-colors duration-150 hover:bg-muted',
                          isOn && 'bg-muted',
                        )}
                        onSelect={() => onToggle(f.id)}
                      >
                        <span className="min-w-0 flex-1 truncate" title={f.hint}>{f.label}</span>
                        <span className="tabular-nums text-xs text-muted-foreground">{n}</span>
                        <span className="flex size-3.5 shrink-0 items-center justify-center" aria-hidden>
                          {isOn && <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2} />}
                        </span>
                      </Menu.Item>
                    );
                  })}
                </Menu.Content>
              </Menu.Container>
            </Menu.Root>
          </div>,
          document.body,
        )}
    </div>
  );
}
