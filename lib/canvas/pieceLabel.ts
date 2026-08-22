import type { Piece, Point } from "@/lib/types";

// The design's piece label: 11px, bottom-left inside the piece ("FRENTE · 1×").
export const MAX_LABEL_FONT_SIZE = 11;

// Inset from the piece's own edges, in canvas px.
const PAD = 6;

// Average glyph advance as a fraction of the font size, for the uppercase
// piece names the label is made of. Deliberately wider than Archivo's real
// uppercase average (~0.62em) so that when the estimate is off, the label
// comes out smaller than it could have been rather than wider than the piece.
// SVG can measure text exactly via getComputedTextLength(), but only after a
// render pass — and jsdom does not implement it, which would put this rule
// beyond the reach of a test.
const ADVANCE = 0.7;

export interface PieceLabelPlacement {
  x: number;
  y: number;
  fontSize: number;
}

export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * ADVANCE;
}

export function pieceLabelText(piece: Pick<Piece, "name" | "qty">): string {
  return `${piece.name.toUpperCase()} · ${piece.qty}×`;
}

// Horizontal extent of the piece at height `y` — a scanline against the
// outline's own edges, which is narrower than the bounding box wherever the
// piece tapers (a sleeve toward its hem) or is scooped out (a neckline).
// Reads the polygon anchors, so it treats a curved span as its chord; the
// deviation is a fraction of a millimetre at the 12-step sampling the
// drafters use, and PAD covers it.
function horizontalSpanAt(vertices: Point[], y: number) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < vertices.length; i++) {
    const a = vertices[i];
    const b = vertices[(i + 1) % vertices.length];
    if (a.y === b.y) continue;
    if (y < Math.min(a.y, b.y) || y > Math.max(a.y, b.y)) continue;
    const x = a.x + ((b.x - a.x) * (y - a.y)) / (b.y - a.y);
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  return { lo, hi };
}

// Places a piece's label inside that piece: anchored to the outline's own
// left edge near the hem, at the largest font size (up to `maxFontSize`) whose
// text still fits the width the piece actually has there.
//
// The drafted `piece.label` anchor is measured from the bounding box, which is
// a superset of the piece — for a narrow piece like a sleeve, a full-size
// label is wider than the bicep and spills past the outline. Recomputing here
// rather than in the drafter is what lets the label depend on the rendered
// text's width, and it repairs patterns that were drafted before this fix.
export function fitPieceLabel(
  piece: Piece,
  text: string,
  maxFontSize: number = MAX_LABEL_FONT_SIZE,
): PieceLabelPlacement {
  const vertices = piece.vertices;
  // Pre-snap-tool patterns carry no vertices; keep the stored anchor.
  if (!vertices || vertices.length < 3)
    return { x: piece.label.x, y: piece.label.y, fontSize: maxFontSize };

  const bottom = Math.max(...vertices.map((v) => v.y));
  const y = bottom - PAD;

  // The glyphs rise from the baseline, so the fit has to hold across the
  // whole cap height. Measuring the upper edge at the *largest* font size
  // keeps this a single pass and errs narrow either way — whether the piece
  // widens toward the hem (an A-line skirt) or narrows (a sleeve).
  const capTop = y - maxFontSize;
  const atBaseline = horizontalSpanAt(vertices, y);
  const atCapTop = horizontalSpanAt(vertices, capTop);
  const lo = Math.max(atBaseline.lo, Math.min(atCapTop.lo, atBaseline.hi));
  const hi = Math.min(atBaseline.hi, Math.max(atCapTop.hi, atBaseline.lo));

  const available = hi - lo - PAD * 2;
  const wanted = estimateTextWidth(text, maxFontSize);
  const fontSize =
    available >= wanted
      ? maxFontSize
      : Math.max(0, available / (text.length * ADVANCE));

  return { x: lo + PAD, y, fontSize };
}
