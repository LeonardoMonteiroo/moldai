import type { ExPt, ExSeg, ExportModel, ExportPiece } from "./model";
import { flattenOutlineCm, TOL_CM } from "./dxf";

// "AAMA/ASTM D6673-compatible" DXF (subset). Unlike the generic DXF
// (lib/export/dxf.ts, named layers), this one uses the industry convention:
//
//   - NUMBERED layers with D6673's fixed semantics (layer 0 isn't used):
//       1  piece boundary (+ the piece's system text)
//       6  fold/mirror line (#126 — cut-on-fold, geometry only)
//       7  grainline
//       8  internal lines (not cut) — the dart and its own fold line (#127)
//      13  drill holes (#127)
//   - each piece is a BLOCK, positioned by an INSERT (pieces are blocks in D6673)
//   - R13 version (AC1012) + classic POLYLINE/VERTEX/SEQEND (not LWPOLYLINE,
//     which is R14) — R13 is what D6673 references and maximizes compat with Audaces/Gerber.
//
// #123: layer 1 (the piece boundary) is now the real CUT line — `outline`
// offset outward by the seam allowance — and the net sew line moved to its
// own layer 14, D6673's reserved slot for it (closing that half of #2's
// tracked gap).
// #124: layer 4 (D6673's reserved notch layer) now carries every notch.
// #2 (this pass): the file is now structurally strict — an LTYPE table
// defines CONTINUOUS (every layer references it), a BLOCK_RECORD table
// declares every BLOCK the file INSERTs, every classic POLYLINE carries its
// 10/20/30 dummy point, and TEXT/999 content is restricted to plain ASCII
// (the SVG-inherited "·" separator and any accented character are
// normalized away — a strict importer can choke on either). Drill holes
// (layer 13) were the one remaining tracked gap at that point — #127 closes
// it: every dart's free apex now gets a CIRCLE on layer 13. None of this has
// been opened in a real CAD importer (Audaces/Gerber); "strict" here means
// structurally self-consistent DXF, verified by parsing the emitted file
// back apart in this repo, not verified against a real reader.

const MM = 10; // cm -> mm (1:1)
// #2: the per-piece system text block. The name leads at a larger height;
// each labelled field below it is smaller and stacked one step down.
const TEXT_NAME_H = 8; // mm
const TEXT_FIELD_H = 5; // mm
const TEXT_FIELD_STEP = 6; // mm between field baselines
const f = (n: number) => (Math.round(n * 100) / 100).toString();

