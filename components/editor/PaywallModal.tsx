"use client";

import { useTranslations } from "next-intl";
import { ChevronRightIcon } from "lucide-react";
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

function PurchaseRow({
  title,
  badge,
  detail,
  price,
  period,
  onClick,
  disabled,
  highlighted,
}: {
  title: string;
  badge?: string;
  detail: string;
  price: string;
  period: string;
  onClick: () => void;
  disabled: boolean;
  highlighted?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      // #31: double-clicking granted double credits -- applyPurchase has no
      // idempotency key, so nothing but this flag stood between one click
      // and two purchase requests.
      className={[
        "rounded-card flex w-full items-center justify-between gap-3 border p-[14px] text-left transition-colors disabled:pointer-events-none disabled:opacity-50",
        highlighted
          ? "border-olive bg-olive-tint hover:brightness-[0.98]"
          : "border-border bg-surface hover:bg-surface-alt",
      ].join(" ")}
    >
      <div className="flex flex-col gap-[3px]">
        <div className="flex items-center gap-[7px]">
          <span className="text-control font-semibold">{title}</span>
          {badge && <Badge variant="notice">{badge}</Badge>}
        </div>
        <span className="text-muted text-meta">{detail}</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="flex flex-col items-end">
          <span className="font-display text-title font-semibold">{price}</span>
          <span className="text-muted-2 text-meta whitespace-nowrap">
            {period}
          </span>
        </div>
        <ChevronRightIcon className="text-muted-2" />
      </div>
    </button>
  );
}

export function PaywallModal() {
  const t = useTranslations("PaywallModal");
  const paywall = useEditorStore((s) => s.paywall);
  const credits = useEditorStore((s) => s.credits);
  const purchase = useEditorStore((s) => s.purchase);
  const purchasing = useEditorStore((s) => s.purchasing);
  const close = useEditorStore((s) => s.closePaywall);

  if (!credits) return null;
  // #37: same clamp PageHeader's own credits pill uses -- a top-up can push
  // balance past total, so the bar must not overflow its track.
  const pct = Math.min(
    100,
    Math.round((credits.balance / credits.total) * 100),
  );

  return (
    <Dialog
      open={paywall.open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
    >
      <DialogContent className="sm:max-w-[470px]">
        <DialogHeader>
          <span className="text-muted text-meta tracking-eyebrow font-semibold uppercase">
            {t("eyebrow")}
          </span>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>
            {t("description", {
              action: paywall.action ? t(`actions.${paywall.action}`) : "",
              required: paywall.required,
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="border-line flex flex-col gap-[7px] border-t pt-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-ui">
              {t("usageLabel", {
                balance: credits.balance,
                total: credits.total,
              })}
            </span>
            <span className="text-muted text-meta whitespace-nowrap">
              {t("usageRenewsNote", { days: credits.renewsInDays })}
            </span>
          </div>
          <div className="bg-track h-1 w-full overflow-hidden rounded-full">
            <div className="bg-olive h-full" style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <PurchaseRow
            // #9: the plan is now named at the call site rather than
            // defaulted server-side -- this row IS Ateliê per design 5d.
            title={t("subscribeTitle")}
            badge={t("subscribeBadge")}
            detail={t("subscribeDetail")}
            price={formatBRL(PLAN_PRICE_CENTS.atelier)}
            period={t("subscribePeriod")}
            onClick={() => purchase("subscribe", "atelier")}
            disabled={purchasing}
            highlighted
          />
          <PurchaseRow
            title={t("topupTitle")}
            detail={t("topupDetail")}
            price={formatBRL(TOPUP_PRICE_CENTS)}
            period={t("topupPeriod")}
            onClick={() => purchase("topup")}
            disabled={purchasing}
          />
        </div>

        <DialogFooter className="sm:justify-start">
          <span className="text-muted text-ui">{t("paymentNote")}</span>
          <div className="flex-1" />
          <Button variant="link" size="sm" onClick={close}>
            {t("backButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
