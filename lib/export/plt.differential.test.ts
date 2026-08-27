import { describe, it, expect } from "vitest";
import { toPlt, PLT_PENS } from "./plt";
import { buildExportModel, type ExPt, type ExportModel } from "./model";
import { readPlt, type PltDocument } from "./plt-test-reader";
import type { Pattern } from "@/lib/types";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import { DECORATION_CASES } from "@/lib/draft/fixtures";

/**
 * #135 — the differential pass.
 *
 * `plt.test.ts` asserts on substrings of the emitted text, which can only
 * ever confirm that `toPlt` wrote what `toPlt` meant to write: serializer
 * and assertions were authored against one shared understanding of HPGL, so
 * a misconception common to both passes every one of them.
 *
 * These tests instead run the output back through `plt-test-reader.ts` — an
 * HPGL reader written from the format's own semantics, importing nothing
 * from `./plt` — and compare the geometry a plotter would actually draw
 * against the `ExportModel` the serializer was handed. The model is the
 * shared ground truth and the two sides reach it by completely different
 * routes, which is what makes a wrong scale factor, an inverted Y flip, a
 * dropped pen, or a stream a device would stop executing partway through
 * fail here rather than at a service bureau.
 *
 * Run against the whole `DECORATION_CASES` drafting matrix, the same rule
 * the containment and cut-line invariants follow — never one hand-picked
 * garment.
 */

// The spec's own figure, restated here rather than imported from `./plt`:
// HPGL plotter units are 1/1016 inch, so 1016/2.54 = 400 per cm. If the
// serializer's constant ever drifts from the format's, these tests fail.
const UNITS_PER_CM = 1016 / 2.54;

// The round-trip tolerance plt.test.ts already uses, comfortably above the
// 1/400 cm quantisation of a single plotter unit.
const TOL_CM = 0.02;

function patternFor(spec: Pattern["spec"]): Pattern {
  const m = spec?.gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
  return {
    id: "p1",
    name: "Teste",
    version: 1,
    baseSize: "M",
    unit: "cm",
    sizes: ["M"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: { M: m },
    pieces: [],
    spec,
  };
}

/** Undo the serializer's unit scaling and Y flip, back into model cm. */
function toModelCm(
  model: ExportModel,
  p: { x: number; y: number },
): { x: number; y: number } {
  return {
    x: p.x / UNITS_PER_CM,
    y: model.sheetHeightCm - p.y / UNITS_PER_CM,
  };
}

/** Every point the reader saw drawn on `pen`, in model cm. */
function pointsOnPen(
  model: ExportModel,
  doc: PltDocument,
  pen: number,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  for (const s of doc.strokes) {
    if (s.pen !== pen) continue;
    out.push(toModelCm(model, s.from), toModelCm(model, s.to));
  }
  return out;
}

function nearestDistanceCm(
  target: ExPt,
  candidates: { x: number; y: number }[],
): number {
  let best = Infinity;
  for (const c of candidates) {
    const d = Math.hypot(c.x - target.x, c.y - target.y);
    if (d < best) best = d;
  }
  return best;
}

/** Absolute (sheet-frame) vertices of a piece's cut outline. */
function absCutVertices(piece: ExportModel["pieces"][number]): ExPt[] {
  const o = piece.originCm;
  const abs = (p: ExPt) => ({ x: o.x + p.x, y: o.y + p.y });
  return [
    abs(piece.cutOutline.start),
    ...piece.cutOutline.segs.map((s) => abs(s.to)),
  ];
}

function parsed(spec: Pattern["spec"]) {
  const model = buildExportModel(patternFor(spec), t);
  return { model, doc: readPlt(toPlt(model)) };
}

const countNotches = (model: ExportModel) =>
  model.pieces.reduce((n, p) => n + (p.notches?.length ?? 0), 0);
const countHoles = (model: ExportModel) =>
  model.pieces.reduce((n, p) => n + (p.drillHoles?.length ?? 0), 0);

describe("PLT differential — parsed back by an independent HPGL reader", () => {
  describe.each(DECORATION_CASES)("%s", (_label, spec) => {
    it("executes every command: no label swallows the rest of the plot", () => {
      const { doc } = parsed(spec);
      // A label that never meets its terminator puts a real plotter into
      // text mode for the remainder of the stream — every following piece,
      // pen change and the final SP0 would be printed, not plotted.
      expect(doc.labels.filter((l) => l.unterminated)).toEqual([]);
      expect(doc.swallowedAfterLabel).toBe(0);
    });

    it("draws one piece-name label per piece", () => {
      const { model, doc } = parsed(spec);
      expect(doc.labels).toHaveLength(model.pieces.length);
      expect(doc.labels.map((l) => l.text)).toEqual(
        model.pieces.map((p) => `${p.name.toUpperCase()} · ${p.qty}x`),
      );
    });

    it("draws every cut-outline vertex of every piece, at 1:1 scale", () => {
      const { model, doc } = parsed(spec);
      const drawn = pointsOnPen(model, doc, PLT_PENS.cut);
      expect(drawn.length).toBeGreaterThan(0);
      for (const piece of model.pieces) {
        for (const v of absCutVertices(piece)) {
          expect(nearestDistanceCm(v, drawn)).toBeLessThan(TOL_CM);
        }
      }
    });

    it("draws one outer-to-inner tick per notch on the notch pen", () => {
      const { model, doc } = parsed(spec);
      expect(doc.strokes.filter((s) => s.pen === PLT_PENS.notch)).toHaveLength(
        countNotches(model),
      );
    });

    it("draws one CI circle per drill hole, at the model's own radius", () => {
      const { model, doc } = parsed(spec);
      const radii = model.pieces
        .flatMap((p) => p.drillHoles ?? [])
        .map((h) => h.rCm);
      expect(doc.circles).toHaveLength(radii.length);
      for (const c of doc.circles) {
        expect(c.pen).toBe(PLT_PENS.drillHole);
        expect(
          radii.some((r) => Math.abs(c.r / UNITS_PER_CM - r) < TOL_CM),
        ).toBe(true);
      }
    });

    it("uses no command the reader cannot account for", () => {
      const { doc } = parsed(spec);
      expect(doc.unknownCommands).toEqual([]);
    });
  });

  // Guards the per-case assertions above from passing vacuously: if the
  // matrix stopped producing notches or drill holes entirely, the equality
  // checks would still hold at zero and prove nothing.
  it("the matrix exercises notches and drill holes somewhere", () => {
    const models = DECORATION_CASES.map(([, spec]) =>
      buildExportModel(patternFor(spec), t),
    );
    expect(models.reduce((n, m) => n + countNotches(m), 0)).toBeGreaterThan(0);
    expect(models.reduce((n, m) => n + countHoles(m), 0)).toBeGreaterThan(0);
  });
});
