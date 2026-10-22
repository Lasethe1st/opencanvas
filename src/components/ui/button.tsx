import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

/* Press feedback: 0.96 over 150ms, only when enabled and only when the user allows motion.
   Transitions name their properties (never `all`). The focus ring is an outline so it survives forced-colors mode. */
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[background-color,color,scale] duration-150 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 motion-safe:enabled:active:scale-[0.96] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border-0 bg-muted text-foreground hover:bg-secondary",
        ghost: "text-foreground hover:bg-accent",
        destructive: "bg-destructive text-white hover:bg-destructive/90",
        link: "text-foreground underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 px-3.5 has-[>[data-icon=inline-start]]:ps-3 has-[>[data-icon=inline-end]]:pe-3",
        sm: "h-7 gap-1.5 px-2.5 text-xs has-[>[data-icon=inline-start]]:ps-2 has-[>[data-icon=inline-end]]:pe-2",
        lg: "h-10 px-5 text-base",
        icon: "size-8",
        "icon-sm": "size-7",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      type={asChild ? undefined : (type ?? "button")}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button, buttonVariants };
