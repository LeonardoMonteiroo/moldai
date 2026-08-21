import { useTranslations } from "next-intl";
import { ConflictInfo } from "@/lib/types";

export function ConflictInfoCard({ conflict }: { conflict: ConflictInfo }) {
  const t = useTranslations("ConflictInfoCard");
  return (
    <div className="bg-surface border-border rounded-card shadow-card absolute top-5 right-5 flex w-[172px] flex-col gap-[7px] border p-3">
      <span className="text-muted text-meta tracking-eyebrow font-semibold uppercase">
        {t("sectionLabel")}
      </span>
      <span className="text-ui font-semibold">{conflict.title}</span>
      <span className="text-alert text-ui">
        {t("diffLabel", {
          diff: conflict.diffCm.toString().replace(".", ","),
        })}
      </span>
      <div className="bg-line h-px" />
      <span className="text-muted-2 text-meta leading-[1.45]">
        {conflict.suggestion}
      </span>
    </div>
  );
}
