import { Measurements } from "@/lib/measurements";
import { DetailRow, GarmentStyle, Gender } from "@/lib/types";
import { DraftedPiece, Pt } from "./core";
import type { Translate } from "@/lib/i18n/translate";

const cm = (v: number) => `${v.toFixed(1).replace(".", ",")} cm`;

export interface BlockOpts {
  gender: Gender;
  knit: boolean;
  lengthCm: number;
}

function defaultOpts(m: Measurements): BlockOpts {
  return {
    gender: "female",
    knit: false,
    lengthCm: m.backLength + m.hipHeight + 5,
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
): { piece: DraftedPiece; armholeLenCm: number; armholeBaseLenCm: number } {
  const ease = style.seamAllowanceCm ?? 1;
  const wearingEase = opts.knit ? 0 : 2;
  const halfChest = m.bust / 4 + wearingEase;
  const armholeDeepen = Math.max(0, style.armholeDeepenCm ?? 0);
  const armholeDepthBase = m.bust / 8 + (opts.gender === "male" ? 10.5 : 9.5);
  const armholeDepth = armholeDepthBase + armholeDeepen; // deepened armhole, visible in the outline
  const shoulderSlope = opts.gender === "male" ? 4.5 : 4.0;
  const neckHalf = m.bust / 14 + (opts.gender === "male" ? 0.8 : 0);
  const shoulderHalf = m.shoulder;
  const len = opts.lengthCm;
  const hemHalf = m.hip / 4 + wearingEase;

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
  if (fitted) push([cx - waistHalf, waistY]); // left waist
  push([cx - hemHalf, len]); // left hem
  push([cx + hemHalf, len]); // right hem (straight = hem)
  if (fitted) push([cx + waistHalf, waistY]); // right waist
  const uaR = push([cx + halfChest, armholeDepth]); // right underarm
  push([cx + armCtrlX, midArmY]); // right armhole ctrl
  const shR = push([cx + shoulderHalf, shoulderSlope]); // right shoulder
  spans.push([uaR, shR]); // right armhole (curved)
  const hpsR = push([cx + neckHalf, 0]); // right HPS (straight shR->hpsR)
  push([cx + neckHalf * 0.6, neckDrop * 0.55]); // right neckline ctrl
  spans.push([hpsR, pts.length]); // right neckline + closing (curved)

  const armholeLenCm =
    Math.hypot(halfChest - shoulderHalf, armholeDepth - shoulderSlope) * 1.08;
  // "Base" armhole (without the adjustment) — this is what the sleeve cap uses
  // while it hasn't been refit; the divergence between this and armholeLenCm
  // is what seamCheck detects.
  const armholeBaseLenCm =
    Math.hypot(halfChest - shoulderHalf, armholeDepthBase - shoulderSlope) *
    1.08;

  const detailRows: DetailRow[] = [
    { label: t("rows.seamAllowance"), value: cm(ease) },
    { label: t("rows.chestWidth"), value: cm(halfChest * 2) },
    { label: t("rows.length"), value: cm(len) },
    { label: t("rows.armhole"), value: cm(armholeLenCm) },
    {
      label: t("rows.neckline"),
      value: t("neckline." + (style.neckline ?? "straight")),
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
      armholeLenCm,
    },
    armholeLenCm,
    armholeBaseLenCm,
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
  return {
    front: f.piece,
    back: c.piece,
    armholeLenCm: f.armholeLenCm,
    armholeBaseLenCm: f.armholeBaseLenCm,
  };
}
