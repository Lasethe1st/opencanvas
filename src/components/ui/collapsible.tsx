"use client";

import * as React from "react";

type CollapsibleContextValue = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

const CollapsibleContext = React.createContext<CollapsibleContextValue | null>(null);

function Collapsible({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolled, setUncontrolled] = React.useState(defaultOpen);
  const open = openProp ?? uncontrolled;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (openProp === undefined) setUncontrolled(next);
      onOpenChange?.(next);
    },
    [onOpenChange, openProp],
  );

  return (
    <CollapsibleContext.Provider value={{ open, onOpenChange: setOpen }}>
      <div data-slot="collapsible" data-state={open ? "open" : "closed"} {...props}>
        {children}
      </div>
    </CollapsibleContext.Provider>
  );
}

function CollapsibleTrigger({
  children,
  onClick,
  ...props
}: React.ComponentProps<"button">) {
  const ctx = React.useContext(CollapsibleContext);
  if (!ctx) throw new Error("CollapsibleTrigger must be used within Collapsible");
  return (
    <button
      type="button"
      data-slot="collapsible-trigger"
      aria-expanded={ctx.open}
      data-state={ctx.open ? "open" : "closed"}
      onClick={(e) => {
        onClick?.(e);
        if (!e.defaultPrevented) ctx.onOpenChange(!ctx.open);
      }}
      {...props}
    >
      {children}
    </button>
  );
}

function CollapsibleContent({
  children,
  ...props
}: React.ComponentProps<"div">) {
  const ctx = React.useContext(CollapsibleContext);
  if (!ctx) throw new Error("CollapsibleContent must be used within Collapsible");
  if (!ctx.open) return null;
  return (
    <div data-slot="collapsible-content" data-state="open" {...props}>
      {children}
    </div>
  );
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
