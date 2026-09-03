"use client";

import type { ReactNode } from "react";
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
  checklistSlot,
}: {
  onOpen: (id: string) => void;
  onNewPattern: () => void;
  /** The onboarding checklist card, rendered between the heading/search row
   *  and the grid — Dashboard.dc.html's own DOM order, not above it. Owned
   *  by DashboardShell (it knows whether there's a checklist at all); this
   *  component only knows where the slot goes. */
  checklistSlot?: ReactNode;
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
          className="h-[34px] w-full sm:w-[200px]"
        />
        <Select
          value={typeFilter}
          onValueChange={(value) => setTypeFilter(value as typeof typeFilter)}
        >
          {/* All three controls in this row are 34px in Dashboard.dc.html --
              taller than the 32px `sm` the dialogs use, so the height is set
              here rather than by rescaling the shared size. Without it the
              select and button sat 2px short of the input beside them. */}
          <SelectTrigger size="sm" className="h-[34px] w-full sm:w-[150px]">
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
        {/* Dashboard.dc.html:124 -- "+ Novo molde" lives in this row, not as
            a persistent Sidebar action (the sidebar there is nav-only). */}
        <Button size="sm" className="h-[34px]" onClick={onNewPattern}>
          {t("newPatternButton")}
        </Button>
      </div>

      {checklistSlot}

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
          {/* Dashboard.dc.html's trailing cell is a second "+ Novo molde"
              opening the same chooser as the toolbar button, not a shortcut
              into one particular way of starting. Importing a .dxf is one of
              the three options inside that chooser now (it was #210's fix to
              make this cell a real control rather than an inert "em breve"
              placeholder; the control is real either way, it just points at
              the chooser the design routes everything through). */}
          <button
            type="button"
            onClick={onNewPattern}
            // `min-h`, not a fixed height: sharing a row with pattern cards,
            // the grid's own stretch already matches it to them, so this only
            // has to carry the case where it wraps onto a row of its own with
            // nothing to stretch against. 196px is a PatternCard's real
            // height (10px padding + 128px thumbnail + 8px gap + its two text
            // lines + 10px padding) -- the 168px this used to hardcode was
            // short even of the old 112px thumbnail's card.
            className="border-border rounded-card text-muted text-ui hover:bg-surface-alt flex min-h-[196px] flex-col items-center justify-center gap-1 border border-dashed text-center transition-colors"
          >
            {t("newPatternButton")}
          </button>
        </div>
      )}
    </div>
  );
}
