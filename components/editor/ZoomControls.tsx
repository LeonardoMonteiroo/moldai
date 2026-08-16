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
    <div className="absolute right-5 bottom-5 bg-surface border border-border rounded-item p-[7px] flex items-center gap-1 shadow-card">
      <button
        title="Diminuir zoom"
        onClick={onZoomOut}
        className="w-[30px] h-[30px] rounded-[7px] flex items-center justify-center text-[16px] text-muted-2 hover:bg-surface-alt transition-colors"
      >
        −
      </button>
      <button
        title="Ajustar à tela"
        onClick={onFit}
        className="min-w-[54px] h-[30px] px-2 rounded-[7px] flex items-center justify-center text-[12px] text-muted-2 hover:bg-surface-alt transition-colors tabular-nums"
      >
        {Math.round(scale * 100)}%
      </button>
      <button
        title="Aumentar zoom"
        onClick={onZoomIn}
        className="w-[30px] h-[30px] rounded-[7px] flex items-center justify-center text-[16px] text-muted-2 hover:bg-surface-alt transition-colors"
      >
        +
      </button>
    </div>
  );
}
