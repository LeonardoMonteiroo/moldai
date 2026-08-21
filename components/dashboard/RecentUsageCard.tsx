"use client";

import { useTranslations } from "next-intl";
import type { RecentUsageEntry } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";

const REASON_KEY: Record<string, "reasonGenerate" | "reasonGraduate"> = {
  generate: "reasonGenerate",
  graduate: "reasonGraduate",
};

export function RecentUsageCard({ entries }: { entries: RecentUsageEntry[] }) {
  const t = useTranslations("RecentUsageCard");
  const tf = useTranslations("Format");
  return (
    <div className="border-border rounded-card flex w-[290px] flex-col gap-2 border bg-white p-[16px]">
      <span className="text-muted text-ui font-medium">{t("title")}</span>
      {entries.length === 0 ? (
        <span className="text-muted text-ui">{t("empty")}</span>
      ) : (
        <ul className="flex flex-col gap-[6px]">
          {entries.map((e, i) => (
            <li key={i} className="text-ui flex items-center justify-between">
              <span>
                {e.reason && REASON_KEY[e.reason]
                  ? t(REASON_KEY[e.reason])
                  : (e.reason ?? "—")}
              </span>
              <span className="text-muted">
                {relativeTime(tf, e.createdAt)}
              </span>
              <span className="text-alert font-medium">−{e.amount}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
