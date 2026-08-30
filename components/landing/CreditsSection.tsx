"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  EXPORT_FORMATS,
  EXPORT_FORMAT_USE_CASE,
  EXPORT_FORMAT_USE_CASE_ORDER,
} from "@/lib/export/formats";
import { PLAN_CREDITS, PLAN_PRICE_CENTS, formatBRL } from "@/lib/billing/plans";

// Replaces the old FormatsSection's flat badge strip: the "Exporta para"
// list now groups every EXPORT_FORMATS id by use case
// (EXPORT_FORMAT_USE_CASE is a Record over ExportFormat, so a format added
// to the app is placed in a group at compile time rather than silently
// missing from this page). The plan card's numbers all come from
// lib/billing/plans.ts -- never a second, hand-typed copy of a price or
// credit count.
export function CreditsSection() {
  const t = useTranslations("Landing");

  return (
    <section id="plans" className="bg-surface">
      <div className="mx-auto grid max-w-[1160px] grid-cols-[1fr_360px] items-start gap-8 px-[34px] py-16">
        <div className="flex flex-col gap-[18px]">
          <div className="flex flex-col gap-1.5">
            <span className="text-olive text-meta tracking-eyebrow font-semibold uppercase">
              {t("credits.eyebrow")}
            </span>
            <h2 className="font-display text-display font-semibold">
              {t("credits.title")}
            </h2>
            <p className="text-muted-2 text-control max-w-[480px]">
              {t("credits.body")}
            </p>
          </div>
          <div className="border-line flex flex-col gap-2 border-t pt-[18px]">
            <span className="text-muted text-meta tracking-eyebrow font-semibold uppercase">
              {t("credits.exportLabel")}
            </span>
            <div className="flex flex-col gap-[7px]">
              {EXPORT_FORMAT_USE_CASE_ORDER.map((group) => {
                const ids = EXPORT_FORMATS.filter(
                  (id) => EXPORT_FORMAT_USE_CASE[id] === group,
                );
                return (
                  <div
                    key={group}
                    className="flex flex-wrap items-baseline gap-2"
                  >
                    <span className="text-muted-2 text-ui w-[116px] flex-none">
                      {t(`formatGroups.${group}`)}
                    </span>
                    <span className="text-ui font-medium">
                      {ids.map((id) => t(`formatShort.${id}`)).join(" · ")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="border-olive bg-olive-tint rounded-card flex flex-col gap-3.5 border-2 p-6">
          <span className="text-olive text-meta tracking-eyebrow font-semibold uppercase">
            {t("credits.planEyebrow")}
          </span>
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-display font-semibold">
              {PLAN_CREDITS.free}
            </span>
            <span className="text-olive-dark text-control">
              {t("credits.planUnit")}
            </span>
          </div>
          <p className="text-olive-dark text-ui">{t("credits.planNote")}</p>
          <Button asChild size="lg" className="w-full">
            <Link href="/signup">{t("credits.planCta")}</Link>
          </Button>
          <span className="text-olive text-ui">
            {t("credits.planUpsell", {
              price: formatBRL(PLAN_PRICE_CENTS.atelier),
              credits: PLAN_CREDITS.atelier,
            })}
          </span>
        </div>
      </div>
    </section>
  );
}
