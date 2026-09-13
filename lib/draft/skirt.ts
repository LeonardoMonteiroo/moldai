import { Measurements } from "@/lib/measurements";
import {
  DetailRow,
  GarmentStyle,
  PleatType,
  SkirtSilhouette,
} from "@/lib/types";
import {
  DraftedPiece,
  gradedLengthCm,
  InternalCm,
  NO_PLACEMENT_TRANSFORM,
  notchAtVertex,
  NotchCm,
  Pt,
} from "./core";
import { formatCm } from "@/lib/format";
import type { Translate } from "@/lib/i18n/translate";

const cm = (v: number) => `${formatCm(v)} cm`;

// #244: the reserved InternalCm "pleat" variant's first real emitter -- a
// standalone straight/a-line skirt panel only (see draftSkirt's own
// isDressWaist gate below, and lib/types.ts's GarmentStyle.pleats doc for
// why a dress/radial-silhouette panel never reads this field at all).
//
// PLEAT_FOLD_DEPTH_CM is the finished, visible fold depth per side -- a
// deliberate, reasonable constant; no verified industry-standard figure
// exists to cite, the same footing BUTTON_STAND_WIDTH_CM/
// WAISTBAND_OVERLAP_CM (lib/draft/subpieces.ts) already stand on. A single
// fold needs 2x its own depth of flat fabric (it doubles back on itself),
// so PLEAT_INTAKE_PER_SIDE_CM is what actually widens the panel.
//
// The intake is added to BOTH the waist and hem edges, on BOTH sides,
// symmetric about the panel's own foldEdge axis (x = hemHalf): #244
// deliberately never drafts a single lopsided "knife" fold on this shared
// front/back panel, since an asymmetric insert would falsify the piece's
// own declared foldEdge/axis-of-symmetry contract (core.ts's
// DraftedPiece.foldEdge doc) -- see lib/types.ts's PleatType doc for the
// same reasoning. "box" and "inverted-box" stay symmetric, and differ only
// in which of the two marked lines (the press fold vs. where the folded
// edge is placed) sits closer to the panel's own new outer edge -- see
// pleatFoldPlacement below.
export const PLEAT_FOLD_DEPTH_CM = 4;
export const PLEAT_INTAKE_PER_SIDE_CM = PLEAT_FOLD_DEPTH_CM * 2;

// One side's own fold + placement marks, from the panel's ORIGINAL
// (pre-pleat) edge position at the waist/hem down to its new, widened outer
// edge -- t=0 at the new outer edge, t=1 at the original position, for both
// the waist (y=0) and hem (y=lengthCm) ends of this side's own edge.
//
// "box": the press fold sits nearer the ORIGINAL edge (t=2/3) and the
// placement line nearer the new OUTER edge (t=1/3) -- the added strip's
// outer portion folds inward, toward centre, so the visible crease on each
// side opens AWAY from centre (a standard box pleat: two folds facing away
// from each other).
// "inverted-box": the reverse -- fold nearer the OUTER edge (t=1/3),
// placement nearer the ORIGINAL edge (t=2/3) -- the two folds face TOWARD
// each other and hide underneath, at centre (a standard inverted box
// pleat).
//
// The press fold reuses the "foldLine" InternalCm kind (the same "a press
// line, not a cut line" concept a dart's own fold line already uses); the
// placement/stitch line is what the reserved "pleat" kind marks explicitly,
// since no other existing kind names it.
// #259: the waist edge's own y is a parameter rather than a hardcoded 0 --
// a non-zero riseCm moves that edge off y=0 (see waistY/hemY below), and a
// fold/placement line still has to span the panel it is drawn on. Passing
// both ends beats passing a length: the caller already computes them, and a
// pleat line that started at 0 while the panel's waist sat at -riseCm ran
// outside the outline entirely (a containment failure, not a cosmetic one).
export function pleatFoldPlacement(
  pleatType: Exclude<PleatType, "none">,
  origWaistX: number,
  outerWaistX: number,
  origHemX: number,
  outerHemX: number,
  waistYCm: number,
  hemYCm: number,
): InternalCm[] {
  const lerp = (outer: number, orig: number, t: number) =>
    outer + (orig - outer) * t;
  const [foldT, placeT] = pleatType === "box" ? [2 / 3, 1 / 3] : [1 / 3, 2 / 3];
  const at = (t: number): [Pt, Pt] => [
    [lerp(outerWaistX, origWaistX, t), waistYCm],
    [lerp(outerHemX, origHemX, t), hemYCm],
  ];
  const [foldA, foldB] = at(foldT);
  const place = at(placeT);
  return [
    { kind: "foldLine", aCm: foldA, bCm: foldB },
    { kind: "pleat", ptsCm: place },
  ];
}

