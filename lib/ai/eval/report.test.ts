import { describe, it, expect } from "vitest";
import { renderReport } from "./report";
import type { GenerationResult, EditingResult } from "./score";

describe("renderReport", () => {
  it("renders the baseline header, both sections, and per-case rows", () => {
    const generation: GenerationResult[] = [
      {
        id: "blouse-v-long",
        expectedDecision: "apply",
        actualDecision: "apply",
        decisionPassed: true,
        fieldChecks: [
          { field: "neckline", expected: "V", actual: "V", passed: true },
        ],
        draftSucceeded: true,
      },
      {
        id: "ask-underspecified",
        expectedDecision: "ask",
        actualDecision: "apply",
        decisionPassed: false,
        fieldChecks: [],
        draftSucceeded: null,
      },
    ];
    const editing: EditingResult[] = [
      {
        id: "edit-blouse-collar",
        missingChanges: [],
        collateralChanges: [],
        changedAsExpected: true,
        hasCollateral: false,
      },
    ];

    const out = renderReport(
      {
        model: "claude-sonnet-5",
        provider: "anthropic",
        generatedAt: "2026-09-05T00:00:00.000Z",
      },
      generation,
      editing,
    );

    expect(out).toContain("anthropic:claude-sonnet-5");
    expect(out).toContain("Decision accuracy: **50.0%**");
    expect(out).toContain("blouse-v-long");
    expect(out).toContain("ask-underspecified");
    expect(out).toContain("edit-blouse-collar");
    expect(out).toContain("| ask | 1 | 0 | 0 | 0 |");
  });

  // #265: the scoped-vs-unscoped comparison is opt-in via a 4th argument --
  // absent, the report stays byte-for-byte what it was before this existed.
  it("omits the part-scoping section entirely when no scoped results are given", () => {
    const out = renderReport(
      {
        model: "claude-sonnet-5",
        provider: "anthropic",
        generatedAt: "2026-09-05T00:00:00.000Z",
      },
      [],
      [],
    );
    expect(out).not.toContain("Part scoping");
  });

  it("renders the scoped-vs-unscoped collateral comparison when given", () => {
    const editing: EditingResult[] = [
      {
        id: "a",
        missingChanges: [],
        collateralChanges: ["collar"],
        changedAsExpected: true,
        hasCollateral: true,
      },
    ];
    const scopedEditing: EditingResult[] = [
      {
        id: "a",
        missingChanges: [],
        collateralChanges: [],
        changedAsExpected: true,
        hasCollateral: false,
      },
    ];

    const out = renderReport(
      {
        model: "claude-sonnet-5",
        provider: "anthropic",
        generatedAt: "2026-09-05T00:00:00.000Z",
      },
      [],
      editing,
      scopedEditing,
    );

    expect(out).toContain("Part scoping");
    expect(out).toContain("| Collateral-change rate | 100.0% | 0.0% |");
  });
});
