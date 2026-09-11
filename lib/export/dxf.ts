import type { ExPt, ExSeg, ExportModel } from "./model";
import { flattenCubic, TOL_CM } from "./bezier";

// Re-exported so existing importers (dxf.test.ts, dxf-aama.ts, pdf.ts) don't
// need to know the flattening helper moved to its own leaf module (#123 --
// lib/export/offset.ts needs it too, without importing this file's
// ExportModel-typed surface).
export { flattenCubic, TOL_CM };

// Outline flattened to cm: line -> 1 vertex, cubic -> flattenCubic's points.
// Closed; drops the final vertex if it coincides with the first (dedup).
export function flattenOutlineCm(
  outline: { start: ExPt; segs: ExSeg[] },
  tolCm: number,
): ExPt[] {
  const verts: ExPt[] = [outline.start];
  let prev = outline.start;
  for (const s of outline.segs) {
    if (s.kind === "line") {
      verts.push(s.to);
      prev = s.to;
    } else {
      verts.push(...flattenCubic(prev, s.c1, s.c2, s.to, tolCm));
      prev = s.to;
    }
  }
  const first = verts[0];
  const last = verts[verts.length - 1];
  if (
    verts.length > 1 &&
    Math.abs(first.x - last.x) < 1e-6 &&
    Math.abs(first.y - last.y) < 1e-6
  ) {
    verts.pop();
  }
  return verts;
}

const MM = 10; // cm -> mm (1:1)
const f = (n: number) => (Math.round(n * 100) / 100).toString();
// #123: CONTORNO is now the offset cut line (the real piece boundary a
// plotter/cutter follows) instead of the net stitch line; COSTURA carries
// that net line, kept for anyone who still wants it (e.g. tracing seams by
// hand). Every other layer is unchanged.
const LAYERS = [
  "CONTORNO",
  "COSTURA",
  "INTERNO",
  "GRAINLINE",
  "TEXTO",
  "DOBRA",
  "PIQUE", // #124
] as const;

