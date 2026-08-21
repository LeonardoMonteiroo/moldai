import * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      // Type comes from the named scale, so the stock text-base/md:text-sm this
      // primitive ships with is replaced by the same text-body/md:text-control
      // pair input.tsx uses — a 14px default is out of scale here.
      // field-sizing-content is what makes it grow with its content, so no
      // JS height measuring is needed.
      className={cn(
        "border-input placeholder:text-muted-foreground dark:bg-input/30 text-body md:text-control flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
