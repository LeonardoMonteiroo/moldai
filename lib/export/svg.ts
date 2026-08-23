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

export function toSvg(model: ExportModel): string {
  const w = model.sheetWidthCm * MM;
  const h = model.sheetHeightCm * MM;
  const parts: string[] = [];

  for (const p of model.pieces) {
    const ox = p.originCm.x;
    const oy = p.originCm.y;
    const X = (x: number) => f((ox + x) * MM);
    const Y = (y: number) => f((oy + y) * MM);

    parts.push(
      `<path d="${pathD(p.outline.start, p.outline.segs, ox, oy)}" fill="none" stroke="#000" stroke-width="0.3"/>`,
    );
    if (p.grainline) {
      const [a, b] = p.grainline;
      parts.push(
        `<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="#4a5a3a" stroke-width="0.3" stroke-dasharray="6 4"/>`,
      );
    }
    if (p.dart && p.dart.length >= 3) {
      const dd = p.dart
        .map((pt, i) => `${i === 0 ? "M" : "L"}${X(pt.x)} ${Y(pt.y)}`)
        .join(" ");
      parts.push(
        `<path d="${dd} Z" fill="none" stroke="#4a5a3a" stroke-width="0.3"/>`,
      );
    }
    parts.push(
      `<text x="${X(p.outline.start.x)}" y="${Y(p.heightCm)}" font-family="sans-serif" font-size="6" fill="#5a564a">${escapeXml(p.name.toUpperCase())} · ${p.qty}x</text>`,
    );
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- MoldAI · ${escapeXml(xmlCommentText(model.patternName))} · tam ${escapeXml(xmlCommentText(model.size))} · folga ${model.seamAllowanceCm ?? 0}cm (net line) -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}mm" height="${f(h)}mm" viewBox="0 0 ${f(w)} ${f(h)}">`,
    ...parts,
    `</svg>`,
  ].join("\n");
}
