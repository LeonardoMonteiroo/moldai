import type { Pattern } from "@/lib/types";
import {
  buildExportModel,
  type ExportPiece,
  type ExPt,
  type ExSeg,
} from "./model";
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

// #123: `cutOutline`'s local frame is anchored to the *net* outline's own
// bbox (see model.ts), so it can run negative/past cutWidthCm-cutHeightCm on
// the sides that grew -- fine for ExportPiece, which still needs the net
// frame for outline/grainline/dart/fold, but wrong for a fresh CutInstance
// that only ever needs the cut line: shelf-packing `it.originCm` by
// `cutWidthCm`/`cutHeightCm` while the outline itself starts below (0,0)
// would place the packer's GAP_CM between nominal cursor positions rather
// than between the actual drawn shapes, letting two neighbours' real cut
// lines run closer than GAP_CM apart (worse here than in model.ts's own
// packer, since GAP_CM is only 3cm against up to ~4-5cm of mitre growth per
// side, measured against the real drafting matrix at the max allowance).
// Re-zeroing to the cut line's own bbox once, up front, makes `widthCm`/
// `heightCm` an honest 0-based extent again, so the packer below is correct
// without having to special-case anything.
function outlineBBox(outline: { start: ExPt; segs: ExSeg[] }) {
  let minX = outline.start.x,
    minY = outline.start.y,
    maxX = minX,
    maxY = minY;
  const consider = (p: ExPt) => {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  };
  for (const s of outline.segs) {
    consider(s.to);
    if (s.kind === "cubic") {
      consider(s.c1);
      consider(s.c2);
    }
  }
  return { minX, minY, maxX, maxY };
}

function shiftOutline(
  outline: { start: ExPt; segs: ExSeg[] },
  dx: number,
  dy: number,
): { start: ExPt; segs: ExSeg[] } {
  const shiftPt = (p: ExPt): ExPt => ({ x: p.x - dx, y: p.y - dy });
  return {
    start: shiftPt(outline.start),
    segs: outline.segs.map((s): ExSeg =>
      s.kind === "line"
        ? { kind: "line", to: shiftPt(s.to) }
        : {
            kind: "cubic",
            c1: shiftPt(s.c1),
            c2: shiftPt(s.c2),
            to: shiftPt(s.to),
          },
    ),
  };
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

  // #123: nests the real cut line (with seam allowance), not the net
  // stitch line -- what actually has to be cut from the fabric. Re-zeroed
  // to its own bbox (see outlineBBox/shiftOutline above) so widthCm/heightCm
  // are an honest 0-based extent the shelf-packer below can rely on.
  const instances: CutInstance[] = model.pieces.flatMap((p) => {
    const b = outlineBBox(p.cutOutline);
    const outline = shiftOutline(p.cutOutline, b.minX, b.minY);
    const widthCm = b.maxX - b.minX;
    const heightCm = b.maxY - b.minY;
    return Array.from({ length: p.qty }, (_, k) => ({
      id: `${p.id}#${k + 1}`,
      name: p.name,
      outline,
      widthCm,
      heightCm,
      originCm: { x: PAD_CM, y: PAD_CM },
    }));
  });

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
