import { describe, it, expect } from "vitest";
import type { GarmentSpec, Pattern } from "@/lib/types";
import { SIZE_TABLE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import { toTechSheetPdf } from "./techSheetPdf";

const SPEC: GarmentSpec = {
  type: "blouse",
  gender: "female",
  measurementOverrides: {},
  style: { seamAllowanceCm: 1, sleeve: "long", neckline: "round" },
};

// buildExportModel/buildEaseReport/buildAssemblyOrder all redraft geometry
// from spec+sizeTable themselves -- pattern.pieces is only ever read for its
// length and qty here, the same minimal fixture lib/draft/assembly.test.ts
// uses for the identical reason.
function fakePattern(): Pattern {
  return {
    id: "p1",
    name: "Blusa Teste",
    version: 1,
    baseSize: "M",
    unit: "cm",
    sizes: ["PP", "P", "M", "G", "GG"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: { M: SIZE_TABLE.M },
    pieces: [
      {
        id: "x",
        name: "x",
        qty: 1,
        outline: { kind: "polygon", points: "0,0" },
        label: { x: 0, y: 0 },
        detailRows: [],
      },
    ],
    spec: SPEC,
  };
}

function isPdf(bytes: Uint8Array): boolean {
  return (
    bytes.length > 4 &&
    bytes[0] === 0x25 && // %
    bytes[1] === 0x50 && // P
    bytes[2] === 0x44 && // D
    bytes[3] === 0x46 // F
  );
}

describe("toTechSheetPdf", () => {
  it("produces a valid PDF for a drafted pattern with every section on", async () => {
    const bytes = await toTechSheetPdf(fakePattern(), t, t);
    expect(isPdf(bytes)).toBe(true);
  });

  it("produces a valid, shorter PDF with measurements/assembly both off", async () => {
    const withBoth = await toTechSheetPdf(fakePattern(), t, t);
    const withNeither = await toTechSheetPdf(fakePattern(), t, t, {
      includeMeasurements: false,
      includeAssembly: false,
    });
    expect(isPdf(withNeither)).toBe(true);
    expect(withNeither.length).toBeLessThan(withBoth.length);
  });

  it("never throws on a blank pattern (no spec, no pieces)", async () => {
    const blank: Pattern = {
      id: "p2",
      name: "Novo molde",
      version: 0,
      baseSize: "M",
      unit: "cm",
      sizes: ["PP", "P", "M", "G", "GG"],
      sizesApplied: [],
      sizesPending: [],
      sizeTable: {},
      pieces: [],
    };
    const bytes = await toTechSheetPdf(blank, t, t);
    expect(isPdf(bytes)).toBe(true);
  });
});
