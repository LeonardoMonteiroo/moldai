import { useTranslations } from "next-intl";

export function GeneratingOverlay({
  stepIndex,
  onCancel,
}: {
  stepIndex: number;
  onCancel: () => void;
}) {
  const t = useTranslations("GeneratingOverlay");
  const n = stepIndex + 1;

  return (
    <div className="bg-surface border-border flex items-center gap-[10px] border-b px-4 py-[11px]">
      <span className="text-muted-2 text-[12px]">
        {t("steps.progress" + n)}
      </span>
      <span className="text-muted-2 text-[12px]">
        {t("steps.stepLabel", { n, stage: t("steps.stage" + n) })}
      </span>
      <div className="flex-1" />
      <button
        onClick={onCancel}
        className="rounded-btn border-border bg-surface hover:bg-surface-alt border px-[11px] py-[6px] text-[12px] font-medium transition-colors"
      >
        {t("cancelButton")}
      </button>
    </div>
  );
}
