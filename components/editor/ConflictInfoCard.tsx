import { useTranslations } from "next-intl";
import { ConflictInfo } from "@/lib/types";

export function ConflictInfoCard({ conflict }: { conflict: ConflictInfo }) {
  const t = useTranslations("ConflictInfoCard");
  return (
    <div className="bg-surface border-border rounded-card shadow-card absolute top-5 right-5 flex w-[172px] flex-col gap-[7px] border p-3">
      <span className="text-muted text-[11px] font-semibold tracking-[.8px] uppercase">
        {t("sectionLabel")}
      </span>
      <span className="text-[12.5px] font-semibold">{conflict.title}</span>
      <span className="text-alert text-[12px]">
        {t("diffLabel", {
          diff: conflict.diffCm.toString().replace(".", ","),
        })}
      </span>
      <div className="bg-line h-px" />
      <span className="text-muted-2 text-[11.5px] leading-[1.45]">
        {conflict.suggestion}
      </span>
    </div>
  );
}
