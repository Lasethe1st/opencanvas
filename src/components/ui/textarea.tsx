import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full resize-none rounded-md border-0 bg-muted px-3 py-2 text-base text-foreground outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-muted-foreground focus-visible:bg-secondary focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-2 aria-invalid:ring-destructive/30",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
