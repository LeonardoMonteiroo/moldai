import { Pattern } from "@/lib/types";

export function FichaTecnicaTab({ pattern }: { pattern: Pattern }) {
  return (
    <div className="flex-1 overflow-auto p-[22px]">
      <div className="flex items-baseline gap-2 mb-4">
        <span className="font-display text-[19px] font-semibold">Ficha técnica</span>
        <span className="text-[12px] text-muted">
          {pattern.name} · base {pattern.baseSize} · unidade {pattern.unit}
        </span>
      </div>
      <div className="flex flex-col gap-3">
        {pattern.pieces.map((piece) => {
          const detailRows = piece.detailRows ?? [];
          return (
            <div
              key={piece.id}
              className="border border-border rounded-card overflow-hidden bg-surface"
            >
              <div className="flex items-baseline gap-2 px-3 py-[9px] bg-surface-alt border-b border-line">
                <span className="text-[13px] font-semibold">{piece.name}</span>
                <span className="text-[12px] text-muted">{piece.qty}×</span>
              </div>
              {detailRows.length > 0 ? (
                <table className="w-full text-[12.5px] border-collapse">
                  <tbody>
                    {detailRows.map((row, i) => (
                      <tr key={row.label} className={i > 0 ? "border-t border-line" : undefined}>
                        <td className="px-3 py-[7px] text-muted w-1/2">{row.label}</td>
                        <td className="px-3 py-[7px] font-medium">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="px-3 py-[9px] text-[12px] text-muted">Sem detalhes.</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
