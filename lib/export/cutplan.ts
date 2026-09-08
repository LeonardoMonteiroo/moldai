import type { Pattern, SizeLabel } from "@/lib/types";
import {
  buildExportModel,
  type ExportModel,
  type ExportPiece,
  type ExPt,
  type ExSeg,
} from "./model";
import type { Translate } from "@/lib/i18n/translate";

// Most common roll widths in fabric retail (cm).
export const FABRIC_WIDTHS_CM = [140, 150, 160] as const;

const PAD_CM = 4; // margin between the pieces and the selvage
const GAP_CM = 3; // spacing between pieces

// #8: the only two nesting modes the cut plan exposes -- a plain runtime
// list + derived union, the exact EXPORT_FORMATS/ExportFormat shape, so a UI
// can map the list and resolve labels with t("mode." + mode) instead of a
// hand-written Record<NestingMode, string>.
export const NESTING_MODES = ["auto", "manual"] as const;
export type NestingMode = (typeof NESTING_MODES)[number];

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
  // #89: usedArea / (effective width × length), in (0,1] while no copies
  // overlap -- manual mode (below) can legitimately produce overlaps, and
  // when it does the ratio is no longer a meaningful percentage; see
  // `overlaps`. "Effective width" is fabricWidthCm widened to fit the widest
  // instance whenever a piece overflows the usable width -- dividing by the
  // nominal fabricWidthCm in that case (a half-circle skirt on a 140cm roll,
  // measured) produced efficiency > 1, a nonsense percentage on the card a
  // user reads to buy fabric.
  efficiency: number;
  instances: CutInstance[];
  overflow: boolean; // some piece wider than the usable fabric
  // #8: ids of every instance whose rectangle overlaps another's -- only
  // ever non-empty in manual mode (auto never produces an overlap by
  // construction). Flagged, never auto-corrected, per "a control must not
  // rewrite what you typed."
  overlaps: string[];
}

// #8: pulled out of planCutLayout so both packAuto (below) and a future
// caller can measure a candidate layout's own consumed length without
// re-deriving it from a CutPlan.
export function layoutLengthCm(placed: CutInstance[]): number {
  if (!placed.length) return 0;
  let maxBottom = 0;
  for (const it of placed) {
    maxBottom = Math.max(maxBottom, it.originCm.y + it.heightCm);
  }
  return maxBottom + PAD_CM;
}

// #8: the packer MoldAI shipped with -- first-fit, not optimal. Extracted
// into a pure, instance-level function (previously inlined in
// planCutLayout): same height-desc sort, same PAD_CM/GAP_CM, same
// `it.widthCm > usableW -> overflow` flag. Pure: never mutates `instances`,
// returns fresh instance objects in the SAME order as the input (the
// original code mutated originCm in place, which happened to preserve input
// order too -- this keeps that observable behavior while letting packAuto
// below run this and packSkyline over the same instances without either
// clobbering the other).
export function packShelf(
  instances: CutInstance[],
  fabricWidthCm: number,
): { placed: CutInstance[]; overflow: boolean } {
  const usableW = fabricWidthCm - PAD_CM * 2;
  let overflow = false;

  // sorts by height desc for tighter shelves; the output order follows the original
  const order = [...instances].sort((a, b) => b.heightCm - a.heightCm);
  const originById = new Map<string, { x: number; y: number }>();
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
    originById.set(it.id, { x: cursorX, y: cursorY });
    cursorX += it.widthCm + GAP_CM;
    rowH = Math.max(rowH, it.heightCm);
  }

  const placed = instances.map((it) => ({
    ...it,
    originCm: originById.get(it.id) ?? it.originCm,
  }));
  return { placed, overflow };
}

interface SkySeg {
  x: number;
  w: number;
  y: number;
}

const EPS = 1e-6;

