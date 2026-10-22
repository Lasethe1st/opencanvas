import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';
import { cn } from '@/lib/utils';

function TooltipProvider({ delayDuration = 300, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

/** Tooltips are high-frequency, so they appear instantly with no animation. */
function TooltipContent({ className, sideOffset = 4, ...props }: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-tw=""
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          'z-[110] rounded-[var(--pill)] border border-[color:var(--line)] bg-[color:var(--surface-3)]/90 px-3 py-2 text-xs font-medium text-foreground shadow-[var(--shadow-md)] backdrop-blur-[20px] backdrop-saturate-150',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
