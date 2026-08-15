import { GENERATION_STEPS } from "@/lib/store";

export function GeneratingOverlay({
  stepIndex,
  onCancel,
}: {
  stepIndex: number;
  onCancel: () => void;
}) {
  const step = GENERATION_STEPS[stepIndex];

  return (
    <div className="flex items-center gap-[10px] px-4 py-[11px] bg-surface border-b border-border">
      <span className="text-[12px] text-muted-2">{step.pieceProgress}</span>
      <span className="text-[12px] text-muted">·</span>
      <span className="text-[12px] text-muted-2">{step.label}</span>
      <div className="flex-1" />
      <button
        onClick={onCancel}
        className="text-[12px] font-medium px-[11px] py-[6px] rounded-btn border border-border bg-surface hover:bg-surface-alt transition-colors"
      >
        Cancelar
      </button>
    </div>
  );
}
