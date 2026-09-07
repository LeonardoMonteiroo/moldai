import { Measurements } from "@/lib/measurements";
import { DetailRow, GarmentStyle, SkirtSilhouette } from "@/lib/types";
import { bbox, DraftedPiece, notchAtVertex, NotchCm, Pt } from "./core";
import { formatCm } from "@/lib/format";
import type { Translate } from "@/lib/i18n/translate";

const cm = (v: number) => `${formatCm(v)} cm`;

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
): DraftedPiece {
  const silhueta: SkirtSilhouette = style.skirt ?? "straight";
  const ease = style.seamAllowanceCm ?? 1;
  const length = style.skirtLengthCm ?? m.skirtLength;
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

    // #124: bbox centre is a safe interior reference for this convex-ish
    // fan shape -- simpler than deriving one from r/R, and robust to the
    // minY normalization radialSkirt already applied above.
    const b = bbox(outlineCm);
    const insideRef: Pt = [b.minX + b.w / 2, b.minY + b.h / 2];
    const notches: NotchCm[] = [
      // hem-fold notch: centre front/back at the hem.
      notchAtVertex(outlineCm, foldEdge[1], insideRef, "single"),
    ];
    if (isDressWaist) {
      // #124: waist-join notches -- the two ends of the waist arc, matching
      // body.ts's own outer-corner notches on the bodice hem it's sewn to.
      notches.push(
        notchAtVertex(outlineCm, waistSpan[0], insideRef, "double"),
        notchAtVertex(outlineCm, waistSpan[1], insideRef, "double"),
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
  const waistLeftX = waistHalf === hemHalf ? 0 : hemHalf - waistHalf;
  const waistRightX = waistLeftX + waistHalf * 2;
  const hemRightX = hemHalf * 2;
  // #259: the waist edge's own y — raised (moved to negative y, extending
  // the panel upward past the natural waist) when riseCm > 0, retracted
  // (moved down toward the natural waist) when < 0. The hem's own y stays
  // `length` unchanged either way (the same "hem position holds, only how
  // far above it the waistband starts changes" reading the trousers block
  // uses for its own rise), so the panel's total drafted height becomes
  // length + riseCm.
  const waistY = -riseCm;
  const hemY = length;
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
    [0, hemY],
  ];
  detailRows.splice(1, 0, {
    label: t("rows.waistPanel"),
    value: cm(waistHalf * 2),
  });

  const b = bbox(outlineCm);
  const insideRef: Pt = [b.minX + b.w / 2, b.minY + b.h / 2];
  const notches: NotchCm[] = [
    // hem-fold notch: centre front/back at the hem (index 4, #126).
    notchAtVertex(outlineCm, 4, insideRef, "single"),
  ];
  if (isDressWaist) {
    // #124: waist-join notches -- the waist edge's own corners (indices 0
    // and 2), matching body.ts's own outer-corner notches on the bodice
    // hem it's sewn to.
    notches.push(
      notchAtVertex(outlineCm, 0, insideRef, "double"),
      notchAtVertex(outlineCm, 2, insideRef, "double"),
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
    // #134: the waist edge (index 0 to 2, straight -- see the outline
    // comment above), matching body.ts's own `hem` edge when this is a
    // dress's skirt panel. #188: `hem` (index 3 to 5, straight through the
    // fold-bottom vertex at 4 -- the mirror of `waist`'s own 0-to-2 span
    // across the panel) is this panel's own bottom edge, exposed
    // unconditionally like `waist` above -- never claimed by another pair
    // (a skirt's own bottom is never sewn to anything), so it always
    // reports a real "hem" step regardless of silhouette or waistband.
    seamEdges: { waist: [0, 2], hem: [3, 5] },
  };
}