// Strict DXF readers can choke on non-ASCII bytes. The "·" separator was
// inherited from the SVG export's own punctuation and isn't safe here;
// replace it with a plain ASCII hyphen, then strip any other accent (NFD +
// drop combining marks) and fall back to "?" for anything still outside
// printable ASCII (e.g. an emoji in a user-typed pattern name).
function asciiSafe(s: string): string {
  return s
    .replace(/·/g, " - ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

// Numbered layers this subset uses, each with a color (code 62).
const LAYERS: [string, number][] = [
  ["1", 7], // boundary (#123: the cut line) — white/black
  ["4", 6], // notches (#124) — magenta
  ["6", 1], // fold/mirror line (#126) — red
  ["7", 5], // grainline — blue
  ["8", 3], // internal (dart + its own fold line, #127) — green
  ["13", 2], // drill holes (#127) — yellow
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
    asciiSafe(
      `MoldAI AAMA/ASTM subset · ${model.patternName} · tam ${model.size} · folga ${model.seamAllowanceCm ?? 0}cm (camada 1 = linha de corte, camada 14 = linha de costura líquida, camada 4 = piques)`,
    ),
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

  // TABLES / LTYPE — every layer below references "CONTINUOUS" (group 6),
  // so the table defining it has to exist for a strict reader to resolve it.
  p(0, "SECTION");
  p(2, "TABLES");
  p(0, "TABLE");
  p(2, "LTYPE");
  p(70, 1);
  p(0, "LTYPE");
  p(2, "CONTINUOUS");
  p(70, 0);
  p(3, "Solid line");
  p(72, 65);
  p(73, 0);
  p(40, 0.0);
  p(0, "ENDTAB");

  // TABLES / LAYER — numbered layers.
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

  // TABLES / BLOCK_RECORD — one entry per BLOCK the ENTITIES section
  // INSERTs below; a strict reader resolves an INSERT's block name through
  // this table, not just the BLOCKS section itself.
  p(0, "TABLE");
  p(2, "BLOCK_RECORD");
  p(70, model.pieces.length);
  for (const piece of model.pieces) {
    p(0, "BLOCK_RECORD");
    p(2, blockName(piece.id));
  }
  p(0, "ENDTAB");

  p(0, "ENDSEC");

  // The piece's local geometry -> DXF-up inside the BLOCK (Y flipped by the
  // piece's height). The INSERT repositions the block on the sheet (also Y-flipped).
  const emitBlockBody = (piece: ExportPiece) => {
    const h = piece.heightCm;
    const X = (x: number) => f(x * MM);
    const Y = (y: number) => f((h - y) * MM); // +Y up inside the block

    // #123/#243: layer 1 is the cut line (the real boundary), layer 14 the
    // net sew line, D6673's reserved slot for it -- the piece's own outer
    // boundary and every internal loop (#243, a genuine cut boundary too,
    // not layer 8) draw this identical closed-POLYLINE pair. #2: the net
    // polyline is emitted ONLY when the allowance actually separates the two
    // lines -- at seamAllowanceCm = 0 (a value STYLE_LIMITS genuinely
    // allows) the cut line IS the net line, and emitting both would hand the
    // importer two coincident closed polylines on different layers: a reader
    // that honours layer 14 would draw a sew line exactly on the cut line,
    // and a cutter reading layer 1 would see a duplicate boundary.
    const emitOutlinePair = (
      outline: { start: ExPt; segs: ExSeg[] },
      cutOutline: { start: ExPt; segs: ExSeg[] },
    ) => {
      const cutVerts = flattenOutlineCm(cutOutline, TOL_CM);
      p(0, "POLYLINE");
      p(8, "1");
      p(66, 1);
      p(10, 0); // dummy point (always 0,0,0) — classic POLYLINE's own vertices are the VERTEX entities below
      p(20, 0);
      p(30, 0);
      p(70, 1); // 70=1 closed
      for (const v of cutVerts) {
        p(0, "VERTEX");
        p(8, "1");
        p(10, X(v.x));
        p(20, Y(v.y));
      }
      p(0, "SEQEND");
      p(8, "1");

      if ((model.seamAllowanceCm ?? 0) > 0) {
        const netVerts = flattenOutlineCm(outline, TOL_CM);
        p(0, "POLYLINE");
        p(8, "14");
        p(66, 1);
        p(10, 0); // dummy point, see the cut-line POLYLINE above
        p(20, 0);
        p(30, 0);
        p(70, 1); // 70=1 closed
        for (const v of netVerts) {
          p(0, "VERTEX");
          p(8, "14");
          p(10, X(v.x));
          p(20, Y(v.y));
        }
        p(0, "SEQEND");
        p(8, "14");
      }
    };
    emitOutlinePair(piece.outline, piece.cutOutline);
    for (const loop of piece.internalLoops ?? []) {
      emitOutlinePair(loop.outline, loop.cutOutline);
    }

    // #2: the piece's system text, on layer 1. Structured into one labelled
    // field per line instead of the single "NAME NX" string this used to
    // emit: a cut piece leaves the sheet and has to carry its own identity,
    // and the size/allowance it was drafted at is exactly what distinguishes
    // two otherwise identical outlines. DXF TEXT is single-line, so the block
    // is several stacked TEXT entities rather than one multi-line entity
    // (MTEXT is R13+ but far less uniformly supported by pattern CAD).
    const nameY = Math.max(0, h * MM - TEXT_NAME_H);
    p(0, "TEXT");
    p(8, "1");
    p(10, X(0));
    p(20, f(nameY));
    p(40, TEXT_NAME_H);
    p(1, asciiSafe(piece.name.toUpperCase()));

    const fields: [string, string][] = [
      ["QTD", `${piece.qty}X`],
      ["TAM", `${model.size}`],
    ];
    // Absent only on a hand-built fixture; buildExportModel always sets it.
    if (model.garmentType)
      fields.push(["MODELO", model.garmentType.toUpperCase()]);
    fields.push(["FOLGA", `${model.seamAllowanceCm ?? 0}CM`]);
    fields.forEach(([label, value], i) => {
      p(0, "TEXT");
      p(8, "1");
      p(10, X(0));
      p(20, f(Math.max(0, nameY - (i + 1) * TEXT_FIELD_STEP)));
      p(40, TEXT_FIELD_H);
      p(1, asciiSafe(`${label}: ${value}`));
    });

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
      p(10, 0); // dummy point, see the cut-line POLYLINE above
      p(20, 0);
      p(30, 0);
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

    // #127: a dart's own fold line -> LINE on layer 8, the same "internal,
    // not cut" semantics as the dart it belongs to.
    for (const [a, b] of piece.internalFoldLines ?? []) {
      p(0, "LINE");
      p(8, "8");
      p(10, X(a.x));
      p(20, Y(a.y));
      p(11, X(b.x));
      p(21, Y(b.y));
    }

    // #244: a pleat's own placement/stitch line -> open POLYLINE on layer
    // 8, the same "internal, not cut" semantics as the dart/fold line above.
    for (const pleat of piece.pleats ?? []) {
      if (pleat.length < 2) continue;
      p(0, "POLYLINE");
      p(8, "8");
      p(66, 1);
      p(10, 0); // dummy point, see the cut-line POLYLINE above
      p(20, 0);
      p(30, 0);
      p(70, 0);
      for (const pt of pleat) {
        p(0, "VERTEX");
        p(8, "8");
        p(10, X(pt.x));
        p(20, Y(pt.y));
      }
      p(0, "SEQEND");
      p(8, "8");
    }

    // #344: a style line's own cut geometry (the sleeve's own placket
    // opening) -> open POLYLINE, same layer 8 as the dart/fold/pleat marks
    // above -- D6673's fixed numbered-layer set has no reserved slot for an
    // internal SLIT distinct from a placement mark, so layer 8 ("internal
    // lines (not cut)") is the closest documented fit, even though this one
    // genuinely IS meant to be cut. A known simplification of this strict
    // subset, not a claim this is D6673-verified for a real cut slit.
    for (const styleLine of piece.styleLines ?? []) {
      if (styleLine.length < 2) continue;
      p(0, "POLYLINE");
      p(8, "8");
      p(66, 1);
      p(10, 0); // dummy point, see the cut-line POLYLINE above
      p(20, 0);
      p(30, 0);
      p(70, 0);
      for (const pt of styleLine) {
        p(0, "VERTEX");
        p(8, "8");
        p(10, X(pt.x));
        p(20, Y(pt.y));
      }
      p(0, "SEQEND");
      p(8, "8");
    }

    // #127: a drill hole -> CIRCLE on layer 13, D6673's reserved semantics
    // for it — closes the drill-hole half of issue #2.
    for (const hole of piece.drillHoles ?? []) {
      p(0, "CIRCLE");
      p(8, "13");
      p(10, X(hole.at.x));
      p(20, Y(hole.at.y));
      p(40, f(hole.rCm * MM));
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
