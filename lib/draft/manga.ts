import { Measurements } from "@/lib/measurements";
import { DetailRow, GarmentStyle } from "@/lib/types";
import { DraftedPiece, Pt } from "./core";

const cm = (v: number) => `${v.toFixed(1).replace(".", ",")} cm`;

export function draftManga(m: Measurements, style: GarmentStyle, armholeLenCm: number): DraftedPiece | null {
  if (style.manga === "sem" || !style.manga) return null;
  const bicep = armholeLenCm * 0.9;         // largura no topo
  const capH = armholeLenCm * 0.4;          // altura da copa
  const len = style.manga === "longa" ? m.compMangaLonga : m.compMangaCurta;
  const hemHalf = (bicep / 2) * (style.manga === "longa" ? 0.7 : 0.92); // afunila na manga longa

  const cxTop = bicep / 2;
  // copa: dois picos suaves (frente/costas) -> lateral
  const outlineCm: Pt[] = [
    [cxTop, 0],                       // topo central da copa
    [bicep * 0.78, capH * 0.55],
    [bicep, capH],                    // axila dir
    [cxTop + hemHalf, capH + len],    // barra dir
    [cxTop - hemHalf, capH + len],    // barra esq
    [0, capH],                        // axila esq
    [bicep * 0.22, capH * 0.55],
  ];
  const grainlineCm: [Pt, Pt] = [[cxTop, 3], [cxTop, capH + len - 3]];
  const detailRows: DetailRow[] = [
    { label: "Tipo", value: style.manga === "longa" ? "longa" : "curta" },
    { label: "Comprimento", value: cm(capH + len) },
    { label: "Cava (copa)", value: cm(armholeLenCm) },
    { label: "Fio", value: "reto" },
  ];
  return { id: "manga", name: "Manga", qty: 2, outlineCm, grainlineCm, detailRows, armholeLenCm };
}