// #80: was `m.hip/4 + (style.seamAllowanceCm ?? 1)` -- the seam-allowance
// spec field baked straight into finished geometry here, while every other
// drafter (and CLAUDE.md: "exported geometry is the net sewing line -- seam
// allowance is not offset into it") treats it as an annotation only. A user
// asking for "4cm de margem" (clamped to STYLE_LIMITS.seamAllowanceCm's max)
// silently widened the waist opening by up to 12 cm with no announcement,
// while `rows.waistPanel` printed the inflated number as if it were the
// design. Mirrors body.ts's own wearingEase constant; the skirt drafter
// takes no BlockOpts, so a plain module constant is enough.
const SKIRT_WEARING_EASE_CM = 2;

// #249/#326: `gradedLengthCm` (the explicit-length-vs-graded-sizes fix,
// shared with lib/draft/trousers.ts) lives in ./core, not here --
// lib/draft/engine/freesewing/designs/skirt.ts (a different,
// independently-scored engine) needs the identical formula and must not
// import moldai's own drafter module to get it. Re-used below unchanged;
// see core.ts's own doc comment for the fix's rationale.

// Standalone skirt only (#177 left this untouched): a skirt with no bodice
// to join sizes its own straight/a-line waist panel off the hip, same as
// always.
export function skirtWaistHalfCm(hipCm: number): number {
  return hipCm / 4 + SKIRT_WEARING_EASE_CM;
}

// #177: how many equal panels a radial (circle/gore/half-circle) silhouette
// cuts the waist opening into -- pulled out of draftSkirt/radialSkirt below
// so dressWaistHalfCm can reuse the exact same mapping rather than a second
// copy of it drifting alongside.
function radialPanels(silhueta: SkirtSilhouette): number {
  return silhueta === "half-circle" ? 1 : 2;
}

// #177 (owner decision on #177's own issue thread, refined after a
// follow-up review of the first cut of this fix -- see #185, closed by that
// review): a fitted bodice ends at the natural WAIST, not the hip -- sizing
// its hem off skirtWaistHalfCm(hip) was wrong on its own terms, independent
// of which skirt silhouette it was sewn to. This is the ONE derivation the
// dress bodice hem reads (body.ts, via garment.ts's dressHemHalfCm opt) --
// and it takes NO silhouette parameter, on purpose: the bodice describes
// the BODY, so which skirt happens to be attached cannot change its own
// hem width, or the exact "two functions that happen to agree today" drift
// this repo has already had four times (Wallet.planLabel,
// FREE_PLAN_CREDITS, FORMAT_KEYS, the third Catmull-Rom copy in #151) would
// just move from "per-silhouette formula" to "silhouette-shaped call site".
//
// The value is waistCm/4, with NO added design ease -- not an arbitrary
// choice, but the one value every silhouette's own already-correct
// construction can meet exactly:
//  - circle/gore (panels=2, untouched by this issue): each drafted panel is
//    a whole, self-contained piece (like a bodice front/back), and its own
//    waist arc is `r * sweep` = waistCm/panels = waistCm/2 -- exactly TWO
//    quarters. A bodice hem of waistCm/4 half-width (waistCm/2 full width)
//    matches that panel's own arc exactly, with no ease term available to
//    add without changing radialSkirt's own math (out of scope, and #185
//    said not to touch it).
//  - half-circle (panels=1): the single undivided panel's own waist arc is
//    the full waistCm: it is split in half between the two waist-join pairs
//    (see draftSkirt's waistFront/waistBack below and garment.ts's
//    draftAll), so each half also needs to be waistCm/2 -- the same value.
//  - straight/a-line (isDressWaist): sized directly by this function below,
//    so it trivially matches.
// Front + back together therefore always sum to exactly waistCm, for every
// silhouette -- the closed-circumference invariant a dress waist seam
// actually needs, not an incidental equality.
//
// A standalone skirt's OWN waist opening (skirtWaistHalfCm, hip-based)
// keeps its SKIRT_WEARING_EASE_CM design ease -- that ease exists for a
// separately-worn waistband sitting at/below the natural waist, comfort
// room a dress's own natural-waist SEAM (already sewn to an already-eased
// bodice) doesn't carry the same way.
//
// #335: this is the width the two sides PRESENT once the bodice's own hem
// darts are folded away -- not what the bodice hem is CUT to. Only the
// bodice's own cut edge (body.ts's hemHalf) sums the dart intake back on
// top of this value; the skirt panel this function feeds is untouched.
export function dressWaistHalfCm(waistCm: number): number {
  return waistCm / 4;
}

