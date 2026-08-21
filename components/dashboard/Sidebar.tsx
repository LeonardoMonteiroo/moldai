"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useDashboardStore } from "@/lib/dashboardStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Sidebar({ onCreate }: { onCreate: (id: string) => void }) {
  const t = useTranslations("Sidebar");
  const router = useRouter();
  const create = useDashboardStore((s) => s.create);

  const handleCreate = async () => {
    const id = await create();
    onCreate(id);
  };

  return (
    <div className="border-border bg-surface flex w-[186px] flex-col border-r p-[14px]">
      <nav className="flex flex-col gap-1">
        <span className="bg-olive-tint text-olive rounded-item text-ui px-[10px] py-[7px] font-medium">
          {t("myPatternsLabel")}
        </span>
        <Button
          variant="ghost"
          size="chrome"
          onClick={() => router.push("/size-charts")}
          className="text-muted-2 justify-start"
        >
          {t("measurementsLabel")}
        </Button>
        <span className="text-disabled rounded-item text-ui flex items-center justify-between px-[10px] py-[7px]">
          {t("studioBasesLabel")}
          <Badge variant="soon">{t("comingSoonBadge")}</Badge>
        </span>
      </nav>
      <div className="flex-1" />
      <div className="border-border rounded-card text-disabled text-meta mb-3 border border-dashed p-[10px] text-center">
        {t("importLabel")}
      </div>
      <Button onClick={handleCreate}>{t("newPatternButton")}</Button>
    </div>
  );
}
