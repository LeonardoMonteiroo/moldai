import type { ExPt, ExportModel, ExportPiece } from "./model";
import { flattenOutlineCm, TOL_CM } from "./dxf";
import { planRollStrips, stripIntersectsBBox, type RollPlan } from "./strips";

// #135: one dialect -- standard HPGL/2, plotter units of 1016/inch
// (0.025mm, the format's own native resolution). Written to the spec and
// verified structurally (valid HPGL syntax, coordinates round-trip to the
// input cm within 0.02cm, strip count matches the roll-splitting math,
// distinguishable pens are present) -- never plotted on a physical device,
// since no plotter or vendor software was available in this environment.
// The export menu badges this format 'beta', the same marker formatDxfAama
// uses for its own known gap, and states the untested-hardware caveat
// plus that piece-name (LB) text renders in whatever font the physical
// plotter has loaded, not a specific typeface. Molde.me/Audaces each ship
// their own vendor variants (.plt/.hpgl/.dmpl dialect quirks) this file
// does not attempt to reproduce -- one honestly-labelled variant beats
// three untested ones (issue #135's own decision).
const UNITS_PER_CM = 1016 / 2.54; // exactly 400

// #135: "Grainline, piece name, notches and the cut line are emitted on
// distinguishable pen selections" -- one pen number per semantic layer,
// mirroring the DXF layer split (CONTORNO/COSTURA/GRAINLINE/DOBRA/PIQUE/
// INTERNO/TEXTO) so a plotter with physically different pens loaded (or a
// viewer that colors by pen) can tell them apart the same way a DXF/AAMA
// viewer tells layers apart.
export const PLT_PENS = {
  cut: 1,
  net: 2,
  grainline: 3,
  fold: 4,
  dart: 5,
  notch: 6,
  text: 7,
  drillHole: 8, // #127
} as const;

const u = (cm: number) => Math.round(cm * UNITS_PER_CM);

function outlineAbsBBoxCm(piece: ExportPiece) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  const consider = (p: ExPt) => {
    minX = Math.min(minX, piece.originCm.x + p.x);
    maxX = Math.max(maxX, piece.originCm.x + p.x);
    minY = Math.min(minY, piece.originCm.y + p.y);
    maxY = Math.max(maxY, piece.originCm.y + p.y);
  };
  consider(piece.cutOutline.start);
  for (const s of piece.cutOutline.segs) {
    consider(s.to);
    if (s.kind === "cubic") {
      consider(s.c1);
      consider(s.c2);
    }
  }
  return { minX, minY, maxX, maxY };
}

export interface PltOptions {
  // Roll width in cm. Omitted, zero, or >= the sheet's own width -> a
  // single strip (no splitting), matching the pdf-single/pdf-a4 default.
  rollWidthCm?: number;
}

export interface PltPlan {
  rollPlan: RollPlan;
}

// #135: exposed so a caller (the export screen) can show the strip count
// before committing to a download, and so a test can assert "a pattern
// wider than the roll produces the expected strip count" against the same
// planning function toPlt itself uses.
export function planPltStrips(
  model: ExportModel,
  rollWidthCm?: number,
): PltPlan {
  const w = rollWidthCm && rollWidthCm > 0 ? rollWidthCm : model.sheetWidthCm;
  return { rollPlan: planRollStrips(model.sheetWidthCm, w) };
}

