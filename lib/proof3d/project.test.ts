import { describe, it, expect } from "vitest";
import type { GarmentSpec, Pattern } from "@/lib/types";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import { buildProofMesh, RING_SAMPLES } from "./mesh";
import { projectMesh, YAW_STEP_DEG } from "./project";

function pattern(spec: GarmentSpec, baseMeasurements = SIZE_TABLE.M): Pattern {
  return {
    id: "p1",
    name: "Blusa",
    version: 1,
    baseSize: "M",
    unit: "cm",
    sizes: ["M"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: { M: baseMeasurements },
    pieces: [],
    spec,
  };
}

const CASES: [string, GarmentSpec, Parameters<typeof pattern>[1]][] = [
  [
    "blouse woven round short",
    {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { neckline: "round", sleeve: "short", darts: true },
    },
    SIZE_TABLE.M,
  ],
  [
    "tshirt male",
    { type: "tshirt", gender: "male", measurementOverrides: {}, style: {} },
    SIZE_TABLE_MALE.M,
  ],
  [
    "dress a-line",
    {
      type: "dress",
      gender: "female",
      measurementOverrides: {},
      style: {
        neckline: "round",
        sleeve: "short",
        darts: true,
        skirt: "a-line",
      },
    },
    SIZE_TABLE.M,
  ],
  [
    "skirt circle",
    {
      type: "skirt",
      gender: "female",
      measurementOverrides: {},
      style: { skirt: "circle" },
    },
    SIZE_TABLE.M,
  ],
];

describe("projectMesh", () => {
  it("exports a 3-degree yaw step for the component to quantize drag deltas against", () => {
    expect(YAW_STEP_DEG).toBe(3);
  });

  it.each(CASES)(
    "every projected coordinate is finite, shade is within 0..1 — %s",
    (_name, spec, base) => {
      const mesh = buildProofMesh(pattern(spec, base), t);
      const { faces, viewBox } = projectMesh(mesh, 20);
      expect(faces.length).toBeGreaterThan(0);
      for (const face of faces) {
        expect(Number.isFinite(face.depth)).toBe(true);
        expect(face.shade).toBeGreaterThanOrEqual(0);
        expect(face.shade).toBeLessThanOrEqual(1);
        // `d` is an M/L/Z path built entirely from toFixed(2) numbers -- no
        // NaN/Infinity survives that (they'd stringify to "NaN"/"Infinity").
        expect(face.d).not.toMatch(/NaN|Infinity/);
      }
      expect(Number.isFinite(viewBox.x)).toBe(true);
      expect(Number.isFinite(viewBox.y)).toBe(true);
      expect(Number.isFinite(viewBox.w)).toBe(true);
      expect(Number.isFinite(viewBox.h)).toBe(true);
      expect(viewBox.w).toBeGreaterThan(0);
      expect(viewBox.h).toBeGreaterThan(0);
    },
  );

  it.each(CASES)(
    "faces are sorted non-increasing by depth — %s",
    (_name, spec, base) => {
      const mesh = buildProofMesh(pattern(spec, base), t);
      const { faces } = projectMesh(mesh, 45);
      for (let i = 1; i < faces.length; i++) {
        expect(faces[i - 1].depth).toBeGreaterThanOrEqual(
          faces[i].depth - 1e-9,
        );
      }
    },
  );

  it("face count equals (rings-1) * RING_SAMPLES summed over every shell", () => {
    const mesh = buildProofMesh(pattern(CASES[2][1], CASES[2][2]), t);
    const { faces } = projectMesh(mesh, 0);
    const shells = [mesh.form, ...mesh.garment];
    const expected = shells.reduce(
      (sum, s) => sum + Math.max(0, s.rings.length - 1) * RING_SAMPLES,
      0,
    );
    expect(faces).toHaveLength(expected);
  });

  it("yaw 0 and yaw 180 produce x-mirrored bounding boxes of equal width", () => {
    const mesh = buildProofMesh(pattern(CASES[0][1], CASES[0][2]), t);
    const a = projectMesh(mesh, 0);
    const b = projectMesh(mesh, 180);
    expect(b.viewBox.w).toBeCloseTo(a.viewBox.w, 1);
  });

  it("returns an empty (but finite) projection for a mesh with no rings", () => {
    const empty = projectMesh(
      { form: { id: "form", centerXCm: 0, rings: [] }, garment: [], fit: [] },
      0,
    );
    expect(empty.faces).toHaveLength(0);
    expect(Number.isFinite(empty.viewBox.x)).toBe(true);
    expect(Number.isFinite(empty.viewBox.w)).toBe(true);
  });
});
