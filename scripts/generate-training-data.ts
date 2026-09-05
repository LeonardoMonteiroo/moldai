// #269 Fase 5 (dataset): the combinatorial generator this repo's own
// docs/decisions/ai-provider.md and docs/reference/lora-training/README.md
// name as the pivot away from the pattern-catalog-benchmark distillation
// (scripts/distill-training-data.ts, measured 0/26 kept pairs). Enumerates
// MOLDAI_CAPABILITY's own supported (type, style-field) combinations
// directly, phrases each in varied pt-BR (lib/ai/training/phrasings.ts,
// authored in-session -- $0 Anthropic spend), verifies every phrase through
// the REAL proposeGarment facade, and keeps a pair only when the model's own
// returned spec agrees with the fields the phrase actually named -- the same
// self-verifying criterion (draftSucceeds) the eval harness and the old
// distillation script both score against.
//
// NOT a *.test.ts -- excluded from both vitest projects' globs, same
// precedent as scripts/ai-eval.ts and scripts/distill-training-data.ts (a
// runner spending real Anthropic tokens has no place in `npm test`). Run
// explicitly: `npm run generate:training -- --dry-run` first (zero API
// calls), then a small `--transport=live --limit=50` smoke run, then the
// full batch run. See the plan's own Verification section.
//
// Relative imports throughout, not "@/..." -- tsx has no tsconfig-paths
// loader configured (the same reason scripts/ai-eval.ts/cron-renew.ts stay
// relative).
import Anthropic from "@anthropic-ai/sdk";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  appendFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  enumerateApplyCombinations,
  coverageReport,
  specPayloadFor,
  DECLINE_CASES,
  type Combination,
} from "../lib/ai/training/combinations";
import {
  composePhrasings,
  phrasingCoverageGaps,
  DECLINE_PROMPTS,
  EXPLAIN_PROMPTS,
} from "../lib/ai/training/phrasings";
import { draftsCleanly } from "../lib/ai/training/verify";
import {
  submitBatch,
  pollBatchUntilDone,
  collectBatchResults,
  type BatchJobRequest,
} from "../lib/ai/training/batch";
import { anthropicProvider } from "../lib/ai/provider/anthropic";
import type { LlmCallOptions } from "../lib/ai/provider/types";
import { validateSpec } from "../lib/draft/garment";
import { staticSectionsFor, buildDynamicSection } from "../lib/ai/prompt";
import { buildHistory } from "../lib/ai/history";
import { toolFor, parseRawToolInput } from "../lib/ai/schema";
import { resolveDecision, type AiDecision } from "../lib/ai/decision";
import { seedPatternState, addMessage } from "../lib/editor/state";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "../lib/measurements";
import { DEFAULT_ENGINE_ID } from "../lib/draft/engine/capability";
import { getEngine } from "../lib/draft/engine/registry";
import { t } from "../lib/i18n/test-translate";
import type {
  PatternState,
  GarmentSpec,
  GarmentType,
  Gender,
} from "../lib/types";

const OUTPUT_PATH = resolve(__dirname, "../data/training/combinatorial.jsonl");
const BATCH_SIDECAR_PATH = resolve(
  __dirname,
  "../data/training/combinatorial.batch.json",
);
const DEFAULT_MAX_TOKENS = 1024;

// ---------------------------------------------------------------------------
// CLI args -- no dependency, this repo's own precedent (scripts/ai-eval.ts,
// scripts/distill-training-data.ts) is plain env vars or no args at all;
// flags are simple enough here not to warrant a parsing library.
// ---------------------------------------------------------------------------

interface Args {
  dryRun: boolean;
  transport: "live" | "batch";
  limit?: number;
  seed: number;
  fillGaps: boolean;
  applyBudget: number;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split("=", 2)[1];
  return {
    dryRun: argv.includes("--dry-run"),
    transport: get("transport") === "live" ? "live" : "batch",
    limit: get("limit") ? Number(get("limit")) : undefined,
    seed: get("seed") ? Number(get("seed")) : 269,
    fillGaps: argv.includes("--fill-gaps"),
    // ~750 of the ~1,000-phrase budget -- the remaining ~250 covers
    // DECLINE_PROMPTS + EXPLAIN_PROMPTS (both fixed-size, hand-authored).
    applyBudget: get("apply-budget") ? Number(get("apply-budget")) : 750,
  };
}

