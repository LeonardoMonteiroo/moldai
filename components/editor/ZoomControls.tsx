export function ZoomControls({
  scale,
  onZoomIn,
  onZoomOut,
  onFit,
}: {
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}) {
  return (
    <div className="bg-surface border-border rounded-item shadow-card absolute right-5 bottom-5 flex items-center gap-1 border p-[7px]">
      <button
        title="Diminuir zoom"
        onClick={onZoomOut}
        className="text-muted-2 hover:bg-surface-alt flex h-[30px] w-[30px] items-center justify-center rounded-[7px] text-[16px] transition-colors"
      >
        −
      </button>
      <button
        title="Ajustar à tela"
        onClick={onFit}
        className="text-muted-2 hover:bg-surface-alt flex h-[30px] min-w-[54px] items-center justify-center rounded-[7px] px-2 text-[12px] tabular-nums transition-colors"
      >
        {Math.round(scale * 100)}%
      </button>
      <button
        title="Aumentar zoom"
        onClick={onZoomIn}
        className="text-muted-2 hover:bg-surface-alt flex h-[30px] w-[30px] items-center justify-center rounded-[7px] text-[16px] transition-colors"
      >
        +
      </button>
    </div>
  );
}
