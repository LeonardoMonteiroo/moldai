import { describe, it, expect } from "vitest";
import { parseDxf } from "./dxf";
import { detectPieces } from "./pieces";

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

const CLOSED_SQUARE_10 = [
  "0",
  "LWPOLYLINE",
  "8",
  "CUTLAYER",
  "70",
  "1",
  "10",
  "0",
  "20",
  "0",
  "10",
  "10",
  "20",
  "0",
  "10",
  "10",
  "20",
  "10",
  "10",
  "0",
  "20",
  "10",
];

describe("detectPieces", () => {
  it("returns one entry per closed polyline on a layer resolved to the cut role", () => {
    const doc = docFrom([
      ...CLOSED_SQUARE_10,
      "0",
      "LWPOLYLINE",
      "8",
      "OTHERLAYER",
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
    ]);
    const pieces = detectPieces(
      doc,
      { CUTLAYER: "cut", OTHERLAYER: "seam" },
      1,
    );
    expect(pieces).toHaveLength(1);
  });

  it("ignores an open polyline even on a cut-role layer", () => {
    const doc = docFrom([
      "0",
      "LWPOLYLINE",
      "8",
      "CUTLAYER",
      "70",
      "0",
      "10",
      "0",
      "20",
      "0",
      "10",
      "10",
      "20",
      "0",
    ]);
    const pieces = detectPieces(doc, { CUTLAYER: "cut" }, 1);
    expect(pieces).toEqual([]);
  });

  it("scales the bbox width/height by unitScaleToCm", () => {
    const doc = docFrom(CLOSED_SQUARE_10);
    const pieces = detectPieces(doc, { CUTLAYER: "cut" }, 0.1); // mm -> cm
    expect(pieces).toEqual([{ key: "0", widthCm: 1, heightCm: 1 }]);
  });

  it("reports null dimensions when the unit scale is unknown, rather than assuming cm", () => {
    const doc = docFrom(CLOSED_SQUARE_10);
    const pieces = detectPieces(doc, { CUTLAYER: "cut" }, null);
    expect(pieces).toEqual([{ key: "0", widthCm: null, heightCm: null }]);
  });

  it("suggests a label from an unambiguous TEXT entity anchored inside the piece's bbox", () => {
    const doc = docFrom([
      ...CLOSED_SQUARE_10,
      "0",
      "TEXT",
      "8",
      "TEXTO",
      "1",
      "FRENTE",
      "10",
      "5",
      "20",
      "5",
    ]);
    const pieces = detectPieces(doc, { CUTLAYER: "cut" }, 1);
    expect(pieces).toEqual([
      { key: "0", widthCm: 10, heightCm: 10, suggestedLabel: "front" },
    ]);
  });

  it("leaves suggestedLabel unset when no recognised text falls inside the bbox", () => {
    const doc = docFrom([
      ...CLOSED_SQUARE_10,
      "0",
      "TEXT",
      "8",
      "TEXTO",
      "1",
      "SAIA",
      "10",
      "5",
      "20",
      "5",
    ]);
    const pieces = detectPieces(doc, { CUTLAYER: "cut" }, 1);
    expect(pieces[0].suggestedLabel).toBeUndefined();
  });

  it("returns an empty array when no layer resolves to cut", () => {
    const doc = docFrom(CLOSED_SQUARE_10);
    const pieces = detectPieces(doc, { CUTLAYER: "ignore" }, 1);
    expect(pieces).toEqual([]);
  });
});
