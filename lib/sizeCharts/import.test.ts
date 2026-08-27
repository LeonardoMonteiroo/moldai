import { describe, it, expect } from "vitest";
import { parseSizeChartFile, type ImportResult } from "./import";
import { resolveSizeChartSize } from "@/lib/sizeCharts/compute";
import { buildSystemSizeChart } from "@/lib/sizeCharts/seed";
import {
  EXTENDED_MEASUREMENT_KEYS,
  MEASUREMENT_RANGES,
} from "@/lib/measurements";

// The same measurement table (sizes 38/40/42/44, base "40"), expressed three
// ways: pt-BR semicolon+comma-decimal, comma+dot-decimal, and transposed
// (sizes as rows instead of columns). Cintura (waist) is deliberately
// non-uniform (66/70/76/78, not a constant step) so the reconstruction has
// at least one cell that can't be expressed by the rule alone and must
// become an override -- every other row is a uniform step, which should
// need no override at all.
const SEMI_COMMA_CSV = [
  "Medida;38;40;42;44",
  "Busto;88;92;96;100",
  "Cintura;66,0;70,0;76,0;78,0",
  "Quadril;94;98;102;106",
  "Altura do quadril;20,0;20,6;21,2;21,8",
  "Comprimento das costas;40;41;42;43",
  "Ombro;17,5;18,5;19,5;20,5",
  "Comprimento da saia;56;60;64;68",
  "Manga curta;17;18;19;20",
  "Manga longa;55;58;61;64",
].join("\n");

const COMMA_DOT_CSV = [
  "Medida,38,40,42,44",
  "Busto,88,92,96,100",
  "Cintura,66.0,70.0,76.0,78.0",
  "Quadril,94,98,102,106",
  "Altura do quadril,20.0,20.6,21.2,21.8",
  "Comprimento das costas,40,41,42,43",
  "Ombro,17.5,18.5,19.5,20.5",
  "Comprimento da saia,56,60,64,68",
  "Manga curta,17,18,19,20",
  "Manga longa,55,58,61,64",
].join("\n");

const TRANSPOSED_CSV = [
  "Tamanho;Busto;Cintura;Quadril;Altura do quadril;Comprimento das costas;Ombro;Comprimento da saia;Manga curta;Manga longa",
  "38;88;66,0;94;20,0;40;17,5;56;17;55",
  "40;92;70,0;98;20,6;41;18,5;60;18;58",
  "42;96;76,0;102;21,2;42;19,5;64;19;61",
  "44;100;78,0;106;21,8;43;20,5;68;20;64",
].join("\n");

// Per-size, per-key expected values, exactly as authored above -- used by
// the round-trip assertion.
const EXPECTED: Record<string, Record<string, number>> = {
  "38": {
    bust: 88,
    waist: 66,
    hip: 94,
    hipHeight: 20.0,
    backLength: 40,
    shoulder: 17.5,
    skirtLength: 56,
    shortSleeveLength: 17,
    longSleeveLength: 55,
  },
  "40": {
    bust: 92,
    waist: 70,
    hip: 98,
    hipHeight: 20.6,
    backLength: 41,
    shoulder: 18.5,
    skirtLength: 60,
    shortSleeveLength: 18,
    longSleeveLength: 58,
  },
  "42": {
    bust: 96,
    waist: 76,
    hip: 102,
    hipHeight: 21.2,
    backLength: 42,
    shoulder: 19.5,
    skirtLength: 64,
    shortSleeveLength: 19,
    longSleeveLength: 61,
  },
  "44": {
    bust: 100,
    waist: 78,
    hip: 106,
    hipHeight: 21.8,
    backLength: 43,
    shoulder: 20.5,
    skirtLength: 68,
    shortSleeveLength: 20,
    longSleeveLength: 64,
  },
};

function ok(result: ImportResult) {
  if ("error" in result)
    throw new Error(`expected success, got ${result.error}`);
  return result;
}

function fail(result: ImportResult) {
  if (!("error" in result)) throw new Error("expected an error result");
  return result;
}

