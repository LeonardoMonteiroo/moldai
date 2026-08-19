import type { Pattern, PieceOutline } from "@/lib/types";

function pieceMarkup(outline: PieceOutline): string {
  if (outline.kind === "path") return `<path d="${outline.d}" />`;
  return `<polygon points="${outline.points}" />`;
}

// Server-built dashboard-card thumbnail from a pattern's already-drafted
// pieces — no redraft, no AI call. Blank patterns render an empty <g>.
export function buildThumbnailSvg(pattern: Pattern): string {
  const vb = pattern.viewBox ?? { w: 620, h: 380 };
  const shapes = pattern.pieces.map((p) => pieceMarkup(p.outline)).join("");
  return (
    `<svg viewBox="0 0 ${vb.w} ${vb.h}" xmlns="http://www.w3.org/2000/svg">` +
    `<g fill="#fff" stroke="#1c1c19" stroke-width="1.7">${shapes}</g></svg>`
  );
}
