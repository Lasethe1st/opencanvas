import type { ReactNode } from 'react';
import { ListItem } from '@/components/lime/ui/list';
import { Skeleton } from '@/components/lime/ui/skeleton';

/** One entry in a project or chat list. Parent must be a Lime List. */
export function ProjectRow({
  icon,
  name,
  detail,
  path,
  hint,
  onClick,
  onMouseEnter,
  disabled,
}: {
  icon: ReactNode;
  name: string;
  detail?: string;
  path: string;
  active?: boolean;
  hint?: string;
  onClick?: () => void;
  onMouseEnter?: () => void;
  disabled?: boolean;
}) {
  return (
    <ListItem
      leading={icon}
      title={name}
      description={detail}
      trailing={hint}
      onClick={onClick}
      disabled={disabled}
      chevron={false}
      aria-description={path}
      onMouseEnter={onMouseEnter}
    />
  );
}

/** Placeholder rows while the recent list loads. */
export function ProjectRowSkeletons({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-0.5 px-1">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2">
          <Skeleton className="size-10 rounded-full" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
