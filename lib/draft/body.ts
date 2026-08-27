import { Measurements } from "@/lib/measurements";
import { DetailRow, GarmentStyle, Gender, NotchType } from "@/lib/types";
import {
  curveArcLengthCm,
  dartInternals,
  DraftedPiece,
  InternalCm,
  notchAt,
  notchAtArcLengthCm,
  notchAtVertex,
  NotchCm,
  Pt,
} from "./core";
import { wearingEaseCm } from "./ease";
import { formatCm } from "@/lib/format";
import type { Translate } from "@/lib/i18n/translate";

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
  // are skipped. The number is the skirt panel's own waist half-width
  // (lib/draft/skirt.ts's skirtWaistHalfCm), so the seam a dress joins is
  // drafted at a length that matches what the skirt panel actually is.
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
  // ease this proportion already carried -- falls back to the old
  // bust-derived approximation (bust/14) when the chart has no neckGirth.
  const neckHalf =
    m.neckGirth !== undefined
      ? m.neckGirth / 6 + (opts.gender === "male" ? 0.8 : 0)
      : m.bust / 14 + (opts.gender === "male" ? 0.8 : 0);
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
  const neckDrop = frontish ? frontNeckDrop : backNeckDrop;

  const fitted = !!style.darts && !opts.knit;
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

  const cf = push([cx, neckDrop]); // neckline center
  push([cx - neckHalf * 0.6, neckDrop * 0.55]); // left neckline ctrl
  const hpsL = push([cx - neckHalf, 0]); // left HPS
  spans.push([cf, hpsL]); // left neckline (curved)
  const shL = push([cx - shoulderHalf, shoulderSlope]); // left shoulder (straight hpsL->shL)
  push([cx - armCtrlX, midArmY]); // left armhole ctrl
  const uaL = push([cx - halfChest, armholeDepth]); // left underarm
  spans.push([shL, uaL]); // left armhole (curved)
  // #79: for a dress, waistY === len (the hem IS the waist seam) -- pushing
  // both would land two extra vertices exactly on top of the hem's own,
  // retracing that edge and leaving the boundary non-simple.
  if (fitted && !isDressHem) push([cx - waistHalf, waistY]); // left waist
  const hemL = push([cx - hemHalf, len]); // left hem
  // #126: exactly on the straight hem edge (collinear with left/right hem,
  // same y) -- subdivides that edge into two collinear segments rather than
  // changing the piece's rendered shape, giving the fold line's bottom
  // endpoint a real vertex to reference. The top endpoint is `cf`, the
  // neckline-center point already pushed at index 0.
  const hemCenter = push([cx, len]); // hem center (fold bottom)
  const hemR = push([cx + hemHalf, len]); // right hem (straight = hem)
  if (fitted && !isDressHem) push([cx + waistHalf, waistY]); // right waist
  const uaR = push([cx + halfChest, armholeDepth]); // right underarm
  push([cx + armCtrlX, midArmY]); // right armhole ctrl
  const shR = push([cx + shoulderHalf, shoulderSlope]); // right shoulder
  spans.push([uaR, shR]); // right armhole (curved)
  const hpsR = push([cx + neckHalf, 0]); // right HPS (straight shR->hpsR)
  push([cx + neckHalf * 0.6, neckDrop * 0.55]); // right neckline ctrl
  spans.push([hpsR, pts.length]); // right neckline + closing (curved)

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

  // #124: pitch notches sit a fixed rise above the underarm on both the
  // front/back armhole curves and the sleeve cap (single = front, double =
  // back, the standard pattern-making convention) -- clamped so a very
  // short armhole never places one past its own shoulder point. Both
  // pitchNotchCm (off the actual, possibly-deepened curve) and
  // basePitchNotchCm (off the un-deepened one) are exposed so garment.ts
  // can hand the sleeve whichever one matches the armhole IT was actually
  // drafted against (refit or not) -- the same actual/base choice it
  // already makes for sleeveArmhole, keeping the two "generated as pairs
  // from the same computation" per #124's acceptance criteria.
  const PITCH_NOTCH_RISE_CM = 8;
  const pitchNotchCm = Math.min(PITCH_NOTCH_RISE_CM, armholeEdgeLenCm * 0.7);
  const basePitchNotchCm = Math.min(
    PITCH_NOTCH_RISE_CM,
    armholeEdgeBaseLenCm * 0.7,
  );

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
    const dartHalfWidth = Math.max(0.9, dartsSuppression / 8);
    const dartRiseCm = 12;
    const oneDart = (side: -1 | 1): DraftedDart => {
      const dx = cx + side * dartOffset;
      if (isDressHem) {
        // The hem IS the waist seam here (#79) -- the dart opens directly
        // onto it: its wide end sits on the seam, tapering to a single
        // point above. No seam to open onto below (there's nothing past the
        // hem), so it can't be double-ended -- one free apex, one seam end
        // (#127: the fold line runs apex -> seam midpoint; only the apex
        // gets a drill hole).
        const apex: Pt = [dx, waistY - dartRiseCm];
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
      // apex, and each end gets its own drill hole.
      const apexTop: Pt = [dx, waistY - dartRiseCm];
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
    dartsStruct = [oneDart(-1), oneDart(1)];
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
  const insideRef: Pt = [cx, len / 2];
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
    notchAtArcLengthCm(
      pts,
      spans,
      uaR,
      shR,
      pitchNotchCm,
      insideRef,
      pitchType,
    ),
    // hem-fold notch: centre front/back at the hem, to line up the fabric fold.
    notchAtVertex(pts, hemCenter, insideRef, "single"),
  ];
  if (isDressHem) {
    // #124: waist-join notches -- the outer corners of the hem/waist-join
    // edge this panel shares with the skirt panel it's sewn to (#79).
    // "double" so they read apart from the hem-fold's own "single" centre
    // mark.
    notches.push(
      notchAtVertex(pts, hemL, insideRef, "double"),
      notchAtVertex(pts, hemR, insideRef, "double"),
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
  const seamEdges: Record<string, [number, number]> = {
    shoulder: [hpsL, shL],
    side: [uaL, hemL],
    armhole: [shL, uaL],
    hem: [hemL, hemR],
  };

  return {
    piece: {
      id,
      name,
      qty: 1,
      outlineCm: pts,
      curvedSpans: spans,
      grainlineCm,
      internalsCm,
      foldEdge: [cf, hemCenter],
      notches,
      detailRows,
      armholeLenCm: armholeEdgeLenCm,
      seamEdges,
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
  const f = bodice(
    m,
    style,
    opts,
    t,
    "body-front",
    t("pieceNames.front"),
    true,
  );
  const c = bodice(m, style, opts, t, "body-back", t("pieceNames.back"), false);
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
    // #124: front and back draft an identical armhole curve (only the
    // neckline differs by `frontish`), so f.pitchNotchCm === c.pitchNotchCm
    // by construction -- either's value is the garment's one pitch-notch
    // distance, which garment.ts hands to draftSleeve unchanged.
    //
    // #132: that construction assumes front and back draft an identical
    // armCtrlX, which is no longer forced -- a chart whose backWidth
    // genuinely differs from the shoulder/underarm interpolation (a real
    // narrower/wider back, the whole point of the field) drafts a back
    // armhole a different length than the front's, so f.pitchNotchCm and
    // c.pitchNotchCm can now legitimately diverge (halfChest/the underarm
    // itself is untouched -- see bodice()'s own note -- so this is strictly
    // narrower than an earlier version of this comment described). Each
    // panel already places its OWN notch from its OWN local pitch distance
    // (computed inside bodice(), not from this return value), so that stays
    // correct either way; what's no longer exact is the sleeve's
    // single/double notch, which still shares ONE distance (garment.ts
    // hands it whichever of f/c matches the armhole the cap was actually
    // drafted against) for both sides. A sleeve notch a few millimetres off
    // a diverged back's own notch is a labelled-cosmetic precision gap, not
    // a fit defect -- the seams it marks still sew together at the lengths
    // seamCheck actually verifies.
    pitchNotchCm: f.pitchNotchCm,
    basePitchNotchCm: f.basePitchNotchCm,
  };
}
