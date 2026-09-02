"use client";

import { useTranslations } from "next-intl";
import { Wordmark } from "@/components/shared/Wordmark";

export function LandingFooter() {
  const t = useTranslations("Landing");

  return (
    <div className="border-border bg-surface border-t">
      <div className="mx-auto flex max-w-[1160px] flex-wrap items-center gap-3 px-[34px] pt-[22px] pb-[34px]">
        <Wordmark />
        <div className="flex-1" />
        <span className="text-muted text-ui">{t("footer.billingNote")}</span>
      </div>
    </div>
  );
}
