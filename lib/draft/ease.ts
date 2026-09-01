import { FitClass, StretchClass, GarmentStyle, Girth } from "@/lib/types";

// A leaf module with no dependency on garment.ts or body.ts: both need these
// tables (garment.ts's validateSpec/prompt/schema exposure, body.ts's actual
// drafting), and body.ts is a drafter garment.ts already imports, so putting
// this here instead of in garment.ts avoids a cycle. garment.ts re-exports
// everything below so existing importers keep reading from one place, per
// the established "AI layer quotes the same numbers validateSpec clamps
// with" convention (see garment.ts's STYLE_LIMITS).
export const FIT_CLASSES: FitClass[] = [
  "close",
  "fitted",
  "semiFitted",
  "loose",
];
export const STRETCH_CLASSES: StretchClass[] = [
  "none",
  "low",
  "medium",
  "high",
];

// #125: Aldrich, Metric Pattern Cutting, published ease bands at the bust —
// close-fitting up to ~6 cm, fitted ~7.5-10, semi-fitted ~10-12.5, loose
// ~12.5-20 — this table's own representative pick within each band, cited so
// a reviewer can check the numbers. `fitted` is fixed at exactly 8 cm because
// that reproduces today's hardcoded +2 cm/quarter (4 quarters × 2 = 8)
// bit-for-bit: `fitted` is the default fit class, so drafting with no fit set
// must change nothing about existing patterns. waist/hip are reported here and
// in the AI-facing catalogs for completeness, but only `bust` currently drives
// geometry (see wearingEaseCm below) — the waist width is still the
// proportional taper off the bust that bodice() has always used, not an
// independently-tunable ease budget. That is a scoping choice, not an
// oversight: introducing three independently-tunable ease zones would change
// the drafted silhouette even at the default fit class, which the "no
// geometry change for the default" requirement rules out.
export const FIT_EASE_CM: Record<
  FitClass,
  { bust: number; waist: number; hip: number }
> = {
  close: { bust: 5, waist: 3, hip: 5 },
  fitted: { bust: 8, waist: 5, hip: 8 },
  semiFitted: { bust: 11, waist: 7, hip: 11 },
  loose: { bust: 16, waist: 10, hip: 16 },
};

// A stretchier fabric tolerates MORE negative ease (it clings and stretches
// to fit), expressed as a percentage of the body bust rather than a flat cm
// figure since how much negative ease a fabric tolerates scales with the
// body it's stretched around. `none` is 0% -- no reduction off the knit base
// below.
export const STRETCH_EASE_PCT: Record<StretchClass, number> = {
  none: 0,
  low: 4,
  medium: 8,
  high: 12,
};

// tshirt-fit-calibration: today (spec.type === "tshirt" is the only caller
// that ever passes knit: true -- see garment.ts's `const knit = spec.type
// === "tshirt"`) a knit garment is drafted as a relaxed/regular-fit tee, not
// a close-fitting rib -- so the knit branch's BASE ease is a genuinely
// positive cm figure (a boxy tee has real ease over the body, despite being
// knit), with `stretch` still narrowing it for a clingier fabric on top.
// Solved against a real graded crew-neck tee reference
// (docs/reference/tshirt-benchmark/measurements.json): that reference's
// size-M front/back panel bounding widths average ~77.96cm, and
// halfChest = bust/4 + ease/4 with SIZE_TABLE_MALE.M's bust held at its
// existing value (100, not a newly-invented body measurement) gives
// ease = (77.96/2 - 100/4) * 4 = 55.9.
//
// FLAG (estimate, not a verified industry figure -- see design.md's Risks
// table): this is far outside the ~15-20cm "loose tee" range found in
// hand-sewing pattern-drafting references during research. Two readings are
// both plausible and neither is verifiable from the data available: (1) the
// reference tee is a deliberately oversized/streetwear-fit garment, whose
// ease genuinely exceeds classic drafting conventions, or (2)
// SIZE_TABLE_MALE.M's bust=100 doesn't match whatever chest size the
// reference's "M" actually targets. Treat this constant as a calibration
// figure this app's own comparison tool solved for, not a citation.
export const TSHIRT_BASE_EASE_CM = 55.9;

// The one ease knob bodice() has ever had (today: `opts.knit ? 0 : 2` per
// quarter), now sourced from the tables above instead of an inline constant.
// Returns the TOTAL cm added to (or, for a stretchy knit past its base ease,
// subtracted from) the body bust circumference -- callers dividing by 4 get
// the per-quarter figure bodice() actually adds to each of its four panels.
// Exported so TechSheetTab can display the same number the drafter used,
// instead of a second, driftable copy of this formula.
export function wearingEaseCm(
  style: GarmentStyle,
  knit: boolean,
  bustCm: number,
): number {
  return knit
    ? TSHIRT_BASE_EASE_CM -
        (bustCm * STRETCH_EASE_PCT[style.stretch ?? "none"]) / 100
    : FIT_EASE_CM[style.fit ?? "fitted"].bust;
}

// #137: classifies a MEASURED ease value (a drafted-ease report's own
// finishedCm - bodyCm, lib/draft/easeReport.ts) into one of FIT_CLASSES,
// using FIT_EASE_CM's own representative points as band centres -- the
// boundary between two adjacent classes is their midpoint, so a bust ease
// reading right between "fitted" (8cm) and "semiFitted" (11cm) lands at
// 9.5cm. This is the SAME table wearingEaseCm draws from (and the one
// #125's doc comment above cites the published Aldrich bands for), so a
// MEASURED ease and a REQUESTED one are judged on one shared scale, never a
// second, competing set of numbers -- per CLAUDE.md's rule that a threshold
// the AI could reason about has to come from the same exported constant
// lib/ai/prompt.ts renders from (FIT_CLASSES, via garment.ts's re-export).
// Below the tightest class's own boundary -- including negative, a knit's
// own convention (see wearingEaseCm above) -- still reads as "close":
// there's no class below it to distinguish among, and negative ease is a
// real, intentional value here, not an error state.
export function classifyGirthFit(girth: Girth, easeCm: number): FitClass {
  for (let i = 0; i < FIT_CLASSES.length - 1; i++) {
    const a = FIT_EASE_CM[FIT_CLASSES[i]][girth];
    const b = FIT_EASE_CM[FIT_CLASSES[i + 1]][girth];
    if (easeCm <= (a + b) / 2) return FIT_CLASSES[i];
  }
  return FIT_CLASSES[FIT_CLASSES.length - 1];
}