describe("parseSizeChartFile", () => {
  it("parses a semicolon-delimited pt-BR file with comma decimals", () => {
    const { chart, warnings } = ok(
      parseSizeChartFile(SEMI_COMMA_CSV, "grade.csv", "female"),
    );
    // #132: the fixture maps only the original nine columns, so each of the
    // six new EXTENDED fields legitimately falls back to the system default
    // with its own missing_measurement warning -- nothing else should be
    // flagged, since every core column IS present and in range.
    expect(warnings.every((w) => w.code === "missing_measurement")).toBe(true);
    expect(warnings.map((w) => w.detail).sort()).toEqual(
      [...EXTENDED_MEASUREMENT_KEYS].sort(),
    );
    expect(chart.sizes).toEqual(["38", "40", "42", "44"]);
    expect(chart.baseSizeIndex).toBe(1);
    expect(chart.baseMeasurements.bust).toBe(92);
    expect(chart.baseMeasurements.waist).toBe(70);
  });

  // Same table, comma-delimited with dot decimals -- must parse identically.
  it("parses a comma-delimited file with dot decimals identically", () => {
    const a = ok(parseSizeChartFile(SEMI_COMMA_CSV, "grade.csv", "female"));
    const b = ok(parseSizeChartFile(COMMA_DOT_CSV, "grade.csv", "female"));
    expect(b.chart.sizes).toEqual(a.chart.sizes);
    expect(b.chart.baseSizeIndex).toBe(a.chart.baseSizeIndex);
    expect(b.chart.baseMeasurements).toEqual(a.chart.baseMeasurements);
    expect(b.chart.progressionRule).toEqual(a.chart.progressionRule);
    expect(b.chart.overrides).toEqual(a.chart.overrides);
  });

  // Measurements-as-columns (the two fixtures above) vs measurements-as-rows
  // (this one) must resolve to the same chart -- orientation is detected,
  // not assumed.
  it("detects both orientations and produces the same SizeChartData", () => {
    const rows = ok(parseSizeChartFile(SEMI_COMMA_CSV, "grade.csv", "female"));
    const cols = ok(
      parseSizeChartFile(TRANSPOSED_CSV, "grade-transposed.csv", "female"),
    );
    expect(cols.chart.sizes).toEqual(rows.chart.sizes);
    expect(cols.chart.baseSizeIndex).toBe(rows.chart.baseSizeIndex);
    expect(cols.chart.baseMeasurements).toEqual(rows.chart.baseMeasurements);
    expect(cols.chart.progressionRule).toEqual(rows.chart.progressionRule);
    expect(cols.chart.overrides).toEqual(rows.chart.overrides);
  });

  // The reconstructed progressionRule + overrides, fed back through
  // resolveSizeChartSize, must reproduce every cell of the source file --
  // including cintura, the one non-uniform (override-bearing) row.
  it("round-trips every cell exactly through resolveSizeChartSize", () => {
    const { chart } = ok(
      parseSizeChartFile(SEMI_COMMA_CSV, "grade.csv", "female"),
    );
    for (const size of chart.sizes) {
      const resolved = resolveSizeChartSize(chart, size);
      for (const [key, expected] of Object.entries(EXPECTED[size])) {
        expect(resolved[key as keyof typeof resolved]).toBeCloseTo(expected, 5);
      }
    }
    // Only the non-uniform row should have needed an override.
    expect(chart.overrides).toEqual({ "42": { waist: 76 } });
  });

  it("rejects an unsupported file type without reading it as text", () => {
    const result = fail(
      parseSizeChartFile(SEMI_COMMA_CSV, "grade.xlsx", "female"),
    );
    expect(result.error).toBe("unsupported_file_type");
  });

  it("rejects an empty file", () => {
    const result = fail(parseSizeChartFile("   \n  ", "grade.csv", "female"));
    expect(result.error).toBe("empty_file");
  });

  it("reports no_sizes_found when there is no size axis to detect", () => {
    const result = fail(
      parseSizeChartFile("Medida\nBusto\n", "x.csv", "female"),
    );
    expect(result.error).toBe("no_sizes_found");
  });

  it("reports no_measurements_found when no header matches the synonym table", () => {
    const result = fail(
      parseSizeChartFile("Medida;38;40\nPerna;90;92\n", "x.csv", "female"),
    );
    expect(result.error).toBe("no_measurements_found");
  });

  describe("a file with malformed and out-of-range cells", () => {
    // Quadril (hip) has an out-of-range cell at "42" (500 > MEASUREMENT_RANGES.hip.max);
    // Ombro (shoulder) has a non-numeric cell ("abc") at the base size "40" and
    // an empty cell at "42"; "Altura do quadril" (hipHeight) is missing
    // entirely; "Altura" doesn't match any synonym at all.
    const CSV = [
      "Medida;38;40;42;44",
      "Busto;88;92;96;100",
      "Cintura;66;70;76;78",
      "Quadril;90;94;500;98",
      "Ombro;17;abc;;18",
      "Comprimento das costas;40;41;42;43",
      "Comprimento da saia;56;60;64;68",
      "Manga curta;17;18;19;20",
      "Manga longa;55;58;61;64",
      "Altura;170;172;174;176",
    ].join("\n");

    it("drops an out-of-range value, reports it, and never persists it", () => {
      const { chart, warnings } = ok(
        parseSizeChartFile(CSV, "grade.csv", "female"),
      );
      expect(warnings).toContainEqual({
        code: "value_out_of_range",
        detail: "hip",
        size: "42",
      });
      // The rejected 500 must not survive anywhere in the resolved chart.
      expect(chart.baseMeasurements.hip).not.toBe(500);
      expect(chart.overrides["42"]?.hip).toBeUndefined();
      for (const size of chart.sizes) {
        const hip = resolveSizeChartSize(chart, size).hip;
        expect(hip).not.toBe(500);
        expect(hip).toBeGreaterThanOrEqual(MEASUREMENT_RANGES.hip.min);
        expect(hip).toBeLessThanOrEqual(MEASUREMENT_RANGES.hip.max);
      }
    });

    it("drops a non-numeric or empty cell, reports it, and never coerces it to 0", () => {
      const { chart, warnings } = ok(
        parseSizeChartFile(CSV, "grade.csv", "female"),
      );
      expect(warnings).toContainEqual({
        code: "value_not_numeric",
        detail: "shoulder",
        size: "40",
      });
      expect(warnings).toContainEqual({
        code: "value_not_numeric",
        detail: "shoulder",
        size: "42",
      });
      for (const size of chart.sizes) {
        expect(resolveSizeChartSize(chart, size).shoulder).not.toBe(0);
      }
    });

    it("reports an unmapped header and excludes it from the chart", () => {
      const { warnings } = ok(parseSizeChartFile(CSV, "grade.csv", "female"));
      expect(warnings).toContainEqual({
        code: "unmapped_column",
        detail: "Altura",
      });
    });

    it("falls back to a system default and reports missing_measurement for a key absent from the file", () => {
      const { chart, warnings } = ok(
        parseSizeChartFile(CSV, "grade.csv", "female"),
      );
      expect(warnings).toContainEqual({
        code: "missing_measurement",
        detail: "hipHeight",
      });
      expect(chart.baseMeasurements.hipHeight).toBe(
        buildSystemSizeChart("female").baseMeasurements.hipHeight,
      );
    });

    it("never produces an isSystem chart", () => {
      const { chart } = ok(parseSizeChartFile(CSV, "grade.csv", "female"));
      expect(chart.isSystem).toBe(false);
    });
  });

  it("re-parsing with an explicit baseSizeIndex re-anchors the chart consistently", () => {
    const { chart } = ok(
      parseSizeChartFile(SEMI_COMMA_CSV, "grade.csv", "female", 0),
    );
    expect(chart.baseSizeIndex).toBe(0);
    for (const size of chart.sizes) {
      const resolved = resolveSizeChartSize(chart, size);
      for (const [key, expected] of Object.entries(EXPECTED[size])) {
        expect(resolved[key as keyof typeof resolved]).toBeCloseTo(expected, 5);
      }
    }
  });
});
