"use client";

import { useTranslations } from "next-intl";
import { useDashboardStore } from "@/lib/dashboardStore";

export function Sidebar({ onCreate }: { onCreate: (id: string) => void }) {
  const t = useTranslations("Sidebar");
  const create = useDashboardStore((s) => s.create);

  const handleCreate = async () => {
    const id = await create();
    onCreate(id);
  };

  return (
    <div className="border-border bg-surface flex w-[186px] flex-col border-r p-[14px]">
      <nav className="flex flex-col gap-1">
        <span className="bg-olive-tint text-olive rounded-item px-[10px] py-[7px] text-[12.5px] font-medium">
          {t("myPatternsLabel")}
        </span>
        <span className="text-disabled rounded-item flex items-center justify-between px-[10px] py-[7px] text-[12.5px]">
          {t("measurementsLabel")}
          <span className="bg-amber-bg border-amber-border text-amber-text rounded-pill border px-[6px] py-px text-[10px] font-semibold">
            {t("comingSoonBadge")}
          </span>
        </span>
        <span className="text-disabled rounded-item flex items-center justify-between px-[10px] py-[7px] text-[12.5px]">
          {t("studioBasesLabel")}
          <span className="bg-amber-bg border-amber-border text-amber-text rounded-pill border px-[6px] py-px text-[10px] font-semibold">
            {t("comingSoonBadge")}
          </span>
        </span>
      </nav>
      <div className="flex-1" />
      <div className="border-border rounded-card text-disabled mb-3 border border-dashed p-[10px] text-center text-[11px]">
        {t("importLabel")}
      </div>
      <button
        onClick={handleCreate}
        className="bg-olive rounded-btn px-[13px] py-[9px] text-[12.5px] font-medium text-white transition-[filter] hover:brightness-[0.95]"
      >
        {t("newPatternButton")}
      </button>
    </div>
  );
}
