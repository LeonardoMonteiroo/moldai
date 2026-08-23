import { Measurements } from "@/lib/measurements";
import { DetailRow, GarmentStyle } from "@/lib/types";
import { curveArcLengthCm, DraftedPiece, Pt } from "./core";
import { BlockOpts } from "./body";
import type { Translate } from "@/lib/i18n/translate";

const cm = (v: number) => `${v.toFixed(1).replace(".", ",")} cm`;

// #139: until #125 lands a real fit-class/fabric-stretch ease table, these
// are fixed, documented constants in one named place, per that issue's
// decision. Bicep has no measured key yet either (see #132), so it is
// approximated as a proportion of bust girth — a common quick-draft rule
// (upper-arm circumference is roughly 30% of bust circumference) — plus
// wearing ease, rather than as a fraction of the armhole the way it used to
// be (that fraction had no relationship to arm size at all).
const BICEP_PROPORTION_OF_BUST = 0.3;
const WEARING_EASE_CM = { knit: 1.5, wovenFemale: 4, wovenMale: 5 };
// How much longer the cap's own arc is than the armhole it eases into —
// standard set-in-sleeve practice; a knit needs less because the fabric
// itself stretches to take up the difference.
const CAP_EASE_CM = { knit: 1, woven: 2.5 };

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
  opts: BlockOpts = { gender: "female", knit: false, lengthCm: 0 },
): DraftedPiece | null {
  if (style.sleeve === "none" || !style.sleeve) return null;
  const wearingEase = opts.knit
    ? WEARING_EASE_CM.knit
    : opts.gender === "male"
      ? WEARING_EASE_CM.wovenMale
      : WEARING_EASE_CM.wovenFemale;
  const bicep = m.bust * BICEP_PROPORTION_OF_BUST + wearingEase;
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
    detailRows,
    armholeLenCm: fittedArmholeLenCm,
  };
}
