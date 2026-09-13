import { buildPathD, type ExportModel, type ExPt, type ExSeg } from "./model";

const MM = 10; // cm -> mm (1:1)
const f = (n: number) => (Math.round(n * 100) / 100).toString();

function escapeXml(s: string): string {
  return s.replace(
    /[<>&"]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!,
  );
}

// #83: XML forbids "--" anywhere inside a comment (and a trailing "-" would
// touch the closing "-->"), a rule escapeXml doesn't cover — neither
// patternName nor size go through any character-set validation upstream
// (rename only trims + caps length; a size label is free text), so an
// untrusted "--" or "-->" reaches here unless the comment builder strips it
// itself, per the repo's convention that each serializer owns its own
// format's escaping.
function xmlCommentText(s: string): string {
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/-+/g, "-")
    .replace(/-$/, "");
}

function pathD(start: ExPt, segs: ExSeg[], ox: number, oy: number): string {
  return buildPathD(
    start,
    segs,
    (x) => (ox + x) * MM,
    (y) => (oy + y) * MM,
  );
}

// #123/#243: a solid cut-line path + a dashed net-line path -- the piece's
// own outer boundary and every internal loop (#243) draw this identical
// pair, just centered on a different { outline, cutOutline }.
function outlinePairPaths(
  outline: { start: ExPt; segs: ExSeg[] },
  cutOutline: { start: ExPt; segs: ExSeg[] },
  ox: number,
  oy: number,
): string[] {
  return [
    `<path d="${pathD(cutOutline.start, cutOutline.segs, ox, oy)}" fill="none" stroke="#000" stroke-width="0.3"/>`,
    `<path d="${pathD(outline.start, outline.segs, ox, oy)}" fill="none" stroke="#666" stroke-width="0.2" stroke-dasharray="3 2"/>`,
  ];
}

