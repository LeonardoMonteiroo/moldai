"use client";

import { useTranslations } from "next-intl";
import { useEditorStore } from "@/lib/store";

export function PaywallModal() {
  const t = useTranslations("PaywallModal");
  const paywall = useEditorStore((s) => s.paywall);
  const credits = useEditorStore((s) => s.credits);
  const purchase = useEditorStore((s) => s.purchase);
  const close = useEditorStore((s) => s.closePaywall);

  if (!paywall.open || !credits) return null;

  const actionLabel =
    paywall.actionLabel.charAt(0).toUpperCase() + paywall.actionLabel.slice(1);

  return (
    <div className="absolute inset-0 z-20 flex items-start justify-center pt-[52px]">
      <button
        type="button"
        aria-label={t("closeAriaLabel")}
        onClick={close}
        className="bg-overlay absolute inset-0 cursor-default border-0"
      />
      <div className="bg-surface border-border rounded-modal shadow-modal relative flex w-[470px] flex-col gap-[13px] border p-[22px]">
        <div className="flex items-center gap-[9px]">
          <span className="bg-amber-bg border-amber-border text-amber-text flex h-[26px] w-[26px] items-center justify-center rounded-full border text-[12px]">
            ◆
          </span>
          <span className="font-display text-[21px] font-semibold tracking-[-0.4px]">
            {t("title")}
          </span>
        </div>
        <p className="text-muted-2 m-0 text-[13.5px] leading-[1.55]">
          {t("description", {
            action: actionLabel,
            required: paywall.required,
            balance: paywall.balance,
          })}
        </p>
        <div className="flex gap-3">
          <button
            onClick={() => purchase("topup")}
            className="border-border rounded-card bg-surface-alt flex flex-1 flex-col gap-[5px] border p-[14px] text-left transition-colors hover:bg-white"
          >
            <span className="text-[13px] font-semibold">{t("topupTitle")}</span>
            <span className="font-display text-[21px] font-semibold">
              {t("topupPrice")}
            </span>
            <span className="text-muted text-[11.5px]">{t("topupDetail")}</span>
            <div className="min-h-2 flex-1" />
            <span className="text-olive text-[12px] font-semibold">
              {t("topupCta")}
            </span>
          </button>
          <button
            onClick={() => purchase("subscribe")}
            className="border-olive rounded-card bg-olive-tint flex flex-1 flex-col gap-[5px] border-2 p-[14px] text-left transition-[filter] hover:brightness-[0.98]"
          >
            <div className="flex items-center gap-[7px]">
              <span className="text-[13px] font-semibold">
                {t("subscribeTitle")}
              </span>
              <span className="rounded-pill bg-amber-bg border-amber-border text-amber-text border px-[7px] py-[2px] text-[10.5px] font-semibold">
                {t("subscribeBadge")}
              </span>
            </div>
            <div className="flex items-baseline gap-[3px]">
              <span className="font-display text-[21px] font-semibold">
                {t("subscribePrice")}
              </span>
              <span className="text-muted-2 text-[12px]">
                {t("subscribePeriod")}
              </span>
            </div>
            <span className="text-olive text-[11.5px]">
              {t("subscribeDetail")}
            </span>
            <div className="min-h-2 flex-1" />
            <span className="text-olive-dark text-[12px] font-semibold">
              {t("subscribeCta")}
            </span>
          </button>
        </div>
        <div className="flex items-center gap-3 pt-[3px]">
          <span className="text-muted text-[12px]">
            {t("renewsNote", { days: credits.renewsInDays })}
          </span>
          <div className="flex-1" />
          <button
            onClick={close}
            className="text-muted-2 text-[12.5px] font-medium underline"
          >
            {t("backButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
