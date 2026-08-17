import { Measurements } from "@/lib/measurements";
import { DetailRow, GarmentStyle, SkirtSilhouette } from "@/lib/types";
import { DraftedPiece, Pt } from "./core";

const cm = (v: number) => `${v.toFixed(1).replace(".", ",")} cm`;

const SKIRT_SILHOUETTE_LABELS_PT: Record<SkirtSilhouette, string> = {
  straight: "reta",
  "a-line": "evase",
  gore: "gode",
  "half-circle": "meia-roda",
  circle: "circulo",
};

// setor anelar (arco de cintura e de barra) amostrado em pontos
function radialSkirt(
  waist: number,
  comp: number,
  denom: number,
): { pts: Pt[]; r: number } {
  const r = waist / denom; // raio interno (cintura)
  const R = r + comp; // raio externo (barra)
  const sweep = (Math.PI * 2) / denom; // ângulo de UM quarto de peça (peça cortada 4x/2x)
  const half = sweep / 2;
  const steps = 12;
  const inner: Pt[] = [];
  const outer: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = -half + (sweep * i) / steps;
    inner.push([r * Math.sin(a), -r * Math.cos(a)]);
    outer.push([R * Math.sin(a), -R * Math.cos(a)]);
  }
  // fecha: cintura (esq->dir) + barra (dir->esq)
  const pts = [...inner, ...outer.reverse()];
  // normaliza para y>=0 (bbox translada depois)
  const minY = Math.min(...pts.map((p) => p[1]));
  return { pts: pts.map(([x, y]) => [x, y - minY] as Pt), r };
}

export function draftSaia(m: Measurements, style: GarmentStyle): DraftedPiece {
  const silhueta: SkirtSilhouette = style.skirt ?? "straight";
  const folga = style.seamAllowanceCm ?? 1;
  const comp = style.skirtLengthCm ?? m.skirtLength;
  const detailRows: DetailRow[] = [
    { label: "Silhueta", value: SKIRT_SILHOUETTE_LABELS_PT[silhueta] },
    { label: "Comprimento", value: cm(comp) },
    { label: "Folga de costura", value: cm(folga) },
    { label: "Fio", value: "reto" },
  ];

  if (
    silhueta === "circle" ||
    silhueta === "gore" ||
    silhueta === "half-circle"
  ) {
    const denom = silhueta === "half-circle" ? Math.PI : 2 * Math.PI;
    const { pts, r } = radialSkirt(m.waist, comp, denom);
    detailRows.splice(1, 0, { label: "Raio da cintura", value: cm(r) });
    // desloca para x>=0
    const minX = Math.min(...pts.map((p) => p[0]));
    const outlineCm = pts.map(([x, y]) => [x - minX, y] as Pt);
    const cxTop = -minX; // aproximação do centro no topo
    const steps = 12; // igual ao usado em radialSkirt
    const waistSpan: [number, number] = [0, steps];
    const hemSpan: [number, number] = [steps + 1, 2 * steps + 1];
    return {
      id: "saia",
      name: "Saia",
      qty: silhueta === "half-circle" ? 1 : 2,
      outlineCm,
      curvedSpans: [waistSpan, hemSpan],
      grainlineCm: [
        [cxTop, 4],
        [cxTop, comp],
      ],
      detailRows,
    };
  }

  // reta / evasê: trapézio (¼ quadril na cintura, barra igual ou mais larga)
  const waistHalf = m.hip / 4 + folga; // usa quadril como largura de referência do painel
  const flare = silhueta === "a-line" ? 12 : 0;
  const hemHalf = waistHalf + flare;
  const outlineCm: Pt[] = [
    [waistHalf === hemHalf ? 0 : hemHalf - waistHalf, 0],
    [hemHalf - waistHalf + waistHalf * 2, 0],
    [hemHalf * 2, comp],
    [0, comp],
  ];
  detailRows.splice(1, 0, {
    label: "Cintura (painel)",
    value: cm(waistHalf * 2),
  });
  return {
    id: "saia",
    name: "Saia",
    qty: 2,
    outlineCm,
    grainlineCm: [
      [hemHalf, 4],
      [hemHalf, comp - 4],
    ],
    detailRows,
  };
}
