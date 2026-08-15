export function ConflictActions({
  onFix,
  onIgnore,
}: {
  onFix: () => void;
  onIgnore: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 -mt-1">
      <div className="flex flex-wrap gap-[6px]">
        <button
          onClick={onFix}
          className="text-[11.5px] font-semibold px-[11px] py-[6px] rounded-pill bg-ink text-white hover:opacity-90 transition-opacity"
        >
          Corrigir manga
        </button>
        <button className="text-[11.5px] px-[11px] py-[6px] rounded-pill border border-border text-muted-2 hover:bg-surface-alt transition-colors">
          Ver diferença
        </button>
        <button
          onClick={onIgnore}
          className="text-[11.5px] px-[11px] py-[6px] rounded-pill border border-border text-muted-2 hover:bg-surface-alt transition-colors"
        >
          Ignorar
        </button>
      </div>
      <span className="text-[11.5px] text-muted">Correções não consomem crédito.</span>
    </div>
  );
}
