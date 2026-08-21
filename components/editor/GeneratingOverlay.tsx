import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

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
      <span className="text-muted-2 text-ui">{t("steps.progress" + n)}</span>
      <span className="text-muted-2 text-ui">
        {t("steps.stepLabel", { n, stage: t("steps.stage" + n) })}
      </span>
      <div className="flex-1" />
      <Button variant="outline" size="chrome" onClick={onCancel}>
        {t("cancelButton")}
      </Button>
    </div>
  );
}
