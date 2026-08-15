import { Measurements } from "@/lib/measurements";
import { DetailRow, GarmentStyle } from "@/lib/types";
import { DraftedPiece, Pt } from "./core";

const cm = (v: number) => `${v.toFixed(1).replace(".", ",")} cm`;

// Traça meio-corpo espelhado -> peça inteira. `frontish` controla decote (frente mais fundo).
function bodice(m: Measurements, style: GarmentStyle, id: string, name: string, frontish: boolean): {
  piece: DraftedPiece;
  armholeLenCm: number;
} {
  const folga = style.folgaCosturaCm ?? 1;
  const quarter = m.busto / 4;
  const halfW = quarter + folga;        // meia largura (centro -> lateral) no busto
  const len = m.comprimentoCostas;      // ombro/nuca -> cintura
  const neckHalf = m.comprimentoCostas / 6 + 0.5 + (frontish ? 0.5 : 0); // meia largura do decote
  const shoulder = m.ombro;
  const armholeDepth = quarter * 0.5 + 2; // altura de cava a partir da linha de ombro
  const baseDrop = frontish ? neckHalf + 1 : neckHalf * 0.5; // profundidade base do decote
  const extra = style.decote && style.decote !== "reto" ? Math.max(0, style.decoteProfundidadeCm ?? 4) : 0;
  const neckDrop = baseDrop + (frontish ? extra : extra * 0.3);
  const waistHalf = halfW - 1;          // leve afunilamento na cintura

  // centro em x = halfW; y=0 na linha de ombro
  const cx = halfW;
  const shoulderY = 0;
  const top: Pt[] = [];
  // ombro esquerdo -> decote -> ombro direito
  top.push([cx - shoulder, shoulderY + 1.5]);          // ponta de ombro esq
  top.push([cx - neckHalf, shoulderY]);                // base pescoço esq
  if (style.decote === "V") {
    top.push([cx, shoulderY + neckDrop]);              // bico do V
  } else if (style.decote === "redondo") {
    top.push([cx - neckHalf * 0.5, shoulderY + neckDrop * 0.7]);
    top.push([cx, shoulderY + neckDrop]);
    top.push([cx + neckHalf * 0.5, shoulderY + neckDrop * 0.7]);
  } else {
    top.push([cx, shoulderY + baseDrop * 0.4]);        // reto suave
  }
  top.push([cx + neckHalf, shoulderY]);                // base pescoço dir
  top.push([cx + shoulder, shoulderY + 1.5]);          // ponta de ombro dir

  const outlineCm: Pt[] = [
    ...top,
    [cx + halfW, shoulderY + armholeDepth],            // cava dir
    [cx + waistHalf, len],                             // cintura dir
    [cx - waistHalf, len],                             // cintura esq
    [cx - halfW, shoulderY + armholeDepth],            // cava esq
  ];

  // comprimento aproximado da cava (ombro -> lateral do busto), por lado
  const armholeLenCm = Math.hypot(halfW - shoulder, armholeDepth - 1.5) + armholeDepth * 0.15;

  const grainlineCm: [Pt, Pt] = [[cx, shoulderY + 3], [cx, len - 3]];
  const detailRows: DetailRow[] = [
    { label: "Folga de costura", value: cm(folga) },
    { label: "Largura (busto)", value: cm(halfW * 2) },
    { label: "Comprimento", value: cm(len) },
    { label: "Cava", value: cm(armholeLenCm) },
    { label: "Decote", value: style.decote ?? "reto" },
    { label: "Fio", value: "reto" },
  ];

  let dartCm: Pt[] | undefined;
  if (style.pences) {
    const dartW = Math.max(1.5, (m.quadril / 4 - m.cintura / 4) * 0.5);
    const dy = len - 6;
    dartCm = [[cx - dartW, len], [cx, dy - 12], [cx + dartW, len]];
    detailRows.splice(4, 0, { label: "Pence", value: cm(dartW * 2) });
  }

  return {
    piece: { id, name, qty: 1, outlineCm, grainlineCm, dartCm, detailRows, armholeLenCm },
    armholeLenCm,
  };
}

export function draftCorpo(m: Measurements, style: GarmentStyle) {
  const f = bodice(m, style, "corpo-frente", "Frente", true);
  const c = bodice(m, style, "corpo-costas", "Costas", false);
  return { frente: f.piece, costas: c.piece, armholeLenCm: f.armholeLenCm };
}
