"use client";

import { useTranslations } from "next-intl";
import type { Credits } from "@/lib/types";

export function CreditsCard({ credits }: { credits: Credits }) {
  const t = useTranslations("CreditsCard");
  const pct = Math.round((credits.balance / credits.total) * 100);
  return (
    <div className="border-border rounded-card flex flex-col gap-2 border bg-white p-[16px]">
      <span className="text-muted text-ui font-medium">{t("title")}</span>
      <span className="font-display text-display font-semibold">
        {credits.balance}
      </span>
      <span className="text-muted text-meta">
        {t("outOfTotal", { total: credits.total, days: credits.renewsInDays })}
      </span>
      <div className="bg-track h-[5px] overflow-hidden rounded-full">
        <div className="bg-olive h-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
