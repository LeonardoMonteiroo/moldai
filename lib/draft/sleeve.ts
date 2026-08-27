import { Measurements } from "@/lib/measurements";
import { DetailRow, GarmentStyle } from "@/lib/types";
import {
  curveArcLengthCm,
  DraftedPiece,
  notchAtArcLengthCm,
  notchAtVertex,
  NotchCm,
  Pt,
} from "./core";
import { BlockOpts } from "./body";
import { formatCm } from "@/lib/format";
import type { Translate } from "@/lib/i18n/translate";

const cm = (v: number) => `${formatCm(v)} cm`;

// #139: fixed, documented constants in one named place. #125 gave the bodice
// a real fit-class/fabric-stretch ease table (lib/draft/ease.ts's
// FIT_EASE_CM/STRETCH_EASE_PCT), but it is gender-blind and bicep ease here
// is not (wovenFemale/wovenMale differ) -- collapsing the two would need a
// gender-aware mapping #125 doesn't specify, a new design decision this
// constant deliberately leaves for whoever unifies bicep ease with the
// bodice's.
//
// #132: a chart can now carry a real bicep girth -- when it does, that
// value is used directly (plus the same wearing ease below) instead of this
// proportion. BICEP_PROPORTION_OF_BUST stays the fallback for a chart that
// doesn't (approximated as a proportion of bust girth — a common
// quick-draft rule, upper-arm circumference roughly 30% of bust — rather
// than as a fraction of the armhole the way it used to be, which had no
// relationship to arm size at all), and it's also what the two system
// charts' own seeded `bicep` field reproduces exactly, so populating them
// changed nothing about what a default account drafts.
const BICEP_PROPORTION_OF_BUST = 0.3;
const WEARING_EASE_CM = { knit: 1.5, wovenFemale: 4, wovenMale: 5 };
// How much longer the cap's own arc is than the armhole it eases into —
// standard set-in-sleeve practice; a knit needs less because the fabric
// itself stretches to take up the difference. Exported so garment.ts can
// declare the armhole/cap SeamPairDecl's own `easeCm` from this SAME table
// (#134) rather than a second copy of the knit/woven split.
export const CAP_EASE_CM = { knit: 1, woven: 2.5 };

// #130: the wrist ease a cuff adds on top of the sleeve's own MEASURED hem
// edge -- a flat cm figure from a table, not a proportion of the hem (which
// is bicep-derived and much wider than an actual wrist), the same
// knit/woven-table shape as CAP_EASE_CM above. Represents the fastening/hand
// clearance allowance a cuff needs over the fabric it gathers onto.
export const WRIST_EASE_CM = { knit: 1.5, woven: 2.5 };

function capOutline(bicep: number, capH: number): { pts: Pt[]; cxTop: number } {
  const cxTop = bicep / 2;
  return {
    pts: [
      [0, capH],
      [bicep * 0.2, capH * 0.3],
      [cxTop, 0],
      [bicep * 0.8, capH * 0.3],
      [bicep, capH],
    ],
    cxTop,
  };
}

function capArcLengthCm(bicep: number, capH: number): number {
  const { pts } = capOutline(bicep, capH);
  return curveArcLengthCm(pts, [[0, 4]], 0, 4);
}

