import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** One entry in the sidebar list. The full path stays in the tooltip. */
export function ProjectRow({
  icon,
  name,
  detail,
  path,
  active,
  hint,
  ...rest
}: {
  icon: ReactNode;
  name: string;
  detail?: string;
  path: string;
  active?: boolean;
  hint?: string;
} & Omit<React.ComponentProps<"button">, "name">) {
  return (
    <button
      type="button"
      title={path}
      aria-description={path}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-start transition-colors duration-150 hover:bg-accent focus-visible:bg-accent",
        active && "bg-accent",
      )}
      {...rest}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <strong className="block truncate text-sm font-medium">{name}</strong>
        {detail && (
          <span className="block truncate text-xs text-muted-foreground">
            {detail}
          </span>
        )}
      </span>
      {hint && (
        <span className="shrink-0 text-xs text-muted-foreground">{hint}</span>
      )}
    </button>
  );
}

/** Placeholder rows while the recent list loads. */
export function ProjectRowSkeletons({ count = 4 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-0.5 px-1">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex items-center gap-2.5 px-2 py-1.5">
          <Skeleton className="size-8 rounded-md" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-3/5" />
            <Skeleton className="h-2.5 w-1/4" />
          </div>
        </div>
      ))}
    </div>
  );
}
