// #135/#136: shared roll-width splitting, used by both the copyshop PDF mode
// and the PLT/HPGL plotter output -- a pattern wider than the physical roll
// has to be cut into numbered vertical strips, each `rollWidthCm` wide, with
// a small overlap between neighbours so the printed/plotted strips can be
// taped back together in register. A leaf module (no ExportModel import) so
// both pdf.ts and plt.ts can depend on it without a cycle.

export const STRIP_OVERLAP_CM = 2;

// #135 decision: roll-width presets for the copyshop/plotter modes (pdf-single
// with a roll width, and plt) -- 841mm (the ISO A0 short edge, a common
// plotter roll), 24in and 36in (the two other common roll widths), each
// converted to cm. A free numeric input is offered alongside these in the UI.
export const ROLL_WIDTH_PRESETS_CM = [84.1, 60.96, 91.44] as const;

export interface RollStrip {
  stripNumber: number; // 1-based
  originCm: { x: number; y: number }; // y is always 0 -- roll length is unconstrained
  // How much of the *sheet* this strip actually covers (<= rollWidthCm; the
  // last strip is typically narrower). Informational -- piece inclusion uses
  // the full rollWidthCm window (below), since the overlap band deliberately
  // draws the same geometry into two neighbouring strips.
  widthCm: number;
}

export interface RollPlan {
  rollWidthCm: number;
  overlapCm: number;
  stepCm: number;
  strips: RollStrip[];
}

/**
 * Splits a `sheetWidthCm`-wide layout into strips no wider than
 * `rollWidthCm`, overlapping by `overlapCm` so consecutive strips can be
 * taped in register. A sheet no wider than the roll returns exactly one
 * strip starting at x=0 (the common case -- most patterns fit a single
 * roll-width pass).
 */
export function planRollStrips(
  sheetWidthCm: number,
  rollWidthCm: number,
  overlapCm: number = STRIP_OVERLAP_CM,
): RollPlan {
  const w = Math.max(1, rollWidthCm);
  if (sheetWidthCm <= w) {
    return {
      rollWidthCm: w,
      overlapCm,
      stepCm: w,
      strips: [
        { stripNumber: 1, originCm: { x: 0, y: 0 }, widthCm: sheetWidthCm },
      ],
    };
  }
  const stepCm = Math.max(1, w - overlapCm);
  const count = Math.max(1, Math.ceil((sheetWidthCm - overlapCm) / stepCm));
  const strips: RollStrip[] = [];
  for (let i = 0; i < count; i++) {
    const x = i * stepCm;
    strips.push({
      stripNumber: i + 1,
      originCm: { x, y: 0 },
      widthCm: Math.min(w, sheetWidthCm - x),
    });
  }
  return { rollWidthCm: w, overlapCm, stepCm, strips };
}

/** Does a piece's absolute bbox reach into a strip's own roll-width window? */
export function stripIntersectsBBox(
  stripOriginXcm: number,
  rollWidthCm: number,
  bbox: { minX: number; maxX: number },
): boolean {
  return (
    bbox.maxX >= stripOriginXcm && bbox.minX <= stripOriginXcm + rollWidthCm
  );
}
