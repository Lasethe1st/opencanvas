import { HugeiconsIcon } from '@hugeicons/react';
import { Home04Icon, LayoutAlignLeftIcon, LayoutAlignRightIcon, RulerDimensionLineIcon, RulerIcon, Search02Icon } from '@hugeicons/core-free-icons';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toggleCalmPanel, useCalmPanels } from '../lib/calm';
import { useExperienceLevel } from '../lib/experience';
import { closeProject } from '../lib/actions';
import { setMeasure, useMeasure } from '../lib/measure';
import { setRulers, useRulers } from '../lib/rulers';
import { setState } from '../lib/store';
import { USER_AVATAR_SRC } from '../lib/user-avatar';

/** Corner and centre pills of the calm canvas: the same shapes as the home page's toggles, plus search. */
export function CalmPills() {
  const { left, right } = useCalmPanels();
  const level = useExperienceLevel();
  const showSidePanels = level !== 'beginner';
  const showGuides = level !== 'beginner';
  const measuring = useMeasure();
  const rulers = useRulers();
  return (
    <TooltipProvider>
      <div data-tw="" className={`calm-pills${rulers && showGuides ? ' calm-pills--rulers' : ''}`}>
        <div className="calm-pill-pair absolute start-3 top-3 z-20 flex items-center gap-1.5">
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
