// Builds the plain-English technical block sent as the `importContext` wire
// field (app/api/patterns/[id]/generate/route.ts) -- never persisted, never
// shown in the chat transcript, exactly the treatment `image` already gets
// (lib/editor/attachment.ts: only `hasImage` survives as a persisted trace).
// Grounds the AI's GarmentSpec reconstruction in measured piece dimensions
// and any label the user assigned, rather than vision alone.

import type { DetectedPiece } from "./pieces";
import type { PieceLabel } from "./types";

export const MAX_IMPORT_CONTEXT_CHARS = 4000;

const PIECE_LABEL_TEXT: Record<PieceLabel, string> = {
  front: "front",
  back: "back",
  sleeve: "sleeve",
  collar: "collar",
  cuff: "cuff",
  waistband: "waistband",
  skirtFront: "skirt front panel",
  skirtBack: "skirt back panel",
  trouserFront: "trouser front leg",
  trouserBack: "trouser back leg",
  other: "other",
};

export function buildReconstructionContext(
  fileName: string,
  pieces: DetectedPiece[],
  pieceLabels: Record<string, { label: PieceLabel; customName?: string }>,
): string {
  const lines: string[] = [
    `Imported pattern reference: "${fileName}", a real, professional sewing ` +
      `pattern file (not a hand sketch). The attached image is a rendered ` +
      `preview of its traced geometry. Reconstruct your best-effort ` +
      `GarmentSpec from it.`,
    `Detected ${pieces.length} piece(s) on the file's own cut-line layer(s). ` +
      `Trust these measured dimensions and any user-assigned label below ` +
      `over your own visual read of the image:`,
  ];
  for (const piece of pieces) {
    const assigned = pieceLabels[piece.key];
    const labelText = assigned
      ? assigned.label === "other" && assigned.customName
        ? assigned.customName
        : PIECE_LABEL_TEXT[assigned.label]
      : "unlabeled";
    const dims =
      piece.widthCm !== null && piece.heightCm !== null
        ? `${piece.widthCm.toFixed(1)} x ${piece.heightCm.toFixed(1)} cm`
        : "dimensions unknown (file unit not recognized)";
    lines.push(`- Piece ${piece.key}: ${labelText}, ${dims}`);
  }
  lines.push(
    "If the labels and measurements together don't clearly indicate a " +
      "garment type, gender, or fit, prefer decision=ask or decision=decline " +
      "over guessing.",
  );
  return lines.join("\n").slice(0, MAX_IMPORT_CONTEXT_CHARS);
}