// ---------------------------------------------------------------------------
// Task shape -- one per (combination|decline case|explain prompt, phrase).
// ---------------------------------------------------------------------------

type TaskKind = "apply" | "decline" | "explain";

interface Task {
  id: string;
  kind: TaskKind;
  promptPt: string;
  combo?: Combination;
  declineReasonTag?: string;
}

function stableId(kind: TaskKind, key: string, index: number): string {
  return `${kind}:${key}#${index}`;
}

/** A 64-char-limited, safe-charset id for the Batch API's `custom_id` --
 * see its own comment at the batch request-building call site. */
function shortId(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 32);
}

function baseRowFor(gender: Gender) {
  return gender === "male" ? SIZE_TABLE_MALE.M : SIZE_TABLE.M;
}

// ---------------------------------------------------------------------------
// Building the task list
// ---------------------------------------------------------------------------

interface PhrasingDeficit {
  combo: Combination;
  existing: string[];
  deficit: number;
}

interface BuildResult {
  tasks: Task[];
  totalCombosConsidered: number;
  combosDroppedByPreFilter: string[];
  phrasingDeficits: PhrasingDeficit[];
}

function buildTasks(args: Args): BuildResult {
  const capability = getEngine(DEFAULT_ENGINE_ID).capability;
  const allCombos = enumerateApplyCombinations(capability, {
    seed: args.seed,
  });
  const combosDroppedByPreFilter: string[] = [];

  // The free offline pre-filter -- every enumerated spec is run through
  // draftsCleanly (no network) before a single token is spent on it. This
  // re-verifies for whatever --seed/options THIS run actually used, rather
  // than trusting combinations.test.ts's fixed-seed guarantee alone.
  const combos = allCombos.filter((combo) => {
    const spec = validateSpec(specPayloadFor(combo));
    const ok = draftsCleanly(
      DEFAULT_ENGINE_ID,
      capability,
      combo,
      spec,
      baseRowFor(combo.gender),
      t,
    );
    if (!ok) combosDroppedByPreFilter.push(combo.key);
    return ok;
  });

  const perCombo = Math.max(
    2,
    Math.min(8, Math.round(args.applyBudget / Math.max(1, combos.length))),
  );

  const tasks: Task[] = [];
  const phrasingDeficits: PhrasingDeficit[] = [];
  for (const combo of combos) {
    const phrases = composePhrasings(combo, perCombo);
    phrases.forEach((promptPt, i) => {
      tasks.push({
        id: stableId("apply", combo.key, i),
        kind: "apply",
        promptPt,
        combo,
      });
    });
    // The composer's own fragment/template/use-case combinatorics ran dry
    // before reaching perCombo distinct sentences -- rare at this budget's
    // per-combo counts (2-8), but the exact trigger for --fill-gaps' opt-in
    // paid top-up (see fillPhrasingGap below) rather than silently shipping
    // fewer phrases than the budget asked for.
    if (phrases.length < perCombo) {
      phrasingDeficits.push({
        combo,
        existing: phrases,
        deficit: perCombo - phrases.length,
      });
    }
  }
  for (const declineCase of DECLINE_CASES) {
    const phrases = DECLINE_PROMPTS[declineCase.key] ?? [];
    phrases.forEach((promptPt, i) => {
      tasks.push({
        id: stableId("decline", declineCase.key, i),
        kind: "decline",
        promptPt,
        declineReasonTag: declineCase.reasonTag,
      });
    });
  }
  EXPLAIN_PROMPTS.forEach((promptPt, i) => {
    tasks.push({
      id: stableId("explain", "explain", i),
      kind: "explain",
      promptPt,
    });
  });

  return {
    tasks,
    totalCombosConsidered: allCombos.length,
    combosDroppedByPreFilter,
    phrasingDeficits,
  };
}

