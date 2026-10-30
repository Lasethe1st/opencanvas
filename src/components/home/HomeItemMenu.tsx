import { HugeiconsIcon } from '@hugeicons/react';
import { BubbleChatUploadIcon, Delete02Icon, EllipsisIcon } from '@hugeicons/core-free-icons';
import { Menu } from 'bloom-menu';
import { Summary } from 'lucide-react';
import { useEffect, useId, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
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

/** Ellipsis trigger that morphs into the same actions (bloom-menu). */
export function HomeEllipsisMenu({
  actions,
  label = 'More options',
}: {
  actions: HomeMenuAction[];
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!actions.length) return null;
  return (
    <div
      className="relative z-[210] shrink-0"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Menu.Root open={open} onOpenChange={setOpen} direction="bottom" anchor="end" bounce={0.12} visualDuration={0.28}>
        <Menu.Container
          buttonSize={28}
          menuWidth={168}
          menuRadius={10}
          buttonRadius={6}
          className={cn(
            'border border-[color:var(--frost-border)] bg-[var(--frost-bg)] text-muted-foreground',
            'opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100',
            open && 'opacity-100 text-foreground',
          )}
          style={{
            WebkitBackdropFilter: 'var(--frost-filter)',
            backdropFilter: 'var(--frost-filter)',
            boxShadow: open ? 'var(--shadow-md)' : 'none',
          }}
        >
          <Menu.Trigger className="text-muted-foreground hover:text-foreground [&_svg]:size-4">
            <span className="sr-only">{label}</span>
            <HugeiconsIcon icon={EllipsisIcon} strokeWidth={2} aria-hidden />
          </Menu.Trigger>
          <Menu.Content className="flex flex-col gap-0.5 p-1 pt-1.5">
            {actions.map((action) => (
              <Menu.Item
                key={action.id}
                className={cn(
                  'flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none transition-colors duration-150 hover:bg-accent [&_svg]:size-4 [&_svg]:shrink-0',
                  action.destructive
                    ? 'text-destructive [&_svg]:text-destructive'
                    : 'text-foreground [&_svg]:text-muted-foreground',
                )}
                onSelect={action.onSelect}
              >
                {action.icon}
                {action.label}
              </Menu.Item>
            ))}
          </Menu.Content>
        </Menu.Container>
      </Menu.Root>
    </div>
  );
}
