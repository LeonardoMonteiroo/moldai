"use client";

import { useRouter } from "next/navigation";
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
import { TYPES as GARMENT_TYPES } from "@/lib/draft/garment";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export function PatternGrid({
  onOpen,
  onNewPattern,
}: {
  onOpen: (id: string) => void;
  onNewPattern: () => void;
}) {
  const t = useTranslations("PatternGrid");
  const tGarment = useTranslations("TechSheetTab");
  const router = useRouter();
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
    //
    // No top padding: DashboardShell's wrapper owns the 22px top inset so it
    // applies once whether or not the onboarding checklist card precedes
    // this -- a local pt-[22px] here would double up with that inset plus
    // the wrapper's own gap-4, per docs/design/screens/Dashboard.dc.html's
    // single `padding: 22px` + `gap: 16px` content column.
    <div className="flex flex-col gap-4 px-[22px] pb-[22px]">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-display text-display font-semibold">
          {t("countLabel", { count: patterns.length })}
        </span>
        <div className="flex-1" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-[34px] w-full sm:w-[180px]"
        />
        <Select
          value={typeFilter}
          onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}
        >
          <SelectTrigger size="sm" className="w-full sm:w-[150px]">
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
        <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
          {filtered.map((p) => (
            <PatternCard key={p.id} pattern={p} onOpen={onOpen} />
          ))}
          {/* Issue #210: this used to be an inert dashed placeholder badged
              "em breve" for a DXF import flow that had already shipped at
              /import (#163) -- the Sidebar entry linked straight into it
              while this card three columns over still claimed it didn't
              exist. It's a real control now, matching Sidebar's own fix for
              the identical defect (#11). */}
          <button
            type="button"
            onClick={() => router.push("/import")}
            className="border-border rounded-card text-muted text-ui hover:bg-surface-alt flex h-[168px] flex-col items-center justify-center gap-1 border border-dashed text-center transition-colors"
          >
            {t("importCardLabel")}
          </button>
        </div>
      )}
    </div>
  );
}
