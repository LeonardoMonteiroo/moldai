import { describe, it, expect } from "vitest";
import { parseDxf } from "./dxf";
import { analyzeDxf, computeVerification } from "./analyze";
import { buildExportModel } from "@/lib/export/model";
import { toDxf } from "@/lib/export/dxf";
import { toDxfAama } from "@/lib/export/dxf-aama";
import { t } from "@/lib/i18n/test-translate";
import { SIZE_TABLE } from "@/lib/measurements";
import type { Pattern } from "@/lib/types";

function fakePattern(): Pattern {
  return {
    id: "p1",
    name: "Camiseta Teste",
    version: 1,
    baseSize: "M",
    unit: "cm",
    sizes: ["PP", "P", "M", "G", "GG"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: { M: SIZE_TABLE.M },
    pieces: [],
    spec: {
      type: "tshirt",
      gender: "male",
      measurementOverrides: {},
      style: { seamAllowanceCm: 1.5 },
    },
  };
}

describe("analyzeDxf — round trip through this app's own writers", () => {
  it("recognises toDxf's own layer vocabulary with no user input needed", () => {
    const model = buildExportModel(fakePattern(), t);
    const doc = parseDxf(toDxf(model));
    const analysis = analyzeDxf(doc, "molde.dxf", 1234);

    expect(analysis.format).toBe("dxf-moldai");
    expect(analysis.unitScaleToCm).toBe(0.1); // $INSUNITS=4 (mm)
    expect(analysis.pieceCount).toBe(model.pieces.length);
    expect(analysis.suggestedRoles.CONTORNO).toBe("cut");
    expect(analysis.suggestedRoles.COSTURA).toBe("seam");
    expect(analysis.suggestedRoles.GRAINLINE).toBe("grain");
    expect(analysis.suggestedRoles.TEXTO).toBe("ignore");
  });

  it("recognises toDxfAama's numbered-layer vocabulary with no user input needed", () => {
    const model = buildExportModel(fakePattern(), t);
    const doc = parseDxf(toDxfAama(model));
    const analysis = analyzeDxf(doc, "molde-aama.dxf", 4321);

    expect(analysis.format).toBe("dxf-aama");
    expect(analysis.unitScaleToCm).toBe(0.1);
    expect(analysis.suggestedRoles["1"]).toBe("cut");
    expect(analysis.suggestedRoles["7"]).toBe("grain");
    expect(analysis.suggestedRoles["14"]).toBe("seam");
    expect(analysis.pieceCount).toBe(model.pieces.length);
  });

  it("every check is a {code, level, values?} object — no pt-BR prose in any field", () => {
    const model = buildExportModel(fakePattern(), t);
    const doc = parseDxf(toDxf(model));
    const analysis = analyzeDxf(doc, "molde.dxf", 1234);
    for (const check of analysis.checks) {
      expect(typeof check.code).toBe("string");
      expect(["ok", "warning"]).toContain(check.level);
      // No field should contain a space -- the tell for accidental prose;
      // codes and layer/type names never do.
      expect(check.code).not.toMatch(/\s/);
    }
  });
});

describe("analyzeDxf — checks", () => {
  it("emits unitUnknown (warning) rather than guessing a scale when $INSUNITS is absent", () => {
    const doc = parseDxf(
      [
        "0",
        "SECTION",
        "2",
        "ENTITIES",
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
        "5",
        "20",
        "0",
        "10",
        "5",
        "20",
        "5",
        "0",
        "ENDSEC",
        "0",
        "EOF",
      ].join("\n"),
    );
    const analysis = analyzeDxf(doc, "no-units.dxf", 100);
    expect(analysis.unitScaleToCm).toBeNull();
    expect(analysis.checks.find((c) => c.code === "unitUnknown")).toBeTruthy();
    expect(analysis.checks.find((c) => c.code === "unitCm")).toBeUndefined();
  });

  it("reports unsupportedEntities with the dropped type names when the document has any", () => {
    const doc = parseDxf(
      [
        "0",
        "SECTION",
        "2",
        "ENTITIES",
        "0",
        "SPLINE",
        "8",
        "X",
        "0",
        "ENDSEC",
        "0",
        "EOF",
      ].join("\n"),
    );
    const analysis = analyzeDxf(doc, "spline.dxf", 50);
    const check = analysis.checks.find((c) => c.code === "unsupportedEntities");
    expect(check).toBeTruthy();
    expect(check!.values?.types).toBe("SPLINE");
  });

  it("falls back to dxf-generic and maps every layer to ignore for an unrecognised vocabulary", () => {
    const doc = parseDxf(
      [
        "0",
        "SECTION",
        "2",
        "ENTITIES",
        "0",
        "LWPOLYLINE",
        "8",
        "MY_CUSTOM_LAYER",
        "70",
        "1",
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
        "0",
        "ENDSEC",
        "0",
        "EOF",
      ].join("\n"),
    );
    const analysis = analyzeDxf(doc, "generic.dxf", 100);
    expect(analysis.format).toBe("dxf-generic");
    expect(analysis.suggestedRoles.MY_CUSTOM_LAYER).toBe("ignore");
  });

  it("piecesClosed reports a warning when some cut-layer polylines are open", () => {
    const doc = parseDxf(
      [
        "0",
        "SECTION",
        "2",
        "ENTITIES",
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
        "0",
        "LWPOLYLINE",
        "8",
        "CONTORNO",
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
        "10",
        "5",
        "20",
        "5",
        // A second moldai-vocabulary layer -- detectFormat now requires >=2
        // distinct known layer names (see below), and CONTORNO alone would
        // otherwise read as dxf-generic, mapping it to "ignore" instead of
        // "cut" and defeating this test's own setup.
        "0",
        "LINE",
        "8",
        "COSTURA",
        "10",
        "0",
        "20",
        "0",
        "11",
        "1",
        "21",
        "0",
        "0",
        "ENDSEC",
        "0",
        "EOF",
      ].join("\n"),
    );
    const analysis = analyzeDxf(doc, "mixed.dxf", 100);
    expect(analysis.format).toBe("dxf-moldai");
    const check = analysis.checks.find((c) => c.code === "piecesClosed");
    expect(check?.level).toBe("warning");
    expect(check?.values).toEqual({ closed: 1, total: 2 });
    expect(analysis.pieceCount).toBe(1);
  });
});

describe("analyzeDxf / computeVerification — found by code review", () => {
  it("detectFormat requires >=2 vocabulary layers: a lone numeric layer name does not misclassify a generic file as AAMA", () => {
    // A real-world generic export: boundary on a plain "OUTLINE" layer, plus
    // one construction line pen-numbered "7" -- a common non-AAMA
    // convention. A single AAMA-vocabulary hit used to be enough to read
    // this as dxf-aama, force-mapping "7" to grain and dropping the real
    // boundary layer to ignore.
    const doc = parseDxf(
      [
        "0",
        "SECTION",
        "2",
        "ENTITIES",
        "0",
        "LWPOLYLINE",
        "8",
        "OUTLINE",
        "70",
        "1",
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
        "0",
        "LINE",
        "8",
        "7",
        "10",
        "0",
        "20",
        "0",
        "11",
        "1",
        "21",
        "0",
        "0",
        "ENDSEC",
        "0",
        "EOF",
      ].join("\n"),
    );
    const analysis = analyzeDxf(doc, "generic-numbered.dxf", 100);
    expect(analysis.format).toBe("dxf-generic");
    expect(analysis.suggestedRoles.OUTLINE).toBe("ignore");
    expect(analysis.suggestedRoles["7"]).toBe("ignore");
  });

  it("pieceCount is 0, not every polyline in the file, when no layer is mapped to cut", () => {
    // One real piece drawn across three unrecognised layers: a boundary, a
    // sew line and a dart. The old fallback ("no cut layer? count every
    // polyline") reported pieceCount = 3 for a single piece.
    const doc = parseDxf(
      [
        "0",
        "SECTION",
        "2",
        "ENTITIES",
        "0",
        "LWPOLYLINE",
        "8",
        "BOUNDARY",
        "70",
        "1",
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
        "0",
        "LWPOLYLINE",
        "8",
        "SEWLINE",
        "70",
        "1",
        "10",
        "1",
        "20",
        "1",
        "10",
        "4",
        "20",
        "1",
        "10",
        "4",
        "20",
        "4",
        "0",
        "LWPOLYLINE",
        "8",
        "DART",
        "70",
        "0",
        "10",
        "2",
        "20",
        "2",
        "10",
        "3",
        "20",
        "2",
        "0",
        "ENDSEC",
        "0",
        "EOF",
      ].join("\n"),
    );
    const analysis = analyzeDxf(doc, "unmapped.dxf", 100);
    expect(analysis.format).toBe("dxf-generic");
    expect(analysis.pieceCount).toBe(0);
  });

  it("surfaces doc.truncated as a fileTruncated check instead of presenting a partially-parsed file as complete", () => {
    const doc = parseDxf(
      [
        "0",
        "SECTION",
        "2",
        "ENTITIES",
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
        "5",
        "20",
        "0",
        "10",
        "5",
        "20",
        "5",
        "0",
        "ENDSEC",
        "0",
        "EOF",
      ].join("\n"),
    );
    expect(doc.truncated).toBe(false); // sanity: this fixture alone isn't truncated
    const analysis = analyzeDxf({ ...doc, truncated: true }, "big.dxf", 100);
    const check = analysis.checks.find((c) => c.code === "fileTruncated");
    expect(check).toEqual({ code: "fileTruncated", level: "warning" });
  });

  it("computeVerification recomputes pieceCount/checks from a corrected role map, not the initial suggestedRoles", () => {
    const doc = parseDxf(
      [
        "0",
        "SECTION",
        "2",
        "ENTITIES",
        "0",
        "LWPOLYLINE",
        "8",
        "MEU_CONTORNO",
        "70",
        "1",
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
        "0",
        "ENDSEC",
        "0",
        "EOF",
      ].join("\n"),
    );
    const analysis = analyzeDxf(doc, "unmapped.dxf", 100);
    expect(analysis.format).toBe("dxf-generic");
    expect(analysis.pieceCount).toBe(0);

    const corrected = computeVerification(doc, {
      ...analysis.suggestedRoles,
      MEU_CONTORNO: "cut",
    });
    expect(corrected.pieceCount).toBe(1);
    const piecesClosed = corrected.checks.find(
      (c) => c.code === "piecesClosed",
    );
    expect(piecesClosed?.values).toEqual({ closed: 1, total: 1 });
  });
});
