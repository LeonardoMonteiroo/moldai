import type { ExportModel, ExportPiece } from "./model";
import { flattenOutlineCm, TOL_CM } from "./dxf";

// "AAMA/ASTM D6673-compatible" DXF (subset). Unlike the generic DXF
// (lib/export/dxf.ts, named layers), this one uses the industry convention:
//
//   - NUMBERED layers with D6673's fixed semantics (layer 0 isn't used):
//       1  piece boundary (+ the piece's system text)
//       6  fold/mirror line (#126 — cut-on-fold, geometry only)
//       7  grainline
//       8  internal lines (not cut) — we use it for the dart
//   - each piece is a BLOCK, positioned by an INSERT (pieces are blocks in D6673)
//   - R13 version (AC1012) + classic POLYLINE/VERTEX/SEQEND (not LWPOLYLINE,
//     which is R14) — R13 is what D6673 references and maximizes compat with Audaces/Gerber.
//
// #123: layer 1 (the piece boundary) is now the real CUT line — `outline`
// offset outward by the seam allowance — and the net sew line moved to its
// own layer 14, D6673's reserved slot for it (closing that half of #2's
// tracked gap).
// #124: layer 4 (D6673's reserved notch layer) now carries every notch --
// this is still an honest SUBSET: drill holes (13) are NOT emitted, MoldAI
// doesn't model them. The full strict AAMA/ASTM (structured system text,
// block records, those derived elements) remains a later "Phase 2.5".

const MM = 10; // cm -> mm (1:1)
const f = (n: number) => (Math.round(n * 100) / 100).toString();

// Numbered layers this subset uses, each with a color (code 62).
const LAYERS: [string, number][] = [
  ["1", 7], // boundary (#123: the cut line) — white/black
  ["4", 6], // notches (#124) — magenta
  ["6", 1], // fold/mirror line (#126) — red
  ["7", 5], // grainline — blue
  ["8", 3], // internal (dart) — green
  ["14", 4], // sew line (#123: the net line) — cyan
];

// Valid DXF BLOCK name: alphanumeric/_/-/$ only; the prefix guarantees a leading letter.
function blockName(id: string): string {
  return "PIECE_" + id.toUpperCase().replace(/[^A-Z0-9_$-]/g, "_");
}

