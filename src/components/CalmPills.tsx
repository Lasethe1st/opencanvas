import { HugeiconsIcon } from '@hugeicons/react';
import { Home04Icon, LayoutAlignLeftIcon, LayoutAlignRightIcon, RulerDimensionLineIcon, RulerIcon, Search02Icon } from '@hugeicons/core-free-icons';
import { useMemo, useState } from 'react';
import { setLeafPage } from '../../shared/workspace-layout';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toggleCalmPanel, useCalmPanels } from '../lib/calm';
import { focusPage } from '../lib/pages';
import { closeProject, selectElement } from '../lib/actions';
import { setMeasure, useMeasure } from '../lib/measure';
import { setRulers, useRulers } from '../lib/rulers';
import { getState, setState } from '../lib/store';
import { scheduleWorkspaceSave } from '../lib/workspace';
import { USER_AVATAR_SRC } from '../lib/user-avatar';
import { SearchOverlay } from './home/SearchOverlay';
import { MergeGroup } from './MergeLayer';
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
        <MergeGroup className="calm-pill-pair absolute start-3 top-3 z-20 flex items-center gap-3">
          <Button data-merge="" variant="ghost" className="calm-pill calm-pill--round relative size-9 rounded-full bg-transparent p-0 text-foreground hover:bg-transparent [&_svg]:size-[18px]" aria-label={left ? 'Close left panel' : 'Open left panel'} aria-expanded={left} onClick={() => toggleCalmPanel('left')}>
            <HugeiconsIcon icon={left ? LayoutAlignRightIcon : LayoutAlignLeftIcon} strokeWidth={2} />
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button data-merge="" variant="ghost" className="calm-pill calm-pill--round relative size-9 rounded-full bg-transparent p-0 text-foreground hover:bg-transparent [&_svg]:size-[18px]" aria-label="Go home" onClick={() => void closeProject()}>
                <HugeiconsIcon icon={Home04Icon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Home</TooltipContent>
          </Tooltip>
        </MergeGroup>
        <Button variant="ghost" className="calm-pill calm-pill--search absolute top-3 z-20 h-9 gap-2 rounded-full bg-muted px-4 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground [&_svg]:size-4" aria-label="Search layers and pages" style={{ left: '50%', translate: '-50% 0' }} onClick={() => setSearching(true)}>
          <HugeiconsIcon icon={Search02Icon} strokeWidth={2} />
          <span>Search</span>
        </Button>
        <MergeGroup className="calm-pill-pair calm-pill-pair--right absolute end-3 top-3 z-20 flex items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button data-merge="" variant="ghost" className="calm-pill calm-pill--round calm-pill--user relative size-9 overflow-hidden rounded-full bg-transparent p-2 hover:bg-transparent" aria-label="Account and settings" onClick={() => setState({ settingsOpen: true })}>
                <img src={USER_AVATAR_SRC} alt="" width={36} height={36} className="avatar size-full rounded-[var(--r-pill)] object-cover" draggable={false} referrerPolicy="no-referrer" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Account</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button data-merge="" variant="ghost" className="calm-pill calm-pill--right calm-pill--round relative size-9 rounded-full bg-transparent p-0 text-foreground hover:bg-transparent [&_svg]:size-[18px]" aria-label={right ? 'Close right panel' : 'Open right panel'} aria-expanded={right} onClick={() => toggleCalmPanel('right')}>
                <HugeiconsIcon icon={right ? LayoutAlignLeftIcon : LayoutAlignRightIcon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">{right ? 'Close right panel' : 'Open right panel'}</TooltipContent>
          </Tooltip>
        </MergeGroup>
        <MergeGroup axis="column" className="calm-pill-stack absolute end-3 z-20 flex flex-col gap-3" style={{ bottom: 12 }}>
          <Tooltip>
          <TooltipTrigger asChild>
            <Button data-merge="" variant="ghost" className={`calm-pill calm-pill--round calm-pill--ruler relative size-9 rounded-full p-0 [&_svg]:size-[18px] ${rulers ? 'bg-foreground text-background hover:bg-foreground' : 'bg-transparent text-foreground hover:bg-foreground/10'}`} aria-label={rulers ? 'Hide rulers' : 'Show rulers'} aria-pressed={rulers} onClick={() => setRulers(!rulers)}>
              <HugeiconsIcon icon={RulerIcon} strokeWidth={2} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{rulers ? 'Hide rulers' : 'Show rulers'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button data-merge="" variant="ghost" className={`calm-pill calm-pill--round calm-pill--measure relative size-9 rounded-full p-0 [&_svg]:size-[18px] ${measuring ? 'bg-foreground text-background hover:bg-foreground' : 'bg-transparent text-foreground hover:bg-foreground/10'}`} aria-label="Measure distances" aria-pressed={measuring} onClick={() => setMeasure(!measuring)}>
              <HugeiconsIcon icon={RulerDimensionLineIcon} strokeWidth={2} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{measuring ? 'Stop measuring' : 'Measure distances'}</TooltipContent>
        </Tooltip>
        </MergeGroup>
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

function CalmSearch({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const [on, setOn] = useState<string[]>([]);
  const all = useMemo(() => mentionables().filter((i) => i.name), []);
  // Only offer a pill when the project has something it would show.
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
    <SearchOverlay onClose={onClose}>
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
      </div>
      {counts.length > 0 && (
        <div data-bloom-menu="" role="group" aria-label="Filter results" className="flex flex-wrap gap-1.5 px-3 pb-2.5">
          {counts.map(({ f, n }) => {
            const active = on.includes(f.id);
            return (
              <button
                key={f.id}
                type="button"
                title={f.hint}
                aria-pressed={active}
                onClick={() => toggle(f.id)}
                className={`calm-pill inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium outline-none transition-[background-color,color,transform] duration-150 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-ring ${active ? 'bg-foreground text-background' : 'bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground'}`}
              >
                {f.label}
                <span className={`tabular-nums ${active ? 'opacity-70' : 'opacity-60'}`}>{n}</span>
              </button>
            );
          })}
        </div>
      )}
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
