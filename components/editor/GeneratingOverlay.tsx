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
    // role="status" so each step change is announced. This is the one live
    // region for generation progress: ChatPanel renders the same step text in
    // its composer and is deliberately left silent, or every step would be
    // read out twice.
    //
    // EDCH-01: a compact floating pill (Editor.dc.html:480) replacing the
    // old static full-width row in the exact slot TabBar now floats in --
    // kept as a flow-reserving row instead of matching the floating chrome
    // would make the canvas visibly resize every time generation starts or
    // stops.
    <div
      role="status"
      className="bg-surface/86 border-border shadow-card absolute top-4 left-4 z-10 flex h-8 items-center gap-[10px] rounded-full border py-0 pr-1.5 pl-3 backdrop-blur-sm"
    >
      <span className="text-muted-2 text-ui whitespace-nowrap">
        {t("steps.progress" + n)}
      </span>
      <span className="text-muted-2 text-ui whitespace-nowrap">
        {t("steps.stepLabel", { n, stage: t("steps.stage" + n) })}
      </span>
      <Button
        variant="ghost"
        size="chrome"
        onClick={onCancel}
        className="h-6 rounded-full px-2"
      >
        {t("cancelButton")}
      </Button>
    </div>
  );
}
