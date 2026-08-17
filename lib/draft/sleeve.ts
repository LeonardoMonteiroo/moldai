import { Measurements } from "@/lib/measurements";
import { DetailRow, GarmentStyle } from "@/lib/types";
import { DraftedPiece, Pt } from "./core";
import { BlockOpts } from "./body";
import type { Translate } from "@/lib/i18n/translate";

const cm = (v: number) => `${v.toFixed(1).replace(".", ",")} cm`;

export function draftSleeve(
  m: Measurements,
  style: GarmentStyle,
  armholeLenCm: number,
  t: Translate,
  _opts: BlockOpts = { gender: "female", knit: false, lengthCm: 0 },
): DraftedPiece | null {
  if (style.sleeve === "none" || !style.sleeve) return null;
  const bicep = armholeLenCm * 0.9;
  const capH = armholeLenCm / 3;
  const len =
    style.sleeve === "long" ? m.longSleeveLength : m.shortSleeveLength;
  const hemHalf = (bicep / 2) * (style.sleeve === "long" ? 0.7 : 0.9);
  const cxTop = bicep / 2;

  // 0 axila esq -> 1 ctrl costas -> 2 topo -> 3 ctrl frente -> 4 axila dir (copa, curva)
  // 4 -> 5 barra dir (reta) -> 6 barra esq (reta) -> 0 (reta)
  const outlineCm: Pt[] = [
    [0, capH],
    [bicep * 0.2, capH * 0.3],
    [cxTop, 0],
    [bicep * 0.8, capH * 0.3],
    [bicep, capH],
    [cxTop + hemHalf, capH + len],
    [cxTop - hemHalf, capH + len],
  ];
  const curvedSpans: [number, number][] = [[0, 4]];
  const grainlineCm: [Pt, Pt] = [
    [cxTop, 3],
    [cxTop, capH + len - 3],
  ];
  const detailRows: DetailRow[] = [
    { label: t("rows.sleeveType"), value: t("sleeveType." + style.sleeve) },
    { label: t("rows.length"), value: cm(capH + len) },
    { label: t("rows.sleeveCap"), value: cm(armholeLenCm) },
    { label: t("rows.grain"), value: t("grainValue") },
  ];
  return {
    id: "sleeve",
    name: t("pieceNames.sleeve"),
    qty: 2,
    outlineCm,
    curvedSpans,
    grainlineCm,
    detailRows,
    armholeLenCm,
  };
}
