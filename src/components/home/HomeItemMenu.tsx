import { HugeiconsIcon } from '@hugeicons/react';
import { BubbleChatUploadIcon, Delete02Icon, EllipsisIcon } from '@hugeicons/core-free-icons';
import { Summary } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export type HomeMenuAction = {
  id: string;
  label: string;
  icon: ReactNode;
  destructive?: boolean;
  onSelect: () => void;
};

/** Standard chat/project actions: delete, share, summarize. */
export function homeItemActions(opts: {
  onDelete: () => void;
  onShare: () => void;
  onSummarize: () => void;
}): HomeMenuAction[] {
  return [
    {
      id: 'delete',
      label: 'Delete',
      destructive: true,
      icon: <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />,
      onSelect: opts.onDelete,
    },
    {
      id: 'share',
      label: 'Share',
      icon: <HugeiconsIcon icon={BubbleChatUploadIcon} strokeWidth={2} />,
      onSelect: opts.onShare,
    },
    {
      id: 'summarize',
      label: 'Summarize',
      icon: <Summary strokeWidth={2} />,
      onSelect: opts.onSummarize,
    },
  ];
}

function MenuList({ actions, onDone }: { actions: HomeMenuAction[]; onDone?: () => void }) {
  return (
    <>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          role="menuitem"
          className={cn(
            'flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors duration-150 hover:bg-accent focus-visible:bg-accent [&_svg]:size-4 [&_svg]:shrink-0',
            action.destructive ? 'text-destructive [&_svg]:text-destructive' : '[&_svg]:text-muted-foreground',
          )}
          onClick={() => {
            action.onSelect();
            onDone?.();
          }}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
    </>
  );
}

/** Right-click menu anchored at the pointer. */
export function HomeContextMenu({
  actions,
  children,
  className,
}: {
  actions: HomeMenuAction[];
  children: ReactNode;
  className?: string;
}) {
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const menuId = useId();

  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', close, true);
    };
  }, [pos]);

  if (!actions.length) return <>{children}</>;

  return (
    <>
      <div
        className={className}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setPos({ x: e.clientX, y: e.clientY });
        }}
      >
        {children}
      </div>
      {pos &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[200]" aria-hidden onPointerDown={() => setPos(null)} />
            <div
              id={menuId}
              role="menu"
              data-tw=""
              className="fixed z-[201] min-w-[160px] overflow-hidden rounded-lg border border-[color:var(--frost-border)] bg-[var(--frost-bg)] p-1 text-popover-foreground shadow-[var(--shadow-md)]"
              style={{
                left: Math.min(pos.x, window.innerWidth - 180),
                top: Math.min(pos.y, window.innerHeight - 140),
                WebkitBackdropFilter: 'var(--frost-filter)',
                backdropFilter: 'var(--frost-filter)',
              }}
            >
              <MenuList actions={actions} onDone={() => setPos(null)} />
            </div>
          </>,
          document.body,
        )}
    </>
  );
}

/** Ellipsis trigger that opens the same actions in a dropdown. */
export function HomeEllipsisMenu({
  actions,
  label = 'More options',
}: {
  actions: HomeMenuAction[];
  label?: string;
}) {
  if (!actions.length) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-[6px] text-muted-foreground opacity-0 transition-[opacity,background-color,color] duration-150 hover:bg-accent hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:bg-accent data-[state=open]:text-foreground data-[state=open]:opacity-100 [&_svg]:size-4"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <HugeiconsIcon icon={EllipsisIcon} strokeWidth={2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="z-[210] min-w-[160px] border border-[color:var(--frost-border)] bg-[var(--frost-bg)] backdrop-blur-none"
        style={{ WebkitBackdropFilter: 'var(--frost-filter)', backdropFilter: 'var(--frost-filter)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {actions.map((action) => (
          <DropdownMenuItem
            key={action.id}
            className={action.destructive ? 'text-destructive focus:text-destructive [&_svg]:text-destructive' : undefined}
            onSelect={(e) => {
              e.preventDefault();
              action.onSelect();
            }}
          >
            {action.icon}
            {action.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
