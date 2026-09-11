import { aggregateGeneration, aggregateEditing } from "./score";
import type { GenerationResult, EditingResult } from "./score";

// Pure markdown rendering, split out from scripts/ai-eval.ts (which spends
// real Anthropic tokens and can't be unit-tested) the same way
// tshirtBenchmark.test.ts's own report writer stays separate from its
// scoring -- so the report's SHAPE is covered by a fast, deterministic test
// even though no test ever runs the real eval.

const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

export interface EvalMeta {
  model: string;
  provider: string;
  generatedAt: string; // ISO timestamp
}

export function renderReport(
  meta: EvalMeta,
  generationResults: GenerationResult[],
  editingResults: EditingResult[],
  // #265: the same EDITING_CASES that have a `scopedPieceKey`, re-run WITH a
  // resolved `partScope` -- optional so every existing caller (this report's
  // own test, and any older report) keeps rendering unchanged. Compared
  // against `edit` above (the identical cases, unscoped) rather than against
  // the full unscoped suite, so this is an apples-to-apples A/B on the same
  // instructions, not a full-suite-vs-subset mismatch.
  scopedEditingResults?: EditingResult[],
): string {
  const gen = aggregateGeneration(generationResults);
  const edit = aggregateEditing(editingResults);
  const editScoped = scopedEditingResults
    ? aggregateEditing(scopedEditingResults)
    : null;

  const decisions = ["apply", "ask", "decline", "explain"] as const;
  const confusionRows = decisions
    .filter((expected) => gen.confusion[expected])
    .map((expected) => {
      const row = gen.confusion[expected];
      const cells = decisions.map((actual) => row[actual] ?? 0).join(" | ");
      return `| ${expected} | ${cells} |`;
    });

  const genRows = generationResults.map(
    (r) =>
      `| ${r.id} | ${r.expectedDecision} | ${r.actualDecision} | ${r.decisionPassed ? "✅" : "❌"} | ${r.fieldChecks.filter((f) => !f.passed).length || "—"} | ${r.draftSucceeded === null ? "—" : r.draftSucceeded ? "✅" : "❌"} |`,
  );

  const editRows = editingResults.map(
    (r) =>
      `| ${r.id} | ${r.changedAsExpected ? "✅" : "❌ " + r.missingChanges.join(", ")} | ${r.hasCollateral ? "⚠️ " + r.collateralChanges.join(", ") : "—"} |`,
  );

  // #265: rendered only when the runner actually did the scoped re-run
  // (scripts/ai-eval.ts's own runEditing(true)) -- absent, this whole
  // subsection is omitted rather than printed with misleading zeros.
  const scopedSection = editScoped
    ? `

## Part scoping (issue 265): collateral drift, unscoped vs scoped

Same editing cases, same instructions -- the only difference is a resolved
\`partScope\` (the selected piece's own name) on the scoped run. This is the
number the honest caveat in issue 265's PR asks for: ChatGarment's
part-addressed training data is a training-data property, not yet a
demonstrated inference-time prompt effect for THIS prompt -- keep the
"# Scoped part" section only if the scoped row below actually beats the
unscoped one.

| | unscoped | scoped |
| --- | --- | --- |
| Change accuracy | ${pct(edit.changeAccuracy)} | ${pct(editScoped.changeAccuracy)} |
| Collateral-change rate | ${pct(edit.collateralRate)} | ${pct(editScoped.collateralRate)} |
`
    : "";

  return `# AI eval report

Baseline: **${meta.provider}:${meta.model}** — generated ${meta.generatedAt}

This is a measurement, not a gate — see docs/decisions/generation-flow.md's
own note that a prompt/schema change ships on inspection alone today. Compare
this file's numbers against the previous commit's before trusting a change
made things better.

## Generation (${gen.total} cases)

- Decision accuracy: **${pct(gen.decisionAccuracy)}**
- Field accuracy (apply cases only): **${pct(gen.fieldAccuracy)}** (${gen.fieldTotal} fields checked)
- Draft-success rate (applies, drafts, seamCheck empty): **${pct(gen.draftSuccessRate)}** (${gen.draftTotal} applicable)

### Decision confusion (rows = expected, columns = actual)

| expected \\ actual | apply | ask | decline | explain |
| --- | --- | --- | --- | --- |
${confusionRows.join("\n")}

### Per-case detail

| case | expected | actual | pass | failed fields | draft ok |
| --- | --- | --- | --- | --- | --- |
${genRows.join("\n")}

## Editing (${edit.total} cases)

- Change accuracy (every expected field moved): **${pct(edit.changeAccuracy)}**
- Collateral-change rate (an unrelated field moved too): **${pct(edit.collateralRate)}**

### Per-case detail

| case | changed as expected | collateral |
| --- | --- | --- |
${editRows.join("\n")}
${scopedSection}`;
}
