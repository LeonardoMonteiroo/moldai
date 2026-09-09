import { Measurements } from "@/lib/measurements";
import { DetailRow, GarmentStyle, Gender, NotchType } from "@/lib/types";
import {
  curveArcLengthCm,
  dartInternals,
  DraftedPiece,
  InternalCm,
  NO_PLACEMENT_TRANSFORM,
  notchAt,
  notchAtArcLengthCm,
  notchAtVertex,
  NotchCm,
  OutlineAnchors,
  Pt,
  WRAP,
} from "./core";
import { wearingEaseCm } from "./ease";
import { pitchNotchDistanceCm } from "./seams";
import { formatCm } from "@/lib/format";
import type { Translate } from "@/lib/i18n/translate";
import {
  BAND_COLLAR_SHOULDER_DROP_CM,
  BAND_COLLAR_BACK_NECK_DROP_CM,
  BAND_COLLAR_FRONT_NECK_DROP_CM,
} from "./subpieces";

const cm = (v: number) => `${formatCm(v)} cm`;

export interface BlockOpts {
  gender: Gender;
  knit: boolean;
  lengthCm: number;
  // Total cm the bust circumference gains (or, for a stretchy knit, loses) —
  // lib/draft/ease.ts's wearingEaseCm, resolved by the caller from the
  // style's fit/stretch class. Shared with draftSleeve via the same opts.
  wearingEaseCm: number;
  // #79: only set for a dress -- lengthCm equals waistY there (the bodice
  // piece ends at the natural waist, where a separate skirt piece takes
  // over), so the hem IS the waist seam, not a hip-derived blouse hem. When
  // present, this replaces hemHalf and the redundant fitted-only waist
  // vertices (which would otherwise exactly retrace the hem, at the same y)
  // are skipped. #177: the number is `dressWaistHalfCm(waist)`
  // (lib/draft/skirt.ts) -- deliberately silhouette-independent, since the
  // bodice describes the body, not whichever skirt it's sewn to (not
  // skirtWaistHalfCm(hip), which was wrong for a fitted bodice's hem
  // independent of silhouette -- see CLAUDE.md). Every silhouette's own
  // waist-panel construction is sized to meet this exact value (see
  // dressWaistHalfCm's own doc and garment.ts's waist-join pairs).
  dressHemHalfCm?: number;
}

function defaultOpts(m: Measurements): BlockOpts {
  return {
    gender: "female",
    knit: false,
    lengthCm: m.backLength + m.hipHeight + 5,
    wearingEaseCm: wearingEaseCm({}, false, m.bust),
  };
}

