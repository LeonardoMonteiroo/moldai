"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { Credits, LedgerEntryType, LedgerHistoryEntry } from "@/lib/types";
import { purchase } from "@/lib/api-client";
import { relativeTime } from "@/lib/format";

const TYPE_KEY: Record<LedgerEntryType, string> = {
  debit: "typeDebit",
  refund: "typeRefund",
  topup: "typeTopup",
  subscribe: "typeSubscribe",
  renew: "typeRenew",
};

const REASON_KEY: Record<string, string> = {
  generate: "reasonGenerate",
  graduate: "reasonGraduate",
  "generate-ask": "reasonGenerateAsk",
  "generate-declined": "reasonGenerateDeclined",
  "generate-error": "reasonGenerateError",
};

export function UsageSection({
  credits,
  initialLedger,
}: {
  credits: Credits;
  initialLedger: LedgerHistoryEntry[];
}) {
  const t = useTranslations("UsageSection");
  const tf = useTranslations("Format");
  const [balance, setBalance] = useState(credits.balance);
  const [ledger, setLedger] = useState(initialLedger);
  const [buying, setBuying] = useState(false);

  async function buyTopup() {
    setBuying(true);
    const result = await purchase("topup");
    if ("credits" in result) {
      setBalance(result.credits.balance);
      setLedger((prev) => [
        {
          type: "topup",
          reason: null,
          amount: 100,
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
    }
    setBuying(false);
  }

  // #37: a top-up can push balance past total (purchased credits carry over
  // independently of the plan allowance), so the bar clamps at 100% rather
  // than overflowing its track.
  const pct = Math.min(100, Math.round((balance / credits.total) * 100));

  return (
    <div className="flex flex-col gap-4">
      <section className="bg-surface border-border rounded-card flex flex-col gap-3 border p-[18px]">
        <h2 className="font-display text-body font-semibold">{t("heading")}</h2>
        <div className="flex items-end gap-4">
          <div className="flex flex-col gap-1">
            <span className="font-display text-display font-semibold">
              {balance}
            </span>
            <span className="text-muted text-meta">
              {t("outOfTotal", {
                total: credits.total,
                days: credits.renewsInDays,
              })}
            </span>
          </div>
          <div className="flex-1" />
          <Button onClick={buyTopup} disabled={buying}>
            {t("topupButton")}
          </Button>
        </div>
        <div className="bg-track h-[5px] overflow-hidden rounded-full">
          <div className="bg-olive h-full" style={{ width: `${pct}%` }} />
        </div>
      </section>
      <section className="bg-surface border-border rounded-card flex flex-col gap-2 border p-[18px]">
        <h2 className="font-display text-body font-semibold">
          {t("historyHeading")}
        </h2>
        {ledger.length === 0 ? (
          <span className="text-muted text-ui">{t("empty")}</span>
        ) : (
          <ul className="flex flex-col gap-[6px]">
            {ledger.map((entry, i) => {
              const reasonKey = entry.reason
                ? REASON_KEY[entry.reason]
                : undefined;
              const sign = entry.type === "debit" ? "−" : "+";
              const amountClass =
                entry.type === "debit" ? "text-alert" : "text-olive-dark";
              return (
                <li
                  key={i}
                  className="border-line text-ui flex items-center justify-between border-b py-[6px] last:border-b-0"
                >
                  <span>
                    {t(TYPE_KEY[entry.type])}
                    {reasonKey ? ` · ${t(reasonKey)}` : ""}
                  </span>
                  <span className="text-muted">
                    {relativeTime(tf, entry.createdAt)}
                  </span>
                  <span className={`font-medium ${amountClass}`}>
                    {sign}
                    {entry.amount}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
