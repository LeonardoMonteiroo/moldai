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
      className={cn(
        "bg-primary/20 relative w-full overflow-hidden rounded-full",
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
