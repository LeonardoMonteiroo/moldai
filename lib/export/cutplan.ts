import type { Pattern } from "@/lib/types";
import { buildExportModel, type ExportPiece } from "./model";
import type { Translate } from "@/lib/i18n/translate";

// Most common roll widths in fabric retail (cm).
export const FABRIC_WIDTHS_CM = [140, 150, 160] as const;

const PAD_CM = 4; // margin between the pieces and the selvage
const GAP_CM = 3; // spacing between pieces

export interface CutInstance {
  id: string; // unique per copy (piece#n)
  name: string;
  outline: ExportPiece["outline"];
  widthCm: number;
  heightCm: number;
  originCm: { x: number; y: number };
}

export interface CutPlan {
  fabricWidthCm: number;
  lengthCm: number; // fabric length consumed
  usedAreaCm2: number; // sum of the copies' bboxes
  efficiency: number; // usedArea / (width × length), in (0,1]
  instances: CutInstance[];
  overflow: boolean; // some piece wider than the usable fabric
}

// Real nesting, but first-fit — not optimal. Reuses buildExportModel's exact
// cm geometry (re-drafts via draftPiecesCm, doesn't reverse px), expands each
// piece by its cut quantity, and shelf-packs the copies into a strip the
// FABRIC WIDTH wide. The grain is locked (no rotation): the piece keeps the
// orientation it was drafted in, so the cap/neckline stay aligned to the warp.
export function planCutLayout(
  pattern: Pattern,
  fabricWidthCm: number,
  t: Translate,
): CutPlan {
  const model = buildExportModel(pattern, t);

  // expand qty: each copy is one instance to cut
  const instances: CutInstance[] = model.pieces.flatMap((p) =>
    Array.from({ length: p.qty }, (_, k) => ({
      id: `${p.id}#${k + 1}`,
      name: p.name,
      outline: p.outline,
      widthCm: p.widthCm,
      heightCm: p.heightCm,
      originCm: { x: PAD_CM, y: PAD_CM },
    })),
  );

  const usableW = fabricWidthCm - PAD_CM * 2;
  let overflow = false;

  // sorts by height desc for tighter shelves; the output order follows the original
  const order = [...instances].sort((a, b) => b.heightCm - a.heightCm);
  let cursorX = PAD_CM;
  let cursorY = PAD_CM;
  let rowH = 0;
  for (const it of order) {
    if (it.widthCm > usableW) overflow = true;
    if (cursorX > PAD_CM && cursorX - PAD_CM + it.widthCm > usableW) {
      cursorY += rowH + GAP_CM; // new shelf along the fabric
      cursorX = PAD_CM;
      rowH = 0;
    }
    it.originCm = { x: cursorX, y: cursorY };
    cursorX += it.widthCm + GAP_CM;
    rowH = Math.max(rowH, it.heightCm);
  }

  const lengthCm = (instances.length ? cursorY + rowH : 0) + PAD_CM;
  const usedAreaCm2 = instances.reduce(
    (s, it) => s + it.widthCm * it.heightCm,
    0,
  );
  const efficiency =
    lengthCm > 0 ? usedAreaCm2 / (fabricWidthCm * lengthCm) : 0;

  return {
    fabricWidthCm,
    lengthCm,
    usedAreaCm2,
    efficiency,
    instances,
    overflow,
  };
}
