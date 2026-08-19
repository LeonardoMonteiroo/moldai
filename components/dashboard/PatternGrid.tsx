"use client";

import { useTranslations } from "next-intl";
import { useDashboardStore, filteredPatterns } from "@/lib/dashboardStore";
import { PatternCard } from "./PatternCard";
import type { GarmentType } from "@/lib/types";

const GARMENT_TYPES: GarmentType[] = ["blouse", "dress", "skirt", "tshirt"];

export function PatternGrid({ onOpen }: { onOpen: (id: string) => void }) {
  const t = useTranslations("PatternGrid");
  const tGarment = useTranslations("TechSheetTab");
  const patterns = useDashboardStore((s) => s.patterns);
  const search = useDashboardStore((s) => s.search);
  const typeFilter = useDashboardStore((s) => s.typeFilter);
  const setSearch = useDashboardStore((s) => s.setSearch);
  const setTypeFilter = useDashboardStore((s) => s.setTypeFilter);

  const filtered = filteredPatterns({ patterns, search, typeFilter });
  const isTrulyEmpty = patterns.length === 0;
  const hasNoMatches = !isTrulyEmpty && filtered.length === 0;

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-[22px]">
      <div className="flex items-center gap-3">
        <span className="font-display text-[24px] font-semibold">
          {t("countLabel", { count: patterns.length })}
        </span>
        <div className="flex-1" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("searchPlaceholder")}
          className="border-border rounded-btn h-[34px] w-[180px] border px-3 text-[12.5px]"
        />
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          className="border-border rounded-btn h-[34px] border px-2 text-[12.5px]"
        >
          <option value="all">{t("typeFilterAll")}</option>
          {GARMENT_TYPES.map((gt) => (
            <option key={gt} value={gt}>
              {tGarment(`garmentType.${gt}`)}
            </option>
          ))}
        </select>
      </div>

      {isTrulyEmpty && (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <span className="text-[13.5px] font-semibold">{t("emptyTitle")}</span>
          <span className="text-muted text-[12px]">
            {t("emptyDescription")}
          </span>
        </div>
      )}

      {hasNoMatches && (
        <div className="flex flex-1 flex-col items-center justify-center gap-1 text-center">
          <span className="text-[13.5px] font-semibold">
            {t("noMatchesTitle")}
          </span>
          <span className="text-muted text-[12px]">
            {t("noMatchesDescription")}
          </span>
        </div>
      )}

      {!isTrulyEmpty && !hasNoMatches && (
        <div className="grid grid-cols-4 gap-[14px]">
          {filtered.map((p) => (
            <PatternCard key={p.id} pattern={p} onOpen={onOpen} />
          ))}
          <div className="border-border rounded-card text-muted flex h-[168px] flex-col items-center justify-center gap-1 border border-dashed text-center text-[12px]">
            <span>{t("importCardLabel")}</span>
            <span className="bg-amber-bg border-amber-border text-amber-text rounded-pill border px-[7px] py-[2px] text-[10.5px] font-semibold">
              {t("importComingSoonBadge")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
