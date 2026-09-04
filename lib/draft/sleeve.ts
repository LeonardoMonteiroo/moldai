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
// #132: a chart carries a real bicep girth, used directly (plus the same
// wearing ease below). #269 promoted `bicep` to CORE (a FreeSewing design
// requires it outright), so every base row is guaranteed to have one --
// the proportion-of-bust approximation this used to fall back to
// (upper-arm circumference roughly 30% of bust, a common quick-draft rule)
// is unreachable now; lib/measurements.ts's SIZE_TABLE/SIZE_TABLE_MALE
// still seed `bicep` with that exact figure (bust*0.3), so a default
// account's drafted geometry is unchanged.
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
//
// #224: this sleeve-first direction (hem sized off bicep, cuff sized off
// the hem) was considered and kept as-is rather than inverted to a
// cuff-first/wrist-based sleeve fit -- see draftCuff in subpieces.ts.
export const WRIST_EASE_CM = { knit: 1.5, woven: 2.5 };

// #226: this is ONE cap-curve family (a fixed 5-point profile: two low
// underarm corners, two 0.3*capH control points, one apex), parameterized
// only by bicep width and a solved-for height -- every sleeve.sleeve style
// (short/long, the only two lengths GarmentStyle has) walks the same shape,
// just solved against a different target arc. That is correct ONLY because
// this repo drafts a single sleeve silhouette: a fitted, structured set-in
// sleeve. A verified source (ikatbag.com, "Subtleties in Drafting Sleeves")
// says angle of set is a real construction variable, not just a proportion:
// the more downward-sloping/structured the sleeve, the narrower and higher
// its cap needs to be; a more horizontal silhouette (kimono/dropped-shoulder)
// needs a genuinely wider, flatter cap -- a different curve family, not this
// same 5-point profile solved for a shorter capH. Nothing in GarmentStyle
// today names that axis at all (SleeveLength is length-only: "none" |
// "short" | "long", lib/types.ts) -- there is no silhouette/angle-of-set
// concept to branch on here even if we wanted to.
//
// This is deliberately NOT implemented as part of #226 -- the issue is
// scoped to recording the decision, not shipping a new archetype. Adding a
// kimono/dropped-shoulder silhouette for real would need: (1) its own
// capOutline-shaped curve family in this file (wider/flatter, likely fewer
// or differently-placed control points, since a very shallow cap starts
// approaching a straight-ish extension of the shoulder rather than a domed
// cap), (2) a new GarmentStyle.sleeve-adjacent enum (e.g. a `sleeveStyle` or
// `angleOfSet` field alongside `sleeve: SleeveLength`) clamped by
// validateSpec exactly like CollarType/CuffType/WaistbandType/
// FrontClosureType are today, and (3) that enum rendered into the AI
// prompt/schema (lib/ai/prompt.ts + lib/ai/schema.ts) from the same
// exported-constants pattern every other style field follows. None of that
// is attempted here.
//
// CAP_EASE_CM (2.5cm woven / 1cm knit, above) is untouched by this note and
// stays correct as-is: it's the ease for the CURRENT fitted set-in
// silhouette, an independent source corroborated the ~2.5cm woven figure
// directly, and it says nothing about cap shape -- a future kimono curve
// family would need its own ease figure, not a change to this one.
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
  const bicep = m.bicep + wearingEase;
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
