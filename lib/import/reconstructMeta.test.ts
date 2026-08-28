import { describe, it, expect } from "vitest";
import {
  buildReconstructionContext,
  MAX_IMPORT_CONTEXT_CHARS,
} from "./reconstructMeta";
import type { DetectedPiece } from "./pieces";

describe("buildReconstructionContext", () => {
  it("names the file and states it is a real pattern reference, not a sketch", () => {
    const text = buildReconstructionContext("oskar.dxf", [], {});
    expect(text).toContain("oskar.dxf");
    expect(text).toContain("not a hand sketch");
  });

  it("lists a labeled piece with its measured dimensions", () => {
    const pieces: DetectedPiece[] = [
      { key: "0", widthCm: 32.4, heightCm: 45.1 },
    ];
    const text = buildReconstructionContext("oskar.dxf", pieces, {
      "0": { label: "front" },
    });
    expect(text).toContain("Piece 0: front, 32.4 x 45.1 cm");
  });

  it("lists an unlabeled piece as 'unlabeled'", () => {
    const pieces: DetectedPiece[] = [{ key: "0", widthCm: 10, heightCm: 20 }];
    const text = buildReconstructionContext("oskar.dxf", pieces, {});
    expect(text).toContain("Piece 0: unlabeled, 10.0 x 20.0 cm");
  });

  it("states dimensions are unknown rather than printing null", () => {
    const pieces: DetectedPiece[] = [
      { key: "0", widthCm: null, heightCm: null },
    ];
    const text = buildReconstructionContext("oskar.dxf", pieces, {});
    expect(text).toContain("dimensions unknown");
    expect(text).not.toContain("null");
  });

  it("uses the custom name for an 'other'-labeled piece", () => {
    const pieces: DetectedPiece[] = [{ key: "0", widthCm: 5, heightCm: 5 }];
    const text = buildReconstructionContext("oskar.dxf", pieces, {
      "0": { label: "other", customName: "yoke" },
    });
    expect(text).toContain("Piece 0: yoke, 5.0 x 5.0 cm");
  });

  it("tells the model to prefer ask/decline over guessing", () => {
    const text = buildReconstructionContext("oskar.dxf", [], {});
    expect(text).toContain("decision=ask");
    expect(text).toContain("decision=decline");
  });

  it("never exceeds MAX_IMPORT_CONTEXT_CHARS even with many pieces", () => {
    const pieces: DetectedPiece[] = Array.from({ length: 500 }, (_, i) => ({
      key: String(i),
      widthCm: 12.345,
      heightCm: 67.891,
    }));
    const text = buildReconstructionContext("oskar.dxf", pieces, {});
    expect(text.length).toBeLessThanOrEqual(MAX_IMPORT_CONTEXT_CHARS);
  });
});