// ---------------------------------------------------------------------------
// Building the actual request per task -- mirrors proposeGarment
// (lib/ai/index.ts) exactly, for the moldai engine only (this generator's
// whole premise is MOLDAI_CAPABILITY's own supported combinations).
// ---------------------------------------------------------------------------

function stateForTask(task: Task): PatternState {
  const state = seedPatternState(t);
  const gender: Gender = task.combo?.gender ?? "female";
  const table = gender === "male" ? SIZE_TABLE_MALE : SIZE_TABLE;
  state.pattern = {
    ...state.pattern,
    sizeTable: table,
    baseSize: "M",
    sizes: Object.keys(table),
  };
  addMessage(state, {
    id: `msg-${task.id}`,
    author: "user",
    text: task.promptPt,
    createdAt: Date.now(),
  });
  return state;
}

function optionsForTask(task: Task): { opts: LlmCallOptions; system: string } {
  const state = stateForTask(task);
  const systemStatic = staticSectionsFor(DEFAULT_ENGINE_ID);
  const systemDynamic = buildDynamicSection(state, { answering: false });
  return {
    opts: {
      systemStatic,
      systemDynamic,
      tool: toolFor(DEFAULT_ENGINE_ID),
      toolChoice: "propose_garment",
      messages: buildHistory(state.chat),
      maxTokens: DEFAULT_MAX_TOKENS,
    },
    system: `${systemStatic}\n\n${systemDynamic}`,
  };
}

// ---------------------------------------------------------------------------
// Scoring/keep logic -- per task kind. The training label is always the
// spec the model returned, kept only if it agrees with what the phrase
// actually named (the planning conversation's own decision).
// ---------------------------------------------------------------------------

interface TrainingExample {
  id: string;
  source: "combinatorial";
  comboKey?: string;
  arity?: number;
  decision: AiDecision["decision"];
  promptPt: string;
  spec: GarmentSpec;
  expectedStyle?: Record<string, unknown>;
  assistantMessage: string;
  system: string;
  // Carried through verbatim from AiDecision (lib/ai/decision.ts) -- a
  // real ask/decline/explain example is not a full RawToolInput replay
  // without these; dropping them would silently lose the clarifying
  // questions/decline reason/assembly-order signal
  // scripts/lora/prepare_dataset.py needs to reconstruct a faithful
  // propose_garment tool call for the fine-tune.
  questions?: AiDecision["questions"];
  declineReason?: string;
  assemblyOrder?: boolean;
}

// Fields every kept example carries regardless of decision, factored out
// so the three scoreTask branches below can't drift on which AiDecision
// fields get preserved.
function baseExample(
  task: Task,
  decision: AiDecision,
  system: string,
): Omit<TrainingExample, "decision" | "comboKey" | "arity" | "expectedStyle"> {
  return {
    id: task.id,
    source: "combinatorial",
    promptPt: task.promptPt,
    spec: decision.spec,
    assistantMessage: decision.assistantMessage,
    system,
    ...(decision.questions ? { questions: decision.questions } : {}),
    ...(decision.declineReason !== undefined
      ? { declineReason: decision.declineReason }
      : {}),
    ...(decision.assemblyOrder ? { assemblyOrder: true } : {}),
  };
}

function fieldsAgree(combo: Combination, decision: AiDecision): boolean {
  for (const [field, value] of Object.entries(combo.fields)) {
    if (
      decision.spec.style[field as keyof typeof decision.spec.style] !== value
    ) {
      return false;
    }
  }
  if (combo.gender === "male" && decision.spec.gender !== "male") return false;
  return true;
}

