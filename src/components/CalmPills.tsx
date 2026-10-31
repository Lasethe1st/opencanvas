import { HugeiconsIcon } from '@hugeicons/react';
import { LayoutAlignLeftIcon, LayoutAlignRightIcon, Search02Icon, SlidersHorizontalIcon } from '@hugeicons/core-free-icons';
import { useMemo, useState } from 'react';
import { setLeafPage } from '../../shared/workspace-layout';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toggleCalmPanel, useCalmPanels } from '../lib/calm';
import { focusPage } from '../lib/pages';
import { selectElement } from '../lib/actions';
import { getState, setState } from '../lib/store';
import { scheduleWorkspaceSave } from '../lib/workspace';
import { SearchOverlay } from './home/SearchOverlay';
import { mentionables, type Mentionable } from './assistant-shapes';

/** Corner and centre pills of the calm canvas: the same shapes as the home page's toggles, plus search. */
export function CalmPills() {
  const { left, right } = useCalmPanels();
  const [searching, setSearching] = useState(false);
  return (
    <TooltipProvider>
      <div data-tw="" className="calm-pills">
        <Button variant="ghost" className="calm-pill calm-pill--left absolute start-3 top-3 z-20 size-9 rounded-[8px] px-2.5 py-0 text-muted-foreground hover:text-foreground [&_svg]:size-[18px]" aria-label={left ? 'Close left panel' : 'Open left panel'} aria-expanded={left} onClick={() => toggleCalmPanel('left')}>
          <HugeiconsIcon icon={left ? LayoutAlignRightIcon : LayoutAlignLeftIcon} strokeWidth={2} />
        </Button>
        <Button variant="ghost" className="calm-pill calm-pill--search absolute top-3 z-20 h-9 gap-2 rounded-[var(--pill)] bg-muted px-4 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground [&_svg]:size-4" aria-label="Search layers and pages" style={{ left: '50%', translate: '-50% 0' }} onClick={() => setSearching(true)}>
          <HugeiconsIcon icon={Search02Icon} strokeWidth={2} />
          <span>Search</span>
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" className="calm-pill calm-pill--right absolute end-3 top-3 z-20 h-9 gap-1.5 rounded-[var(--pill)] bg-muted px-3.5 text-xs font-medium text-foreground hover:bg-secondary [&_svg]:size-4" aria-label={right ? 'Close right panel' : 'Open right panel'} aria-expanded={right} onClick={() => toggleCalmPanel('right')}>
              <HugeiconsIcon icon={right ? LayoutAlignLeftIcon : SlidersHorizontalIcon} strokeWidth={2} />
              <span>{right ? 'Close' : 'Inspector'}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{right ? 'Close right panel' : 'Open right panel'}</TooltipContent>
        </Tooltip>
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

function CalmSearch({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState('');
  const [at, setAt] = useState(0);
  const items = useMemo(() => {
    const s = q.trim().toLowerCase();
    return mentionables().filter((i) => i.name && (!s || i.name.toLowerCase().includes(s))).slice(0, 40);
  }, [q]);
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
      <ul role="listbox" aria-label="Results" className="m-0 list-none p-0">
        {items.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted-foreground">Nothing matches “{q}”.</li>}
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
