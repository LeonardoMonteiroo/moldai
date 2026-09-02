import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-meta font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        secondary:
          "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        destructive:
          "bg-destructive text-white focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/90",
        outline:
          "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        ghost: "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
        accent: "bg-accent text-accent-foreground",
        // amber attention pill — credits, warnings, plan notes (bg-amber-bg is used
        // in 10 screens; this is the one place it should be spelled out)
        notice: "bg-amber-bg border-amber-border text-amber-text",
        // #50: text-placeholder (2.68:1 on surface) is for real input
        // placeholders and disabled controls, not plain informational text —
        // this variant's only consumer (TabBar's non-base size chips) needed
        // text-muted's 4.5:1 instead.
        quiet: "text-muted",
        soon: "border-dashed border-olive-border bg-accent text-accent-foreground text-tick font-semibold tracking-eyebrow uppercase",
        link: "text-primary underline-offset-4 [a&]:hover:underline",
        // Small state pills (e.g. SizeChartTable's read-only/active-chart
        // badge) -- same text-tick/tracking-eyebrow/uppercase treatment as
        // `soon`, just without its dashed border.
        muted:
          "border-border bg-surface-alt text-muted text-tick font-semibold tracking-eyebrow uppercase",
        olive:
          "border-olive-border bg-olive-tint text-olive text-tick font-semibold tracking-eyebrow uppercase",
        // The heavier of the two version-compare selection badges ("Para") --
        // "olive" (tinted) is the lighter one ("De").
        oliveSolid:
          "border-transparent bg-olive text-white text-tick font-semibold tracking-eyebrow uppercase",
      },
      // A size label on a graded pattern is a square mark, not a rounded tag —
      // and five pill-shaped chips overflowed the size popover.
      size: {
        default: "",
        chip: "rounded-md px-[7px] py-[3px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
