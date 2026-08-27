import { describe, it, expect } from "vitest";
import {
  parseDxf,
  MAX_DXF_CHARS,
  MAX_ENTITIES,
  MAX_VERTICES_PER_ENTITY,
  type DxfPolylineEntity,
  type DxfLineEntity,
} from "./dxf";
import { buildExportModel } from "@/lib/export/model";
import { toDxf } from "@/lib/export/dxf";
import { toDxfAama } from "@/lib/export/dxf-aama";
import { flattenOutlineCm, TOL_CM } from "@/lib/export/dxf";
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

const round2 = (n: number) => Math.round(n * 100) / 100;

describe("parseDxf — round trip against this app's own writers (the strongest fixture)", () => {
  it("re-parses toDxf's own COSTURA (net) output back to matching cm vertices, within TOL_CM", () => {
    const model = buildExportModel(fakePattern(), t);
    const text = toDxf(model);
    const doc = parseDxf(text);

    expect(doc.insUnits).toBe(4); // mm, per toDxf's $INSUNITS
    const netPolylines = doc.entities.filter(
      (e): e is DxfPolylineEntity =>
        e.kind === "polyline" && e.layer === "COSTURA",
    );
    expect(netPolylines.length).toBe(model.pieces.length);

    const piece = model.pieces[0];
    const netVerts = flattenOutlineCm(piece.outline, TOL_CM);
    const ox = piece.originCm.x;
    const oy = piece.originCm.y;
    const X = (x: number) => round2((ox + x) * 10);
    const Y = (y: number) => round2((model.sheetHeightCm - (oy + y)) * 10);
    const expected = netVerts.map((v) => [X(v.x), Y(v.y)]);

    const parsed = netPolylines[0];
    expect(parsed.closed).toBe(true);
    expect(parsed.vertices.length).toBe(expected.length);
    for (let i = 0; i < expected.length; i++) {
      expect(parsed.vertices[i][0]).toBeCloseTo(expected[i][0], 1);
      expect(parsed.vertices[i][1]).toBeCloseTo(expected[i][1], 1);
    }
  });

  it("re-parses toDxf's own CONTORNO (cut) output with the same vertex count as the model's cutOutline", () => {
    const model = buildExportModel(fakePattern(), t);
    const doc = parseDxf(toDxf(model));
    const cutPolylines = doc.entities.filter(
      (e): e is DxfPolylineEntity =>
        e.kind === "polyline" && e.layer === "CONTORNO",
    );
    expect(cutPolylines.length).toBe(model.pieces.length);
    const expectedLen = flattenOutlineCm(
      model.pieces[0].cutOutline,
      TOL_CM,
    ).length;
    expect(cutPolylines[0].vertices.length).toBe(expectedLen);
  });

  it("resolves the R13 POLYLINE/VERTEX/SEQEND + BLOCK/INSERT form toDxfAama writes", () => {
    const model = buildExportModel(fakePattern(), t);
    const doc = parseDxf(toDxfAama(model));

    expect(doc.insUnits).toBe(4);
    // Layer "1" (the cut boundary) resolved through BLOCK -> INSERT.
    const boundary = doc.entities.filter(
      (e): e is DxfPolylineEntity => e.kind === "polyline" && e.layer === "1",
    );
    expect(boundary.length).toBe(model.pieces.length);
    expect(boundary[0].closed).toBe(true);
    expect(boundary[0].vertices.length).toBeGreaterThan(2);

    // Sanity: the INSERT's own insertion offset was actually applied — the
    // resolved piece isn't sitting at the block-local origin.
    const bboxMinX = Math.min(...boundary[0].vertices.map((v) => v[0]));
    const bboxMinY = Math.min(...boundary[0].vertices.map((v) => v[1]));
    expect(Math.abs(bboxMinX) + Math.abs(bboxMinY)).toBeGreaterThan(0);
  });
});

