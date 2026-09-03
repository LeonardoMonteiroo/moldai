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
import { Reveal } from "./reveal";

// The "Exporta para" list groups every EXPORT_FORMATS id by use case
// (EXPORT_FORMAT_USE_CASE is a Record over ExportFormat, so a format added
// to the app is placed in a group at compile time rather than silently
// missing from this page). The plan card's numbers all come from
// lib/billing/plans.ts -- never a second, hand-typed copy of a price or
// credit count.
export function CreditsSection() {
  const t = useTranslations("Landing");

  return (
    <section id="plans" className="border-border bg-paper border-t">
      <div className="mx-auto grid max-w-[1160px] items-start gap-8 px-4 py-24 sm:px-6 lg:grid-cols-[1fr_380px]">
        <Reveal className="flex flex-col gap-6">
          <div className="flex flex-col gap-3">
            <span className="text-olive tracking-eyebrow text-sm font-semibold uppercase">
              {t("credits.eyebrow")}
            </span>
            <h2 className="max-w-[680px] text-3xl font-semibold text-balance sm:text-4xl">
              {t("credits.title")}
            </h2>
            <p className="text-muted-2 max-w-[680px] text-base text-pretty">
              {t("credits.body")}
            </p>
          </div>

          <div className="border-line flex flex-col gap-3 border-t pt-6">
            <span className="text-muted tracking-eyebrow text-sm font-semibold uppercase">
              {t("credits.exportLabel")}
            </span>
            <div className="flex flex-col gap-2">
              {EXPORT_FORMAT_USE_CASE_ORDER.map((group) => {
                const ids = EXPORT_FORMATS.filter(
                  (id) => EXPORT_FORMAT_USE_CASE[id] === group,
                );
                return (
                  <div
                    key={group}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1"
                  >
                    <span className="text-muted-2 w-[116px] flex-none text-sm">
                      {t(`formatGroups.${group}`)}
                    </span>
                    <span className="text-sm font-medium">
                      {ids.map((id) => t(`formatShort.${id}`)).join(" · ")}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>

        <Reveal
          delayMs={100}
          className="border-olive bg-olive-tint flex flex-col gap-4 rounded-2xl border-2 p-6"
        >
          <span className="text-olive tracking-eyebrow text-sm font-semibold uppercase">
            {t("credits.planEyebrow")}
          </span>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-semibold">{PLAN_CREDITS.free}</span>
            <span className="text-olive-dark text-base">
              {t("credits.planUnit")}
            </span>
          </div>
          <p className="text-olive-dark text-sm text-pretty">
            {t("credits.planNote")}
          </p>
          <Button asChild size="marketing" className="w-full">
            <Link href="/signup">{t("credits.planCta")}</Link>
          </Button>
          <span className="text-olive text-sm text-pretty">
            {t("credits.planUpsell", {
              price: formatBRL(PLAN_PRICE_CENTS.atelier),
              credits: PLAN_CREDITS.atelier,
            })}
          </span>
        </Reveal>
      </div>
    </section>
  );
}
