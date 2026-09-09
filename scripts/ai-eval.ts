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
//
// Flags:
//   --only <id[,id...]>   run just these fixture ids (either suite). Spends
//                         fewer tokens while iterating on one failure, and
//                         NEVER writes the committed report (see below) --
//                         a 2-case run must not clobber the full baseline.
//   --verbose             on a mismatch, print the model's own
//                         assistantMessage/questions -- the direct evidence
//                         for WHY a decision or field didn't match, which
//                         the report table doesn't carry.
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
import { getProvider } from "../lib/ai/provider/registry";
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
import type { AiDecision } from "../lib/ai/decision";
import type { PatternState, GarmentSpec } from "../lib/types";

const REPORT_PATH = resolve(__dirname, "../docs/reference/ai-eval/report.md");

function parseArgs(argv: string[]) {
  const onlyIdx = argv.indexOf("--only");
  const only =
    onlyIdx === -1
      ? null
      : new Set(
          (argv[onlyIdx + 1] ?? "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        );
  return { only, verbose: argv.includes("--verbose") };
}

const ARGS = parseArgs(process.argv.slice(2));

function logMismatch(decision: AiDecision) {
  if (!ARGS.verbose) return;
  console.log(`  assistantMessage: ${decision.assistantMessage}`);
  if (decision.questions?.length) {
    console.log(`  questions: ${JSON.stringify(decision.questions)}`);
  }
}

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
  const cases = ARGS.only
    ? GENERATION_CASES.filter((c) => ARGS.only!.has(c.id))
    : GENERATION_CASES;
  const results: GenerationResult[] = [];
  for (const testCase of cases) {
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
      if (!result.decisionPassed) logMismatch(decision);
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
  const cases = ARGS.only
    ? EDITING_CASES.filter((c) => ARGS.only!.has(c.id))
    : EDITING_CASES;
  const results: EditingResult[] = [];
  for (const testCase of cases) {
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
      if (!result.changedAsExpected || result.hasCollateral) {
        logMismatch(decision);
      }
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
  const provider = getProvider();
  const caseCount = ARGS.only
    ? [...GENERATION_CASES, ...EDITING_CASES].filter((c) =>
        ARGS.only!.has(c.id),
      ).length
    : GENERATION_CASES.length + EDITING_CASES.length;
  console.log(
    `Spending real Anthropic tokens: ${caseCount} calls, each with up to one repair retry.\n`,
  );

  const generationResults = await runGeneration();
  const editingResults = await runEditing();

  const report = renderReport(
    {
      model: provider.model(),
      provider: provider.id,
      generatedAt: new Date().toISOString(),
    },
    generationResults,
    editingResults,
  );

  // #252: a --only run must never overwrite the committed baseline with a
  // partial report -- print it instead, the same reason a filtered vitest
  // run doesn't rewrite a coverage summary.
  if (ARGS.only) {
    console.log(`\n--only was set -- report NOT written, printed below:\n`);
    console.log(report);
    return;
  }

  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, report, "utf8");
  console.log(`\nReport written to ${REPORT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