describe("parseDxf — entity parsing", () => {
  it("parses an LWPOLYLINE's closed flag from bit 1 of code 70", () => {
    const text = [
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "LWPOLYLINE",
      "8",
      "CONTORNO",
      "90",
      "3",
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
      "0",
      "ENDSEC",
      "0",
      "EOF",
    ].join("\n");
    const doc = parseDxf(text);
    expect(doc.entities).toHaveLength(1);
    const e = doc.entities[0] as DxfPolylineEntity;
    expect(e.kind).toBe("polyline");
    expect(e.layer).toBe("CONTORNO");
    expect(e.closed).toBe(true);
    expect(e.vertices).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
    ]);
  });

  it("collects SPLINE/ARC into `unsupported` instead of dropping them silently", () => {
    const text = [
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "SPLINE",
      "8",
      "CONTORNO",
      "0",
      "ARC",
      "8",
      "CONTORNO",
      "0",
      "ENDSEC",
      "0",
      "EOF",
    ].join("\n");
    const doc = parseDxf(text);
    expect(doc.entities).toHaveLength(0);
    expect(doc.unsupported.sort()).toEqual(["ARC", "SPLINE"]);
  });

  it("reads $INSUNITS 4 (mm) and 5 (cm)", () => {
    const header = (units: number) =>
      [
        "0",
        "SECTION",
        "2",
        "HEADER",
        "9",
        "$INSUNITS",
        "70",
        String(units),
        "0",
        "ENDSEC",
        "0",
        "EOF",
      ].join("\n");
    expect(parseDxf(header(4)).insUnits).toBe(4);
    expect(parseDxf(header(5)).insUnits).toBe(5);
  });
});

describe("parseDxf — never throws on malformed input", () => {
  it("returns an empty document for an empty string", () => {
    const doc = parseDxf("");
    expect(doc.entities).toEqual([]);
    expect(doc.insUnits).toBeNull();
  });

  it("returns an empty document for a lone '0'", () => {
    const doc = parseDxf("0");
    expect(doc.entities).toEqual([]);
  });

  it("returns an empty document for a truncated file (cut mid-entity, no SEQEND/ENDSEC)", () => {
    const text = [
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "POLYLINE",
      "8",
      "CONTORNO",
      "70",
      "1",
      "0",
      "VERTEX",
      "8",
      "CONTORNO",
      "10",
      "0",
      "20",
      "0",
      // cut off before SEQEND / ENDSEC / EOF
    ].join("\n");
    expect(() => parseDxf(text)).not.toThrow();
    const doc = parseDxf(text);
    // No SEQEND ever arrived, so the in-progress polyline was never committed.
    expect(doc.entities).toEqual([]);
  });

  it("drops a vertex with a NaN or Infinity coordinate instead of persisting it", () => {
    const text = [
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
      "NaN",
      "20",
      "5",
      "10",
      "10",
      "20",
      "Infinity",
      "10",
      "10",
      "20",
      "10",
      "0",
      "ENDSEC",
      "0",
      "EOF",
    ].join("\n");
    const doc = parseDxf(text);
    expect(doc.entities).toHaveLength(1);
    const e = doc.entities[0] as DxfPolylineEntity;
    // Only the two finite vertices survive.
    expect(e.vertices).toEqual([
      [0, 0],
      [10, 10],
    ]);
  });

  it("caps an oversized file rather than reading it unbounded", () => {
    const huge = "999\n" + "x".repeat(MAX_DXF_CHARS + 1000) + "\n0\nEOF";
    expect(() => parseDxf(huge)).not.toThrow();
    const doc = parseDxf(huge);
    expect(doc.truncated).toBe(true);
  });

  it("caps vertices per entity rather than growing without bound", () => {
    const lines = [
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "LWPOLYLINE",
      "8",
      "X",
      "70",
      "1",
    ];
    for (let i = 0; i < MAX_VERTICES_PER_ENTITY + 50; i++) {
      lines.push("10", String(i), "20", "0");
    }
    lines.push("0", "ENDSEC", "0", "EOF");
    const doc = parseDxf(lines.join("\n"));
    expect(doc.truncated).toBe(true);
    const e = doc.entities[0] as DxfPolylineEntity;
    expect(e.vertices.length).toBeLessThanOrEqual(MAX_VERTICES_PER_ENTITY);
  });

  it("caps total entities rather than growing without bound", () => {
    const lines = ["0", "SECTION", "2", "ENTITIES"];
    for (let i = 0; i < MAX_ENTITIES + 20; i++) {
      lines.push(
        "0",
        "LINE",
        "8",
        "X",
        "10",
        "0",
        "20",
        "0",
        "11",
        "1",
        "21",
        "1",
      );
    }
    lines.push("0", "ENDSEC", "0", "EOF");
    const doc = parseDxf(lines.join("\n"));
    expect(doc.truncated).toBe(true);
    expect(doc.entities.length).toBeLessThanOrEqual(MAX_ENTITIES);
  });

  it("an unknown-layer file still parses cleanly (no throw, geometry preserved)", () => {
    const text = [
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "LWPOLYLINE",
      "8",
      "SOME_RANDOM_LAYER",
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
    ].join("\n");
    expect(() => parseDxf(text)).not.toThrow();
    const doc = parseDxf(text);
    expect(doc.entities).toHaveLength(1);
    expect(doc.entities[0].layer).toBe("SOME_RANDOM_LAYER");
  });

  it("does not flag truncated when a polyline has EXACTLY MAX_VERTICES_PER_ENTITY vertices and nothing more", () => {
    const lines = [
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "LWPOLYLINE",
      "8",
      "X",
      "70",
      "1",
    ];
    for (let i = 0; i < MAX_VERTICES_PER_ENTITY; i++) {
      lines.push("10", String(i), "20", "0");
    }
    lines.push("0", "ENDSEC", "0", "EOF");
    const doc = parseDxf(lines.join("\n"));
    expect(doc.truncated).toBe(false);
    const e = doc.entities[0] as DxfPolylineEntity;
    expect(e.vertices.length).toBe(MAX_VERTICES_PER_ENTITY);
  });
});

