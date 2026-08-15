import { Pattern } from "@/lib/types";

export function PlanoCorteTab({ pattern }: { pattern: Pattern }) {
  const totalConsumo = pattern.pieces.reduce((sum, p) => {
    const value = parseFloat(p.details.consumo.replace(",", ".").replace(/[^\d.]/g, ""));
    return sum + (Number.isNaN(value) ? 0 : value) * p.qty;
  }, 0);

  return (
    <div className="flex-1 overflow-auto p-[22px] flex flex-col gap-4">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-[19px] font-semibold">Plano de corte</span>
        <span className="text-[12px] text-muted">{pattern.name}</span>
      </div>

      <div className="flex gap-3">
        <div className="border border-border rounded-card bg-surface p-[14px] flex flex-col gap-1 w-[190px]">
          <span className="text-[11px] font-semibold tracking-[.8px] uppercase text-muted">
            Largura do tecido
          </span>
          <span className="font-display text-[19px] font-semibold">1,50 m</span>
        </div>
        <div className="border border-border rounded-card bg-surface p-[14px] flex flex-col gap-1 w-[190px]">
          <span className="text-[11px] font-semibold tracking-[.8px] uppercase text-muted">
            Consumo estimado
          </span>
          <span className="font-display text-[19px] font-semibold">
            {totalConsumo.toFixed(2).replace(".", ",")} m
          </span>
        </div>
      </div>

      <div className="flex-1 border border-dashed border-pattern-guide rounded-card bg-surface-alt flex items-center justify-center min-h-[200px]">
        <span className="text-[12.5px] text-muted">Prévia do encaixe — em breve</span>
      </div>
    </div>
  );
}