// Drafts a whole body piece (half-piece mirrored around cx) with
// curves only at the neckline and armhole. `frontish` controls the neckline depth.
function bodice(
  m: Measurements,
  style: GarmentStyle,
  opts: BlockOpts,
  t: Translate,
  id: string,
  name: string,
  frontish: boolean,
  // #253: when supplied, these REPLACE this panel's own independently-
  // computed pitch-notch distance -- draftBody below drafts each panel
  // TWICE, first without an override (purely to learn each side's own
  // armhole edge length), then again with the PAIR's own shared distance
  // (lib/draft/seams.ts's pitchNotchDistanceCm, off front+back's combined
  // total) so both panels' notches -- and the sleeve cap's, in sleeve.ts --
  // are "generated as pairs from the same computation" (#124) even when a
  // real backWidth divergence makes front's and back's own armhole lengths
  // genuinely unequal. Absent (the first pass) falls back to this panel's
  // OWN length, which only ever feeds a value that's discarded.
  pitchNotchOverrideCm?: number,
  basePitchNotchOverrideCm?: number,
): {
  piece: DraftedPiece;
  armholeEdgeLenCm: number;
  armholeEdgeBaseLenCm: number;
  halfChestCm: number;
  pitchNotchCm: number;
  basePitchNotchCm: number;
} {
  const seamAllowanceCm = style.seamAllowanceCm ?? 1;
  // #125: was the inline constant `opts.knit ? 0 : 2` -- now the caller
  // (draftAll, lib/draft/garment.ts) resolves it from the style's
  // fit/stretch class via wearingEaseCm and passes the TOTAL cm through
  // opts; dividing by 4 gives the per-quarter figure this bodice adds to
  // each of its four panels (front-left/right, back-left/right).
  const wearingEase = opts.wearingEaseCm / 4;
  // #132: halfChest stays bust-derived for BOTH panels, front and back --
  // it's the panel's width at the underarm (bust level; see uaL/uaR below),
  // and backWidth is not a bust-circumference substitute (a first version of
  // this deliberately conflated the two: seeding backWidth = bust/2 so the
  // fallback stayed byte-identical made the seeded "across-back" value
  // ~46cm at a 92cm bust, while the real measurement the guide text sends a
  // user to take -- armpit to armpit across the back, at shoulder-blade
  // height -- is ~36-38cm there; a user who actually measured and entered
  // that real number into a halfChest-driving field got a back panel ~5cm
  // narrower per side than intended, the exact fit failure #132 exists to
  // prevent). backWidth is consumed further down instead, at the armhole
  // curve's own control point -- roughly shoulder-blade height, above the
  // underarm -- which is where an across-back measurement actually belongs.
  const halfChest = m.bust / 4 + wearingEase;
  const armholeDeepen = Math.max(0, style.armholeDeepenCm ?? 0);
  // #132: armhole depth used to scale with the full bust circumference,
  // which bakes cup size into a dimension that's really about frame size --
  // two people with the same 92cm bust but different cups need the same
  // armhole depth, not one scaled up for the cup. highBust (chest above the
  // bust, below the arms) is the frame measurement that survives cup
  // differences, so it takes over here when the chart has it; a chart that
  // doesn't (including every existing one) falls back to bust exactly as
  // before -- see lib/measurements.ts's own note on why the system charts'
  // seeded highBust (== bust) doesn't change this fallback's output either.
  const armholeDepthBase =
    (m.highBust ?? m.bust) / 8 + (opts.gender === "male" ? 10.5 : 9.5);
  const armholeDepth = armholeDepthBase + armholeDeepen; // deepened armhole, visible in the outline
  const shoulderSlope = m.shoulderSlope ?? (opts.gender === "male" ? 4.5 : 4.0);
  // #132: neck opening half-width is a standard 1/6 of the neck
  // circumference (a common block-drafting ratio) plus the same small male
  // ease this proportion already carried. #269 promoted neckGirth to CORE
  // (a FreeSewing design requires it outright), so the old bust/14
  // fallback for an absent neckGirth is unreachable now -- every base row
  // has one, guaranteed by assertResolvedMeasurements.
  const neckHalf = m.neckGirth / 6 + (opts.gender === "male" ? 0.8 : 0);
  const shoulderHalf = m.shoulder;
  const len = opts.lengthCm;
  const isDressHem = opts.dressHemHalfCm !== undefined;
  const hemHalf = opts.dressHemHalfCm ?? m.hip / 4 + wearingEase;

  const backNeckDrop = 2.0;
  let frontNeckDrop: number;
  if (style.neckline === "V")
    frontNeckDrop = neckHalf + Math.max(0, style.necklineDepthCm ?? 6);
  else if (style.neckline === "round")
    frontNeckDrop = neckHalf + (opts.knit ? 2.0 : 1.0);
  else frontNeckDrop = neckHalf * 0.7;
  // #221/#222: a band (stand) collar -- or a shirt collar's own stand,
  // which is the SAME construction (dresspatternmaking.com's "Collars":
  // "the base is the Mandarin (or Band) Collar") -- sits close to the
  // throat with no folded fall to absorb ease, so the neckline it seats
  // against is opened up a little first -- small, position-specific deltas
  // (lib/draft/subpieces.ts's BAND_COLLAR_*_DROP_CM, sourced from
  // muellerundsohn.com's stand-collar construction), applied BEFORE this
  // panel's own seamEdges are measured so the collar-neckline seam pair in
  // garment.ts measures the ALREADY-lowered curve. Centre back/front only
  // get their own panel's delta (frontish picks which); the shoulder-point
  // delta below is added identically on both panels so the shoulder seam
  // (front hpsL->shL vs back hpsL->shL) stays equal by construction,
  // unperturbed by this change.
  const usesStandNeckline = style.collar === "band" || style.collar === "shirt";
  const neckDrop =
    (frontish ? frontNeckDrop : backNeckDrop) +
    (usesStandNeckline
      ? frontish
        ? BAND_COLLAR_FRONT_NECK_DROP_CM
        : BAND_COLLAR_BACK_NECK_DROP_CM
      : 0);
  const shoulderNeckDropCm = usesStandNeckline
    ? BAND_COLLAR_SHOULDER_DROP_CM
    : 0;

  const fitted = !!style.darts && !opts.knit;
  // #223: a front-closure blouse front splits into a mirrored half-panel
  // instead of the usual whole, cut-on-fold piece -- see docs/superpowers/
  // specs/2026-08-28-front-button-stand-design.md. Gated on `!opts.knit`
  // (excludes tshirt) and `opts.dressHemHalfCm === undefined` (excludes
  // dress, whose bodice hem doubles as the waist-join seam and assumes the
  // front's FULL hem width -- see the spec's Non-goals) rather than
  // threading spec.type into this function.
  const frontClosure =
    frontish &&
    style.frontClosure === "buttonStand" &&
    !opts.knit &&
    opts.dressHemHalfCm === undefined;
  const waistY = m.backLength;
  // #122: the panel's total waist suppression (bust/hip-driven, as before)
  // is now split rather than applied in full twice over -- half narrows the
  // side seam (waistHalf below), half is removed by the two darts together
  // (dartsSuppression, used further down). The old formula put the FULL
  // amount in waistHalf AND put it again, whole, in a single dart wedge.
  const waistSuppression = Math.max(0, m.hip / 4 - m.waist / 4);
  const sideSeamSuppression = waistSuppression * 0.5;
  const dartsSuppression = waistSuppression * 0.5;
  const waistHalf = Math.max(halfChest - sideSeamSuppression, halfChest - 3);

  const cx = Math.max(shoulderHalf, halfChest, hemHalf);
  const midArmY = shoulderSlope + (armholeDepth - shoulderSlope) * 0.55;
  const midArmYBase = shoulderSlope + (armholeDepthBase - shoulderSlope) * 0.55;
  // #132: the armhole curve's own control point, at midArmY -- a height
  // strictly between the shoulder tip (shoulderSlope) and the underarm
  // (armholeDepth), i.e. roughly shoulder-blade/upper-chest height. That is
  // where an across-back measurement is actually taken, so the BACK panel's
  // control point reads backWidth (halved, the same one-side convention
  // halfChest already uses) when the chart has it, instead of the plain
  // shoulder/underarm interpolation every panel used before -- the
  // underarm itself (uaL/uaR, halfChest-driven) is untouched by backWidth,
  // deliberately, so a narrower back doesn't fight the bust-derived width
  // it's still sewn to at the side seam. Falls back to the original
  // interpolation, unchanged, when backWidth is absent (every existing
  // chart, and the front panel always).
  const armCtrlX =
    !frontish && m.backWidth !== undefined
      ? m.backWidth / 2 + wearingEase
      : (shoulderHalf + halfChest) / 2 - 1; // distance from center

  const pts: Pt[] = [];
  const spans: [number, number][] = [];
  const push = (p: Pt) => (pts.push(p), pts.length - 1);
  // #251: named handles onto the vertices this panel's own seamEdges
  // reference -- see core.ts's OutlineAnchors doc for why a NAME survives
  // where the raw indices below (still used directly for spans/notches,
  // unchanged) would go stale the moment a vertex is inserted between them.
  const anchors = new OutlineAnchors();

  const cf = anchors.set("cf", push([cx, neckDrop])); // neckline center
  push([cx - neckHalf * 0.6, neckDrop * 0.55]); // left neckline ctrl
  const hpsL = anchors.set("hpsL", push([cx - neckHalf, shoulderNeckDropCm])); // left HPS
  spans.push([cf, hpsL]); // left neckline (curved)
  const shL = anchors.set("shL", push([cx - shoulderHalf, shoulderSlope])); // left shoulder (straight hpsL->shL)
  push([cx - armCtrlX, midArmY]); // left armhole ctrl
  const uaL = anchors.set("uaL", push([cx - halfChest, armholeDepth])); // left underarm
  spans.push([shL, uaL]); // left armhole (curved)
  // #79: for a dress, waistY === len (the hem IS the waist seam) -- pushing
  // both would land two extra vertices exactly on top of the hem's own,
  // retracing that edge and leaving the boundary non-simple.
  if (fitted && !isDressHem) push([cx - waistHalf, waistY]); // left waist
  const hemL = anchors.set("hemL", push([cx - hemHalf, len])); // left hem
  // #126: exactly on the straight hem edge (collinear with left/right hem,
  // same y) -- subdivides that edge into two collinear segments rather than
  // changing the piece's rendered shape, giving the fold line's bottom
  // endpoint a real vertex to reference. The top endpoint is `cf`, the
  // neckline-center point already pushed at index 0.
  const hemCenter = anchors.set("hemCenter", push([cx, len])); // hem center (fold bottom)

  // #223: a front-closure half-panel stops here -- the polygon closes
  // directly from hemCenter back to cf (index 0), which IS the vertical
  // center-front line, now a real boundary edge instead of the interior
  // fold chord the whole-panel case marks below. Every "right side" vertex
  // (hemR/uaR/shR/hpsR) simply doesn't exist for this half.
  let hemR: number | undefined;
  let uaR: number | undefined;
  let shR: number | undefined;
  let hpsR: number | undefined;
  if (!frontClosure) {
    hemR = anchors.set("hemR", push([cx + hemHalf, len])); // right hem (straight = hem)
    if (fitted && !isDressHem) push([cx + waistHalf, waistY]); // right waist
    uaR = anchors.set("uaR", push([cx + halfChest, armholeDepth])); // right underarm
    push([cx + armCtrlX, midArmY]); // right armhole ctrl
    shR = anchors.set("shR", push([cx + shoulderHalf, shoulderSlope])); // right shoulder
    spans.push([uaR, shR]); // right armhole (curved)
    hpsR = anchors.set("hpsR", push([cx + neckHalf, shoulderNeckDropCm])); // right HPS (straight shR->hpsR)
    push([cx + neckHalf * 0.6, neckDrop * 0.55]); // right neckline ctrl
    spans.push([hpsR, pts.length]); // right neckline + closing (curved)
  }

  // This piece's own armhole edge (shoulder -> control point -> underarm),
  // measured from the real curve outlinePath will draw — not a straight-line
  // approximation. A garment's full armhole circumference is this edge plus
  // the other piece's matching edge (see draftBody, which sums front+back);
  // #139 found that a single edge had been used as if it *were* the full
  // circumference, drafting every sleeve at roughly half size.
  const armholeEdgeLenCm = curveArcLengthCm(pts, spans, shL, uaL);
  // "Base" edge (without the armholeDeepenCm adjustment) — this is what the
  // sleeve cap targets while it hasn't been refit; the divergence between
  // this and armholeEdgeLenCm (doubled to full-circumference scale in
  // draftBody) is what seamCheck detects.
  const armholeEdgeBaseLenCm = curveArcLengthCm(
    [
      [cx - shoulderHalf, shoulderSlope],
      [cx - armCtrlX, midArmYBase],
      [cx - halfChest, armholeDepthBase],
    ],
    [[0, 2]],
    0,
    2,
  );

  // #124/#253: pitch notches sit a fixed rise above the underarm on both the
  // front/back armhole curves and the sleeve cap (single = front, double =
  // back, the standard pattern-making convention). Both pitchNotchCm (off
  // the actual, possibly-deepened curve) and basePitchNotchCm (off the
  // un-deepened one) are exposed so garment.ts can hand the sleeve whichever
  // one matches the armhole IT was actually drafted against (refit or not)
  // -- the same actual/base choice it already makes for sleeveArmhole,
  // keeping the two "generated as pairs from the same computation" per
  // #124's acceptance criteria. #253: when draftBody supplies an override
  // (the pair's own shared distance, off front+back's COMBINED total -- see
  // lib/draft/seams.ts's pitchNotchDistanceCm), that value is used verbatim
  // instead of this panel independently clamping to a fraction of its own
  // single-side length -- the fallback below only ever feeds draftBody's own
  // first (discarded-notch) pass.
  const pitchNotchCm =
    pitchNotchOverrideCm ?? pitchNotchDistanceCm(armholeEdgeLenCm);
  const basePitchNotchCm =
    basePitchNotchOverrideCm ?? pitchNotchDistanceCm(armholeEdgeBaseLenCm);

  const detailRows: DetailRow[] = [
    { label: t("rows.seamAllowance"), value: cm(seamAllowanceCm) },
    { label: t("rows.chestWidth"), value: cm(halfChest * 2) },
    { label: t("rows.length"), value: cm(len) },
    { label: t("rows.armhole"), value: cm(armholeEdgeLenCm) },
    {
      label: t("rows.neckline"),
      // #121: the back is always drafted as a shallow scoop (backNeckDrop =
      // 2.0, the same curve construction as a "round" front, independent of
      // style.neckline entirely) -- reporting the front's chosen style here
      // for BOTH pieces claimed a V-neck back when the drafted geometry was
      // a shallow round one. Only the front's row reflects the spec choice.
      value: frontish
        ? t("neckline." + (style.neckline ?? "straight"))
        : t("neckline.round"),
    },
    { label: t("rows.grain"), value: t("grainValue") },
  ];

  // #122: two darts, symmetric about cx and offset toward the side seam --
  // never one centred on the piece's own axis of symmetry, which a full
  // front/back panel (qty 1, mirrored about cx) would render as a single
  // wedge sitting on centre front/back, not a dart any pattern-maker would
  // accept. `dartRiseCm` is the pre-existing single-dart apex offset,
  // unchanged; `dartHalfWidth` is each dart's own half-width, the combined
  // suppression (dartsSuppression) split across 2 darts x 2 legs each.
  // A dart's own leg outline, plus (#127) the fold line it presses along
  // when sewn and the free apex(es) that get a drill hole -- see
  // core.ts's dartInternals().
  interface DraftedDart {
    ptsCm: Pt[];
    foldCm: [Pt, Pt];
    apexesCm: Pt[];
  }
  let dartsStruct: DraftedDart[] | undefined;
  let internalsCm: InternalCm[] | undefined;
  if (fitted) {
    const dartOffset = waistHalf * 0.5;
    const dartRiseCm = 12;
    // bust-dart-shaping feature: a real cup delta (bust wider than highBust)
    // re-angles the dart's bust-facing apex toward the wearer's actual bust
    // apex instead of straight up, and widens the dart -- but ONLY on the
    // front panel (no anatomical apex exists on the back) and ONLY when
    // there's a real, non-zero delta. Both system charts seed
    // `highBust = bust` (delta 0) precisely so this stays a no-op for them
    // and for every chart/pattern that predates these fields (highBust
    // absent, `?? bust` collapses the delta to 0 the same way). Clamped to
    // >= 0 so an inverted highBust>bust entry never inverts the dart --
    // the same "no class below the tightest, negative is real but
    // bottomed-out" pattern lib/draft/ease.ts's classifyGirthFit already
    // uses.
    const bustCupDeltaCm = frontish
      ? Math.max(0, m.bust - (m.highBust ?? m.bust))
      : 0;
    const hasBustApex = bustCupDeltaCm > 0;
    // Cited FBA (full-bust-adjustment) convention: half the raw high-bust/
    // full-bust delta is the amount added to a HALF-front pattern -- one
    // side of this panel, i.e. one of the two darts oneDart() below drafts.
    // That whole half-front amount is routed into THIS dart's total width
    // (the scope this feature chose over a full slash-and-spread FBA -- see
    // design.md's Risks table), so half of it is the half-width this file
    // already tracks.
    const extraDartHalfWidthCm = bustCupDeltaCm / 4;
    const dartHalfWidth =
      Math.max(0.9, dartsSuppression / 8) + extraDartHalfWidthCm;
    // Bust-apex point, in this panel's own coordinate frame. #269 promoted
    // both to CORE (a FreeSewing design requires bustSpan outright), so
    // every base row carries a real value -- either a real per-chart tape
    // measurement, or the cited flat default (AD-001, .specs/STATE.md; see
    // design.md's Research table for both citations) a size chart seeds it
    // with. Clamped into the panel's own valid interior band so an extreme
    // combination (a small chart paired with range-boundary bustSpan/
    // bustPointHeight) can never place the apex outside the outline.
    const bustSpanCm = m.bustSpan;
    const bustPointHeightCm = m.bustPointHeight;
    const apexXOffsetCm = Math.min(
      Math.max(bustSpanCm / 2 + 0.5, 2),
      halfChest - 2,
    );
    const apexYCm = Math.min(
      Math.max(shoulderSlope + bustPointHeightCm, shoulderSlope + 4),
      waistY - 4,
    );
    const oneDart = (side: -1 | 1): DraftedDart => {
      const dx = cx + side * dartOffset;
      const bustApex: Pt = [cx + side * apexXOffsetCm, apexYCm];
      if (isDressHem) {
        // The hem IS the waist seam here (#79) -- the dart opens directly
        // onto it: its wide end sits on the seam, tapering to a single
        // point above. No seam to open onto below (there's nothing past the
        // hem), so it can't be double-ended -- one free apex, one seam end
        // (#127: the fold line runs apex -> seam midpoint; only the apex
        // gets a drill hole).
        const apex: Pt = hasBustApex ? bustApex : [dx, waistY - dartRiseCm];
        const seamMid: Pt = [dx, waistY];
        return {
          ptsCm: [
            [dx - dartHalfWidth, waistY],
            apex,
            [dx + dartHalfWidth, waistY],
          ],
          foldCm: [apex, seamMid],
          apexesCm: [apex],
        };
      }
      // The piece continues past the waist (a blouse/t-shirt hem below it),
      // so the dart touches no seam at all -- drafted as a double-ended
      // (fisheye) diamond, closed at both ends, entirely internal to the
      // piece. The first point repeats at the end so it renders as closed
      // without a synthetic straight-line base (see core.ts's place()).
      // #127: both ends are free apexes -- the fold line runs apex to
      // apex, and each end gets its own drill hole. Only the upper
      // (bust-facing) apex ever targets the bust apex -- the lower one
      // (toward the hip/hem) has no anatomical target and stays as today.
      const apexTop: Pt = hasBustApex ? bustApex : [dx, waistY - dartRiseCm];
      const apexBottom: Pt = [dx, waistY + dartRiseCm];
      return {
        ptsCm: [
          apexTop,
          [dx + dartHalfWidth, waistY],
          apexBottom,
          [dx - dartHalfWidth, waistY],
          apexTop,
        ],
        foldCm: [apexTop, apexBottom],
        apexesCm: [apexTop, apexBottom],
      };
    };
    // #223: a front-closure half-panel is cut twice (qty:2, mirrored), so
    // one dart here reproduces both darts across the finished garment --
    // the whole-panel case still needs both, since it's cut once.
    dartsStruct = frontClosure ? [oneDart(-1)] : [oneDart(-1), oneDart(1)];
    internalsCm = dartsStruct.flatMap((d) =>
      dartInternals(d.ptsCm, d.foldCm, d.apexesCm),
    );
    detailRows.splice(4, 0, {
      label: t("rows.dart"),
      value: cm(dartHalfWidth * 2),
    });
  }

  // Inset from the piece's OWN top edge at x=cx (the neckline base), not from
  // the bounding box: the neckline scoop means the bbox top is outside the
  // piece there, and a grainline starting at y=3 floated in the neck opening —
  // on canvas and in all five export formats. neckDrop stays well under `len`
  // (necklineDepthCm caps at 15), so the line can never invert.
  const grainlineCm: [Pt, Pt] = [
    [cx, neckDrop + 3],
    [cx, len - 3],
  ];

  // #124: a generic interior reference for every notch this panel places --
  // safely below the shoulders and above the hem, and safely between the
  // left/right armholes, for every drafted proportion.
  // #223: on a front-closure half-panel, [cx, len/2] sits exactly on the
  // new center-front boundary edge -- degenerate for notch orientation
  // (notchAt needs a reference strictly inside the piece). Shifted toward
  // the shoulder side, the same "-" direction every vertex on this half uses.
  const insideRef: Pt = frontClosure
    ? [cx - shoulderHalf * 0.3, len / 2]
    : [cx, len / 2];
  const pitchType: NotchType = frontish ? "single" : "double";
  const notches: NotchCm[] = [
    // front/back pitch notches, walked from the SAME underarm-relative
    // distance the sleeve places its own matching notches at (see
    // sleeve.ts) -- left armhole curve (shL->uaL) and its mirror (uaR->shR).
    notchAtArcLengthCm(
      pts,
      spans,
      shL,
      uaL,
      armholeEdgeLenCm - pitchNotchCm,
      insideRef,
      pitchType,
    ),
  ];
  // #223: the mirror-side pitch notch and the hem-fold notch both mark
  // geometry a front-closure half-panel simply doesn't draft (no right
  // armhole, no fold at center front).
  if (!frontClosure) {
    notches.push(
      notchAtArcLengthCm(
        pts,
        spans,
        uaR!,
        shR!,
        pitchNotchCm,
        insideRef,
        pitchType,
      ),
      // hem-fold notch: centre front/back at the hem, to line up the fabric fold.
      notchAtVertex(pts, hemCenter, insideRef, "single"),
    );
  }
  if (isDressHem) {
    // #124: waist-join notches -- the outer corners of the hem/waist-join
    // edge this panel shares with the skirt panel it's sewn to (#79).
    // "double" so they read apart from the hem-fold's own "single" centre
    // mark. frontClosure is never true here -- isDressHem implies a dress,
    // and frontClosure excludes dress (see its own doc above) -- so hemR is
    // always defined on this branch.
    notches.push(
      notchAtVertex(pts, hemL, insideRef, "double"),
      notchAtVertex(pts, hemR!, insideRef, "double"),
    );
    // #124: dart-leg notches, where each dart's legs meet the waist/hem
    // seam -- only reachable here, since the fisheye (double-ended) dart a
    // non-dress piece drafts is fully internal and touches no edge to notch.
    for (const dart of dartsStruct ?? []) {
      const [legL, , legR] = dart.ptsCm;
      notches.push(
        notchAt(legL, [1, 0], insideRef, "single"),
        notchAt(legR, [1, 0], insideRef, "single"),
      );
    }
  }

  // #134: this panel's own edge-index ranges for the seams it participates
  // in -- garment.ts pairs matching edges across pieces (front vs back,
  // front/back vs sleeve, front/back vs skirt) into the actual SeamPairDecl
  // list. `hem` is exposed unconditionally (not only when isDressHem): it's
  // simply unreferenced by any pair unless this garment has a skirt to join
  // it to, one shape either way rather than a conditional field.
  // #129: the two curved spans that together make up this panel's own
  // neckline -- cf->hpsL (left) and hpsR->wrap-to-cf (right), the exact same
  // index pair the neckline curvedSpans above already use. garment.ts sums
  // both, off front AND back, into the total arc a collar's own neckline
  // seam is sized from.
  // #251: built from `anchors` by NAME rather than by picking among raw
  // indices with a hand-written ternary/`pts.length` sentinel -- the
  // frontClosure branch used to re-derive `hem`/`centerFront`/
  // `necklineRight` that way; OutlineAnchors.edge() centralizes the
  // "wraps to vertex 0" convention (the `WRAP` sentinel) and throws on a
  // typo'd name instead of trusting a `hemR!`/`hpsR!` non-null assertion.
  const seamEdges: Record<string, [number, number]> = {
    shoulder: anchors.edge("hpsL", "shL", pts.length),
    side: anchors.edge("uaL", "hemL", pts.length),
    armhole: anchors.edge("shL", "uaL", pts.length),
    // #223: a front-closure half-panel's own hem edge is only [hemL,
    // hemCenter] (half the width) -- there is no hemR to name.
    hem: anchors.edge("hemL", frontClosure ? "hemCenter" : "hemR", pts.length),
    necklineLeft: anchors.edge("cf", "hpsL", pts.length),
  };
  if (frontClosure) {
    // #223: the polygon's own closing edge (hemCenter wraps back to cf,
    // index 0) -- the new center-front boundary, the button stand's mate.
    seamEdges.centerFront = anchors.edge("hemCenter", WRAP, pts.length);
  } else {
    seamEdges.necklineRight = anchors.edge("hpsR", WRAP, pts.length);
  }

  return {
    piece: {
      id,
      name,
      qty: frontClosure ? 2 : 1,
      outlineCm: pts,
      curvedSpans: spans,
      grainlineCm,
      internalsCm,
      // #223: no fold on a front-closure half-panel -- this edge is a real
      // seam now (its own seamEdges.centerFront above), not a cut-on-fold
      // axis.
      foldEdge: frontClosure ? undefined : [cf, hemCenter],
      notches,
      detailRows,
      armholeLenCm: armholeEdgeLenCm,
      seamEdges,
      // #223: this half-panel isn't symmetric about its own bounding box,
      // so a bbox-midpoint (lib/proof3d/mesh.ts's pieceCx) can't find its
      // true axis -- cx is the same local variable that placed cf/hemCenter.
      centerXCm: frontClosure ? cx : undefined,
      // #254: this panel's own Prova 3D role -- `frontish` is the same flag
      // that already picks the neckline depth, so front vs back can never
      // disagree between the two.
      placementCm: {
        role: frontish ? "torso-front" : "torso-back",
        ...NO_PLACEMENT_TRANSFORM,
      },
    },
    armholeEdgeLenCm,
    armholeEdgeBaseLenCm,
    halfChestCm: halfChest,
    pitchNotchCm,
    basePitchNotchCm,
  };
}