describe("parseDxf — BLOCK/INSERT correctness (found by code review)", () => {
  it("does not double-charge the entity budget: entities defined once inside a BLOCK and expanded once via INSERT are not capped at MAX_ENTITIES/2", () => {
    const n = Math.floor(MAX_ENTITIES * 0.8); // well above the old half-budget ceiling, below the real one
    const lines = [
      "0",
      "SECTION",
      "2",
      "BLOCKS",
      "0",
      "BLOCK",
      "8",
      "0",
      "2",
      "P",
      "70",
      "0",
      "10",
      "0",
      "20",
      "0",
      "30",
      "0",
      "3",
      "P",
    ];
    for (let i = 0; i < n; i++) {
      lines.push(
        "0",
        "LWPOLYLINE",
        "8",
        "X",
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
      );
    }
    lines.push("0", "ENDBLK", "8", "0", "0", "ENDSEC");
    lines.push(
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "INSERT",
      "8",
      "0",
      "2",
      "P",
      "10",
      "0",
      "20",
      "0",
      "0",
      "ENDSEC",
      "0",
      "EOF",
    );
    const doc = parseDxf(lines.join("\n"));
    expect(doc.entities.length).toBe(n);
    expect(doc.truncated).toBe(false);
  });

  it("applies a BLOCK's own base point (codes 10/20), not just the INSERT's insertion/scale/rotation", () => {
    const text = [
      "0",
      "SECTION",
      "2",
      "BLOCKS",
      "0",
      "BLOCK",
      "8",
      "0",
      "2",
      "P",
      "70",
      "0",
      "10",
      "5", // base point (5,5) -- a real Gerber/Lectra/Optitex export routinely has one
      "20",
      "5",
      "30",
      "0",
      "3",
      "P",
      "0",
      "LINE",
      "8",
      "X",
      "10",
      "0",
      "20",
      "0",
      "11",
      "1",
      "21",
      "0",
      "0",
      "ENDBLK",
      "8",
      "0",
      "0",
      "ENDSEC",
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "INSERT",
      "8",
      "0",
      "2",
      "P",
      "10",
      "10",
      "20",
      "10",
      "0",
      "ENDSEC",
      "0",
      "EOF",
    ].join("\n");
    const doc = parseDxf(text);
    const line = doc.entities.find((e) => e.kind === "line") as DxfLineEntity;
    expect(line).toBeTruthy();
    // world = insertion + (local - basePoint): (0,0)-(5,5)+(10,10) = (5,5); (1,0)-(5,5)+(10,10) = (6,5).
    expect(line.a).toEqual([5, 5]);
    expect(line.b).toEqual([6, 5]);
  });

  it("flags truncated when a POLYLINE/VERTEX run is interrupted before its SEQEND, and discards it rather than fabricating a close", () => {
    const text = [
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "POLYLINE",
      "8",
      "X",
      "70",
      "0",
      "0",
      "VERTEX",
      "8",
      "X",
      "10",
      "0",
      "20",
      "0",
      "0",
      "VERTEX",
      "8",
      "X",
      "10",
      "1",
      "20",
      "1",
      // interrupted here by a fresh POLYLINE -- no SEQEND ever closed the first one
      "0",
      "POLYLINE",
      "8",
      "Y",
      "70",
      "0",
      "0",
      "VERTEX",
      "8",
      "Y",
      "10",
      "2",
      "20",
      "2",
      "0",
      "VERTEX",
      "8",
      "Y",
      "10",
      "3",
      "20",
      "3",
      "0",
      "SEQEND",
      "0",
      "ENDSEC",
      "0",
      "EOF",
    ].join("\n");
    const doc = parseDxf(text);
    expect(doc.truncated).toBe(true);
    expect(doc.entities).toHaveLength(1);
    expect((doc.entities[0] as DxfPolylineEntity).vertices).toEqual([
      [2, 2],
      [3, 3],
    ]);
  });
});

