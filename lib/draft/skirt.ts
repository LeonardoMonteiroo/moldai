import { Measurements } from "@/lib/measurements";
import { DetailRow, GarmentStyle, SkirtSilhouette } from "@/lib/types";
import { DraftedPiece, Pt } from "./core";
import type { Translate } from "@/lib/i18n/translate";

const cm = (v: number) => `${v.toFixed(1).replace(".", ",")} cm`;

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
): { pts: Pt[]; r: number } {
  const r = waist / fullSweep; // inner radius (waist)
  const R = r + length; // outer radius (hem)
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
): DraftedPiece {
  const silhueta: SkirtSilhouette = style.skirt ?? "straight";
  const ease = style.seamAllowanceCm ?? 1;
  const length = style.skirtLengthCm ?? m.skirtLength;
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
    const panels = silhueta === "half-circle" ? 1 : 2;
    const { pts, r } = radialSkirt(m.waist, length, fullSweep, panels);
    detailRows.splice(1, 0, { label: t("rows.waistRadius"), value: cm(r) });
    // shift to x>=0
    const minX = Math.min(...pts.map((p) => p[0]));
    const outlineCm = pts.map(([x, y]) => [x - minX, y] as Pt);
    const cxTop = -minX; // approximation of the top center
    const steps = 12; // same as used in radialSkirt
    const waistSpan: [number, number] = [0, steps];
    const hemSpan: [number, number] = [steps + 1, 2 * steps + 1];
    return {
      id: "skirt",
      name: t("pieceNames.skirt"),
      qty: panels,
      outlineCm,
      curvedSpans: [waistSpan, hemSpan],
      grainlineCm: [
        [cxTop, 4],
        [cxTop, length],
      ],
      detailRows,
    };
  }

  // straight / A-line: trapezoid (¼ hip at the waist, hem equal or wider)
  const waistHalf = m.hip / 4 + ease; // uses hip as the panel's reference width
  const flare = silhueta === "a-line" ? 12 : 0;
  const hemHalf = waistHalf + flare;
  const outlineCm: Pt[] = [
    [waistHalf === hemHalf ? 0 : hemHalf - waistHalf, 0],
    [hemHalf - waistHalf + waistHalf * 2, 0],
    [hemHalf * 2, length],
    [0, length],
  ];
  detailRows.splice(1, 0, {
    label: t("rows.waistPanel"),
    value: cm(waistHalf * 2),
  });
  return {
    id: "skirt",
    name: t("pieceNames.skirt"),
    qty: 2,
    outlineCm,
    grainlineCm: [
      [hemHalf, 4],
      [hemHalf, length - 4],
    ],
    detailRows,
  };
}