export function toSvg(model: ExportModel): string {
  const w = model.sheetWidthCm * MM;
  const h = model.sheetHeightCm * MM;
  const parts: string[] = [];

  for (const p of model.pieces) {
    const ox = p.originCm.x;
    const oy = p.originCm.y;
    const X = (x: number) => f((ox + x) * MM);
    const Y = (y: number) => f((oy + y) * MM);

    // #123: the cut line (with seam allowance) is the primary solid
    // boundary now; the net stitch line is a secondary dashed path, its own
    // dash pattern distinct from the grainline's (6 4) and the fold's (8 2 2
    // 2) so all three read apart on screen.
    parts.push(...outlinePairPaths(p.outline, p.cutOutline, ox, oy));
    // #243: an internal loop (hole) draws exactly like the piece's own
    // outer boundary above -- solid cut line first, dashed net line on top.
    for (const loop of p.internalLoops ?? []) {
      parts.push(...outlinePairPaths(loop.outline, loop.cutOutline, ox, oy));
    }
    if (p.grainline) {
      const [a, b] = p.grainline;
      parts.push(
        `<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="#4a5a3a" stroke-width="0.3" stroke-dasharray="6 4"/>`,
      );
    }
    // #87/#122: open, not closed -- a dart is two legs meeting at a point,
    // and closing it drew a fourth segment straight back along the base, a
    // marking line that isn't part of the dart and matches neither the AAMA
    // exporter's own layer-8 open polyline nor pattern-making convention. A
    // fitted panel carries two darts, symmetric about its own centre line.
    for (const dart of p.darts ?? []) {
      if (dart.length < 3) continue;
      const dd = dart
        .map((pt, i) => `${i === 0 ? "M" : "L"}${X(pt.x)} ${Y(pt.y)}`)
        .join(" ");
      parts.push(
        `<path d="${dd}" fill="none" stroke="#4a5a3a" stroke-width="0.3"/>`,
      );
    }
    // #127: the dart's own fold line -- where the fabric presses when the
    // dart is sewn, distinct from both the dart's own solid legs above and
    // the piece's cut-on-fold axis below (`fold`, a different concept, its
    // own black chain-dash) -- a fine dotted line in the dart's own color.
    for (const [a, b] of p.internalFoldLines ?? []) {
      parts.push(
        `<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="#4a5a3a" stroke-width="0.15" stroke-dasharray="1 1.5"/>`,
      );
    }
    // #244: a pleat's own placement/stitch line -- where the folded edge
    // lays down once pressed, distinct from its own press fold (already
    // drawn above via internalFoldLines): a dash pattern of its own so the
    // two read apart.
    for (const pleat of p.pleats ?? []) {
      if (pleat.length < 2) continue;
      const dd = pleat
        .map((pt, i) => `${i === 0 ? "M" : "L"}${X(pt.x)} ${Y(pt.y)}`)
        .join(" ");
      parts.push(
        `<path d="${dd}" fill="none" stroke="#4a5a3a" stroke-width="0.2" stroke-dasharray="2 2"/>`,
      );
    }
    // #344: a style line's own cut geometry (the sleeve's own placket
    // opening) -- SOLID black, like the piece's own cut line above, unlike
    // every dashed olive mark above: this is fabric to actually cut
    // through, not a placement/press guide.
    for (const styleLine of p.styleLines ?? []) {
      if (styleLine.length < 2) continue;
      const dd = styleLine
        .map((pt, i) => `${i === 0 ? "M" : "L"}${X(pt.x)} ${Y(pt.y)}`)
        .join(" ");
      parts.push(
        `<path d="${dd}" fill="none" stroke="#000" stroke-width="0.25"/>`,
      );
    }
    // #127: a drill hole -- a small open circle, 1.0-1.5cm short of the
    // dart apex it marks (lib/draft/core.ts's DRILL_HOLE_SETBACK_CM).
    for (const hole of p.drillHoles ?? []) {
      parts.push(
        `<circle cx="${X(hole.at.x)}" cy="${Y(hole.at.y)}" r="${f(hole.rCm * MM)}" fill="none" stroke="#000" stroke-width="0.2"/>`,
      );
    }
    // #124: one short tick per notch, single/double/triple told apart
    // purely by how far it reaches (NOTCH_DEPTH_CM), matching the cut
    // line's own solid black.
    for (const notch of p.notches ?? []) {
      parts.push(
        `<line x1="${X(notch.outer.x)}" y1="${Y(notch.outer.y)}" x2="${X(notch.inner.x)}" y2="${Y(notch.inner.y)}" stroke="#000" stroke-width="0.3"/>`,
      );
    }
    if (p.fold) {
      // #126: a chain dash (long-short), distinct from the grainline's even
      // dash, matching the cut-on-fold symbol pattern-making convention.
      const [a, b] = p.fold;
      parts.push(
        `<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="#000" stroke-width="0.25" stroke-dasharray="8 2 2 2"/>`,
      );
      const midX = X((a.x + b.x) / 2);
      const midY = Y((a.y + b.y) / 2);
      parts.push(
        `<text x="${midX}" y="${midY}" font-family="sans-serif" font-size="5" fill="#5a564a">${escapeXml(model.foldLabel)}</text>`,
      );
    }
    parts.push(
      `<text x="${X(p.outline.start.x)}" y="${Y(p.heightCm)}" font-family="sans-serif" font-size="6" fill="#5a564a">${escapeXml(p.name.toUpperCase())} · ${p.qty}x</text>`,
    );
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- MoldAI · ${escapeXml(xmlCommentText(model.patternName))} · tam ${escapeXml(xmlCommentText(model.size))} · folga ${model.seamAllowanceCm ?? 0}cm (contorno sólido = linha de corte, tracejado = linha de costura líquida) -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}mm" height="${f(h)}mm" viewBox="0 0 ${f(w)} ${f(h)}">`,
    ...parts,
    `</svg>`,
  ].join("\n");
}
