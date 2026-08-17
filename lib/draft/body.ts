import { Measurements } from "@/lib/measurements";
import { DetailRow, GarmentStyle, Gender, Neckline } from "@/lib/types";
import { DraftedPiece, Pt } from "./core";

const cm = (v: number) => `${v.toFixed(1).replace(".", ",")} cm`;

const NECKLINE_LABELS_PT: Record<Neckline, string> = {
  straight: "reto",
  V: "V",
  round: "redondo",
};

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

// Traça uma peça de corpo inteira (meia-peça espelhada em torno de cx) com
// curvas só em neckline e cava. `frontish` controla a profundidade do neckline.
function bodice(
  m: Measurements,
  style: GarmentStyle,
  opts: BlockOpts,
  id: string,
  name: string,
  frontish: boolean,
): { piece: DraftedPiece; armholeLenCm: number; armholeBaseLenCm: number } {
  const folga = style.seamAllowanceCm ?? 1;
  const folgaVestir = opts.knit ? 0 : 2;
  const halfChest = m.bust / 4 + folgaVestir;
  const cavaAjuste = Math.max(0, style.armholeDeepenCm ?? 0);
  const armholeDepthBase = m.bust / 8 + (opts.gender === "male" ? 10.5 : 9.5);
  const armholeDepth = armholeDepthBase + cavaAjuste; // cava aprofundada visível no contorno
  const caimentoOmbro = opts.gender === "male" ? 4.5 : 4.0;
  const neckHalf = m.bust / 14 + (opts.gender === "male" ? 0.8 : 0);
  const shoulderHalf = m.shoulder;
  const len = opts.lengthCm;
  const hemHalf = m.hip / 4 + folgaVestir;

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
  const midArmY = caimentoOmbro + (armholeDepth - caimentoOmbro) * 0.55;
  const armCtrlX = (shoulderHalf + halfChest) / 2 - 1; // distância do centro

  const pts: Pt[] = [];
  const spans: [number, number][] = [];
  const push = (p: Pt) => (pts.push(p), pts.length - 1);

  const cf = push([cx, neckDrop]); // centro neckline
  push([cx - neckHalf * 0.6, neckDrop * 0.55]); // ctrl neckline esq
  const hpsL = push([cx - neckHalf, 0]); // HPS esq
  spans.push([cf, hpsL]); // neckline esq (curvo)
  const shL = push([cx - shoulderHalf, caimentoOmbro]); // ombro esq (reta hpsL->shL)
  push([cx - armCtrlX, midArmY]); // ctrl cava esq
  const uaL = push([cx - halfChest, armholeDepth]); // axila esq
  spans.push([shL, uaL]); // cava esq (curva)
  if (fitted) push([cx - waistHalf, waistY]); // cintura esq
  push([cx - hemHalf, len]); // barra esq
  push([cx + hemHalf, len]); // barra dir (reta = barra)
  if (fitted) push([cx + waistHalf, waistY]); // cintura dir
  const uaR = push([cx + halfChest, armholeDepth]); // axila dir
  push([cx + armCtrlX, midArmY]); // ctrl cava dir
  const shR = push([cx + shoulderHalf, caimentoOmbro]); // ombro dir
  spans.push([uaR, shR]); // cava dir (curva)
  const hpsR = push([cx + neckHalf, 0]); // HPS dir (reta shR->hpsR)
  push([cx + neckHalf * 0.6, neckDrop * 0.55]); // ctrl neckline dir
  spans.push([hpsR, pts.length]); // neckline dir + fechamento (curvo)

  const armholeLenCm =
    Math.hypot(halfChest - shoulderHalf, armholeDepth - caimentoOmbro) * 1.08;
  // Cava "base" (sem o ajuste) — é a que a copa da manga usa enquanto não é refeita;
  // a divergência entre esta e armholeLenCm é o que o seamCheck detecta.
  const armholeBaseLenCm =
    Math.hypot(halfChest - shoulderHalf, armholeDepthBase - caimentoOmbro) *
    1.08;

  const detailRows: DetailRow[] = [
    { label: "Folga de costura", value: cm(folga) },
    { label: "Largura (tórax)", value: cm(halfChest * 2) },
    { label: "Comprimento", value: cm(len) },
    { label: "Cava", value: cm(armholeLenCm) },
    {
      label: "Decote",
      value: NECKLINE_LABELS_PT[style.neckline ?? "straight"],
    },
    { label: "Fio", value: "reto" },
  ];

  let dartCm: Pt[] | undefined;
  if (fitted) {
    const dartW = Math.max(1.5, (m.hip / 4 - m.waist / 4) * 0.5);
    dartCm = [
      [cx - dartW, waistY],
      [cx, waistY - 12],
      [cx + dartW, waistY],
    ];
    detailRows.splice(4, 0, { label: "Pence", value: cm(dartW * 2) });
  }

  const grainlineCm: [Pt, Pt] = [
    [cx, 3],
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
  opts: BlockOpts = defaultOpts(m),
) {
  const f = bodice(m, style, opts, "body-front", "Frente", true);
  const c = bodice(m, style, opts, "body-back", "Costas", false);
  return {
    frente: f.piece,
    costas: c.piece,
    armholeLenCm: f.armholeLenCm,
    armholeBaseLenCm: f.armholeBaseLenCm,
  };
}
