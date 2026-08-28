import { describe, it, expect } from "vitest";
import { parseRul, analyzeRul, MAX_RULES, MAX_DELTAS_PER_RULE } from "./rul";

const FIXTURE = `
AUTHOR: J. Silva
PRODUCT: Camisa Social
GRADE RULE TABLE: 11111
NUMBER OF SIZES: 2
UNITS: METRIC
ANSI/AAMA VERSION: 1.0.0
SIZE LIST: M L
SAMPLE SIZE: M
RULE: DELTA 1 0.000, -0.000 100.000, -0.000
RULE: DELTA 2 0.000, -0.000 100.000, -100.000
`;

describe("parseRul", () => {
  it("reads every header field off a well-formed grade rule table", () => {
    const doc = parseRul(FIXTURE);
    expect(doc.author).toBe("J. Silva");
    expect(doc.product).toBe("Camisa Social");
    expect(doc.tableId).toBe("11111");
    expect(doc.units).toBe("metric");
    expect(doc.version).toBe("1.0.0");
    expect(doc.sizeList).toEqual(["M", "L"]);
    expect(doc.sampleSize).toBe("M");
    expect(doc.truncated).toBe(false);
    expect(doc.unrecognizedLines).toBe(0);
  });

  it("parses one [dx, dy] delta per SIZE LIST entry, in order, per rule", () => {
    const doc = parseRul(FIXTURE);
    expect(doc.rules).toEqual([
      {
        ruleNumber: 1,
        deltas: [
          [0, -0],
          [100, -0],
        ],
      },
      {
        ruleNumber: 2,
        deltas: [
          [0, -0],
          [100, -100],
        ],
      },
    ]);
  });

  it("returns an empty, non-throwing document for non-string/empty input", () => {
    // @ts-expect-error deliberately passing a non-string to prove it never throws
    expect(() => parseRul(null)).not.toThrow();
    // @ts-expect-error same as above
    const fromNull = parseRul(null);
    expect(fromNull.rules).toEqual([]);
    expect(parseRul("").rules).toEqual([]);
  });

  it("counts an unrecognisable line rather than dropping it silently", () => {
    const doc = parseRul(FIXTURE + "\nTHIS LINE HAS NO COLON\n");
    expect(doc.unrecognizedLines).toBe(1);
  });

  it("counts a known key whose value carries no delta pairs", () => {
    const doc = parseRul("SIZE LIST: M L\nRULE: DELTA 1 not-a-pair\n");
    expect(doc.unrecognizedLines).toBe(1);
    expect(doc.rules).toEqual([]);
  });

  it("ignores NUMBER OF SIZES entirely, deriving from SIZE LIST instead", () => {
    // A deliberately wrong count must not leak into the parsed document —
    // there is no field to disagree with SIZE LIST's own length.
    const doc = parseRul("NUMBER OF SIZES: 99\nSIZE LIST: P M G\n");
    expect(doc.sizeList).toHaveLength(3);
    expect(doc as unknown as { numberOfSizes?: unknown }).not.toHaveProperty(
      "numberOfSizes",
    );
  });

  it("caps the rule count and flags truncation rather than growing unbounded", () => {
    const lines = Array.from(
      { length: MAX_RULES + 5 },
      (_, i) => `RULE: DELTA ${i} 0.000, 0.000`,
    ).join("\n");
    const doc = parseRul(lines);
    expect(doc.rules).toHaveLength(MAX_RULES);
    expect(doc.truncated).toBe(true);
  });

  it("caps deltas per rule and flags truncation only when a real extra pair existed", () => {
    const exactlyAtCap = Array.from(
      { length: MAX_DELTAS_PER_RULE },
      () => "0.000, 0.000",
    ).join(" ");
    const atCapDoc = parseRul(`RULE: DELTA 1 ${exactlyAtCap}\n`);
    expect(atCapDoc.rules[0].deltas).toHaveLength(MAX_DELTAS_PER_RULE);
    expect(atCapDoc.truncated).toBe(false);

    const overCap = exactlyAtCap + " 1.000, 1.000";
    const overCapDoc = parseRul(`RULE: DELTA 1 ${overCap}\n`);
    expect(overCapDoc.rules[0].deltas).toHaveLength(MAX_DELTAS_PER_RULE);
    expect(overCapDoc.truncated).toBe(true);
  });

  it("recognises ENGLISH units too, not only METRIC", () => {
    expect(parseRul("UNITS: ENGLISH\n").units).toBe("english");
    expect(parseRul("UNITS: BOGUS\n").units).toBeNull();
  });
});

describe("analyzeRul", () => {
  it("every check is a {code, level, values?} object — no pt-BR prose in any field", () => {
    const summary = analyzeRul(parseRul(FIXTURE), "molde.rul", "molde.dxf");
    for (const check of summary.checks) {
      expect(typeof check.code).toBe("string");
      expect(["ok", "warning"]).toContain(check.level);
    }
  });

  it("reports rulLoaded ok with the real rule count", () => {
    const summary = analyzeRul(parseRul(FIXTURE), "molde.rul", "molde.dxf");
    expect(summary.checks).toContainEqual({
      code: "rulLoaded",
      level: "ok",
      values: { count: 2 },
    });
    expect(summary.ruleCount).toBe(2);
  });

  it("warns rulNoRulesFound when nothing parsed as a rule", () => {
    const summary = analyzeRul(parseRul("AUTHOR: nobody\n"), "x.rul", "x.dxf");
    expect(summary.checks).toContainEqual({
      code: "rulNoRulesFound",
      level: "warning",
    });
  });

  it("flags a base-filename mismatch between the .rul and the loaded .dxf", () => {
    const summary = analyzeRul(parseRul(FIXTURE), "outro.rul", "molde.dxf");
    expect(summary.checks.some((c) => c.code === "rulNameMismatch")).toBe(true);
  });

  it("does not flag a mismatch when the base filenames agree (case-insensitive)", () => {
    const summary = analyzeRul(parseRul(FIXTURE), "Molde.RUL", "molde.dxf");
    expect(summary.checks.some((c) => c.code === "rulNameMismatch")).toBe(
      false,
    );
  });

  it("does not flag a mismatch when no DXF filename is known", () => {
    const summary = analyzeRul(parseRul(FIXTURE), "molde.rul", null);
    expect(summary.checks.some((c) => c.code === "rulNameMismatch")).toBe(
      false,
    );
  });

  it("warns rulUnitsUnknown when UNITS was absent/unrecognised", () => {
    const summary = analyzeRul(
      parseRul("SIZE LIST: M L\nRULE: DELTA 1 0,0 1,1\n"),
      "x.rul",
      null,
    );
    expect(summary.checks.some((c) => c.code === "rulUnitsUnknown")).toBe(true);
  });
});