export function toDxfAama(model: ExportModel): string {
  const L: (string | number)[] = [];
  const p = (code: number, value: string | number) => {
    L.push(code, value);
  };

  p(
    999,
    `MoldAI AAMA/ASTM subset · ${model.patternName} · tam ${model.size} · folga ${model.seamAllowanceCm ?? 0}cm (camada 1 = linha de corte, camada 14 = linha de costura líquida, camada 4 = piques)`,
  );

  // HEADER — R13, millimeters, metric.
  p(0, "SECTION");
  p(2, "HEADER");
  p(9, "$ACADVER");
  p(1, "AC1012"); // R13 — D6673's base
  p(9, "$INSUNITS");
  p(70, 4); // 4 = millimeters
  p(9, "$MEASUREMENT");
  p(70, 1); // 1 = metric
  p(0, "ENDSEC");

  // TABLES / LAYER — numbered layers.
  p(0, "SECTION");
  p(2, "TABLES");
  p(0, "TABLE");
  p(2, "LAYER");
  p(70, LAYERS.length);
  for (const [name, color] of LAYERS) {
    p(0, "LAYER");
    p(2, name);
    p(70, 0);
    p(62, color);
    p(6, "CONTINUOUS");
  }
  p(0, "ENDTAB");
  p(0, "ENDSEC");

  // The piece's local geometry -> DXF-up inside the BLOCK (Y flipped by the
  // piece's height). The INSERT repositions the block on the sheet (also Y-flipped).
  const emitBlockBody = (piece: ExportPiece) => {
    const h = piece.heightCm;
    const X = (x: number) => f(x * MM);
    const Y = (y: number) => f((h - y) * MM); // +Y up inside the block

    // #123: layer 1 is the cut line (the real piece boundary) -- closed
    // POLYLINE, same flattening helper the generic DXF uses.
    const cutVerts = flattenOutlineCm(piece.cutOutline, TOL_CM);
    p(0, "POLYLINE");
    p(8, "1");
    p(66, 1);
    p(70, 1); // 70=1 closed
    for (const v of cutVerts) {
      p(0, "VERTEX");
      p(8, "1");
      p(10, X(v.x));
      p(20, Y(v.y));
    }
    p(0, "SEQEND");
    p(8, "1");

    // #123: layer 14 is the net sew line, D6673's reserved slot for it.
    const netVerts = flattenOutlineCm(piece.outline, TOL_CM);
    p(0, "POLYLINE");
    p(8, "14");
    p(66, 1);
    p(70, 1); // 70=1 closed
    for (const v of netVerts) {
      p(0, "VERTEX");
      p(8, "14");
      p(10, X(v.x));
      p(20, Y(v.y));
    }
    p(0, "SEQEND");
    p(8, "14");

    // name/qty as the piece's system text, on layer 1
    p(0, "TEXT");
    p(8, "1");
    p(10, X(0));
    p(20, f(Math.max(0, h * MM - 8)));
    p(40, 8); // text height in mm
    p(1, `${piece.name.toUpperCase()} ${piece.qty}X`);

    // fold/mirror line -> LINE on layer 6 (#126, ASTM D6673's reserved
    // semantics for it) — geometry only, matching the grainline's own
    // no-text precedent on layer 7.
    if (piece.fold) {
      const [a, b] = piece.fold;
      p(0, "LINE");
      p(8, "6");
      p(10, X(a.x));
      p(20, Y(a.y));
      p(11, X(b.x));
      p(21, Y(b.y));
    }

    // #124: notches -> LINE on layer 4, D6673's reserved semantics for them.
    for (const notch of piece.notches ?? []) {
      p(0, "LINE");
      p(8, "4");
      p(10, X(notch.outer.x));
      p(20, Y(notch.outer.y));
      p(11, X(notch.inner.x));
      p(21, Y(notch.inner.y));
    }

    // grainline -> LINE on layer 7
    if (piece.grainline) {
      const [a, b] = piece.grainline;
      p(0, "LINE");
      p(8, "7");
      p(10, X(a.x));
      p(20, Y(a.y));
      p(11, X(b.x));
      p(21, Y(b.y));
    }

    // dart -> open POLYLINE on layer 8 (internal line, not cut). #122: a
    // fitted panel carries two darts, symmetric about its own centre line.
    for (const dart of piece.darts ?? []) {
      if (dart.length < 3) continue;
      p(0, "POLYLINE");
      p(8, "8");
      p(66, 1);
      p(70, 0);
      for (const d of dart) {
        p(0, "VERTEX");
        p(8, "8");
        p(10, X(d.x));
        p(20, Y(d.y));
      }
      p(0, "SEQEND");
      p(8, "8");
    }
  };

  // BLOCKS — one block definition per piece.
  p(0, "SECTION");
  p(2, "BLOCKS");
  for (const piece of model.pieces) {
    const bn = blockName(piece.id);
    p(0, "BLOCK");
    p(8, "0");
    p(2, bn);
    p(70, 0);
    p(10, 0);
    p(20, 0);
    p(30, 0);
    p(3, bn);
    emitBlockBody(piece);
    p(0, "ENDBLK");
    p(8, "0");
  }
  p(0, "ENDSEC");

  // ENTITIES — one INSERT per block, positioned on the sheet (Y flipped).
  p(0, "SECTION");
  p(2, "ENTITIES");
  for (const piece of model.pieces) {
    const ix = piece.originCm.x;
    const iy = model.sheetHeightCm - piece.originCm.y - piece.heightCm;
    p(0, "INSERT");
    p(8, "0");
    p(2, blockName(piece.id));
    p(10, f(ix * MM));
    p(20, f(iy * MM));
    p(30, 0);
  }
  p(0, "ENDSEC");

  p(0, "EOF");
  return L.join("\n");
}