function scoreTask(
  task: Task,
  decision: AiDecision,
  system: string,
  capability = getEngine(DEFAULT_ENGINE_ID).capability,
): TrainingExample | null {
  if (task.kind === "apply") {
    const combo = task.combo!;
    if (decision.decision === "apply") {
      if (!fieldsAgree(combo, decision)) return null;
      const ok = draftsCleanly(
        DEFAULT_ENGINE_ID,
        capability,
        combo,
        decision.spec,
        baseRowFor(combo.gender),
        t,
      );
      if (!ok) return null;
      return {
        ...baseExample(task, decision, system),
        comboKey: combo.key,
        arity: combo.arity,
        decision: "apply",
        expectedStyle: combo.fields as Record<string, unknown>,
      };
    }
    // Thin (arity 1-2) combinations are exactly where the prompt's own
    // blank-pattern rule pushes toward `ask` -- accept it as real training
    // signal instead of forcing every combination to a single expected
    // decision. A confident higher-arity combination returning
    // ask/decline/explain is an unverifiable miss and is dropped.
    if (decision.decision === "ask" && combo.arity <= 2) {
      return {
        ...baseExample(task, decision, system),
        comboKey: combo.key,
        arity: combo.arity,
        decision: "ask",
      };
    }
    return null;
  }
  if (task.kind === "decline") {
    if (decision.decision !== "decline") return null;
    return { ...baseExample(task, decision, system), decision: "decline" };
  }
  // explain
  if (decision.decision !== "explain") return null;
  return { ...baseExample(task, decision, system), decision: "explain" };
}

// ---------------------------------------------------------------------------
// Resumability -- read ids already written, skip re-generating/re-verifying
// them. Append-only.
// ---------------------------------------------------------------------------

function existingIds(path: string): Set<string> {
  if (!existsSync(path)) return new Set();
  const ids = new Set<string>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line) as { id?: string };
      if (parsed.id) ids.add(parsed.id);
    } catch {
      // corrupt/truncated line -- ignore, don't crash a resume over it
    }
  }
  return ids;
}

function appendExample(path: string, example: TrainingExample): void {
  appendFileSync(path, JSON.stringify(example) + "\n");
}

// ---------------------------------------------------------------------------
// Cost estimate -- flat per-phrase figures from this generator's own design
// discussion (~6.2k cached-read static + ~2.2k fresh dynamic + ~300 out
// tokens per call, Sonnet 5 pricing): ~US$0.01 live, ~US$0.005 batch (50%
// off). An approximation for planning purposes, not a billing guarantee.
// ---------------------------------------------------------------------------

function estimateCostUsd(
  taskCount: number,
  transport: "live" | "batch",
): number {
  const perPhrase = transport === "batch" ? 0.005 : 0.01;
  return taskCount * perPhrase;
}

// ---------------------------------------------------------------------------
// --fill-gaps: an OPT-IN, real-money path -- the one place in this whole
// generator that spends tokens on PHRASING rather than only on
// verification. Used when a combination's authored fragment variety can't
// produce as many distinct phrasings as the budget calls for (composer
// exhaustion), or when scaling past what phrasings.ts's hand-curated banks
// support. A short plain-text completion, the same shape
// scripts/distill-training-data.ts's own translateToPtBrPrompt uses --
// never routed through proposeGarment (that would defeat the point of a
// cheap phrasing-only call).
// ---------------------------------------------------------------------------

async function fillPhrasingGap(
  client: Anthropic,
  combo: Combination,
  existing: string[],
  needed: number,
): Promise<string[]> {
  const fieldList = Object.entries(combo.fields)
    .map(([f, v]) => `${f}=${v}`)
    .join(", ");
  const resp = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content:
          `Escreva ${needed} pedidos DIFERENTES entre si, em português do Brasil, de um cliente de ateliê de costura pedindo ${TYPE_NOUN_FOR_PROMPT[combo.type]} com exatamente estas características (nomeie todas, não invente outras): ${fieldList}. ` +
          `Varie o registro (formal, coloquial, direto) e o vocabulário -- não repita as frases já existentes:\n${existing.join("\n")}\n\n` +
          `Responda só com as ${needed} frases, uma por linha, sem numeração.`,
      },
    ],
  });
  const block = resp.content.find((b) => b.type === "text");
  if (!block || block.type !== "text") return [];
  return block.text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .slice(0, needed);
}

