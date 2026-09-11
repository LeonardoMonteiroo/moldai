import { Measurements } from "@/lib/measurements";
import { DetailRow, Gender, GarmentStyle } from "@/lib/types";
import {
  canonicalTangent,
  dartInternals,
  DraftedPiece,
  NO_PLACEMENT_TRANSFORM,
  notchAt,
  NotchCm,
  Pt,
} from "./core";
import { formatCm } from "@/lib/format";
import type { Translate } from "@/lib/i18n/translate";

const cm = (v: number) => `${formatCm(v)} cm`;

// #128: a straight-leg trouser block only (the issue's own scope decision --
// tapered/wide/flared legs are a follow-up). Front and back are each a
// SINGLE (non-mirrored) leg panel, cut x2 -- unlike a bodice/skirt panel,
// a trouser leg's inseam and outseam are not symmetric about any centre
// line, so neither panel declares a foldEdge; the "other leg" is the exact
// same cut piece with the fabric flipped, not a second half joined at a
// fold.
//
// Front and back deliberately share the SAME rise depth, total length and
// hip quarter-width (an equal front/back split, the same simplification
// lib/draft/skirt.ts's own hip/4 panel already makes) -- only the crotch
// curve's own extension differs between them (the back's own seat curve
// reaches further out than the front's). That is what keeps the inseam and
// the outseam an IDENTICAL length front vs back "by construction" (#134):
// both edges are plumb verticals sharing the same dy (and, for the outseam,
// the same x), so their arc length depends only on riseCm/totalLengthCm --
// never on the crotch extension that tells front and back apart.
const TROUSER_WEARING_EASE_CM = 3; // total ease added to the hip circumference
const FRONT_CROTCH_EXT_RATIO = 1 / 20; // of hip+ease -- front rise extends out modestly
const BACK_CROTCH_EXT_RATIO = 1 / 9; // of hip+ease -- back (seat) rise extends further
const DART_DEPTH_CM = 10; // same order of magnitude as body.ts's own dartRiseCm

// #132: no per-size "leg length"/"inside leg" measurement exists in
// Measurements yet (#128's own dependency, the measurement-vocabulary issue,
// added only `rise`) -- style.trouserLengthCm (see lib/types.ts) is the
// total waist-to-hem length, and this is its default when the request
// doesn't set one. Unlike skirtLengthCm there is no per-size table value to
// fall back to, so every graded size gets this SAME flat per-gender number
// -- a documented simplification, the same "not graded across sizes" shape
// shoulderSlope's own flat per-gender constant already uses for a different
// field (see lib/draft/body.ts) -- not an oversight. Exported for
// garment.test.ts.
export const TROUSER_DEFAULT_LENGTH_CM: Record<Gender, number> = {
  female: 100,
  male: 104,
};

// One trouser leg panel (front or back). `isFront` only controls the crotch
// curve's own extension and the single/double notch convention -- every
// other formula is identical between the two calls in draftTrousers below,
// which is exactly what makes the inseam/outseam pairs equal by
// construction.

