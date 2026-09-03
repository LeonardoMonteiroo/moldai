"use client";

import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

const PROGRESS_SIZES = {
  default: "h-2",
  // A thinner track for compact contexts (the dashboard onboarding
  // checklist, per the redesign reference) -- a variant here rather than a
  // per-call-site className override, matching Button's size scale.
  thin: "h-[5px]",
} as const;

function Progress({
  className,
  value,
  size = "default",
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  size?: keyof typeof PROGRESS_SIZES;
}) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      value={value}
      className={cn(
        // `bg-track` (#ece8dd), not shadcn's stock `bg-primary/20`: every
        // progress track in the design handoff is that one warm token
        // (Dashboard.dc.html's checklist bar, the header credits pill,
        // Configuracoes' usage bar), never a tint of the olive fill. Three
        // call sites were already overriding it back to `bg-track` one at a
        // time -- this is the primitive-level fix that rule asks for.
        "bg-track relative w-full overflow-hidden rounded-full",
        PROGRESS_SIZES[size],
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="bg-primary h-full w-full flex-1 transition-all"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
