import { Pattern } from "@/lib/types";

const COLUMNS = [
  { key: "qty", label: "Qtd" },
  { key: "folgaCostura", label: "Folga de costura" },
  { key: "penceBusto", label: "Pence" },
  { key: "cava", label: "Cava" },
  { key: "fio", label: "Fio" },
  { key: "consumo", label: "Consumo" },
] as const;

export function FichaTecnicaTab({ pattern }: { pattern: Pattern }) {
  return (
    <div className="flex-1 overflow-auto p-[22px]">
      <div className="flex items-baseline gap-2 mb-4">
        <span className="font-display text-[19px] font-semibold">Ficha técnica</span>
        <span className="text-[12px] text-muted">
          {pattern.name} · base {pattern.baseSize} · unidade {pattern.unit}
        </span>
      </div>
      <div className="border border-border rounded-card overflow-hidden bg-surface">
        <table className="w-full text-[12.5px] border-collapse">
          <thead>
            <tr className="bg-surface-alt text-muted text-[11px] uppercase tracking-[.4px]">
              <th className="text-left px-3 py-[9px] font-semibold">Peça</th>
              {COLUMNS.map((col) => (
                <th key={col.key} className="text-left px-3 py-[9px] font-semibold">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pattern.pieces.map((piece) => (
              <tr key={piece.id} className="border-t border-line">
                <td className="px-3 py-[9px] font-medium">{piece.name}</td>
                <td className="px-3 py-[9px]">{piece.qty}×</td>
                <td className="px-3 py-[9px]">{piece.details.folgaCostura}</td>
                <td className="px-3 py-[9px]">{piece.details.penceBusto}</td>
                <td className="px-3 py-[9px]">{piece.details.cava}</td>
                <td className="px-3 py-[9px]">{piece.details.fio}</td>
                <td className="px-3 py-[9px]">{piece.details.consumo}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