// Solves for the cap height that makes this bicep's cap curve hit the target
// arc length (armhole + cap ease). Arc length is monotonically increasing in
// capH for a fixed bicep — a taller cap always adds curve length — so plain
// bisection converges in a handful of steps. There is no closed form once
// bicep is set independently of the armhole (see #139): a narrower bicep
// needs a taller, more pointed cap to still carry the same arc length, which
// matches how a fitted sleeve is actually drafted.
function solveCapHeight(bicep: number, targetArcCm: number): number {
  let lo = 0.5,
    hi = bicep * 3;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (capArcLengthCm(bicep, mid) < targetArcCm) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

export function draftSleeve(
  m: Measurements,
  style: GarmentStyle,
  armholeLenCm: number,
  t: Translate,
  // wearingEaseCm is unused here -- this drafter has its own independent
  // bicep-ease table (WEARING_EASE_CM above), not lib/draft/ease.ts's.
  opts: BlockOpts = {
    gender: "female",
    knit: false,
    lengthCm: 0,
    wearingEaseCm: 8,
  },
  // #124: the arc-length rise from the underarm at which the body panels
  // placed their own pitch notches -- garment.ts passes body.ts's own
  // pitchNotchCm/basePitchNotchCm through unchanged so both sides land at
  // truly matching positions "generated as pairs from the same computation".
  // The default here only matters to a caller (a direct unit test) that
  // doesn't care about cross-piece matching.
  pitchNotchCm = 8,
): DraftedPiece | null {
  if (style.sleeve === "none" || !style.sleeve) return null;
  const wearingEase = opts.knit
    ? WEARING_EASE_CM.knit
    : opts.gender === "male"
      ? WEARING_EASE_CM.wovenMale
      : WEARING_EASE_CM.wovenFemale;
  const bicep = (m.bicep ?? m.bust * BICEP_PROPORTION_OF_BUST) + wearingEase;
  const capEase = opts.knit ? CAP_EASE_CM.knit : CAP_EASE_CM.woven;
  const targetCapArcCm = armholeLenCm + capEase;
  const capH = solveCapHeight(bicep, targetCapArcCm);
  // What the drafted cap curve actually measures, and the armhole it
  // therefore fits (arc minus the deliberate cap ease) — a real measurement
  // of the emitted geometry, not an echo of `armholeLenCm`. #78: seamCheck
  // must compare against this, or it stays blind to any cap/armhole
  // mismatch a future change to the shape above could introduce.
  const measuredCapArcCm = capArcLengthCm(bicep, capH);
  const fittedArmholeLenCm = measuredCapArcCm - capEase;

  const len =
    style.sleeve === "long" ? m.longSleeveLength : m.shortSleeveLength;
  const hemHalf = (bicep / 2) * (style.sleeve === "long" ? 0.7 : 0.9);
  const { pts: capPts, cxTop } = capOutline(bicep, capH);

  // 0 left underarm -> 1 back ctrl -> 2 top -> 3 front ctrl -> 4 right underarm (cap, curved)
  // 4 -> 5 right hem (straight) -> 6 left hem (straight) -> 0 (straight)
  const outlineCm: Pt[] = [
    ...capPts,
    [cxTop + hemHalf, capH + len],
    [cxTop - hemHalf, capH + len],
  ];
  const curvedSpans: [number, number][] = [[0, 4]];
  const grainlineCm: [Pt, Pt] = [
    [cxTop, 3],
    [cxTop, capH + len - 3],
  ];

  // #124: single notch walked from the left underarm (index 0), double from
  // the right (index 4) -- an arbitrary but consistent convention, since
  // this cap is bilaterally symmetric and either physical arm can be cut
  // from the same flat piece by flipping the fabric. Clamped the same way
  // body.ts clamps its own pitch distance, so a very short cap never places
  // one past its own apex. The cap apex notch marks where the shoulder seam
  // meets the cap; it has no single body-side counterpart to pair with (the
  // shoulder point exists on both the front AND back panels), so it's
  // excluded from the mated-pair cross-check in garment.test.ts.
  const insideRef: Pt = [cxTop, capH + len / 2];
  const clampedPitchCm = Math.min(pitchNotchCm, measuredCapArcCm * 0.35);
  const notches: NotchCm[] = [
    notchAtArcLengthCm(
      capPts,
      curvedSpans,
      0,
      4,
      clampedPitchCm,
      insideRef,
      "single",
    ),
    notchAtArcLengthCm(
      capPts,
      curvedSpans,
      0,
      4,
      measuredCapArcCm - clampedPitchCm,
      insideRef,
      "double",
    ),
    notchAtVertex(capPts, 2, insideRef, "single"),
  ];

  const detailRows: DetailRow[] = [
    { label: t("rows.sleeveType"), value: t("sleeveType." + style.sleeve) },
    { label: t("rows.length"), value: cm(capH + len) },
    { label: t("rows.sleeveCap"), value: cm(measuredCapArcCm) },
    { label: t("rows.grain"), value: t("grainValue") },
  ];
  return {
    id: "sleeve",
    name: t("pieceNames.sleeve"),
    qty: 2,
    outlineCm,
    curvedSpans,
    grainlineCm,
    notches,
    detailRows,
    armholeLenCm: fittedArmholeLenCm,
    // #134: the cap (0-4, curved, the seam mated to the body's armhole) and
    // the sleeve's own two side seams -- 4-5 (right underarm: cap end to
    // hem) and 6-7/0 (left underarm: hem to cap start, wrapping) -- which
    // sew to each other when the piece is folded into a tube. This outline
    // shape (5 cap points + 2 hem points, in this exact order) is fixed
    // regardless of bicep/capH/hemHalf, so these indices never move.
    seamEdges: {
      cap: [0, 4],
      underarmRight: [4, 5],
      underarmLeft: [6, 7],
      // #130: the straight hem edge (right hem -> left hem) a cuff's own
      // seam edge is measured and mated against.
      hem: [5, 6],
    },
  };
}
