"use client";

import * as React from "react";
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function ScrollArea({
  className,
  children,
  viewportRef,
  fill,
  // Radix defaults to "hover", which only reveals the bar on pointer enter.
  // Windows draws persistent native scrollbars, so hover-only would drop the
  // "there is more below" cue this app relied on. "auto" is the native rule:
  // visible exactly while the content overflows.
  type = "auto",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  /** Ref to the scrolling element itself — what `scrollTo` has to target. */
  viewportRef?: React.Ref<HTMLDivElement>;
  /**
   * Give the content box a definite height so a `min-h-full` wrapper — and the
   * `flex-1` children inside it — can fill the region. See the comment below.
   */
  fill?: boolean;
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      type={type}
      className={cn("relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        className={cn(
          "focus-visible:ring-ring/50 size-full rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:ring-[3px] focus-visible:outline-1",
          // Radix wraps the content in an inline-styled `display:table;
          // min-width:100%` div. A table box has no definite height, so a
          // `flex-1` child (an Empty state, a full-height two-column row)
          // collapses to its content size instead of filling the region the way
          // it does in a plain `overflow-y-auto` div. `fill` swaps it for a
          // block box at the viewport's height — which the viewport does have —
          // so the child's own `min-h-full` resolves. `!block` beats the inline
          // style; overflow past that height still scrolls, since scrollable
          // overflow counts descendants. The trade-off: losing shrink-to-fit
          // clips content wider than the viewport instead of scrolling it,
          // which is fine for a vertical-only region.
          fill && "[&>div]:!block [&>div]:h-full",
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none p-px transition-colors select-none",
        orientation === "vertical" &&
          "h-full w-2.5 border-l border-l-transparent",
        orientation === "horizontal" &&
          "h-2.5 flex-col border-t border-t-transparent",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        // Deliberately the MoldAI `muted` (text) token, not shadcn's stock
        // `bg-border`: #ded9cc reaches only 1.26:1 on paper, so a hand-drawn
        // thumb in it would be invisible where the native one was not. A
        // draggable thumb is a UI component under WCAG 1.4.11, which wants 3:1
        // — `muted` (#6e6b60) clears it at 4.77:1 on paper, 5.34:1 on white.
        className="bg-muted relative flex-1 rounded-full"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
