import { Button } from '@/components/lime/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/lime/ui/tooltip';
import { cn } from '@/lib/lime/utils';

/** Persistent vertical tool rail on the left edge of the workspace. */
export function ToolRail({ children }) {
  return (
    <nav className="flex h-full w-14 shrink-0 flex-col items-center gap-1 border-e border-line bg-surface py-2" aria-label="Tools">
      {children}
    </nav>
  );
}

export function ToolButton({ label, shortcut, active, children, className, ...rest }) {
  const tip = shortcut ? `${label} (${shortcut})` : label;
  return (
    <span className={cn('rounded-control', active && 'bg-accent-wash')}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon"
              aria-label={label}
              aria-pressed={active}
              className={className}
              {...rest}
            />
          }
        >
          {children}
        </TooltipTrigger>
        <TooltipContent side="right">{tip}</TooltipContent>
      </Tooltip>
    </span>
  );
}

export function ToolGroup({ children }) {
  return <div className="flex flex-col items-center gap-0.5">{children}</div>;
}

export function ToolSeparator() {
  return <span className="my-1 h-px w-8 bg-line-strong" role="separator" />;
}

/** Popover that opens to the right of a rail button. */
export function ToolFlyout({ title, children }) {
  return (
    <div className="absolute start-full top-0 z-(--z-popover) ms-2 w-64 rounded-panel border border-line bg-raised p-2 text-fg shadow-menu" role="menu">
      {title && <div className="mb-1 px-2 py-1 text-xs font-medium text-fg-3">{title}</div>}
      {children}
    </div>
  );
}
