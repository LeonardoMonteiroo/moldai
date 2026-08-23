import { describe, it, expect } from "vitest";
import { draftGarment } from "@/lib/draft/garment";
import { SIZE_TABLE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import ptBR from "@/messages/pt-BR.json";
import type { GarmentSpec, Piece } from "@/lib/types";
import {
  MAX_LABEL_FONT_SIZE,
  MIN_LABEL_FONT_SIZE,
  estimateTextWidth,
  fitPieceLabel,
  pieceLabelText,
} from "./pieceLabel";

const blouse: GarmentSpec = {
  type: "blouse",
  gender: "female",
  measurementOverrides: {},
  style: { neckline: "round", sleeve: "short", darts: true },
};

// `test-translate` echoes the key back, so a drafted piece's `name` is
// "pieceNames.sleeve" rather than the word a user sees. The geometry is what
// these tests need from the drafter; the label text comes from the catalog,
// so the widths under test are the ones that actually render.
const labelFor = (
  piece: keyof typeof ptBR.PatternData.pieceNames,
  qty: number,
) => `${ptBR.PatternData.pieceNames[piece].toUpperCase()} · ${qty}×`;

function drafted(id: string): Piece {
  const { pieces } = draftGarment(blouse, SIZE_TABLE.M, t);
  const piece = pieces.find((p) => p.id === id);
  if (!piece) throw new Error(`no piece ${id}`);
  return piece;
}

// The piece's own horizontal extent at a given y — the outline, not the
// bounding box that contains it.
function horizontalSpanAt(piece: Piece, y: number) {
  const vs = piece.vertices!;
  let lo = Infinity,
    hi = -Infinity;
  for (let i = 0; i < vs.length; i++) {
    const a = vs[i],
      b = vs[(i + 1) % vs.length];
    if (a.y === b.y) continue;
    if (y < Math.min(a.y, b.y) || y > Math.max(a.y, b.y)) continue;
    const x = a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  return { lo, hi };
}

describe("estimateTextWidth", () => {
  it("grows with both the character count and the font size", () => {
    expect(estimateTextWidth("MANGA", 11)).toBeLessThan(
      estimateTextWidth("MANGA · 2×", 11),
    );
    expect(estimateTextWidth("MANGA · 2×", 8)).toBeLessThan(
      estimateTextWidth("MANGA · 2×", 11),
    );
  });

  it("over-estimates rather than under-estimates: at least 0.62em per glyph", () => {
    // The advance factor is deliberately wider than Archivo's real uppercase
    // average, so a mis-estimate shrinks the label instead of overflowing it.
    expect(estimateTextWidth("MMMMM", 10)).toBeGreaterThanOrEqual(5 * 6.2);
  });
});

describe("fitPieceLabel", () => {
  // #139 widened the drafted sleeve from ~17.7 cm (narrower than "MANGA · 2×"
  // at full size — the reported case fitPieceLabel exists for) to a real
  // bicep girth, so the live drafter no longer produces a piece narrow
  // enough to trigger shrinking. The shrink path is still real behavior
  // (a legacy pattern, a future narrow piece), so it's tested here against
  // a synthetic narrow piece instead of relying on the drafter for one.
  it("keeps a narrow piece's label inside it, shrinking the font to fit", () => {
    const narrow: Piece = {
      id: "narrow",
      name: "Manga",
      qty: 2,
      outline: { kind: "polygon", points: "0,0 60,0 60,80 0,80" },
      label: { x: 0, y: 74 },
      detailRows: [],
      vertices: [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 80 },
        { x: 0, y: 80 },
      ],
    };
    const text = labelFor("sleeve", 2);
    const placed = fitPieceLabel(narrow, text, MAX_LABEL_FONT_SIZE);
    const span = horizontalSpanAt(narrow, placed.y);

    // the reported case: at full size the label is wider than the piece
    expect(estimateTextWidth(text, MAX_LABEL_FONT_SIZE)).toBeGreaterThan(
      span.hi - span.lo,
    );
    // ...so it has to come down, and the drawn box has to fit
    expect(placed.fontSize).toBeLessThan(MAX_LABEL_FONT_SIZE);
    expect(placed.fontSize).toBeGreaterThan(0);
    expect(placed.x).toBeGreaterThanOrEqual(span.lo);
    expect(
      placed.x + estimateTextWidth(placed.text, placed.fontSize),
    ).toBeLessThanOrEqual(span.hi);
  });

  it("leaves the now-realistically-wide drafted sleeve's label at full size", () => {
    const sleeve = drafted("sleeve");
    const text = labelFor("sleeve", 2);
    const placed = fitPieceLabel(sleeve, text, MAX_LABEL_FONT_SIZE);
    const span = horizontalSpanAt(sleeve, placed.y);

    expect(placed.fontSize).toBe(MAX_LABEL_FONT_SIZE);
    expect(placed.x).toBeGreaterThanOrEqual(span.lo);
    expect(
      placed.x + estimateTextWidth(placed.text, placed.fontSize),
    ).toBeLessThanOrEqual(span.hi);
  });

  it("leaves a wide piece's label at full size", () => {
    const front = drafted("body-front");
    const text = labelFor("front", 1);
    const placed = fitPieceLabel(front, text, MAX_LABEL_FONT_SIZE);
    const span = horizontalSpanAt(front, placed.y);

    expect(placed.fontSize).toBe(MAX_LABEL_FONT_SIZE);
    expect(placed.x).toBeGreaterThanOrEqual(span.lo);
    expect(
      placed.x + estimateTextWidth(placed.text, placed.fontSize),
    ).toBeLessThanOrEqual(span.hi);
  });

  it("every drafted piece's label fits inside its own outline", () => {
    const { pieces } = draftGarment(blouse, SIZE_TABLE.M, t);
    const texts = [
      labelFor("front", 1),
      labelFor("back", 1),
      labelFor("sleeve", 2),
      labelFor("skirt", 2),
    ];
    for (const piece of pieces) {
      for (const text of texts) {
        const placed = fitPieceLabel(piece, text, MAX_LABEL_FONT_SIZE);
        const span = horizontalSpanAt(piece, placed.y);
        expect(placed.x, `${piece.id} / ${text}`).toBeGreaterThanOrEqual(
          span.lo,
        );
        expect(
          placed.x + estimateTextWidth(placed.text, placed.fontSize),
          `${piece.id} / ${text}`,
        ).toBeLessThanOrEqual(span.hi);
      }
    }
  });

  it("falls back to the stored anchor when a piece carries no vertices", () => {
    const legacy: Piece = {
      id: "legacy",
      name: "Frente",
      qty: 1,
      outline: { kind: "polygon", points: "0,0 100,0 100,100 0,100" },
      label: { x: 6, y: 94 },
      detailRows: [],
    };
    expect(fitPieceLabel(legacy, "FRENTE · 1×", 11)).toEqual({
      x: 6,
      y: 94,
      fontSize: 11,
      text: "FRENTE · 1×",
    });
  });

  it("composes the label text from the piece's name and cut quantity", () => {
    const piece = { ...drafted("sleeve"), name: "Manga", qty: 2 };
    expect(pieceLabelText(piece)).toBe(labelFor("sleeve", 2));
  });

  // #81: the shrink-to-fit formula had no lower bound -- a narrow piece's
  // label shrank to ~5.4 (long sleeve) or ~7.5 (short sleeve) SVG user
  // units, well under --text-tick (10.5, the design system's smallest
  // legible step), while its siblings on the same canvas rendered at 11.
  it("floors a long sleeve's label at MIN_LABEL_FONT_SIZE instead of shrinking below it", () => {
    const longSleeveBlouse: GarmentSpec = {
      ...blouse,
      style: { ...blouse.style, sleeve: "long" },
    };
    const { pieces } = draftGarment(longSleeveBlouse, SIZE_TABLE.M, t);
    const sleeve = pieces.find((p) => p.id === "sleeve")!;
    const text = labelFor("sleeve", 2);
    const placed = fitPieceLabel(sleeve, text, MAX_LABEL_FONT_SIZE);

    expect(placed.fontSize).toBeGreaterThanOrEqual(MIN_LABEL_FONT_SIZE);
    // Still contained, whichever text (full or shortened) actually renders.
    const span = horizontalSpanAt(sleeve, placed.y);
    expect(placed.x).toBeGreaterThanOrEqual(span.lo);
    expect(
      placed.x + estimateTextWidth(placed.text, placed.fontSize),
    ).toBeLessThanOrEqual(span.hi);
  });

  it("shortens to the bare piece name when even the floor size doesn't fit the qty suffix", () => {
    const narrow: Piece = {
      id: "narrow",
      name: "Manga",
      qty: 2,
      outline: { kind: "polygon", points: "0,0 60,0 60,80 0,80" },
      label: { x: 0, y: 74 },
      detailRows: [],
      vertices: [
        { x: 0, y: 0 },
        { x: 60, y: 0 },
        { x: 60, y: 80 },
        { x: 0, y: 80 },
      ],
    };
    const text = labelFor("sleeve", 2); // "MANGA · 2×" -- does not fit at the floor
    const placed = fitPieceLabel(narrow, text, MAX_LABEL_FONT_SIZE);

    expect(placed.text).toBe("MANGA");
    expect(placed.fontSize).toBe(MIN_LABEL_FONT_SIZE);
  });
});
