"use client";

import { useTranslations } from "next-intl";
import { useEditorStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import {
  PLAN_PRICE_CENTS,
  TOPUP_PRICE_CENTS,
  formatBRL,
} from "@/lib/billing/plans";
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
  const purchasing = useEditorStore((s) => s.purchasing);
  const close = useEditorStore((s) => s.closePaywall);

  if (!credits) return null;

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
              action: paywall.action ? t(`actions.${paywall.action}`) : "",
              required: paywall.required,
              balance: paywall.balance,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-3">
          <button
            onClick={() => purchase("topup")}
            disabled={purchasing}
            // #31: double-clicking granted double credits -- applyPurchase
            // has no idempotency key, so nothing but this flag stood
            // between one click and two purchase requests.
            className="border-border rounded-card bg-surface-alt flex flex-1 flex-col gap-[5px] border p-[14px] text-left transition-colors hover:bg-white disabled:pointer-events-none disabled:opacity-50"
          >
            <span className="text-control font-semibold">
              {t("topupTitle")}
            </span>
            <span className="font-display text-title font-semibold">
              {formatBRL(TOPUP_PRICE_CENTS)}
            </span>
            <span className="text-muted text-meta">{t("topupDetail")}</span>
            <div className="min-h-2 flex-1" />
            <span className="text-olive text-ui font-semibold">
              {t("topupCta")}
            </span>
          </button>
          <button
            // #9: the plan is now named at the call site rather than
            // defaulted server-side -- this card IS Ateliê per design 5d.
            onClick={() => purchase("subscribe", "atelier")}
            disabled={purchasing}
            className="border-olive rounded-card bg-olive-tint flex flex-1 flex-col gap-[5px] border-2 p-[14px] text-left transition-[filter] hover:brightness-[0.98] disabled:pointer-events-none disabled:opacity-50"
          >
            <div className="flex items-center gap-[7px]">
              <span className="text-control font-semibold">
                {t("subscribeTitle")}
              </span>
              <Badge variant="notice">{t("subscribeBadge")}</Badge>
            </div>
            <div className="flex items-baseline gap-[3px]">
              <span className="font-display text-title font-semibold">
                {formatBRL(PLAN_PRICE_CENTS.atelier)}
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