describe("parseDxf — LWPOLYLINE bulge (found by code review)", () => {
  it("flattens a bulged segment to a straight chord and reports it via `unsupported`, rather than pretending the curve was read", () => {
    const text = [
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "LWPOLYLINE",
      "8",
      "CONTORNO",
      "70",
      "0",
      "10",
      "0",
      "20",
      "0",
      "42",
      "0.5", // nonzero bulge on the first vertex's outgoing edge -- an arc, not a line
      "10",
      "5",
      "20",
      "0",
      "0",
      "ENDSEC",
      "0",
      "EOF",
    ].join("\n");
    const doc = parseDxf(text);
    expect(doc.entities).toHaveLength(1);
    const e = doc.entities[0] as DxfPolylineEntity;
    // Still flattened to a straight chord (this reader has no arc support)...
    expect(e.vertices).toEqual([
      [0, 0],
      [5, 0],
    ]);
    // ...but the loss is now reported, not silent.
    expect(doc.unsupported).toContain("LWPOLYLINE_BULGE");
  });

  it("does not flag a zero-bulge (straight) LWPOLYLINE", () => {
    const text = [
      "0",
      "SECTION",
      "2",
      "ENTITIES",
      "0",
      "LWPOLYLINE",
      "8",
      "CONTORNO",
      "70",
      "0",
      "10",
      "0",
      "20",
      "0",
      "42",
      "0",
      "10",
      "5",
      "20",
      "0",
      "0",
      "ENDSEC",
      "0",
      "EOF",
    ].join("\n");
    const doc = parseDxf(text);
    expect(doc.unsupported).not.toContain("LWPOLYLINE_BULGE");
  });
});
