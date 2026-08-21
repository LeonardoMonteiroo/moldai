"use client";

import { useTranslations } from "next-intl";
import { useDashboardStore, filteredPatterns } from "@/lib/dashboardStore";
import { PatternCard } from "./PatternCard";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
        <span className="font-display text-display font-semibold">
          {t("countLabel", { count: patterns.length })}
        </span>
        <div className="flex-1" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-[34px] w-[180px]"
        />
        <Select
          value={typeFilter}
          onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}
        >
          <SelectTrigger size="sm" className="w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">{t("typeFilterAll")}</SelectItem>
              {GARMENT_TYPES.map((gt) => (
                <SelectItem key={gt} value={gt}>
                  {tGarment(`garmentType.${gt}`)}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
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
