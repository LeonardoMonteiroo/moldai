"use client";

import { useTranslations } from "next-intl";
import { useSlopersStore } from "@/lib/slopersStore";
import { SloperCard } from "./SloperCard";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export function SloperGrid({ onUse }: { onUse: (id: string) => void }) {
  const t = useTranslations("Slopers");
  const slopers = useSlopersStore((s) => s.slopers);

  return (
    // `fill` + `min-h-full` so the Empty state still centres in the region
    // instead of collapsing to its own content height.
    <ScrollArea fill className="min-h-0 flex-1">
      <div className="flex min-h-full flex-col gap-4 p-[22px]">
        <span className="font-display text-display font-semibold">
          {t("countLabel", { count: slopers.length })}
        </span>

        {slopers.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
              <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 lg:grid-cols-4">
            {slopers.map((s) => (
              <SloperCard key={s.id} sloper={s} onUse={onUse} />
            ))}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
