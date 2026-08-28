// Detects individual PIECES (not layers — #238's own unit) from the file's
// already-parsed geometry: one entry per closed polyline whose layer
// resolves to the "cut" role, the same filter computeVerification
// (analyze.ts) applies for its own pieceCount. Kept as its own small pure
// module rather than exported from analyze.ts: the two units read the same
// raw geometry for genuinely different purposes (a count/checklist vs. a
// per-piece labeling UI), and the handful of bbox lines below are cheaper to
// duplicate than to couple the two modules over.

import type { DxfDocument } from "./dxf";
import type { LayerRole, PieceLabel } from "./types";

export interface DetectedPiece {
  key: string;
  widthCm: number | null;
  heightCm: number | null;
  suggestedLabel?: PieceLabel;
}

interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function bboxOf(points: [number, number][]): Bbox {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

function within(pt: [number, number], b: Bbox): boolean {
  return (
    pt[0] >= b.minX && pt[0] <= b.maxX && pt[1] >= b.minY && pt[1] <= b.maxY
  );
}

// Unambiguous single-piece pattern-making terms only. A word that could name
// either side of a garment (e.g. "SAIA" alone, front or back skirt panel) is
// deliberately left unmatched rather than guessed — the same
// "never a wrong guess forced into the UI" rule LayerMappingPanel follows.
const LABEL_SYNONYMS: Record<string, PieceLabel> = {
  FRENTE: "front",
  COSTAS: "back",
  MANGA: "sleeve",
  GOLA: "collar",
  PUNHO: "cuff",
  CINTURA: "waistband",
  FAIXA: "waistband",
};

function suggestLabel(doc: DxfDocument, bbox: Bbox): PieceLabel | undefined {
  for (const e of doc.entities) {
    if (e.kind !== "text") continue;
    if (!within(e.anchor, bbox)) continue;
    const match = LABEL_SYNONYMS[e.text.trim().toUpperCase()];
    if (match) return match;
  }
  return undefined;
}

export function detectPieces(
  doc: DxfDocument,
  roles: Record<string, LayerRole>,
  unitScaleToCm: number | null,
): DetectedPiece[] {
  const cutLayers = new Set(
    Object.entries(roles)
      .filter(([, role]) => role === "cut")
      .map(([name]) => name),
  );
  const pieces: DetectedPiece[] = [];
  doc.entities.forEach((e, index) => {
    if (e.kind !== "polyline" || !e.closed || !cutLayers.has(e.layer)) return;
    const bbox = bboxOf(e.vertices);
    const widthCm =
      unitScaleToCm !== null ? (bbox.maxX - bbox.minX) * unitScaleToCm : null;
    const heightCm =
      unitScaleToCm !== null ? (bbox.maxY - bbox.minY) * unitScaleToCm : null;
    const suggestedLabel = suggestLabel(doc, bbox);
    pieces.push({
      key: String(index),
      widthCm,
      heightCm,
      ...(suggestedLabel ? { suggestedLabel } : {}),
    });
  });
  return pieces;
}
