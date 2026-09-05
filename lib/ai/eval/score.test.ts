import { describe, it, expect } from "vitest";
import {
  scoreGeneration,
  scoreEditing,
  aggregateGeneration,
  aggregateEditing,
  draftSucceeds,
} from "./score";
import { validateSpec } from "@/lib/draft/garment";
import { DEFAULT_ENGINE_ID } from "@/lib/draft/engine/capability";
import { getEngine } from "@/lib/draft/engine/registry";
import { SIZE_TABLE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import type { AiDecision } from "@/lib/ai/decision";
import type { GenerationCase, EditingCase } from "./types";

const capability = getEngine(DEFAULT_ENGINE_ID).capability;

function decisionFor(spec: ReturnType<typeof validateSpec>): AiDecision {
  return { decision: "apply", spec, assistantMessage: "ok" };
}

describe("scoreGeneration", () => {
  it("passes decision and field checks that match", () => {
    const testCase: GenerationCase = {
      id: "x",
      prompt: "blusa decote V",
      expectedDecision: "apply",
      expectedType: "blouse",
      expectedStyle: { neckline: "V" },
    };
    const spec = validateSpec({ type: "blouse", style: { neckline: "V" } });
    const result = scoreGeneration(testCase, decisionFor(spec), () => true);
    expect(result.decisionPassed).toBe(true);
    expect(result.fieldChecks.every((f) => f.passed)).toBe(true);
    expect(result.draftSucceeded).toBe(true);
  });

  it("fails a field check that doesn't match", () => {
    const testCase: GenerationCase = {
      id: "x",
      prompt: "blusa decote V",
      expectedDecision: "apply",
      expectedStyle: { neckline: "V" },
    };
    const spec = validateSpec({ type: "blouse", style: { neckline: "round" } });
    const result = scoreGeneration(testCase, decisionFor(spec), () => true);
    expect(result.fieldChecks).toEqual([
      { field: "neckline", expected: "V", actual: "round", passed: false },
    ]);
  });

  it("reports a decision mismatch without checking fields", () => {
    const testCase: GenerationCase = {
      id: "x",
      prompt: "vestido",
      expectedDecision: "ask",
    };
    const spec = validateSpec({ type: "dress" });
    const result = scoreGeneration(testCase, decisionFor(spec), () => true);
    expect(result.decisionPassed).toBe(false);
    expect(result.draftSucceeded).toBeNull();
  });
});

describe("scoreEditing", () => {
  it("passes when exactly the expected field changed", () => {
    const testCase: EditingCase = {
      id: "e",
      baseSpec: validateSpec({ type: "blouse", style: { sleeve: "short" } }),
      instruction: "manga longa",
      expectedChanged: ["sleeve"],
      expectedUnchanged: ["type", "gender"],
    };
    const after = validateSpec({ type: "blouse", style: { sleeve: "long" } });
    const result = scoreEditing(testCase, after);
    expect(result.changedAsExpected).toBe(true);
    expect(result.hasCollateral).toBe(false);
  });

  it("flags a collateral change to a field named as unchanged", () => {
    const testCase: EditingCase = {
      id: "e",
      baseSpec: validateSpec({
        type: "blouse",
        style: { sleeve: "short", collar: "none" },
      }),
      instruction: "manga longa",
      expectedChanged: ["sleeve"],
      expectedUnchanged: ["collar"],
    };
    const after = validateSpec({
      type: "blouse",
      style: { sleeve: "long", collar: "band" },
    });
    const result = scoreEditing(testCase, after);
    expect(result.changedAsExpected).toBe(true);
    expect(result.hasCollateral).toBe(true);
    expect(result.collateralChanges).toEqual(["collar"]);
  });

  it("flags a missing expected change", () => {
    const testCase: EditingCase = {
      id: "e",
      baseSpec: validateSpec({ type: "blouse", style: { sleeve: "short" } }),
      instruction: "manga longa",
      expectedChanged: ["sleeve"],
      expectedUnchanged: [],
    };
    const after = validateSpec({ type: "blouse", style: { sleeve: "short" } });
    const result = scoreEditing(testCase, after);
    expect(result.changedAsExpected).toBe(false);
    expect(result.missingChanges).toEqual(["sleeve"]);
  });
});

describe("draftSucceeds", () => {
  it("is true for a spec the engine can draft with no seam conflict", () => {
    const spec = validateSpec({ type: "tshirt", gender: "male" });
    expect(
      draftSucceeds(DEFAULT_ENGINE_ID, capability, spec, SIZE_TABLE.M, t),
    ).toBe(true);
  });

  it("is false for a garment type the engine doesn't support", () => {
    const spec = validateSpec({ type: "hoodie" });
    expect(
      draftSucceeds(DEFAULT_ENGINE_ID, capability, spec, SIZE_TABLE.M, t),
    ).toBe(false);
  });
});

describe("aggregateGeneration / aggregateEditing", () => {
  it("computes decision accuracy, a confusion matrix, and rates", () => {
    const results = [
      scoreGeneration(
        { id: "a", prompt: "", expectedDecision: "apply" },
        decisionFor(validateSpec({ type: "blouse" })),
        () => true,
      ),
      scoreGeneration(
        { id: "b", prompt: "", expectedDecision: "ask" },
        decisionFor(validateSpec({ type: "blouse" })),
        () => true,
      ),
    ];
    const report = aggregateGeneration(results);
    expect(report.total).toBe(2);
    expect(report.decisionAccuracy).toBe(0.5);
    expect(report.confusion.ask.apply).toBe(1);
    expect(report.confusion.apply.apply).toBe(1);
  });

  it("computes editing change accuracy and collateral rate", () => {
    const base = validateSpec({ type: "blouse", style: { sleeve: "short" } });
    const results = [
      scoreEditing(
        {
          id: "a",
          baseSpec: base,
          instruction: "",
          expectedChanged: ["sleeve"],
          expectedUnchanged: ["collar"],
        },
        validateSpec({ type: "blouse", style: { sleeve: "long" } }),
      ),
      scoreEditing(
        {
          id: "b",
          baseSpec: base,
          instruction: "",
          expectedChanged: ["sleeve"],
          expectedUnchanged: ["collar"],
        },
        validateSpec({
          type: "blouse",
          style: { sleeve: "long", collar: "band" },
        }),
      ),
    ];
    const report = aggregateEditing(results);
    expect(report.total).toBe(2);
    expect(report.changeAccuracy).toBe(1);
    expect(report.collateralRate).toBe(0.5);
  });
});
