import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/* Fill-only surface for a control plus addons — no stroke; focus darkens the fill. */
function InputGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="input-group"
      role="group"
      className={cn(
        "group/input-group relative flex h-8 w-full min-w-0 items-center rounded-md border-0 bg-muted outline-none transition-[background-color] duration-150",
        "has-[>textarea]:h-auto has-[>[data-align=block-end]]:h-auto has-[>[data-align=block-start]]:h-auto has-[>[data-align=block-end]]:flex-col has-[>[data-align=block-start]]:flex-col",
        "has-[[data-slot=input-group-control]:focus-visible]:bg-secondary",
        "has-[[data-slot][aria-invalid=true]]:ring-2 has-[[data-slot][aria-invalid=true]]:ring-destructive/30",
        className,
      )}
      {...props}
    />
  );
}

const inputGroupAddonVariants = cva(
  "flex h-auto cursor-text select-none items-center justify-center gap-2 text-sm text-muted-foreground [&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        "inline-start": "order-first ps-2.5 has-[>button]:-ms-1",
        "inline-end": "order-last pe-2.5 has-[>button]:-me-1",
        "block-start": "order-first w-full justify-start px-3 pt-3",
        "block-end": "order-last w-full justify-start px-3 pb-3",
      },
    },
    defaultVariants: { align: "inline-start" },
  },
);

function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        e.currentTarget.parentElement
          ?.querySelector<HTMLElement>("[data-slot=input-group-control]")
          ?.focus();
      }}
      {...props}
    />
  );
}

function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  size = "icon-sm",
  ...props
}: React.ComponentProps<typeof Button>) {
  return (
    <Button
      type={type}
      variant={variant}
      size={size}
      className={cn("shadow-none", className)}
      {...props}
    />
  );
}

function InputGroupText({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "flex items-center gap-2 text-sm text-muted-foreground [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function InputGroupInput({
  className,
  ...props
}: React.ComponentProps<"input">) {
  return (
    <Input
      data-slot="input-group-control"
      className={cn(
        "flex-1 rounded-none border-0 bg-transparent px-2.5 focus-visible:ring-0",
        className,
      )}
      {...props}
    />
  );
}

const InputGroupTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.ComponentProps<"textarea">
>(function InputGroupTextarea({ className, ...props }, ref) {
  return (
    <Textarea
      ref={ref}
      data-slot="input-group-control"
      className={cn(
        "flex-1 resize-none rounded-none border-0 bg-transparent px-3 py-3 focus-visible:bg-transparent focus-visible:ring-0",
        className,
      )}
      {...props}
    />
  );
});

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
  InputGroupTextarea,
};
