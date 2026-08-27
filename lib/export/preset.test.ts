import { describe, it, expect } from "vitest";
import {
  validateExportPreset,
  DEFAULT_EXPORT_PRESET,
  type ExportPreset,
} from "./preset";
import { FABRIC_WIDTHS_CM } from "./cutplan";

describe("validateExportPreset", () => {
  it("returns the default for a completely unusable input", () => {
    expect(validateExportPreset(null)).toEqual(DEFAULT_EXPORT_PRESET);
    expect(validateExportPreset(undefined)).toEqual(DEFAULT_EXPORT_PRESET);
    expect(validateExportPreset("not an object")).toEqual(
      DEFAULT_EXPORT_PRESET,
    );
    expect(validateExportPreset(42)).toEqual(DEFAULT_EXPORT_PRESET);
    expect(validateExportPreset([1, 2, 3])).toEqual(DEFAULT_EXPORT_PRESET);
  });

  it("never throws, even on hostile shapes", () => {
    expect(() => validateExportPreset(undefined)).not.toThrow();
    expect(() =>
      validateExportPreset({ format: { toString: () => "dxf" } }),
    ).not.toThrow();
    expect(() =>
      validateExportPreset(
        JSON.parse('{"format": "dxf", "fabricWidthCm": "150"}'),
      ),
    ).not.toThrow();
  });

  it("drops an unknown field silently rather than persisting it", () => {
    const result = validateExportPreset({
      format: "svg",
      somethingUnexpected: "value",
      seamAllowance: "included",
    });
    expect(result).not.toHaveProperty("somethingUnexpected");
    expect(result.format).toBe("svg");
  });

  it("keeps a valid format and falls back on an unknown one", () => {
    expect(validateExportPreset({ format: "pdf-a4" }).format).toBe("pdf-a4");
    expect(validateExportPreset({ format: "audaces-legacy" }).format).toBe(
      DEFAULT_EXPORT_PRESET.format,
    );
    expect(validateExportPreset({ format: 123 }).format).toBe(
      DEFAULT_EXPORT_PRESET.format,
    );
  });

  it("only accepts the two real seamAllowance/marks/pieceNaming values", () => {
    expect(validateExportPreset({ seamAllowance: "none" }).seamAllowance).toBe(
      "none",
    );
    expect(
      validateExportPreset({ seamAllowance: "banana" }).seamAllowance,
    ).toBe("included");
    expect(validateExportPreset({ marks: "omit" }).marks).toBe("omit");
    expect(validateExportPreset({ marks: "banana" }).marks).toBe("include");
    expect(validateExportPreset({ pieceNaming: "short" }).pieceNaming).toBe(
      "short",
    );
    expect(validateExportPreset({ pieceNaming: "banana" }).pieceNaming).toBe(
      "moldai",
    );
  });

  it("clamps an out-of-range fabricWidthCm to the default preset width", () => {
    expect(validateExportPreset({ fabricWidthCm: 9999 }).fabricWidthCm).toBe(
      DEFAULT_EXPORT_PRESET.fabricWidthCm,
    );
    expect(validateExportPreset({ fabricWidthCm: -1 }).fabricWidthCm).toBe(
      DEFAULT_EXPORT_PRESET.fabricWidthCm,
    );
    expect(validateExportPreset({ fabricWidthCm: "150" }).fabricWidthCm).toBe(
      DEFAULT_EXPORT_PRESET.fabricWidthCm,
    );
  });

  it("accepts every real fabric width preset", () => {
    for (const w of FABRIC_WIDTHS_CM) {
      expect(validateExportPreset({ fabricWidthCm: w }).fabricWidthCm).toBe(w);
    }
  });

  it("round-trips a fully valid preset unchanged", () => {
    const preset: ExportPreset = {
      format: "dxf",
      seamAllowance: "none",
      marks: "omit",
      pieceNaming: "short",
      fabricWidthCm: 160,
    };
    expect(validateExportPreset(preset)).toEqual(preset);
  });
});