// annular sector (waist and hem arcs) sampled into points.
// `fullSweep` is the angular extent whose arc length equals the full waist
// measurement (2π for a full circle, π for a half-circle); `panels` is how
// many equal pieces that arc is cut into. Both derive `r` and `sweep` from
// the same fullSweep, so r * sweep * panels === waist by construction --
// #77: these two were previously conflated into one `denom`, which set the
// radius correctly but sized each panel's angle from the *radius* formula
// instead of from the panel count, so the assembled waist opening never
// matched the actual waist measurement.
function radialSkirt(
  waist: number,
  length: number,
  fullSweep: number,
  panels: number,
  // #259: a signed waist-rise offset, extending/retracting the SAME cone
  // toward its own apex -- R (the hem radius) is derived from the TRUE
  // waist-based radius first and is deliberately left untouched, so the
  // hem's own circumference/flare never changes with rise; only the inner
  // (waist) radius moves, physically the same "narrower toward the apex"
  // taper any cone already has above its true-waist cut line. The waistband
  // sub-piece (garment.ts) sizes itself off this MOVED waist edge's own
  // measured arc, not off `waist` directly, so it still closes.
  riseCm = 0,
): { pts: Pt[]; r: number } {
  const trueR = waist / fullSweep; // inner radius at the ACTUAL waist
  const R = trueR + length; // outer radius (hem) -- unaffected by rise
  const r = Math.max(0.5, trueR - riseCm); // inner radius (drafted waist edge)
  const sweep = fullSweep / panels; // angle of ONE panel
  const half = sweep / 2;
  const steps = 12;
  const inner: Pt[] = [];
  const outer: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = -half + (sweep * i) / steps;
    inner.push([r * Math.sin(a), -r * Math.cos(a)]);
    outer.push([R * Math.sin(a), -R * Math.cos(a)]);
  }
  // closes: waist (left->right) + hem (right->left)
  const pts = [...inner, ...outer.reverse()];
  // normalize to y>=0 (bbox translated afterward)
  const minY = Math.min(...pts.map((p) => p[1]));
  return { pts: pts.map(([x, y]) => [x, y - minY] as Pt), r };
}

