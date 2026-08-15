import { SCALE } from "@/lib/draft/core";
import { Pattern, PieceOutline } from "@/lib/types";

// Extrai todos os pares de coordenadas numéricas de um outline (polygon "x,y x,y ..."
// ou path "M.. C.. L.." com comandos absolutos) e retorna a bbox em px.
// Não interpreta curvas — só usa os pontos de controle/âncora presentes na string, o
// que é suficiente para uma estimativa grosseira de tamanho da peça.
function outlineBBoxPx(outline: PieceOutline): { w: number; h: number } {
  const raw = outline.kind === "polygon" ? outline.points : outline.d;
  const nums = raw.match(/-?\d+\.?\d*/g)?.map(Number) ?? [];
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i + 1 < nums.length; i += 2) {
    const x = nums[i];
    const y = nums[i + 1];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return { w: 0, h: 0 };
  return { w: maxX - minX, h: maxY - minY };
}

export function PlanoCorteTab({ pattern }: { pattern: Pattern }) {
  // Estimativa grosseira de consumo de tecido: soma, para cada peça, da altura da
  // bbox do outline (convertida de px pra cm via SCALE) multiplicada pela quantidade,
  // tratando cada peça como se ocupasse uma "faixa" isolada ao longo do tecido.
  // Não considera encaixe real, aproveitamento de sobras ou largura do tecido —
  // é só uma ordem de grandeza pra preencher a aba até termos um encaixe de verdade.
  const totalConsumo = pattern.pieces.reduce((sum, p) => {
    const { h } = outlineBBoxPx(p.outline);
    const heightCm = h / SCALE;
    return sum + (heightCm * p.qty) / 100;
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
          <span className="text-[10.5px] text-muted">aproximado</span>
        </div>
      </div>

      <div className="flex-1 border border-dashed border-pattern-guide rounded-card bg-surface-alt flex items-center justify-center min-h-[200px]">
        <span className="text-[12.5px] text-muted">Prévia do encaixe — em breve</span>
      </div>
    </div>
  );
}
