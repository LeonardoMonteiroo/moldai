// #252: the eval harness runner. NOT a *.test.ts on purpose --
// vitest.workspace.ts's "node" project includes scripts/**/*.test.{ts,tsx},
// so a runner spending real Anthropic tokens on every `npm test` would be
// wrong the same way smoke-prod.mjs would be wrong inside CI's test job.
// Run explicitly: `npm run eval:ai` (exactly smoke/smoke:prod's own
// precedent -- a separate script outside every test glob, invoked on
// purpose, no second flag to remember).
//
// Relative imports throughout, not "@/..." -- tsx has no tsconfig-paths
// loader configured (same reason scripts/cron-renew.ts stays relative).
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { proposeGarment } from "../lib/ai";
import {
  seedPatternState,
  addMessage,
  applyGarmentSpec,
} from "../lib/editor/state";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "../lib/measurements";
import { DEFAULT_ENGINE_ID } from "../lib/draft/engine/capability";
import { getEngine } from "../lib/draft/engine/registry";
import { t } from "../lib/i18n/test-translate";
import { GENERATION_CASES, EDITING_CASES } from "../lib/ai/eval/fixtures";
import {
  scoreGeneration,
  scoreEditing,
  draftSucceeds,
  type GenerationResult,
  type EditingResult,
} from "../lib/ai/eval/score";
import { renderReport } from "../lib/ai/eval/report";
import type { PatternState, GarmentSpec } from "../lib/types";

const REPORT_PATH = resolve(__dirname, "../docs/reference/ai-eval/report.md");

// The literal in lib/ai/index.ts -- there is no exported constant for it
// (deliberately: a hardcoded model string with no override, see
// docs/architecture/ai-provider.md once the provider facade lands). Named
// here only for the report header.
const MODEL = "claude-sonnet-5";
const PROVIDER = "anthropic";

function seedSizeTable(state: PatternState, gender: "male" | "female") {
  const table = gender === "male" ? SIZE_TABLE_MALE : SIZE_TABLE;
  state.pattern = {
    ...state.pattern,
    sizeTable: table,
    baseSize: "M",
    sizes: Object.keys(table),
  };
}

function baseRowFor(gender: string | undefined) {
  return gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
}

async function runGeneration(): Promise<GenerationResult[]> {
  const capability = getEngine(DEFAULT_ENGINE_ID).capability;
  const results: GenerationResult[] = [];
  for (const testCase of GENERATION_CASES) {
    const state = seedPatternState(t);
    seedSizeTable(state, "female");
    addMessage(state, {
      id: `msg-${testCase.id}`,
      author: "user",
      text: testCase.prompt,
      createdAt: Date.now(),
    });
    process.stdout.write(`generation: ${testCase.id}... `);
    try {
      const decision = await proposeGarment(state, { answering: false });
      const result = scoreGeneration(testCase, decision, (spec: GarmentSpec) =>
        draftSucceeds(
          DEFAULT_ENGINE_ID,
          capability,
          spec,
          baseRowFor(spec.gender),
          t,
        ),
      );
      results.push(result);
      console.log(result.decisionPassed ? "ok" : "MISMATCH");
    } catch (err) {
      console.log("ERROR:", err instanceof Error ? err.message : err);
      results.push({
        id: testCase.id,
        expectedDecision: testCase.expectedDecision,
        actualDecision: "decline",
        decisionPassed: false,
        fieldChecks: [],
        draftSucceeded: null,
      });
    }
  }
  return results;
}

async function runEditing(): Promise<EditingResult[]> {
  const results: EditingResult[] = [];
  for (const testCase of EDITING_CASES) {
    const state = seedPatternState(t);
    seedSizeTable(
      state,
      testCase.baseSpec.gender === "male" ? "male" : "female",
    );
    applyGarmentSpec(state, testCase.baseSpec, t);
    addMessage(state, {
      id: `msg-${testCase.id}`,
      author: "user",
      text: testCase.instruction,
      createdAt: Date.now(),
    });
    process.stdout.write(`editing: ${testCase.id}... `);
    try {
      const decision = await proposeGarment(state, { answering: false });
      const result = scoreEditing(testCase, decision.spec);
      results.push(result);
      console.log(result.changedAsExpected ? "ok" : "MISSING CHANGE");
    } catch (err) {
      console.log("ERROR:", err instanceof Error ? err.message : err);
      results.push({
        id: testCase.id,
        missingChanges: testCase.expectedChanged,
        collateralChanges: [],
        changedAsExpected: false,
        hasCollateral: false,
      });
    }
  }
  return results;
}

async function main() {
  console.log(
    `Spending real Anthropic tokens: ${GENERATION_CASES.length + EDITING_CASES.length} calls, each with up to one repair retry.\n`,
  );

  const generationResults = await runGeneration();
  const editingResults = await runEditing();

  const report = renderReport(
    { model: MODEL, provider: PROVIDER, generatedAt: new Date().toISOString() },
    generationResults,
    editingResults,
  );

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, report, "utf8");
  console.log(`\nReport written to ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
