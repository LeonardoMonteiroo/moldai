import { Measurements } from "@/lib/measurements";
import { DetailRow, GarmentStyle, Gender } from "@/lib/types";
import { curveArcLengthCm, DraftedPiece, Pt } from "./core";
import { wearingEaseCm } from "./ease";
import type { Translate } from "@/lib/i18n/translate";

const cm = (v: number) => `${v.toFixed(1).replace(".", ",")} cm`;

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
} {
  const seamAllowanceCm = style.seamAllowanceCm ?? 1;
  // #125: was the inline constant `opts.knit ? 0 : 2` -- now the caller
  // (draftAll, lib/draft/garment.ts) resolves it from the style's
  // fit/stretch class via wearingEaseCm and passes the TOTAL cm through
  // opts; dividing by 4 gives the per-quarter figure this bodice adds to
  // each of its four panels (front-left/right, back-left/right).
  const wearingEase = opts.wearingEaseCm / 4;
  const halfChest = m.bust / 4 + wearingEase;
  const armholeDeepen = Math.max(0, style.armholeDeepenCm ?? 0);
  const armholeDepthBase = m.bust / 8 + (opts.gender === "male" ? 10.5 : 9.5);
  const armholeDepth = armholeDepthBase + armholeDeepen; // deepened armhole, visible in the outline
  const shoulderSlope = opts.gender === "male" ? 4.5 : 4.0;
  const neckHalf = m.bust / 14 + (opts.gender === "male" ? 0.8 : 0);
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
  const waistHalf = Math.max(
    halfChest - (m.hip / 4 - m.waist / 4),
    halfChest - 3,
  );

  const cx = Math.max(shoulderHalf, halfChest, hemHalf);
  const midArmY = shoulderSlope + (armholeDepth - shoulderSlope) * 0.55;
  const midArmYBase = shoulderSlope + (armholeDepthBase - shoulderSlope) * 0.55;
  const armCtrlX = (shoulderHalf + halfChest) / 2 - 1; // distance from center

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
  push([cx - hemHalf, len]); // left hem
  push([cx + hemHalf, len]); // right hem (straight = hem)
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

  let dartCm: Pt[] | undefined;
  if (fitted) {
    const dartW = Math.max(1.5, (m.hip / 4 - m.waist / 4) * 0.5);
    dartCm = [
      [cx - dartW, waistY],
      [cx, waistY - 12],
      [cx + dartW, waistY],
    ];
    detailRows.splice(4, 0, { label: t("rows.dart"), value: cm(dartW * 2) });
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
  return {
    piece: {
      id,
      name,
      qty: 1,
      outlineCm: pts,
      curvedSpans: spans,
      grainlineCm,
      dartCm,
      detailRows,
      armholeLenCm: armholeEdgeLenCm,
    },
    armholeEdgeLenCm,
    armholeEdgeBaseLenCm,
    halfChestCm: halfChest,
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
  };
}
