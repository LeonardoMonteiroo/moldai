import { ALL_SIZES, COSTS, Pattern, Piece } from "@/lib/types";
import { formatList } from "@/lib/format";

export function PieceDetailsPanel({
  piece,
  pattern,
  onClose,
  onGraduate,
}: {
  piece: Piece;
  pattern: Pattern;
  onClose: () => void;
  onGraduate: (sizes: string[]) => void;
}) {
  const detailRows = piece.detailRows ?? [];
  // O tamanho-base já é o tamanho desenhado — não precisa (nem pode) ser graduado.
  const gradable = pattern.sizesPending.filter((s) => s !== pattern.baseSize);

  return (
    <div className="absolute right-5 top-5 bottom-5 w-[230px] bg-surface border border-border rounded-card p-[14px] flex flex-col gap-[11px] shadow-card">
      <div className="flex items-center">
        <span className="text-[11px] font-semibold tracking-[.8px] uppercase text-muted">
          Peça selecionada
        </span>
        <div className="flex-1" />
        <button onClick={onClose} className="text-[13px] text-placeholder hover:text-muted-2">
          ✕
        </button>
      </div>

      <div className="font-display text-[16px] font-semibold">{piece.name}</div>

      {detailRows.length > 0 && (
        <div className="flex flex-col gap-2 text-[12.5px]">
          {detailRows.map((row, i) => (
            <div key={row.label}>
              <div className="flex justify-between">
                <span className="text-muted">{row.label}</span>
                <span className="font-medium">{row.value}</span>
              </div>
              {i < detailRows.length - 1 && <div className="h-px bg-line mt-2" />}
            </div>
          ))}
        </div>
      )}

      <div className="text-[11px] font-semibold tracking-[.8px] uppercase text-muted mt-[2px]">
        Graduação
      </div>
      <div className="border border-dashed border-pattern-guide rounded-item p-[10px] bg-surface-alt">
        <div className="flex gap-[5px] text-[11.5px]">
          {ALL_SIZES.map((size) => {
            const isBase = size === pattern.baseSize;
            const active = isBase || pattern.sizesApplied.includes(size);
            return (
              <span
                key={size}
                title={isBase ? "tamanho base" : undefined}
                className={[
                  "px-[7px] py-[3px] rounded-[6px] font-semibold",
                  active ? "bg-olive-tint text-olive" : "text-placeholder",
                  isBase ? "ring-1 ring-olive-border" : "",
                ].join(" ")}
              >
                {size}
              </span>
            );
          })}
        </div>
        <div className="text-[11.5px] text-muted mt-2">
          {gradable.length > 0
            ? `Graduar ${formatList(gradable)} · ${COSTS.graduate} créditos`
            : "Todos os tamanhos graduados"}
        </div>
      </div>

      <button
        disabled={gradable.length === 0}
        onClick={() => onGraduate(gradable)}
        className="border border-border rounded-btn py-[9px] text-center text-[12.5px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed hover:bg-surface-alt transition-colors"
      >
        Graduar
      </button>

      <div className="flex-1" />
      <span className="text-[11.5px] text-muted" title="Glossário de modelagem chega em breve">
        Glossário: o que é pence? · em breve
      </span>
    </div>
  );
}
