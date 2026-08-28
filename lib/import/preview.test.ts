import { describe, it, expect } from "vitest";
import { parseDxf } from "./dxf";
import { buildLayerPreview, colorForLayer } from "./preview";

function docFrom(codes: (string | number)[]): ReturnType<typeof parseDxf> {
  return parseDxf(
    [
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      ...codes.map(String),
      "0",
      "ENDSEC",
      "0",
      "EOF",
    ].join("\n"),
  );
}

describe("buildLayerPreview", () => {
  it("emits one closed-path segment per layer, with M/L/Z and Y flipped", () => {
    const doc = docFrom([
      "0",
      "LWPOLYLINE",
      "8",
      "CONTORNO",
      "70",
      "1", // closed
      "10",
      "0",
      "20",
      "0",
      "10",
      "5",
      "20",
      "0",
      "10",
      "5",
      "20",
      "5",
    ]);
    const preview = buildLayerPreview(doc);
    expect(preview.segments).toEqual([
      { layer: "CONTORNO", d: "M 0 0 L 5 0 L 5 -5 Z" },
    ]);
  });

  it("does not close an open polyline's path", () => {
    const doc = docFrom([
      "0",
      "LWPOLYLINE",
      "8",
      "SEWLINE",
      "70",
      "0", // open
      "10",
      "0",
      "20",
      "0",
      "10",
      "5",
      "20",
      "0",
    ]);
    const preview = buildLayerPreview(doc);
    expect(preview.segments).toEqual([{ layer: "SEWLINE", d: "M 0 0 L 5 0" }]);
  });

  it("merges multiple entities on the same layer into one path with multiple subpaths", () => {
    const doc = docFrom([
      "0",
      "LINE",
      "8",
      "GRAINLINE",
      "10",
      "0",
      "20",
      "0",
      "11",
      "1",
      "21",
      "0",
      "0",
      "LINE",
      "8",
      "GRAINLINE",
      "10",
      "2",
      "20",
      "0",
      "11",
      "3",
      "21",
      "0",
    ]);
    const preview = buildLayerPreview(doc);
    expect(preview.segments).toEqual([
      { layer: "GRAINLINE", d: "M 0 0 L 1 0 M 2 0 L 3 0" },
    ]);
  });

  it("ignores text entities entirely -- no segment, no effect on the viewBox", () => {
    const doc = docFrom([
      "0",
      "LWPOLYLINE",
      "8",
      "CONTORNO",
      "70",
      "1",
      "10",
      "0",
      "20",
      "0",
      "10",
      "1",
      "20",
      "0",
      "10",
      "1",
      "20",
      "1",
      "0",
      "TEXT",
      "8",
      "TEXTO",
      "1",
      "hello",
      "10",
      "500",
      "20",
      "500",
    ]);
    const preview = buildLayerPreview(doc);
    expect(preview.segments.map((s) => s.layer)).toEqual(["CONTORNO"]);
    expect(preview.viewBox).not.toMatch(/500/);
  });

  it("returns an empty preview (no segments, a fallback viewBox) for a document with no drawable geometry", () => {
    const doc = docFrom([]);
    const preview = buildLayerPreview(doc);
    expect(preview.segments).toEqual([]);
    expect(preview.viewBox).toBeTruthy();
  });
});

describe("colorForLayer", () => {
  it("is deterministic: the same layer name always gets the same color", () => {
    expect(colorForLayer("P1_R150G62B151_CONTINUOUS")).toBe(
      colorForLayer("P1_R150G62B151_CONTINUOUS"),
    );
  });

  it("returns a valid hsl() color string", () => {
    expect(colorForLayer("CONTORNO")).toMatch(/^hsl\(\d+, \d+%, \d+%\)$/);
  });
});