export function toDxf(model: ExportModel): string {
  const L: (string | number)[] = [];
  const p = (code: number, value: string | number) => {
    L.push(code, value);
  };

  // native DXF comment (code 999) — none of the "--" issue an XML comment has
  p(
    999,
    `MoldAI · ${model.patternName} · tam ${model.size} · folga ${model.seamAllowanceCm ?? 0}cm (CONTORNO = linha de corte, COSTURA = linha de costura líquida)`,
  );

  // HEADER
  p(0, "SECTION");
  p(2, "HEADER");
  p(9, "$ACADVER");
  p(1, "AC1014"); // R14 — required for LWPOLYLINE in strict readers
  p(9, "$INSUNITS");
  p(70, 4); // 4 = millimeters
  p(9, "$MEASUREMENT");
  p(70, 1); // 1 = metric
  p(0, "ENDSEC");

  // TABLES / LAYER
  p(0, "SECTION");
  p(2, "TABLES");
  p(0, "TABLE");
  p(2, "LAYER");
  p(70, LAYERS.length);
  for (const name of LAYERS) {
    p(0, "LAYER");
    p(2, name);
    p(70, 0);
    p(62, 7);
    p(6, "CONTINUOUS");
  }
  p(0, "ENDTAB");
  p(0, "ENDSEC");

  // ENTITIES
  p(0, "SECTION");
  p(2, "ENTITIES");
  for (const piece of model.pieces) {
    const ox = piece.originCm.x;
    const oy = piece.originCm.y;
    const X = (x: number) => f((ox + x) * MM);
    // Y flipped: DXF has +Y up; ExportModel has +Y down.
    const Y = (y: number) => f((model.sheetHeightCm - (oy + y)) * MM);

    // #123/#243: CONTORNO is the cut line (the real boundary); COSTURA is
    // the net stitch line -- the piece's own outer boundary and every
    // internal loop (#243, a genuine cut boundary too, not INTERNO) draw
    // this identical LWPOLYLINE pair.
    const emitOutlinePair = (
      outline: { start: ExPt; segs: ExSeg[] },
      cutOutline: { start: ExPt; segs: ExSeg[] },
    ) => {
      const cutVerts = flattenOutlineCm(cutOutline, TOL_CM);
      p(0, "LWPOLYLINE");
      p(8, "CONTORNO");
      p(90, cutVerts.length);
      p(70, 1);
      for (const v of cutVerts) {
        p(10, X(v.x));
        p(20, Y(v.y));
      }

      const netVerts = flattenOutlineCm(outline, TOL_CM);
      p(0, "LWPOLYLINE");
      p(8, "COSTURA");
      p(90, netVerts.length);
      p(70, 1);
      for (const v of netVerts) {
        p(10, X(v.x));
        p(20, Y(v.y));
      }
    };
    emitOutlinePair(piece.outline, piece.cutOutline);
    for (const loop of piece.internalLoops ?? []) {
      emitOutlinePair(loop.outline, loop.cutOutline);
    }

    if (piece.grainline) {
      const [a, b] = piece.grainline;
      p(0, "LINE");
      p(8, "GRAINLINE");
      p(10, X(a.x));
      p(20, Y(a.y));
      p(11, X(b.x));
      p(21, Y(b.y));
    }

    if (piece.fold) {
      // #126: geometry-only, like GRAINLINE above -- the "dobra" label is
      // reserved for the printed formats (svg/pdf); layer name is the
      // semantic marker here.
      const [a, b] = piece.fold;
      p(0, "LINE");
      p(8, "DOBRA");
      p(10, X(a.x));
      p(20, Y(a.y));
      p(11, X(b.x));
      p(21, Y(b.y));
    }

    // #124: one LINE per notch (outer -> inner), geometry-only like the
    // grainline/fold above.
    for (const notch of piece.notches ?? []) {
      p(0, "LINE");
      p(8, "PIQUE");
      p(10, X(notch.outer.x));
      p(20, Y(notch.outer.y));
      p(11, X(notch.inner.x));
      p(21, Y(notch.inner.y));
    }

    // #87/#122: open (0), not closed (1) -- matches the AAMA exporter's own
    // layer-8 open polyline and pattern-making convention. A closed dart
    // drew a fourth segment along the base that isn't part of the dart. A
    // fitted panel carries two darts, symmetric about its own centre line.
    for (const dart of piece.darts ?? []) {
      if (dart.length < 3) continue;
      p(0, "LWPOLYLINE");
      p(8, "INTERNO");
      p(90, dart.length);
      p(70, 0);
      for (const d of dart) {
        p(10, X(d.x));
        p(20, Y(d.y));
      }
    }

    // #127: a dart's own fold line -- INTERNO, same layer as the dart it
    // belongs to.
    for (const [a, b] of piece.internalFoldLines ?? []) {
      p(0, "LINE");
      p(8, "INTERNO");
      p(10, X(a.x));
      p(20, Y(a.y));
      p(11, X(b.x));
      p(21, Y(b.y));
    }

    // #244: a pleat's own placement/stitch line -- INTERNO, the same
    // "internal, not cut" layer every other construction mark here uses.
    for (const pleat of piece.pleats ?? []) {
      if (pleat.length < 2) continue;
      p(0, "LWPOLYLINE");
      p(8, "INTERNO");
      p(90, pleat.length);
      p(70, 0);
      for (const pt of pleat) {
        p(10, X(pt.x));
        p(20, Y(pt.y));
      }
    }

    // #127: a drill hole -- both a POINT (exact centre, machine-readable)
    // and a CIRCLE (radius, for visual reference), same layer.
    for (const hole of piece.drillHoles ?? []) {
      p(0, "POINT");
      p(8, "INTERNO");
      p(10, X(hole.at.x));
      p(20, Y(hole.at.y));
      p(0, "CIRCLE");
      p(8, "INTERNO");
      p(10, X(hole.at.x));
      p(20, Y(hole.at.y));
      p(40, f(hole.rCm * MM));
    }

    p(0, "TEXT");
    p(8, "TEXTO");
    p(10, X(piece.outline.start.x));
    p(20, Y(piece.heightCm));
    p(40, 6); // text height in mm
    p(1, `${piece.name.toUpperCase()} · ${piece.qty}x`);
  }
  p(0, "ENDSEC");

  p(0, "EOF");
  return L.join("\n");
}
