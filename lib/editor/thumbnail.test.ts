import { describe, it, expect } from "vitest";
import { buildThumbnailSvg } from "./thumbnail";
import type { Pattern } from "@/lib/types";

function pattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: "p",
    name: "Novo molde",
    version: 0,
    savedAgo: "",
    baseSize: "M",
    unit: "cm",
    sizesApplied: [],
    sizesPending: [],
    pieces: [],
    viewBox: { w: 620, h: 380 },
    ...overrides,
  };
}

describe("buildThumbnailSvg", () => {
  it("renders an svg with the pattern's viewBox and no shapes when blank", () => {
    const svg = buildThumbnailSvg(pattern());
    expect(svg).toContain('viewBox="0 0 620 380"');
    expect(svg).not.toContain("<path");
    expect(svg).not.toContain("<polygon");
  });

  it("renders a path element for a path-kind piece outline", () => {
    const svg = buildThumbnailSvg(
      pattern({
        pieces: [
          {
            id: "body-front",
            name: "Frente",
            qty: 1,
            outline: { kind: "path", d: "M0 0 L10 0 L10 10 Z" },
            label: { x: 0, y: 0 },
            detailRows: [],
          },
        ],
      }),
    );
    expect(svg).toContain('<path d="M0 0 L10 0 L10 10 Z"');
  });

  it("renders a polygon element for a polygon-kind piece outline", () => {
    const svg = buildThumbnailSvg(
      pattern({
        pieces: [
          {
            id: "sleeve",
            name: "Manga",
            qty: 2,
            outline: { kind: "polygon", points: "0,0 10,0 10,10" },
            label: { x: 0, y: 0 },
            detailRows: [],
          },
        ],
      }),
    );
    expect(svg).toContain('<polygon points="0,0 10,0 10,10"');
  });

  it("falls back to a default viewBox when the pattern has none", () => {
    const svg = buildThumbnailSvg(pattern({ viewBox: undefined }));
    expect(svg).toContain('viewBox="0 0 620 380"');
  });
});
