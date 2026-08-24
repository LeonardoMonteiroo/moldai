"use client";

import { useTranslations } from "next-intl";
import { useDashboardStore, filteredPatterns } from "@/lib/dashboardStore";
import { PatternCard } from "./PatternCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GarmentType } from "@/lib/types";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

const GARMENT_TYPES: GarmentType[] = ["blouse", "dress", "skirt", "tshirt"];

export function PatternGrid({
  onOpen,
  onNewPattern,
}: {
  onOpen: (id: string) => void;
  onNewPattern: () => void;
}) {
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
    // #114: no ScrollArea of its own -- DashboardShell wraps this together
    // with the summary cards in one scroll region, so an empty/small grid
    // takes its natural height instead of stretching to fill the viewport
    // and shoving the cards to the bottom edge.
    <div className="flex flex-col gap-4 p-[22px]">
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
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
            <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={onNewPattern}>{t("emptyAction")}</Button>
          </EmptyContent>
        </Empty>
      )}

      {hasNoMatches && (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t("noMatchesTitle")}</EmptyTitle>
            <EmptyDescription>{t("noMatchesDescription")}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!isTrulyEmpty && !hasNoMatches && (
        <div className="grid grid-cols-4 gap-[14px]">
          {filtered.map((p) => (
            <PatternCard key={p.id} pattern={p} onOpen={onOpen} />
          ))}
          <div className="border-border rounded-card text-muted text-ui flex h-[168px] flex-col items-center justify-center gap-1 border border-dashed text-center">
            <span>{t("importCardLabel")}</span>
            <span className="bg-amber-bg border-amber-border text-amber-text rounded-pill text-tick border px-[7px] py-[2px] font-semibold">
              {t("importComingSoonBadge")}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