function trouserPanel(
  id: string,
  name: string,
  isFront: boolean,
  hipQuarterCm: number,
  waistQuarterRawCm: number,
  riseCm: number,
  totalLengthCm: number,
  seamAllowanceCm: number,
  t: Translate,
): DraftedPiece {
  const crotchExtCm =
    hipQuarterCm *
    (isFront ? FRONT_CROTCH_EXT_RATIO : BACK_CROTCH_EXT_RATIO) *
    4;

  // Same waist-suppression idea body.ts already uses for its own bodice
  // (hip-derived width minus waist-derived width, removed via a dart) --
  // here entirely via the dart, since the outseam is a plumb vertical with
  // no side-seam taper to share the suppression with the way the bodice's
  // side seam does.
  const waistSuppression = Math.max(0, hipQuarterCm - waistQuarterRawCm);
  const dartHalfWidth = Math.max(0.6, waistSuppression / 2);
  const dartCenterX = hipQuarterCm * 0.55;

  const pts: Pt[] = [];
  const push = (p: Pt) => (pts.push(p), pts.length - 1);

  const waistCF = push([0, 0]); // waist at centre front/back -- top of the rise
  push([crotchExtCm * 0.55, riseCm * 0.4]); // rise-curve control point
  const crotchPt = push([crotchExtCm, riseCm]); // bottom of the rise curve
  const spans: [number, number][] = [[waistCF, crotchPt]];
  const hemInner = push([crotchExtCm, totalLengthCm]); // inseam: plumb vertical
  const hemOuter = push([hipQuarterCm, totalLengthCm]); // hem edge
  const waistOuter = push([hipQuarterCm, 0]); // outseam: plumb vertical

  // #127: one waist dart per panel, touching the waist seam -- the same
  // single-ended (apex-to-seam-midpoint) shape body.ts's own isDressHem dart
  // uses, since this edge (like a dress's hem/waist join) has nothing below
  // it for a second, double-ended apex to open onto.
  // #259: the apex depth is DART_DEPTH_CM under a typical rise, but scales
  // DOWN (never up) for a shallow riseCm -- riseCm is a style.riseCm-driven
  // OFFSET now (draftTrousers above), so a legitimate "gancho baixo" request
  // combined with a small body rise can bring the crotch curve well under
  // DART_DEPTH_CM; capping the apex at 60% of the rise (rather than flooring
  // riseCm itself, which review found silently attenuates the user's actual
  // request) keeps the dart clear of the crotch line at every riseCm this
  // drafter can produce, adapting an internal derived value instead of the
  // spec's own style field.
  const dartDepthCm = Math.min(DART_DEPTH_CM, riseCm * 0.6);
  const dartLegL: Pt = [dartCenterX - dartHalfWidth, 0];
  const dartApex: Pt = [dartCenterX, dartDepthCm];
  const dartLegR: Pt = [dartCenterX + dartHalfWidth, 0];
  const dartSeamMid: Pt = [dartCenterX, 0];
  const internalsCm = dartInternals(
    [dartLegL, dartApex, dartLegR],
    [dartApex, dartSeamMid],
    [dartApex],
  );

  // #124: single marks the front, double the back -- the same convention
  // every other mated pair (pitch notches, dress waist-join corners) already
  // uses. The crotch-point notch helps line up the inseam at assembly; the
  // dart-leg notches mark where the dart interrupts the waist seam; the
  // outseam's waist corner (double, matching body.ts's own dress-hem
  // outer-corner convention) marks where the waistband aligns there.
  // #214: the centre-front/back waist corner (pts[waistCF]) deliberately
  // gets NO notch. #208 had tried marking it a little inboard instead of
  // exactly on the corner -- the corner itself is too narrow a wedge for a
  // 0.6cm notch to fit in any direction -- but that inset scales off
  // FRONT_CROTCH_EXT_RATIO/BACK_CROTCH_EXT_RATIO, which disagree, so front
  // and back ended up with two different, undocumented relationships to the
  // same landmark. A corner where two seams meet is already the match
  // point; industrial practice doesn't notch it, and the waistband
  // (lib/draft/subpieces.ts) emits no notches of its own to mate against
  // this one anyway. The outseam's OWN waist corner keeps its notch above,
  // unlike this one -- that mark isn't standing in for an ambiguous corner,
  // it's there for symmetry with body.ts's dress-hem/skirt outer-corner
  // convention, which always marks that pairing regardless of whether the
  // opposite piece carries a reciprocal notch.
  // #263: notchAt derives the inward tick from the given tangent's own
  // orientation relative to `pts`' winding (canonicalTangent) -- no more
  // caller-supplied interior reference. Each literal tangent below matches
  // this outline's own ACTUAL local boundary-walking direction at that
  // point -- (0,1) at the crotch curve (walked upward toward the hem,
  // waistCF -> crotchPt -> hemInner), (-1,0) along the waist edge (walked
  // waistOuter -> waistCF, i.e. decreasing x -- the outline's own closing
  // edge) -- so canonicalTangent's fixed formula resolves the same inward
  // side canonicalTangent(pts, ...) is trusted to resolve everywhere else;
  // a tangent with the WRONG sign relative to the outline's real walking
  // direction is not fixed by canonicalTangent, it's doubly wrong.
  const pitchType = isFront ? "single" : "double";
  const notches: NotchCm[] = [
    notchAt(pts[crotchPt], canonicalTangent(pts, [0, 1]), pitchType),
    notchAt(dartLegL, canonicalTangent(pts, [-1, 0]), "single"),
    notchAt(dartLegR, canonicalTangent(pts, [-1, 0]), "single"),
    notchAt(pts[waistOuter], canonicalTangent(pts, [-1, 0]), "double"),
  ];

  // Inside the leg's own rectangle (y in [riseCm, totalLengthCm], x in
  // [crotchExtCm, hipQuarterCm]) -- see the top-of-file note on why that
  // region is a true rectangle, not merely "usually clear".
  const grainlineCm: [Pt, Pt] = [
    [(crotchExtCm + hipQuarterCm) / 2, riseCm + 3],
    [(crotchExtCm + hipQuarterCm) / 2, totalLengthCm - 3],
  ];

  const detailRows: DetailRow[] = [
    { label: t("rows.trouserLeg"), value: t("trouserLeg.straight") },
    { label: t("rows.seamAllowance"), value: cm(seamAllowanceCm) },
    { label: t("rows.rise"), value: cm(riseCm) },
    { label: t("rows.length"), value: cm(totalLengthCm) },
    // #249: unlike skirtLengthCm (which now grades in the same ratio the
    // chart's own skirtLength does -- see lib/draft/skirt.ts's
    // gradedSkirtLengthCm), `trouserLengthCm` has no per-size measurement to
    // grade against at all (no drafter-facing "leg length" field exists yet
    // in lib/measurements.ts's Measurements -- see TROUSER_DEFAULT_LENGTH_CM's
    // own doc above), so every graded size is drafted at this SAME length,
    // on purpose. Restated here, on the piece itself, rather than left
    // silently sharing #249's own bug shape with no acknowledgment --
    // the same "surface the limitation where the user meets it" rule
    // `rows.trouserOtherLegs` right below already follows.
    {
      label: t("rows.trouserLengthGrading"),
      value: t("trouserLengthFixedNote"),
    },
    { label: t("rows.waistPanel"), value: cm(waistQuarterRawCm * 2) },
    { label: t("rows.dart"), value: cm(dartHalfWidth * 2) },
    { label: t("rows.grain"), value: t("grainValue") },
    // #128 (following the collar/cuff/waistband precedent, #129/#130/#131):
    // this is the only leg shape MoldAI drafts today -- tapered/wide/flared
    // are surfaced "em breve" right on the piece itself, not silently.
    { label: t("rows.trouserOtherLegs"), value: t("comingSoonBadge") },
  ];

  return {
    id,
    name,
    qty: 2, // one leg mirrors the other -- cut 2, flipping the fabric
    outlineCm: pts,
    curvedSpans: spans,
    grainlineCm,
    internalsCm,
    notches,
    detailRows,
    // #134: `rise` is this panel's own centre-front/back edge, sewn to the
    // MIRRORED COPY of itself when the two leg cuts are joined (the fly seam
    // for the front, the back rise seam for the back) -- the same self-pair
    // shape sleeve.ts's own two underarm edges already use for its own
    // left/right mirror seam. `inseam`/`outseam` mate against the OTHER
    // panel (front vs back); `waist` mates against the waistband. #188:
    // `hem` (the straight edge between the two hem vertices already named
    // above) is this leg's own bottom edge, exposed unconditionally like
    // every other edge here -- never claimed by another pair (a trouser
    // leg's own hem, unlike its waist, is never sewn to anything), so
    // buildAssemblyOrder always reports a real "hem" step for both panels.
    seamEdges: {
      rise: [waistCF, crotchPt],
      inseam: [crotchPt, hemInner],
      outseam: [hemOuter, waistOuter],
      waist: [waistOuter, pts.length],
      hem: [hemInner, hemOuter],
    },
    placementCm: {
      role: isFront ? "trouser-front" : "trouser-back",
      ...NO_PLACEMENT_TRANSFORM,
    },
  };
}