export function draftBody(
  m: Measurements,
  style: GarmentStyle,
  t: Translate,
  opts: BlockOpts = defaultOpts(m),
) {
  // #253: first (discarded-notch) pass -- armholeEdgeLenCm/
  // armholeEdgeBaseLenCm don't depend on the pitch-notch distance at all
  // (only where a notch lands on an already-fixed curve does), so this pass
  // exists purely to learn each panel's OWN armhole edge length before the
  // PAIR's shared distance can be computed. A chart whose backWidth
  // genuinely differs from the shoulder/underarm interpolation (a real
  // narrower/wider back) drafts a back armhole a different length than the
  // front's -- this is exactly the case the shared distance below has to
  // stay correct for.
  const f0 = bodice(
    m,
    style,
    opts,
    t,
    "body-front",
    t("pieceNames.front"),
    true,
  );
  const c0 = bodice(
    m,
    style,
    opts,
    t,
    "body-back",
    t("pieceNames.back"),
    false,
  );
  // #253: ONE pitch-notch distance for the whole pair, off front+back's own
  // COMBINED total -- not each side independently clamping to a fraction of
  // its own single-side length (the two-independent-clamps bug this issue
  // closes: 0.7-of-one-side in this file, 0.35-of-the-cap's-own-arc in
  // sleeve.ts, consistent only when front and back happen to be equal).
  // See lib/draft/seams.ts's pitchNotchDistanceCm.
  const pitchNotchCm = pitchNotchDistanceCm(
    f0.armholeEdgeLenCm + c0.armholeEdgeLenCm,
  );
  const basePitchNotchCm = pitchNotchDistanceCm(
    f0.armholeEdgeBaseLenCm + c0.armholeEdgeBaseLenCm,
  );
  // Second pass, with the shared distance now known -- this is the one
  // whose pieces/notches are actually returned.
  const f = bodice(
    m,
    style,
    opts,
    t,
    "body-front",
    t("pieceNames.front"),
    true,
    pitchNotchCm,
    basePitchNotchCm,
  );
  const c = bodice(
    m,
    style,
    opts,
    t,
    "body-back",
    t("pieceNames.back"),
    false,
    pitchNotchCm,
    basePitchNotchCm,
  );
  // The full armhole circumference is the front edge plus the back edge —
  // #139: a single edge had been published and consumed by the sleeve as if
  // it were the whole armhole, drafting every sleeve at roughly half size.
  return {
    front: f.piece,
    back: c.piece,
    armholeLenCm: f.armholeEdgeLenCm + c.armholeEdgeLenCm,
    armholeBaseLenCm: f.armholeEdgeBaseLenCm + c.armholeEdgeBaseLenCm,
    // Front and back share the same formula (it doesn't depend on
    // `frontish`), so either's value is the garment's actual bust
    // quarter-width; total bust girth is 4× this.
    halfChestCm: f.halfChestCm,
    // #253: front and back are now handed the exact SAME pitchNotchCm/
    // basePitchNotchCm above (not each independently re-deriving one from
    // its own length), so f.pitchNotchCm === c.pitchNotchCm by construction
    // -- literally the same number, not merely "equal because the formulas
    // happen to agree" -- regardless of a real backWidth divergence between
    // the two panels' own armhole lengths. This is what removes the
    // "sleeve notch a few millimetres off a diverged back's own notch"
    // precision gap #132 introduced: the sleeve's own single/double notch
    // (sleeve.ts, unchanged distance-taking logic) now truly matches both
    // panels' notches, generated as a triple "from the same computation"
    // (#124), not a pair of independent guesses that happened to agree in
    // the common case.
    pitchNotchCm: f.pitchNotchCm,
    basePitchNotchCm: f.basePitchNotchCm,
  };
}