const TYPE_NOUN_FOR_PROMPT: Record<GarmentType, string> = {
  blouse: "uma blusa",
  dress: "um vestido",
  tshirt: "uma camiseta",
  skirt: "uma saia",
  trousers: "uma calça",
  hoodie: "um moletom com capuz",
  coat: "um casaco",
  shirt: "uma camisa social",
};

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const capability = getEngine(DEFAULT_ENGINE_ID).capability;

  const allCombosForReport = enumerateApplyCombinations(capability, {
    seed: args.seed,
  });
  const phrasingGaps = phrasingCoverageGaps(allCombosForReport);
  const declineGaps = DECLINE_CASES.filter((d) => !DECLINE_PROMPTS[d.key]);
  const report = coverageReport(capability, allCombosForReport);

  const {
    tasks,
    totalCombosConsidered,
    combosDroppedByPreFilter,
    phrasingDeficits,
  } = buildTasks(args);

  console.log(`Combinations enumerated: ${totalCombosConsidered}`);
  console.log(
    `  dropped by the offline pre-filter (armhole-cap-aware draft check): ${combosDroppedByPreFilter.length}`,
  );
  console.log(
    `  under-covered (type,field,value) triples: ${report.underCovered.length}`,
  );
  if (report.underCovered.length > 0) {
    console.log("   ", report.underCovered.slice(0, 10));
  }
  console.log("  pairwise coverage (reported, not guaranteed):");
  for (const p of report.pairwise) {
    console.log(
      `    ${p.type}: ${p.fieldA}×${p.fieldB} — ${p.coveredPairs}/${p.totalPairs}`,
    );
  }
  console.log(`  phrasing gaps: ${phrasingGaps.length}`);
  console.log(`  decline prompt gaps: ${declineGaps.map((d) => d.key)}`);
  console.log(
    `  combinations short of their phrasing budget (composer exhaustion): ${phrasingDeficits.length}` +
      (phrasingDeficits.length > 0 && !args.fillGaps
        ? " -- pass --fill-gaps to top these up with a real (paid) phrasing call"
        : ""),
  );

  const applyCount = tasks.filter((t2) => t2.kind === "apply").length;
  const declineCount = tasks.filter((t2) => t2.kind === "decline").length;
  const explainCount = tasks.filter((t2) => t2.kind === "explain").length;
  console.log(
    `\nTasks: ${tasks.length} total (apply ${applyCount}, decline ${declineCount}, explain ${explainCount})`,
  );
  console.log(
    `Estimated cost (${args.transport}): ~US$${estimateCostUsd(tasks.length, args.transport).toFixed(2)}`,
  );

  if (args.dryRun) {
    console.log("\n--dry-run: no API calls made.");
    return;
  }

  const already = existingIds(OUTPUT_PATH);
  let pending = tasks.filter((t2) => !already.has(t2.id));
  if (args.limit) pending = pending.slice(0, args.limit);
  console.log(
    `\n${already.size} examples already present -- ${pending.length} pending this run.`,
  );
  if (pending.length === 0) {
    console.log("Nothing to do.");
    return;
  }

  mkdirSync(resolve(__dirname, "../data/training"), { recursive: true });
  const client = new Anthropic();

  if (args.fillGaps && phrasingDeficits.length > 0) {
    console.log(
      `--fill-gaps: topping up ${phrasingDeficits.length} combination(s) short of their phrasing budget (real Anthropic spend, phrasing-only, never routed through proposeGarment)...`,
    );
    const filled: Task[] = [];
    for (const { combo, existing, deficit } of phrasingDeficits) {
      const extra = await fillPhrasingGap(client, combo, existing, deficit);
      extra.forEach((promptPt, i) => {
        filled.push({
          id: stableId("apply", combo.key, existing.length + i),
          kind: "apply",
          promptPt,
          combo,
        });
      });
    }
    const newFilled = filled.filter((t2) => !already.has(t2.id));
    pending = [...pending, ...newFilled];
    console.log(
      `  added ${newFilled.length}/${phrasingDeficits.reduce((s, d) => s + d.deficit, 0)} requested top-up phrases.`,
    );
  }

  let kept = 0;
  if (args.transport === "live") {
    for (const task of pending) {
      process.stdout.write(`${task.id}... `);
      try {
        const { opts, system } = optionsForTask(task);
        const result = await anthropicProvider.propose(opts);
        const decision = resolveDecision(
          parseRawToolInput(result.toolInput),
          false,
        );
        const example = scoreTask(task, decision, system, capability);
        if (example && !already.has(example.id)) {
          appendExample(OUTPUT_PATH, example);
          already.add(example.id);
          kept++;
          console.log(`kept (${example.decision})`);
        } else {
          console.log(`skip (${decision.decision})`);
        }
      } catch (err) {
        console.log("ERROR:", err instanceof Error ? err.message : err);
      }
    }
  } else {
    // The Batch API caps custom_id at 64 characters, well under this
    // generator's own descriptive task ids (a combo key can run past that
    // on its own) -- discovered by this script's own small real-batch
    // smoke test, not assumed in advance. Send a short hash on the wire;
    // keep the full descriptive id (and everything else) in the JSONL.
    const allTasksById = new Map(tasks.map((t2) => [t2.id, t2]));
    const systemById = new Map<string, string>();

    let batchId: string;
    let submittedTaskIds: string[];
    if (existsSync(BATCH_SIDECAR_PATH)) {
      // Resuming a prior run's in-flight batch -- rebuild from the EXACT
      // task ids that batch actually submitted (persisted in the
      // sidecar), not from `pending` recomputed now, which could have
      // drifted if the output file changed between runs.
      const sidecar = JSON.parse(readFileSync(BATCH_SIDECAR_PATH, "utf8")) as {
        batchId: string;
        taskIds: string[];
      };
      batchId = sidecar.batchId;
      submittedTaskIds = sidecar.taskIds;
      console.log(
        `Resuming existing batch ${batchId} (${submittedTaskIds.length} requests) from sidecar.`,
      );
      for (const id of submittedTaskIds) {
        const task = allTasksById.get(id);
        if (task) systemById.set(task.id, optionsForTask(task).system);
      }
    } else {
      submittedTaskIds = pending.map((t2) => t2.id);
      const requests: BatchJobRequest[] = pending.map((task) => {
        const { opts, system } = optionsForTask(task);
        systemById.set(task.id, system);
        return { customId: shortId(task.id), opts };
      });
      console.log(`Submitting batch of ${requests.length} requests...`);
      batchId = await submitBatch(client, requests);
      writeFileSync(
        BATCH_SIDECAR_PATH,
        JSON.stringify({ batchId, taskIds: submittedTaskIds }),
        "utf8",
      );
      console.log(`Batch ${batchId} submitted. Sidecar written for resume.`);
    }
    const byShortId = new Map(
      submittedTaskIds
        .map((id) => allTasksById.get(id))
        .filter((t2): t2 is Task => t2 !== undefined)
        .map((t2) => [shortId(t2.id), t2] as const),
    );

    await pollBatchUntilDone(client, batchId, {
      intervalMs: 30_000,
      onTick: (status) =>
        console.log(
          `  ${status.processingStatus} -- ${JSON.stringify(status.counts)}`,
        ),
    });

    const results = await collectBatchResults(client, batchId);
    for (const result of results) {
      const task = byShortId.get(result.customId);
      if (!task) continue;
      if (!result.ok) {
        console.log(`${task.id}: batch error (${result.reason})`);
        continue;
      }
      try {
        const decision = resolveDecision(
          parseRawToolInput(result.toolInput),
          false,
        );
        const system = systemById.get(task.id) ?? "";
        const example = scoreTask(task, decision, system, capability);
        // The `already.has` guard matters here specifically: if a prior
        // run crashed between collecting this batch's results and clearing
        // the sidecar, a resume re-processes the same batch and would
        // otherwise re-append an id it already wrote.
        if (example && !already.has(example.id)) {
          appendExample(OUTPUT_PATH, example);
          already.add(example.id);
          kept++;
        }
      } catch (err) {
        console.log(
          `${task.id}: ERROR`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    // The batch is fully processed (results collected and scored) -- clear
    // the sidecar so the NEXT invocation submits a fresh batch for
    // whatever's still pending instead of re-"resuming" this finished one.
    // Missing before this fix: a real bug this smoke run's own second
    // invocation would have hit had it not been caught here.
    if (existsSync(BATCH_SIDECAR_PATH)) unlinkSync(BATCH_SIDECAR_PATH);
  }

  console.log(`\n${kept}/${pending.length} kept this run -> ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
