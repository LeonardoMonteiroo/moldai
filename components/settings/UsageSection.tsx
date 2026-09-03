"use client";

import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type {
  Credits,
  LedgerEntryType,
  LedgerHistoryEntry,
  UsageThisCycle,
} from "@/lib/types";
import { COSTS, PLAN_IDS } from "@/lib/types";
import { purchase } from "@/lib/api-client";
import {
  TOPUP_CREDITS,
  TOPUP_PRICE_CENTS,
  formatBRL,
} from "@/lib/billing/plans";
import { relativeTime } from "@/lib/format";
import { ActionErrorNotice } from "@/components/shared/ActionErrorNotice";

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

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: number;
  sub: string;
}) {
  return (
    <div className="bg-surface border-border rounded-card flex flex-1 flex-col gap-1 border p-[18px]">
      <span className="text-muted text-meta">{label}</span>
      <span className="font-display text-title font-semibold">{value}</span>
      <span className="text-muted text-meta">{sub}</span>
    </div>
  );
}

export function UsageSection({
  credits,
  initialLedger,
  patternCount,
  usageThisCycle,
  patternsCreatedThisWeek,
}: {
  credits: Credits;
  initialLedger: LedgerHistoryEntry[];
  patternCount: number;
  usageThisCycle: UsageThisCycle;
  patternsCreatedThisWeek: number;
}) {
  const t = useTranslations("UsageSection");
  const tf = useTranslations("Format");
  const tPlan = useTranslations("PlanSection");
  const [balance, setBalance] = useState(credits.balance);
  const [ledger, setLedger] = useState(initialLedger);
  const [buying, setBuying] = useState(false);
  const [actionError, setActionError] = useState(false);

  // #44: purchase() throws on any non-2xx (an expired JWT, a 5xx) --
  // previously uncaught here, so buying never reset and the button stayed
  // disabled forever with nothing on screen and no way to tell whether the
  // R$19 charge went through. finally guarantees setBuying(false) runs
  // either way; the try/catch is local to this component rather than
  // widening purchase()'s `handled` list, which would make the editor
  // paywall (lib/store.ts) mistake a failed purchase for a success.
  async function buyTopup() {
    setBuying(true);
    setActionError(false);
    try {
      const result = await purchase("topup");
      // #161: under the real gateway this is {status:"redirect", url} --
      // the wallet isn't credited yet, so there is nothing to apply here.
      // Navigate out to the hosted checkout instead; on return the page's
      // own server-rendered load (app/settings/page.tsx) shows whatever
      // the webhook actually credited, never an optimistic guess.
      if (result.status === "redirect") {
        // location.assign(), not `location.href = ...` (react-hooks/
        // immutability flags a property assignment on `window`, defined
        // outside the component, from PlanSection's identical case) --
        // assign() is a method call and does the identical same-tab
        // navigation.
        window.location.assign(result.url);
        return;
      }
      if ("credits" in result) {
        setBalance(result.credits.balance);
        setLedger((prev) => [
          {
            type: "topup",
            reason: null,
            amount: TOPUP_CREDITS,
            createdAt: new Date().toISOString(),
          },
          ...prev,
        ]);
      }
    } catch {
      setActionError(true);
    } finally {
      setBuying(false);
    }
  }

  // #37: a top-up can push balance past total (purchased credits carry over
  // independently of the plan allowance), so the bar clamps at 100% rather
  // than overflowing its track.
  const pct = Math.min(100, Math.round((balance / credits.total) * 100));

  const usedThisCycle = usageThisCycle.generate + usageThisCycle.graduate;

  return (
    <div className="flex flex-col gap-4">
      {actionError && (
        <ActionErrorNotice onDismiss={() => setActionError(false)} />
      )}
      <div className="flex flex-col gap-3 sm:flex-row">
        <StatCard
          label={t("statCreditsRemaining")}
          value={balance}
          sub={t("statCreditsRemainingSub", { total: credits.total })}
        />
        <StatCard
          label={t("statUsedThisCycle")}
          value={usedThisCycle}
          sub={t("statUsedThisCycleSub", {
            generate: usageThisCycle.generate,
            graduate: usageThisCycle.graduate,
          })}
        />
        <StatCard
          label={t("statActivePatterns")}
          value={patternCount}
          sub={t("statActivePatternsSub", { count: patternsCreatedThisWeek })}
        />
      </div>
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
            {t("topupButton", { price: formatBRL(TOPUP_PRICE_CENTS) })}
          </Button>
        </div>
        <div className="bg-track h-[5px] overflow-hidden rounded-full">
          <div className="bg-olive h-full" style={{ width: `${pct}%` }} />
        </div>
      </section>
      <div className="flex flex-col gap-4 lg:flex-row">
        <section className="bg-surface border-border rounded-card flex flex-1 flex-col gap-2 border p-[18px]">
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
                // #9: a subscribe row's reason is now the purchased PlanId
                // (lib/billing/wallet.ts's applyPurchase), not one of
                // REASON_KEY's debit reasons -- resolved through
                // PlanSection's own plans.{id}.name catalog entries, the
                // same template-key lookup PageHeader already uses. A row
                // recorded before this shipped carries reason: null and
                // keeps rendering with no suffix, nothing retro-invented.
                const planName =
                  entry.type === "subscribe" &&
                  entry.reason &&
                  (PLAN_IDS as string[]).includes(entry.reason)
                    ? tPlan(`plans.${entry.reason}.name`)
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
                      {planName ? ` · ${planName}` : ""}
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
        <section className="bg-surface border-border rounded-card flex flex-col gap-2 border p-[18px] lg:w-[280px]">
          <h2 className="font-display text-body font-semibold">
            {t("costsHeading")}
          </h2>
          <ul className="text-muted-2 text-ui flex flex-col gap-1">
            {/* #108: generation debits the same constant as an adjustment —
              there is no separate, higher "first draft" price. The cut plan
              has no entry here at all: it's computed client-side and free. */}
            <li>{t("costGenerate", { cost: COSTS.adjust })}</li>
            <li>{t("costAdjust", { cost: COSTS.adjust })}</li>
            <li>{t("costGraduate", { cost: COSTS.graduate })}</li>
            <li>{t("costCorrection", { cost: COSTS.correction })}</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
