import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, AiChat02Icon, Home04Icon, LayoutAlignLeftIcon, LayoutAlignRightIcon, RulerDimensionLineIcon, RulerIcon, Search02Icon } from '@hugeicons/core-free-icons';
import { CalmPagePill } from './CalmPagePill';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toggleCalmPanel, useCalmPanels } from '../lib/calm';
import { useExperienceLevel } from '../lib/experience';
import { closeProject } from '../lib/actions';
import { setMeasure, useMeasure } from '../lib/measure';
import { setRulers, useRulers } from '../lib/rulers';
import { openInsertMenu } from '../lib/element-menu';
import { getState, setState, useStore } from '../lib/store';
import { prepareFrameInsert } from './InsertContextMenu';
import { USER_AVATAR_SRC } from '../lib/user-avatar';

/** Opens the insert menu from the + pill: elements go into the page's active frame, frames onto the page. */
function openAddMenu(button: HTMLElement) {
  const r = button.getBoundingClientRect();
  const vp = document.querySelector('.stage__viewport')?.getBoundingClientRect();
  const { camera, activeFrameId } = getState();
  const cx = (vp?.width ?? window.innerWidth) / 2;
  const cy = (vp?.height ?? window.innerHeight) / 2;
  if (activeFrameId) prepareFrameInsert(activeFrameId);
  openInsertMenu({ x: r.left, y: r.bottom + 6, frameId: activeFrameId, world: { x: (cx - camera.x) / camera.zoom, y: (cy - camera.y) / camera.zoom } });
}

/** Corner and centre pills of the calm canvas: the same shapes as the home page's toggles, plus search. */
export function CalmPills() {
  const { left, right } = useCalmPanels();
  const level = useExperienceLevel();
  const showSidePanels = level !== 'beginner';
  const showGuides = level !== 'beginner';
  const measuring = useMeasure();
  const rulers = useRulers();
  const chatOpen = useStore((s) => s.dockMode === 'input');
  return (
    <TooltipProvider>
      <div data-tw="" className={`calm-pills${rulers && showGuides ? ' calm-pills--rulers' : ''}`}>
        <div className="calm-pill-pair absolute start-3 top-3 z-20 flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" className="calm-circle calm-pill calm-pill--round relative size-9 rounded-full p-0 text-foreground [&_svg]:size-[18px]" aria-label={chatOpen ? 'Close AI chat' : 'Open AI chat'} aria-pressed={chatOpen} onClick={() => setState({ dockMode: chatOpen ? null : 'input' })}>
                <HugeiconsIcon icon={AiChat02Icon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{chatOpen ? 'Close AI chat' : 'AI chat'}</TooltipContent>
          </Tooltip>
          {showSidePanels && (
            <Button variant="ghost" className="calm-circle calm-pill calm-pill--round relative size-9 rounded-full p-0 text-foreground [&_svg]:size-[18px]" aria-label={left ? 'Close left panel' : 'Open left panel'} aria-expanded={left} onClick={() => toggleCalmPanel('left')}>
              <HugeiconsIcon icon={left ? LayoutAlignRightIcon : LayoutAlignLeftIcon} strokeWidth={2} />
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" className="calm-circle calm-pill calm-pill--round relative size-9 rounded-full p-0 text-foreground [&_svg]:size-[18px]" aria-label="Go home" onClick={() => void closeProject()}>
                <HugeiconsIcon icon={Home04Icon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Home</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" className="calm-circle calm-pill calm-pill--round relative size-9 rounded-full p-0 text-foreground [&_svg]:size-[18px]" aria-label="Add to page" onClick={(e) => openAddMenu(e.currentTarget)}>
                <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Add to page</TooltipContent>
          </Tooltip>
        </div>
        <div className="absolute start-3 z-50" style={{ bottom: 12 }}>
          <CalmPagePill side="top" />
        </div>
        <div className="absolute top-3 z-20 flex items-center gap-2" style={{ left: '50%', translate: '-50% 0' }}>
        <Button variant="ghost" className="calm-circle calm-pill calm-pill--search h-9 gap-2 rounded-full px-4 text-xs font-medium text-muted-foreground hover:text-foreground [&_svg]:size-4" aria-label="Search layers and pages" onClick={() => setState({ canvasSearchOpen: true })}>
          <HugeiconsIcon icon={Search02Icon} strokeWidth={2} />
          <span>Search</span>
        </Button>
        </div>
        <div className="calm-pill-pair calm-pill-pair--right absolute end-3 top-3 z-20 flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" className="calm-circle calm-pill calm-pill--round calm-pill--user relative size-9 overflow-hidden rounded-full p-2" aria-label="Account and settings" onClick={() => setState({ settingsOpen: true })}>
                <img src={USER_AVATAR_SRC} alt="" width={36} height={36} className="avatar size-full rounded-[var(--r-pill)] object-cover" draggable={false} referrerPolicy="no-referrer" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Account</TooltipContent>
          </Tooltip>
          {showSidePanels && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" className="calm-circle calm-pill calm-pill--right calm-pill--round relative size-9 rounded-full p-0 text-foreground [&_svg]:size-[18px]" aria-label={right ? 'Close right panel' : 'Open right panel'} aria-expanded={right} onClick={() => toggleCalmPanel('right')}>
                  <HugeiconsIcon icon={right ? LayoutAlignLeftIcon : LayoutAlignRightIcon} strokeWidth={2} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">{right ? 'Close right panel' : 'Open right panel'}</TooltipContent>
            </Tooltip>
          )}
        </div>
        {showGuides && (
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
        )}
      </div>
    </TooltipProvider>
  );
}
