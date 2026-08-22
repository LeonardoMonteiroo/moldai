"use client";

import { XIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * The bar shown when an action failed but the screen's content is still fine —
 * a rename that did not stick, a generation that never ran, a chart that did
 * not save. Distinct from a load error, which replaces the content region
 * because there is nothing to show.
 *
 * Shared by the editor, dashboard and size-charts screens: all three stores
 * funnel mutation failures into the same `actionError` code, and all three used
 * to show nothing at all, so the click just looked inert.
 *
 * Amber (`notice`), not the red alert token — the same distinction the chat
 * bubbles make: recoverable and informational, not a hard failure.
 */
export function ActionErrorNotice({ onDismiss }: { onDismiss: () => void }) {
  const t = useTranslations("ActionErrorNotice");
  return (
    <div
      role="status"
      className="border-amber-border bg-amber-bg flex items-center gap-[10px] border-b px-[22px] py-[9px]"
    >
      <span className="text-ui flex-1">{t("message")}</span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label={t("dismiss")}
        onClick={onDismiss}
      >
        <XIcon />
      </Button>
    </div>
  );
}
