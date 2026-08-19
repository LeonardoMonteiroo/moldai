"use client";

import { useTranslations } from "next-intl";
import type { Credits, PlanId } from "@/lib/types";
import { COSTS } from "@/lib/types";

const PLAN_IDS: PlanId[] = ["free", "atelier", "studio", "factory"];

export function PlanSection({ credits }: { credits: Credits }) {
  const t = useTranslations("PlanSection");

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-2 gap-3">
        {PLAN_IDS.map((id) => {
          const isCurrent = credits.plan === id;
          return (
            <div
              key={id}
              className={
                isCurrent
                  ? "border-olive bg-olive-tint shadow-plan rounded-card flex flex-col gap-2 border-2 p-[16px]"
                  : "border-border bg-surface rounded-card flex flex-col gap-2 border p-[16px] opacity-70"
              }
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-semibold">
                  {t(`plans.${id}.name`)}
                </span>
                {isCurrent ? (
                  <span className="bg-olive rounded-pill px-[9px] py-[3px] text-[10.5px] font-semibold text-white">
                    {t("currentBadge")}
                  </span>
                ) : (
                  <span className="bg-amber-bg border-amber-border text-amber-text rounded-pill border px-[7px] py-[2px] text-[10.5px] font-semibold">
                    {t("comingSoonBadge")}
                  </span>
                )}
              </div>
              <span className="font-display text-[21px] font-semibold">
                {t(`plans.${id}.price`)}
              </span>
              <span className="text-muted text-[11.5px]">
                {t(`plans.${id}.creditsLabel`)}
              </span>
            </div>
          );
        })}
      </section>
      <section className="bg-surface border-border rounded-card flex flex-col gap-2 border p-[18px]">
        <h2 className="font-display text-[16px] font-semibold">
          {t("costsHeading")}
        </h2>
        <ul className="text-muted-2 flex flex-col gap-1 text-[12px]">
          <li>{t("costGenerate", { cost: COSTS.generate })}</li>
          <li>{t("costAdjust", { cost: COSTS.adjust })}</li>
          <li>{t("costGraduate", { cost: COSTS.graduate })}</li>
          <li>{t("costCuttingPlan", { cost: COSTS.cuttingPlan })}</li>
          <li>{t("costCorrection", { cost: COSTS.correction })}</li>
        </ul>
      </section>
    </div>
  );
}
