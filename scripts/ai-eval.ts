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
      // #276: tags this call's Langfuse trace as eval-harness traffic, not
      // production -- see lib/observability/langfuse.ts.
      const decision = await proposeGarment(state, {
        answering: false,
        evalRun: true,
      });
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

// #265: `scoped` re-runs the SAME cases/instructions with a resolved
// `partScope` (the eval-harness equivalent of the generate route's own
// selectedPieceId -> pattern.pieces lookup, by id -- here looked up by the
// case's own `scopedPieceKey` instead, since the harness has no client id to
// start from). This is what lets the report compare collateral drift
// scoped vs unscoped on identical instructions, per issue 265's own
// acceptance criteria: the section is kept or dropped on this number, not
// on inspection.
async function runEditing(scoped: boolean): Promise<EditingResult[]> {
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
    // Under the harness's identity Translate (lib/i18n/test-translate.ts), a
    // drafted piece's own `name` IS the literal `pieceNames.<key>` string --
    // no separate lookup table to keep in sync with messages/pt-BR.json.
    // Absent scopedPieceKey, or no matching piece among what baseSpec
    // actually drafted (e.g. a collar that doesn't exist until the edit
    // adds one), silently resolves to no partScope -- the same
    // "unresolved id behaves as unscoped" contract the real route follows.
    const partScope = scoped
      ? state.pattern.pieces.find(
          (p) => p.name === `pieceNames.${testCase.scopedPieceKey}`,
        )?.name
      : undefined;
    addMessage(state, {
      id: `msg-${testCase.id}`,
      author: "user",
      text: testCase.instruction,
      createdAt: Date.now(),
    });
    process.stdout.write(
      `editing${scoped ? " (scoped)" : ""}: ${testCase.id}... `,
    );
    try {
      // #276: tags this call's Langfuse trace as eval-harness traffic, not
      // production -- see lib/observability/langfuse.ts.
      const decision = await proposeGarment(state, {
        answering: false,
        evalRun: true,
        ...(partScope ? { partScope } : {}),
      });
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
  // #276: reads the actually-active provider/model (LLM_PROVIDER-aware)
  // instead of a hardcoded "claude-sonnet-5"/"anthropic" -- the report
  // header now stays honest when this harness runs against
  // LLM_PROVIDER=local, matching what each Langfuse trace tags the call
  // with (lib/observability/langfuse.ts).
  const provider = getProvider();
  // #265: editing cases now run twice -- once unscoped, once with a resolved
  // partScope -- to produce the scoped-vs-unscoped comparison renderReport's
  // new section prints, so they count double against the token budget.
  const generationCount = ARGS.only
    ? GENERATION_CASES.filter((c) => ARGS.only!.has(c.id)).length
    : GENERATION_CASES.length;
  const editingCount = ARGS.only
    ? EDITING_CASES.filter((c) => ARGS.only!.has(c.id)).length
    : EDITING_CASES.length;
  const caseCount = generationCount + editingCount * 2;
  console.log(
    `Spending real tokens against provider "${provider.id}" (${provider.model()}): ${caseCount} calls, each with up to one repair retry.\n`,
  );

  const generationResults = await runGeneration();
  const editingResults = await runEditing(false);
  const scopedEditingResults = await runEditing(true);

  const report = renderReport(
    {
      model: provider.model(),
      provider: provider.id,
      generatedAt: new Date().toISOString(),
    },
    generationResults,
    editingResults,
    scopedEditingResults,
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
