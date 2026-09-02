"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSlopersStore, filteredSlopers } from "@/lib/slopersStore";
import { SloperCard } from "./SloperCard";
import { ScrollArea } from "@/components/ui/scroll-area";
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

export function SloperGrid({ onUse }: { onUse: (id: string) => void }) {
  const t = useTranslations("Slopers");
  const tGarment = useTranslations("TechSheetTab");
  const router = useRouter();
  const slopers = useSlopersStore((s) => s.slopers);
  const search = useSlopersStore((s) => s.search);
  const typeFilter = useSlopersStore((s) => s.typeFilter);
  const setSearch = useSlopersStore((s) => s.setSearch);
  const setTypeFilter = useSlopersStore((s) => s.setTypeFilter);

  const filtered = filteredSlopers({ slopers, search, typeFilter });
  const isTrulyEmpty = slopers.length === 0;
  const hasNoMatches = !isTrulyEmpty && filtered.length === 0;

  return (
    // `fill` + `min-h-full` so an Empty state still centres in the region
    // instead of collapsing to its own content height.
    <ScrollArea fill className="min-h-0 flex-1">
      <div className="flex min-h-full flex-col gap-4 p-[22px]">
        <div className="flex flex-col gap-px">
          <span className="font-display text-display font-semibold">
            {t("countLabel", { count: slopers.length })}
          </span>
          <span className="text-muted text-meta">{t("subtitle")}</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
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
              <Button variant="outline" onClick={() => router.push("/")}>
                {t("emptyAction")}
              </Button>
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
            {filtered.map((s) => (
              <SloperCard key={s.id} sloper={s} onUse={onUse} />
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
