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
    <div className="bg-surface border-border flex items-center gap-[10px] border-b px-4 py-[11px]">
      <span className="text-muted-2 text-[12px]">{step.pieceProgress}</span>
      <span className="text-muted text-[12px]">·</span>
      <span className="text-muted-2 text-[12px]">{step.label}</span>
      <div className="flex-1" />
      <button
        onClick={onCancel}
        className="rounded-btn border-border bg-surface hover:bg-surface-alt border px-[11px] py-[6px] text-[12px] font-medium transition-colors"
      >
        Cancelar
      </button>
    </div>
  );
}