export function toPlt(model: ExportModel, opts: PltOptions = {}): string {
  const { rollPlan } = planPltStrips(model, opts.rollWidthCm);
  const bboxes = model.pieces.map((p) => outlineAbsBBoxCm(p));

  const lines: string[] = ["IN;"];

  rollPlan.strips.forEach((strip, stripIdx) => {
    if (stripIdx > 0) lines.push("PG;"); // page/plot advance between strips

    model.pieces.forEach((piece, pieceIdx) => {
      if (
        !stripIntersectsBBox(
          strip.originCm.x,
          rollPlan.rollWidthCm,
          bboxes[pieceIdx],
        )
      ) {
        return;
      }

      const X = (x: number) => u(piece.originCm.x + x - strip.originCm.x);
      // Y flipped: HPGL/2 has +Y up; ExportModel has +Y down.
      const Y = (y: number) => u(model.sheetHeightCm - (piece.originCm.y + y));

      const emitPolyline = (pen: number, pts: ExPt[]) => {
        if (pts.length === 0) return;
        lines.push(`SP${pen};`);
        lines.push(`PU${X(pts[0].x)},${Y(pts[0].y)};`);
        for (let i = 1; i < pts.length; i++) {
          lines.push(`PD${X(pts[i].x)},${Y(pts[i].y)};`);
        }
        // close the loop back to the start
        lines.push(`PD${X(pts[0].x)},${Y(pts[0].y)};`);
      };

      const emitLine = (pen: number, a: ExPt, b: ExPt) => {
        lines.push(`SP${pen};`);
        lines.push(`PU${X(a.x)},${Y(a.y)};`);
        lines.push(`PD${X(b.x)},${Y(b.y)};`);
      };

      // #123: the cut line (with seam allowance) is the real boundary a
      // plotter/cutter follows; the net stitch line is included too, on its
      // own pen, for anyone tracing seams by hand.
      emitPolyline(PLT_PENS.cut, flattenOutlineCm(piece.cutOutline, TOL_CM));
      emitPolyline(PLT_PENS.net, flattenOutlineCm(piece.outline, TOL_CM));

      // #243: an internal loop (hole) is a genuine cut boundary too -- the
      // same two pens (cut/net) as the piece's own outer boundary above.
      for (const loop of piece.internalLoops ?? []) {
        emitPolyline(PLT_PENS.cut, flattenOutlineCm(loop.cutOutline, TOL_CM));
        emitPolyline(PLT_PENS.net, flattenOutlineCm(loop.outline, TOL_CM));
      }

      if (piece.grainline) {
        const [a, b] = piece.grainline;
        emitLine(PLT_PENS.grainline, a, b);
      }
      if (piece.fold) {
        const [a, b] = piece.fold;
        emitLine(PLT_PENS.fold, a, b);
      }
      // #87/#122: open, not closed -- matches the AAMA/DXF exporters' own
      // open dart polyline.
      for (const dart of piece.darts ?? []) {
        if (dart.length < 2) continue;
        lines.push(`SP${PLT_PENS.dart};`);
        lines.push(`PU${X(dart[0].x)},${Y(dart[0].y)};`);
        for (let i = 1; i < dart.length; i++) {
          lines.push(`PD${X(dart[i].x)},${Y(dart[i].y)};`);
        }
      }
      // #124: one segment per notch, outer -> inner, single/double/triple
      // told apart purely by NOTCH_DEPTH_CM like every other format.
      for (const notch of piece.notches ?? []) {
        emitLine(PLT_PENS.notch, notch.outer, notch.inner);
      }
      // #127: a dart's own fold line, on the dart's own pen -- both are the
      // dart's own construction marks.
      for (const [a, b] of piece.internalFoldLines ?? []) {
        emitLine(PLT_PENS.dart, a, b);
      }
      // #244: a pleat's own placement/stitch line, on the dart's own pen --
      // both are internal construction marks, same footing as
      // internalFoldLines above.
      for (const pleat of piece.pleats ?? []) {
        if (pleat.length < 2) continue;
        lines.push(`SP${PLT_PENS.dart};`);
        lines.push(`PU${X(pleat[0].x)},${Y(pleat[0].y)};`);
        for (let i = 1; i < pleat.length; i++) {
          lines.push(`PD${X(pleat[i].x)},${Y(pleat[i].y)};`);
        }
      }
      // #127: a drill hole -- HPGL/2's native CI (circle) command, centred
      // by a PU move first; radius in plotter units like everything else
      // here.
      for (const hole of piece.drillHoles ?? []) {
        lines.push(`SP${PLT_PENS.drillHole};`);
        lines.push(`PU${X(hole.at.x)},${Y(hole.at.y)};`);
        lines.push(`CI${u(hole.rCm)};`);
      }

      // Piece name + qty label, HPGL LB (label), terminated by ETX (\x03) --
      // the default label terminator. PA positions the pen (text origin),
      // DI resets the text direction/slant to horizontal in case a previous
      // strip's DI (none emitted here, but future-proof) lingered.
      lines.push(`SP${PLT_PENS.text};`);
      lines.push(`PA${X(0)},${Y(piece.heightCm)};`);
      lines.push("DI1,0;");
      lines.push(`LB${piece.name.toUpperCase()} · ${piece.qty}x`);
    });
  });

  lines.push("SP0;"); // return the pen carriage
  return lines.join("\n") + "\n";
}
