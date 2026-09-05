import type { GarmentSpec } from "@/lib/types";
import type { Measurements } from "@/lib/measurements";
import type { Translate } from "@/lib/i18n/translate";
import type { AiDecision, Decision } from "@/lib/ai/decision";
import {
  checkEngineSupport,
  type EngineId,
  type EngineCapability,
} from "@/lib/draft/engine/capability";
import { draftGarment } from "@/lib/draft/engine/facade";
import { seamCheck } from "@/lib/draft/garment";
import { diffSpec, type SpecField } from "@/lib/draft/specDiff";
import type { GenerationCase, EditingCase } from "./types";

// #252: pure scoring, no network -- the runner (scripts/ai-eval.ts) is the
// only thing that actually calls proposeGarment. Kept separate so this file
// is unit-testable against hand-built AiDecision fixtures, the same
// leaf/heavy split lib/draft/engine/capability.ts documents for its own
// module.

/**
 * Whether `spec` drafts cleanly on the given engine: no blocking
 * type/measurement gap (checkEngineSupport, the same gate the generate
 * route applies before ever drafting), at least one piece, and an empty
 * seamCheck over the resulting seam graph -- MoldAI's own
 * Simulation-Success-Rate analogue (#252's own Context section).
 */
export function draftSucceeds(
  engine: EngineId,
  capability: EngineCapability,
  spec: GarmentSpec,
  baseMeasurements: Measurements,
  t: Translate,
): boolean {
  const gaps = checkEngineSupport(capability, spec, baseMeasurements);
  if (gaps.some((g) => g.kind === "type" || g.kind === "measurements")) {
    return false;
  }
  try {
    const { pieces, seamGraph } = draftGarment(
      engine,
      spec,
      baseMeasurements,
      t,
    );
    return pieces.length > 0 && seamCheck(seamGraph).length === 0;
  } catch {
    return false;
  }
}

export interface FieldCheck {
  field: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
}

export interface GenerationResult {
  id: string;
  expectedDecision: Decision;
  actualDecision: Decision;
  decisionPassed: boolean;
  fieldChecks: FieldCheck[];
  // null when the case never expected/got a drafted spec -- there is
  // nothing to draft-check for an ask/decline/explain turn.
  draftSucceeded: boolean | null;
}

export function scoreGeneration(
  testCase: GenerationCase,
  decision: AiDecision,
  draftCheck: (spec: GarmentSpec) => boolean,
): GenerationResult {
  const decisionPassed = decision.decision === testCase.expectedDecision;
  const fieldChecks: FieldCheck[] = [];
  let draftSucceeded: boolean | null = null;

  if (testCase.expectedDecision === "apply" && decision.decision === "apply") {
    if (testCase.expectedType !== undefined) {
      fieldChecks.push({
        field: "type",
        expected: testCase.expectedType,
        actual: decision.spec.type,
        passed: decision.spec.type === testCase.expectedType,
      });
    }
    for (const [field, expected] of Object.entries(
      testCase.expectedStyle ?? {},
    )) {
      const actual =
        decision.spec.style[field as keyof typeof decision.spec.style];
      fieldChecks.push({
        field,
        expected,
        actual,
        passed: actual === expected,
      });
    }
    draftSucceeded = draftCheck(decision.spec);
  }

  return {
    id: testCase.id,
    expectedDecision: testCase.expectedDecision,
    actualDecision: decision.decision,
    decisionPassed,
    fieldChecks,
    draftSucceeded,
  };
}

export interface EditingResult {
  id: string;
  missingChanges: SpecField[];
  collateralChanges: SpecField[];
  changedAsExpected: boolean;
  hasCollateral: boolean;
}

export function scoreEditing(
  testCase: EditingCase,
  afterSpec: GarmentSpec,
): EditingResult {
  const changes = diffSpec(testCase.baseSpec, afterSpec);
  const changedFields = new Set(changes.map((c) => c.field));
  const missingChanges = testCase.expectedChanged.filter(
    (f) => !changedFields.has(f),
  );
  const collateralChanges = testCase.expectedUnchanged.filter((f) =>
    changedFields.has(f),
  );
  return {
    id: testCase.id,
    missingChanges,
    collateralChanges,
    changedAsExpected: missingChanges.length === 0,
    hasCollateral: collateralChanges.length > 0,
  };
}

export interface EvalReport {
  generation: {
    total: number;
    decisionAccuracy: number;
    confusion: Record<string, Record<string, number>>;
    fieldAccuracy: number;
    fieldTotal: number;
    draftSuccessRate: number;
    draftTotal: number;
  };
  editing: {
    total: number;
    changeAccuracy: number;
    collateralRate: number;
  };
}

const rate = (passed: number, total: number) =>
  total === 0 ? 1 : passed / total;

export function aggregateGeneration(
  results: GenerationResult[],
): EvalReport["generation"] {
  const confusion: Record<string, Record<string, number>> = {};
  let decisionPassed = 0;
  let fieldPassed = 0;
  let fieldTotal = 0;
  let draftPassed = 0;
  let draftTotal = 0;

  for (const r of results) {
    if (r.decisionPassed) decisionPassed++;
    confusion[r.expectedDecision] ??= {};
    confusion[r.expectedDecision][r.actualDecision] =
      (confusion[r.expectedDecision][r.actualDecision] ?? 0) + 1;
    for (const f of r.fieldChecks) {
      fieldTotal++;
      if (f.passed) fieldPassed++;
    }
    if (r.draftSucceeded !== null) {
      draftTotal++;
      if (r.draftSucceeded) draftPassed++;
    }
  }

  return {
    total: results.length,
    decisionAccuracy: rate(decisionPassed, results.length),
    confusion,
    fieldAccuracy: rate(fieldPassed, fieldTotal),
    fieldTotal,
    draftSuccessRate: rate(draftPassed, draftTotal),
    draftTotal,
  };
}

export function aggregateEditing(
  results: EditingResult[],
): EvalReport["editing"] {
  const changedOk = results.filter((r) => r.changedAsExpected).length;
  const withCollateral = results.filter((r) => r.hasCollateral).length;
  return {
    total: results.length,
    changeAccuracy: rate(changedOk, results.length),
    collateralRate: rate(withCollateral, results.length),
  };
}
