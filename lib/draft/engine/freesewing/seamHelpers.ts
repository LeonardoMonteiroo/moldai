import type { SeamEdgeRef } from "../../seams";

// Shared by every per-design freesewing wrapper (lib/draft/engine/freesewing/
// designs/*.ts) -- the exact same `edgeRef` shape lib/draft/garment.ts's own
// private helper builds, extracted here since every design's own draft
// function needs it (garment.ts's copy is private, not exported, and stays
// that way -- only the moldai engine is allowed to import garment.ts at
// all, per lib/draft/engine/conformance.test.ts's source scan).
export const edgeRef = (
  pieceId: string,
  [from, to]: [number, number],
): SeamEdgeRef => ({ pieceId, from, to });
