export function ConflictActions({
  onFix,
  onIgnore,
}: {
  onFix: () => void;
  onIgnore: () => void;
}) {
  return (
    <div className="-mt-1 flex flex-col gap-2">
      <div className="flex flex-wrap gap-[6px]">
        <button
          onClick={onFix}
          className="rounded-pill bg-ink px-[11px] py-[6px] text-[11.5px] font-semibold text-white transition-opacity hover:opacity-90"
        >
          Corrigir manga
        </button>
        <button className="rounded-pill border-border text-muted-2 hover:bg-surface-alt border px-[11px] py-[6px] text-[11.5px] transition-colors">
          Ver diferença
        </button>
        <button
          onClick={onIgnore}
          className="rounded-pill border-border text-muted-2 hover:bg-surface-alt border px-[11px] py-[6px] text-[11.5px] transition-colors"
        >
          Ignorar
        </button>
      </div>
      <span className="text-muted text-[11.5px]">
        Correções não consomem crédito.
      </span>
    </div>
  );
}