export function draftTrousers(
  m: Measurements,
  style: GarmentStyle,
  gender: Gender,
  t: Translate,
): { front: DraftedPiece; back: DraftedPiece } {
  const seamAllowanceCm = style.seamAllowanceCm ?? 1;
  const hipQuarterCm = m.hip / 4 + TROUSER_WEARING_EASE_CM / 4;
  const waistQuarterRawCm = m.waist / 4;
  // #132: `rise` is the trouser-specific EXTENDED_MEASUREMENT_KEYS field --
  // read when the chart has it, falling back to a documented hip-derived
  // proportion (a common quick-draft crotch-depth rule) when it doesn't, the
  // same "documented proportion when absent" scheme every other extended
  // key already follows (lib/draft/body.ts's neckHalf/armholeDepthBase/
  // backWidth, lib/draft/sleeve.ts's bicep -- see CLAUDE.md's Drafting
  // engine section). Both seeded system charts already set a real,
  // per-size-graded `rise`, so this fallback is a robustness path for a
  // custom chart that doesn't, not the common case.
  const bodyRiseCm = m.rise ?? m.hip / 4 + 4;
  // #259: style.riseCm is a signed waist-RISE STYLE OFFSET (STYLE_LIMITS.
  // riseCm, lib/draft/vocabulary.ts) applied on top of the resolved BODY
  // rise above -- never a replacement for it, the exact style/measurement
  // conflation CLAUDE.md forbids for `fit`. Increasing the crotch-curve
  // depth (moving the crotch point further from the waist top at y=0) is
  // physically "more rise" -- a higher waistline relative to the crotch,
  // i.e. "cintura alta"/high-waisted; decreasing it is "gancho baixo"/
  // low-rise, the waist sitting closer to the crotch/hip level. `waist`
  // (the panel's own top edge, a plumb horizontal from waistCF to
  // waistOuter) never moves horizontally with this offset, so the
  // waistband -- sized from that edge's own measured length -- still
  // closes regardless of riseCm; `totalLengthCm` (the waist-to-hem length)
  // is untouched too, so a rise change trades leg length for rise length,
  // never the garment's own total.
  //
  // A previous cut of this floored the SUM well above DART_DEPTH_CM to keep
  // the waist dart clear of the crotch curve -- found (by review) to
  // silently attenuate a fully in-range, legitimate style.riseCm request
  // (e.g. bodyRiseCm=20 + riseCm=-10 floored to 15, delivering only -5 with
  // no adjustment reported anywhere) for any chart whose body rise sits
  // near STYLE_LIMITS.riseCm's own span, the exact silent-substitution
  // CLAUDE.md forbids. The floor here instead only rules out a literal
  // non-positive crotch depth (a pathological custom chart, never a real
  // in-range request) -- trouserPanel's own dart depth adapts to whatever
  // rise room is ACTUALLY available (see its own comment) instead of the
  // rise being bent to fit a fixed dart.
  const riseCm = Math.max(1, bodyRiseCm + (style.riseCm ?? 0));
  const totalLengthCm =
    style.trouserLengthCm ?? TROUSER_DEFAULT_LENGTH_CM[gender];

  const front = trouserPanel(
    "trouser-front",
    t("pieceNames.front"),
    true,
    hipQuarterCm,
    waistQuarterRawCm,
    riseCm,
    totalLengthCm,
    seamAllowanceCm,
    t,
  );
  const back = trouserPanel(
    "trouser-back",
    t("pieceNames.back"),
    false,
    hipQuarterCm,
    waistQuarterRawCm,
    riseCm,
    totalLengthCm,
    seamAllowanceCm,
    t,
  );
  return { front, back };
}
