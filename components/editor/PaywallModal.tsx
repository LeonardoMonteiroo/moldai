"use client";

import { useTranslations } from "next-intl";
import { useEditorStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function PaywallModal() {
  const t = useTranslations("PaywallModal");
  const paywall = useEditorStore((s) => s.paywall);
  const credits = useEditorStore((s) => s.credits);
  const purchase = useEditorStore((s) => s.purchase);
  const close = useEditorStore((s) => s.closePaywall);

  if (!credits) return null;

  const actionLabel =
    paywall.actionLabel.charAt(0).toUpperCase() + paywall.actionLabel.slice(1);

  return (
    <Dialog
      open={paywall.open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="sm:max-w-[470px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-[9px]">
            <span
              aria-hidden="true"
              className="bg-amber-bg border-amber-border text-amber-text text-ui flex h-[26px] w-[26px] items-center justify-center rounded-full border"
            >
              ◆
            </span>
            {t("title")}
          </DialogTitle>
          <DialogDescription>
            {t("description", {
              action: actionLabel,
              required: paywall.required,
              balance: paywall.balance,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-3">
          <button
            onClick={() => purchase("topup")}
            className="border-border rounded-card bg-surface-alt flex flex-1 flex-col gap-[5px] border p-[14px] text-left transition-colors hover:bg-white"
          >
            <span className="text-control font-semibold">
              {t("topupTitle")}
            </span>
            <span className="font-display text-title font-semibold">
              {t("topupPrice")}
            </span>
            <span className="text-muted text-meta">{t("topupDetail")}</span>
            <div className="min-h-2 flex-1" />
            <span className="text-olive text-ui font-semibold">
              {t("topupCta")}
            </span>
          </button>
          <button
            onClick={() => purchase("subscribe")}
            className="border-olive rounded-card bg-olive-tint flex flex-1 flex-col gap-[5px] border-2 p-[14px] text-left transition-[filter] hover:brightness-[0.98]"
          >
            <div className="flex items-center gap-[7px]">
              <span className="text-control font-semibold">
                {t("subscribeTitle")}
              </span>
              <Badge variant="notice">{t("subscribeBadge")}</Badge>
            </div>
            <div className="flex items-baseline gap-[3px]">
              <span className="font-display text-title font-semibold">
                {t("subscribePrice")}
              </span>
              <span className="text-muted-2 text-ui">
                {t("subscribePeriod")}
              </span>
            </div>
            <span className="text-olive text-meta">{t("subscribeDetail")}</span>
            <div className="min-h-2 flex-1" />
            <span className="text-olive-dark text-ui font-semibold">
              {t("subscribeCta")}
            </span>
          </button>
        </div>

        <DialogFooter className="sm:justify-start">
          <span className="text-muted text-ui">
            {t("renewsNote", { days: credits.renewsInDays })}
          </span>
          <div className="flex-1" />
          <Button variant="link" size="sm" onClick={close}>
            {t("backButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