export function draftSkirt(
  m: Measurements,
  style: GarmentStyle,
  t: Translate,
  // #124: only a dress's skirt panel joins a bodice hem at all (a standalone
  // skirt's waist joins a waistband instead) -- garment.ts passes
  // `spec.type === "dress"`, and only then do the waist-edge corners get the
  // "waist join" notches that mirror body.ts's own isDressHem ones.
  isDressWaist = false,
  // #249: the reference row an explicit style.skirtLengthCm is normalized
  // against before being re-expanded for `m`'s own skirtLength -- defaults
  // to `m` itself, so every call site that doesn't grade across sizes (every
  // one before #249) sees byte-identical behavior. garment.ts threads the
  // pattern's actual base-size row through here only when `m` is a
  // DIFFERENT size's row (see gradedLengthCm's own doc above).
  baseRow: Measurements = m,
): DraftedPiece {
  const silhueta: SkirtSilhouette = style.skirt ?? "straight";
  const ease = style.seamAllowanceCm ?? 1;
  const length = gradedLengthCm(
    style.skirtLengthCm,
    m.skirtLength,
    baseRow.skirtLength,
  );
  // #259: a signed waist-RISE style offset -- raises/lowers the panel's own
  // waist edge, never the body waist/hip measurements those feed the panel
  // width from. Only meaningful for a STANDALONE skirt: a dress's skirt
  // panel is joined directly to the bodice at the natural waist (isDressWaist
  // above), so moving that edge here would desync it from the bodice hem's
  // own dressWaistHalfCm-derived seam -- the same "type-mismatched style
  // field is a no-op" precedent waistband/skirtLengthCm already follow for a
  // spec shape they don't apply to.
  const riseCm = isDressWaist ? 0 : (style.riseCm ?? 0);
  const detailRows: DetailRow[] = [
    { label: t("rows.silhouette"), value: t("skirtSilhouette." + silhueta) },
    { label: t("rows.length"), value: cm(length) },
    { label: t("rows.seamAllowance"), value: cm(ease) },
    { label: t("rows.grain"), value: t("grainValue") },
  ];

  if (
    silhueta === "circle" ||
    silhueta === "gore" ||
    silhueta === "half-circle"
  ) {
    const fullSweep = silhueta === "half-circle" ? Math.PI : 2 * Math.PI;
    const panels = radialPanels(silhueta);
    const { pts, r } = radialSkirt(m.waist, length, fullSweep, panels, riseCm);
    detailRows.splice(1, 0, { label: t("rows.waistRadius"), value: cm(r) });
    // shift to x>=0
    const minX = Math.min(...pts.map((p) => p[0]));
    const outlineCm = pts.map(([x, y]) => [x - minX, y] as Pt);
    const cxTop = -minX; // approximation of the top center
    const steps = 12; // same as used in radialSkirt
    const waistSpan: [number, number] = [0, steps];
    const hemSpan: [number, number] = [steps + 1, 2 * steps + 1];
    // #126: each panel is sampled symmetrically about its own centre angle
    // (a=0), and `steps` is even, so the centre sample already exists as a
    // real vertex on both arcs -- no new point needed. Index `steps/2` is
    // the waist arc's own middle sample (`inner`, indices 0..steps); the hem
    // arc is appended reversed (`outer.reverse()`, indices steps+1..2*steps+1),
    // so its middle sample lands at `steps+1 + steps/2`.
    const foldEdge: [number, number] = [steps / 2, steps + 1 + steps / 2];

    // #263: notchAtVertex derives the inward tick from outlineCm's own
    // winding now -- no more caller-supplied interior reference.
    const notches: NotchCm[] = [
      // hem-fold notch: centre front/back at the hem.
      notchAtVertex(outlineCm, foldEdge[1], "single"),
    ];
    if (isDressWaist) {
      // #124: waist-join notches -- the two ends of the waist arc, matching
      // body.ts's own outer-corner notches on the bodice hem it's sewn to.
      notches.push(
        notchAtVertex(outlineCm, waistSpan[0], "double"),
        notchAtVertex(outlineCm, waistSpan[1], "double"),
      );
    }

    // #185 (found while implementing #177, fixed in the same PR): when this
    // silhouette cuts the waist opening into a SINGLE undivided panel
    // (half-circle, panels===1, qty===1), that one panel's own waist arc
    // already equals the FULL waist measurement -- it has to be shared
    // between the two bodice halves it's sewn to (front + back TOGETHER
    // equal the arc), not matched by each individually. `waistFront`/
    // `waistBack` split the arc at its own centre vertex (`steps/2`, the
    // same vertex `foldEdge` already anchors on for exactly this reason --
    // it's the panel's own axis of symmetry). For panels===2
    // (circle/gore), each cut copy is already a WHOLE panel matching one
    // bodice half entirely (like circle/gore always has), so these extra
    // fields are simply unused -- garment.ts picks `waist` vs.
    // `waistFront`/`waistBack` off `skirtPiece.qty`, not off the
    // silhouette's name.
    const half = panels === 1 ? steps / 2 : undefined;
    // #188: `hem` is this panel's own bottom/outer arc (`hemSpan`, already
    // curved) -- exposed unconditionally, the same "not only when relevant
    // to a mated pair" shape `waist` above and body.ts's/sleeve.ts's own
    // `hem` already use. Unlike `waist`, it is never claimed by another
    // seamEdges.hem entry buildAssemblyOrder's own HEM_CONSUMED_BY reads
    // (a skirt's own bottom is never sewn to anything, dress or standalone),
    // so every silhouette's own panel always reports a real "hem" step.
    const seamEdges: Record<string, [number, number]> = {
      waist: waistSpan,
      hem: hemSpan,
    };
    if (half !== undefined) {
      seamEdges.waistFront = [waistSpan[0], half];
      seamEdges.waistBack = [half, waistSpan[1]];
    }

    return {
      id: "skirt",
      name: t("pieceNames.skirt"),
      qty: panels,
      outlineCm,
      curvedSpans: [waistSpan, hemSpan],
      // #259: the waist-side endpoint reads the ACTUAL drafted waist-arc
      // centre vertex (`outlineCm[steps/2]`, the same real point `foldEdge`/
      // `half` already anchor on) rather than a formula (`length + riseCm`)
      // that assumed the naive relationship -- for a wide sweep (circle's
      // own 2-panel, half-π-radian cut), the arc's OWN edges reach all the
      // way to the hem radius R regardless of rise, so `length + riseCm` can
      // overshoot past the panel's true bound once riseCm approaches the
      // waist radius itself. Reading the real vertex is correct for every
      // sweep/panel count and both signs of riseCm, including the radius
      // floor radialSkirt applies for a pathologically large positive rise.
      grainlineCm: [
        [cxTop, 4],
        [cxTop, outlineCm[steps / 2][1]],
      ],
      foldEdge,
      notches,
      detailRows,
      // #134: the waist arc (whole edge, `waistSpan`) -- only meaningful
      // when isDressWaist (paired against a bodice hem by garment.ts), but
      // exposed unconditionally like body.ts's own `hem` edge.
      seamEdges,
      placementCm: { role: "skirt", ...NO_PLACEMENT_TRANSFORM },
      // #249: garment.ts reads this instead of re-deriving it via a second
      // gradedLengthCm call -- see core.ts's own doc on this field.
      resolvedLengthCm: length,
    };
  }

  // straight / A-line: trapezoid (¼ hip/waist at the waist, hem equal or
  // wider), symmetric about x=hemHalf -- the whole panel (qty 2 = front +
  // back, each cut on its own fold), matching the grainline already centred
  // there. #177: a dress's own panel is sized off the WAIST (the same
  // dressWaistHalfCm the bodice hem it's sewn to also reads); a standalone
  // skirt keeps the hip-based panel it's always had.
  const waistHalf = isDressWaist
    ? dressWaistHalfCm(m.waist)
    : skirtWaistHalfCm(m.hip);
  const flare = silhueta === "a-line" ? 12 : 0;
  const hemHalf = waistHalf + flare;
  // #259: the waist edge's own y — raised (moved to negative y, extending
  // the panel upward past the natural waist) when riseCm > 0, retracted
  // (moved down toward the natural waist) when < 0. The hem's own y stays
  // `length` unchanged either way (the same "hem position holds, only how
  // far above it the waistband starts changes" reading the trousers block
  // uses for its own rise), so the panel's total drafted height becomes
  // length + riseCm.
  const waistY = -riseCm;
  const hemY = length;
  // #244: a dress's own skirt panel never reads pleats (see this function's
  // own isDressWaist param doc and lib/types.ts's GarmentStyle.pleats doc);
  // undefined defaults to "none", same as every other optional style enum.
  const pleatType: PleatType = isDressWaist ? "none" : (style.pleats ?? "none");
  const pleatIntakeCm = pleatType === "none" ? 0 : PLEAT_INTAKE_PER_SIDE_CM;
  // Original (pre-pleat) corner positions -- also the "placement"/"press
  // fold" reference points pleatFoldPlacement below measures from.
  const waistLeftX0 = waistHalf === hemHalf ? 0 : hemHalf - waistHalf;
  const waistRightX0 = waistLeftX0 + waistHalf * 2;
  const hemLeftX0 = 0;
  const hemRightX0 = hemHalf * 2;
  // Widened by pleatIntakeCm on EACH side (0 when unpleated, reproducing
  // the original corners exactly) -- symmetric about x=hemHalf, so foldEdge
  // below still names a real axis of symmetry (#244's own doc on why this
  // panel never drafts a single lopsided fold).
  const waistLeftX = waistLeftX0 - pleatIntakeCm;
  const waistRightX = waistRightX0 + pleatIntakeCm;
  const hemLeftX = hemLeftX0 - pleatIntakeCm;
  const hemRightX = hemRightX0 + pleatIntakeCm;
  // #126: the waist and hem are each a single straight edge with no vertex
  // at their own midpoint -- (hemHalf, waistY) and (hemHalf, hemY) subdivide
  // those two edges exactly at their centres (collinear with their
  // neighbours), so the fold line's endpoints are real vertices without
  // moving the panel's rendered shape.
  const outlineCm: Pt[] = [
    [waistLeftX, waistY],
    [hemHalf, waistY], // waist centre (fold top)
    [waistRightX, waistY],
    [hemRightX, hemY],
    [hemHalf, hemY], // hem centre (fold bottom)
    [hemLeftX, hemY],
  ];
  // #244: the panel's own REAL (possibly pleat-widened) CUT waist width --
  // never the pre-widen waistHalf*2. #319/#320: this is deliberately the
  // CUT edge, not the finished one the waistband is actually sized from
  // (garment.ts nets pleatTakeUpCm back out via presentedEdgeLenCm) -- see
  // the rows.waistFinished row below, added alongside rows.pleats, so the
  // ficha técnica states both numbers rather than only the cut one.
  detailRows.splice(1, 0, {
    label: t("rows.waistPanel"),
    value: cm(waistRightX - waistLeftX),
  });
  let internalsCm: InternalCm[] | undefined;
  if (pleatType !== "none") {
    // One (origWaistX, outerWaistX, origHemX, outerHemX) tuple per side --
    // left then right -- fed to pleatFoldPlacement in turn rather than two
    // hand-duplicated call sites.
    const sides: [number, number, number, number][] = [
      [waistLeftX0, waistLeftX, hemLeftX0, hemLeftX],
      [waistRightX0, waistRightX, hemRightX0, hemRightX],
    ];
    internalsCm = sides.flatMap(
      ([origWaistX, outerWaistX, origHemX, outerHemX]) =>
        pleatFoldPlacement(
          pleatType,
          origWaistX,
          outerWaistX,
          origHemX,
          outerHemX,
          waistY,
          hemY,
        ),
    );
    detailRows.splice(detailRows.length - 1, 0, {
      label: t("rows.pleats"),
      value: t("pleatType." + pleatType),
    });
    // #319/#320: the finished waist the pleat actually leaves once its own
    // fold is taken up -- derived by subtraction from the two numbers
    // already in scope (never a re-derivation of waistHalf*2), and only
    // ever emitted alongside rows.pleats since an unpleated panel would
    // otherwise print the identical number twice under two different rows.
    detailRows.splice(detailRows.length - 1, 0, {
      label: t("rows.waistFinished"),
      value: cm(waistRightX - waistLeftX - pleatIntakeCm * 2),
    });
  }

  // #263: notchAtVertex derives the inward tick from outlineCm's own
  // winding now -- no more caller-supplied interior reference.
  const notches: NotchCm[] = [
    // hem-fold notch: centre front/back at the hem (index 4, #126).
    notchAtVertex(outlineCm, 4, "single"),
  ];
  if (isDressWaist) {
    // #124: waist-join notches -- the waist edge's own corners (indices 0
    // and 2), matching body.ts's own outer-corner notches on the bodice
    // hem it's sewn to.
    notches.push(
      notchAtVertex(outlineCm, 0, "double"),
      notchAtVertex(outlineCm, 2, "double"),
    );
  }

  return {
    id: "skirt",
    name: t("pieceNames.skirt"),
    qty: 2,
    outlineCm,
    grainlineCm: [
      [hemHalf, waistY + 4],
      [hemHalf, hemY - 4],
    ],
    foldEdge: [1, 4],
    notches,
    detailRows,
    ...(internalsCm ? { internalsCm } : {}),
    // #249: garment.ts reads this instead of re-deriving it via a second
    // gradedLengthCm call -- see core.ts's own doc on this field.
    resolvedLengthCm: length,
    // #319/#320: declared here (not re-derived by garment.ts) on the exact
    // branch that widened the edge -- see core.ts's DraftedPiece.pleatTakeUpCm
    // doc for why a pleat's own take-up can't be scanned off internalsCm the
    // way a dart's can. Conditional spread (never `pleatTakeUpCm: 0`) so an
    // unpleated panel stays byte-identical to one with no pleats at all.
    ...(pleatIntakeCm > 0 ? { pleatTakeUpCm: pleatIntakeCm * 2 } : {}),
    // #134: the waist edge (index 0 to 2, straight -- see the outline
    // comment above), matching body.ts's own `hem` edge when this is a
    // dress's skirt panel. #188: `hem` (index 3 to 5, straight through the
    // fold-bottom vertex at 4 -- the mirror of `waist`'s own 0-to-2 span
    // across the panel) is this panel's own bottom edge, exposed
    // unconditionally like `waist` above -- never claimed by another pair
    // (a skirt's own bottom is never sewn to anything), so it always
    // reports a real "hem" step regardless of silhouette or waistband.
    seamEdges: { waist: [0, 2], hem: [3, 5] },
    placementCm: { role: "skirt", ...NO_PLACEMENT_TRANSFORM },
  };
}