function updateSkyline(
  sky: SkySeg[],
  fx: number,
  fw: number,
  fy: number,
  boundary: number,
): SkySeg[] {
  const fxEnd = Math.min(fx + fw, boundary);
  const rest: SkySeg[] = [];
  for (const seg of sky) {
    const segEnd = seg.x + seg.w;
    if (segEnd <= fx + EPS || seg.x >= fxEnd - EPS) {
      rest.push(seg);
      continue;
    }
    if (seg.x < fx - EPS) rest.push({ x: seg.x, w: fx - seg.x, y: seg.y });
    if (segEnd > fxEnd + EPS)
      rest.push({ x: fxEnd, w: segEnd - fxEnd, y: seg.y });
  }
  rest.push({ x: fx, w: fxEnd - fx, y: fy });
  rest.sort((a, b) => a.x - b.x);

  const merged: SkySeg[] = [];
  for (const seg of rest) {
    if (seg.w <= EPS) continue;
    const last = merged[merged.length - 1];
    if (
      last &&
      Math.abs(last.y - seg.y) < EPS &&
      Math.abs(last.x + last.w - seg.x) < EPS
    ) {
      last.w += seg.w;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

// #8: skyline bottom-left packer -- fits each copy's real rectangle into the
// lowest, then leftmost, gap along a running "skyline" of occupied height
// per x-position, instead of shelf's row-at-a-time first-fit. Reserves a
// (widthCm + GAP_CM) x (heightCm + GAP_CM) footprint when updating the
// skyline (what preserves GAP_CM spacing on every side without double-
// counting it), while the fit test and the reported originCm use the real
// widthCm/heightCm. Deterministic: ties broken by (height desc, width desc,
// id asc), so two calls on the same input return identical placements.
export function packSkyline(
  instances: CutInstance[],
  fabricWidthCm: number,
): { placed: CutInstance[]; overflow: boolean } {
  const usableW = fabricWidthCm - PAD_CM * 2;
  const boundary = PAD_CM + usableW;
  let overflow = false;

  const order = [...instances].sort((a, b) => {
    if (b.heightCm !== a.heightCm) return b.heightCm - a.heightCm;
    if (b.widthCm !== a.widthCm) return b.widthCm - a.widthCm;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  let sky: SkySeg[] = [{ x: PAD_CM, w: usableW, y: PAD_CM }];
  const originById = new Map<string, { x: number; y: number }>();

  for (const it of order) {
    if (it.widthCm > usableW) {
      overflow = true;
      // No candidate fits -- place on a fresh row at the current maximum
      // top so it never lands on top of another copy.
      const maxTop = sky.reduce((m, s) => Math.max(m, s.y), PAD_CM);
      originById.set(it.id, { x: PAD_CM, y: maxTop });
      sky = updateSkyline(
        sky,
        PAD_CM,
        it.widthCm + GAP_CM,
        maxTop + it.heightCm + GAP_CM,
        boundary,
      );
      continue;
    }

    // candidate x values: every segment's own left and right edge that a
    // full-width placement could still start from.
    const candidates = new Set<number>();
    for (const seg of sky) {
      if (seg.x + it.widthCm <= boundary + EPS) candidates.add(seg.x);
      const segEnd = seg.x + seg.w;
      if (segEnd + it.widthCm <= boundary + EPS) candidates.add(segEnd);
    }

    let bestX: number | null = null;
    let bestY = Infinity;
    for (const x of candidates) {
      let y = PAD_CM;
      for (const seg of sky) {
        if (seg.x < x + it.widthCm - EPS && seg.x + seg.w > x + EPS) {
          y = Math.max(y, seg.y);
        }
      }
      if (
        y < bestY - EPS ||
        (Math.abs(y - bestY) < EPS && (bestX === null || x < bestX))
      ) {
        bestY = y;
        bestX = x;
      }
    }

    if (bestX === null) {
      // Shouldn't happen (usableW already checked above), but keep the same
      // "own fresh row" fallback rather than silently dropping the copy.
      overflow = true;
      const maxTop = sky.reduce((m, s) => Math.max(m, s.y), PAD_CM);
      originById.set(it.id, { x: PAD_CM, y: maxTop });
      sky = updateSkyline(
        sky,
        PAD_CM,
        it.widthCm + GAP_CM,
        maxTop + it.heightCm + GAP_CM,
        boundary,
      );
      continue;
    }

    originById.set(it.id, { x: bestX, y: bestY });
    sky = updateSkyline(
      sky,
      bestX,
      it.widthCm + GAP_CM,
      bestY + it.heightCm + GAP_CM,
      boundary,
    );
  }

  const placed = instances.map((it) => ({
    ...it,
    originCm: originById.get(it.id) ?? it.originCm,
  }));
  return { placed, overflow };
}

// #8: auto mode is the best of both packers, never worse than shelf alone by
// construction (min(shelf, skyline) <= shelf) -- so a user-facing first-fit
// choice would be a permanently worse option on screen. Measured example:
// a short-sleeve female blouse at 150cm drops from 102.15cm (shelf) to
// 74.6cm (skyline). Ties break toward shelf for stability (its output order
// and layout are the ones every existing screenshot/test already assumes).
function packAuto(
  instances: CutInstance[],
  fabricWidthCm: number,
): { placed: CutInstance[]; overflow: boolean } {
  const shelf = packShelf(instances, fabricWidthCm);
  const skyline = packSkyline(instances, fabricWidthCm);
  const shelfLen = layoutLengthCm(shelf.placed);
  const skylineLen = layoutLengthCm(skyline.placed);
  return skylineLen < shelfLen - EPS ? skyline : shelf;
}

// #8: clamps a manual placement's origin so a copy always stays inside the
// fabric width (x) and never goes negative (y) -- a piece wider than the
// fabric clamps to x=0 rather than going negative.
export function clampOriginCm(
  origin: { x: number; y: number },
  sizeCm: { widthCm: number; heightCm: number },
  fabricWidthCm: number,
): { x: number; y: number } {
  const maxX = Math.max(0, fabricWidthCm - sizeCm.widthCm);
  return {
    x: Math.min(Math.max(0, origin.x), maxX),
    y: Math.max(0, origin.y),
  };
}

// #8: ids of every instance whose axis-aligned rectangle overlaps another's,
// using the same 1e-6 epsilon as the disjointness test in cutplan.test.ts.
// Returned sorted so a caller/test gets a deterministic order regardless of
// instance array order.
export function overlappingInstanceIds(instances: CutInstance[]): string[] {
  const overlapping = new Set<string>();
  for (let i = 0; i < instances.length; i++) {
    for (let j = i + 1; j < instances.length; j++) {
      const a = instances[i];
      const b = instances[j];
      const disjoint =
        a.originCm.x + a.widthCm <= b.originCm.x + 1e-6 ||
        b.originCm.x + b.widthCm <= a.originCm.x + 1e-6 ||
        a.originCm.y + a.heightCm <= b.originCm.y + 1e-6 ||
        b.originCm.y + b.heightCm <= a.originCm.y + 1e-6;
      if (!disjoint) {
        overlapping.add(a.id);
        overlapping.add(b.id);
      }
    }
  }
  return Array.from(overlapping).sort();
}

export interface PlanCutLayoutOptions {
  mode?: NestingMode;
  // Manual overrides, keyed by CutInstance id -- an id missing from this map
  // keeps its auto placement (a copy that appeared after a regeneration); an
  // id present here that matches no instance is ignored.
  placements?: Record<string, { x: number; y: number }>;
  // #280: how many garments to nest per size, keyed by SizeLabel -- the cut
  // plan's "Quantidade por tamanho" panel. `undefined` (a pattern that has
  // never touched the panel) means the pre-existing default: baseSize only,
  // at each piece's own drafted `qty`. Once DEFINED -- even `{}`, or every
  // entry 0 -- it is an explicit spec: a size missing from it, or at 0,
  // nests nothing for that size, including baseSize. See
  // cutInstancesForQuantities below.
  cutQuantities?: Partial<Record<SizeLabel, number>>;
}

// Real nesting. Reuses buildExportModel's exact cm geometry (re-drafts via
// draftPiecesCm, doesn't reverse px), expands each piece by its cut
// quantity, and packs the copies into a strip the FABRIC WIDTH wide. The
// grain is locked (no rotation): the piece keeps the orientation it was
// drafted in, so the cap/neckline stay aligned to the warp.
//
// #8: `opts.mode` defaults to "auto" -- the best of packShelf and
// packSkyline (never worse than the original first-fit-only shelf packer).
// "manual" starts from that same auto placement and overwrites the origin of
// every instance named in `opts.placements`, clamped inside the fabric
// width -- everything else about the layout (which copies exist, their
// size) is identical between modes.
// #123: nests the real cut line (with seam allowance), not the net stitch
// line -- what actually has to be cut from the fabric. Re-zeroed to its own
// bbox (see outlineBBox/shiftOutline above) so widthCm/heightCm are an
// honest 0-based extent the packers below can rely on. Exported so tests can
// measure a specific packer (packShelf/packSkyline) directly against the
// same instances planCutLayout itself builds, without duplicating this
// extraction.
export function cutInstancesFromModel(model: ExportModel): CutInstance[] {
  return model.pieces.flatMap((p) => {
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
}

// #280: expands cutQuantities into the full instance set to nest -- one
// buildExportModel/cutInstancesFromModel pass per size with a quantity > 0,
// each pass's instances repeated `qty` times with size- and copy-suffixed
// ids so they stay unique once concatenated (cutInstancesFromModel alone
// only guarantees uniqueness within a single size/piece). Falls back to
// today's exact pre-#280 behavior -- one buildExportModel(pattern, t) call
// at the pattern's own baseSize, no repetition beyond each piece's drafted
// `qty` -- ONLY when cutQuantities is `undefined` (a pattern that has never
// touched the size panel), so it nests identically to before this option
// existed. A defined-but-empty or all-zero object is a real (if degenerate)
// spec -- it returns no instances at all, not the default -- since setting
// every size to 0 through the panel is an explicit "nest nothing", not "I
// haven't decided".
function cutInstancesForQuantities(
  pattern: Pattern,
  t: Translate,
  cutQuantities: Partial<Record<SizeLabel, number>> | undefined,
): CutInstance[] {
  if (cutQuantities === undefined) {
    return cutInstancesFromModel(buildExportModel(pattern, t));
  }
  const entries = Object.entries(cutQuantities).filter(
    ([, qty]) => (qty ?? 0) > 0,
  );
  return entries.flatMap(([size, qty]) => {
    const perGarment = cutInstancesFromModel(
      buildExportModel(pattern, t, size),
    );
    return Array.from({ length: qty ?? 0 }, (_, copy) =>
      perGarment.map((it) => ({
        ...it,
        id: `${size}:${it.id}:${copy + 1}`,
      })),
    ).flat();
  });
}

export function planCutLayout(
  pattern: Pattern,
  fabricWidthCm: number,
  t: Translate,
  opts: PlanCutLayoutOptions = {},
): CutPlan {
  const mode = opts.mode ?? "auto";
  const rawInstances = cutInstancesForQuantities(
    pattern,
    t,
    opts.cutQuantities,
  );

  const { placed: autoPlaced, overflow } = packAuto(
    rawInstances,
    fabricWidthCm,
  );

  let instances = autoPlaced;
  if (mode === "manual") {
    const placements = opts.placements ?? {};
    instances = autoPlaced.map((it) => {
      const manual = placements[it.id];
      if (!manual) return it;
      return {
        ...it,
        originCm: clampOriginCm(manual, it, fabricWidthCm),
      };
    });
  }

  const lengthCm = layoutLengthCm(instances);
  const usedAreaCm2 = instances.reduce(
    (s, it) => s + it.widthCm * it.heightCm,
    0,
  );
  // #89: an overflowing piece is packed into its own row regardless (the
  // warning fires, but nothing stops the layout), so dividing by the
  // nominal fabricWidthCm undercounted the width that row actually
  // consumed. Widening the denominator to whatever the widest instance
  // actually needs keeps the ratio honest instead of exceeding 1.
  const widestInstanceCm = instances.reduce(
    (m, it) => Math.max(m, it.widthCm + PAD_CM * 2),
    0,
  );
  const effectiveWidthCm = Math.max(fabricWidthCm, widestInstanceCm);
  const efficiency =
    lengthCm > 0 ? usedAreaCm2 / (effectiveWidthCm * lengthCm) : 0;

  return {
    fabricWidthCm,
    lengthCm,
    usedAreaCm2,
    efficiency,
    instances,
    overflow,
    overlaps: overlappingInstanceIds(instances),
  };
}
