import { Pattern } from "@/lib/types";
import { buildExportModel } from "@/lib/export/model";

const cm = (n: number) => n.toFixed(1).replace(".", ",");

export function FichaTecnicaTab({ pattern }: { pattern: Pattern }) {
  // Dimensões (larg × alt em cm) por peça, do model re-draftado em cm exato.
  const dims: Record<string, { w: number; h: number }> = {};
  if (pattern.spec && pattern.pieces.length > 0) {
    try {
      for (const p of buildExportModel(pattern).pieces) dims[p.id] = { w: p.widthCm, h: p.heightCm };
    } catch {
      /* sem spec válido: cai no comportamento sem dimensões */
    }
  }

  const totalPieces = pattern.pieces.reduce((s, p) => s + p.qty, 0);
  const folga = pattern.spec?.style.folgaCosturaCm ?? 1;

  return (
    <div className="flex-1 overflow-auto p-[22px]">
      <div className="flex items-baseline gap-2 mb-1">
        <span className="font-display text-[19px] font-semibold">Ficha técnica</span>
        <span className="text-[12px] text-muted">
          {pattern.name} · base {pattern.baseSize} · unidade {pattern.unit}
        </span>
      </div>

      {/* resumo do molde */}
      {pattern.spec && (
        <div className="flex gap-2 flex-wrap mb-4 text-[11.5px]">
          <Chip label="Tipo" value={pattern.spec.tipo} />
          <Chip label="Modelagem" value={pattern.spec.sexo === "masc" ? "masculina" : "feminina"} />
          <Chip label="Peças" value={`${totalPieces}`} />
          <Chip label="Folga de costura" value={`${cm(folga)} cm`} />
        </div>
      )}

      <div className="flex flex-col gap-3">
        {pattern.pieces.map((piece) => {
          const d = dims[piece.id];
          const detailRows = [
            ...(d ? [{ label: "Dimensões (larg × alt)", value: `${cm(d.w)} × ${cm(d.h)} cm` }] : []),
            ...(piece.detailRows ?? []),
          ];
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

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-baseline gap-[5px] border border-border rounded-item bg-surface px-[9px] py-[4px]">
      <span className="text-muted uppercase tracking-[.5px] text-[10px] font-semibold">{label}</span>
      <span className="font-medium">{value}</span>
    </span>
  );
}
