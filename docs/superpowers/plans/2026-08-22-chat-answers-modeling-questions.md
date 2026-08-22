# Chat Answers Modeling and Product Questions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the editor's chat to answer pattern-making and MoldAI-product questions through a fourth AI decision (`explain`), and delete the inert "Glossário: o que é pence? · em breve" line that issue #20 was originally about.

**Architecture:** `proposeGarment` returns `apply | decline | ask | explain`. `explain` answers in prose and drafts nothing — no `applyGarmentSpec`, no `bumpVersion`, no size-chart snapshot — but unlike `ask`/`decline` it **keeps** the `COSTS.adjust` debit, so the answer bubble carries the credit chip. The system prompt gains a `# Modeling knowledge` section (free-form domain knowledge) and a `# Product facts` section whose prices and export formats render from `COSTS` and a new `EXPORT_FORMATS` constant, so the prompt can never quote a price the app doesn't charge.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Anthropic SDK (`claude-sonnet-5`, forced tool use), Vitest (two projects: `node` + `dom`), next-intl (single pt-BR catalog), Prisma/Postgres.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-22-chat-answers-modeling-questions-design.md` — read it before Task 1.
- **Commits:** English, Conventional Commits — `type(scope): summary`. Commit after every task.
- **Language boundary:** code identifiers, wire keys and enum values are English; UI display text is pt-BR and comes from `messages/pt-BR.json`. The system prompt is written in English (the model mirrors the user's language in its reply).
- **Never hardcode a value the code already owns in the prompt or schema** — enums, ranges, prices and formats render from the exported constants (`STYLE_LIMITS`, `MEASUREMENT_RANGES`, `COSTS`, `EXPORT_FORMATS`).
- **Wire carries codes, never pt-BR prose.** The new status is the machine-readable string `"answered"`.
- **Verify with `npm run build`, never bare `tsc`** (bare tsc reports a spurious `app/layout.tsx` LayoutProps error under Next 16).
- **Scope lint to the app dirs:** `npx eslint app lib components` — repo-root `npm run lint` crawls any `.claude/worktrees/` worktree and false-alarms.
- Tests run with `npx vitest run <path>` for one file, `npm test` for everything. `lib/**` and `app/**` tests are the `node` project; `components/**` are `dom`.
- Prettier runs automatically on commit via lint-staged; don't hand-format.

---

### Task 1: `explain` in the AI schema and decision resolver

**Files:**

- Modify: `lib/ai/schema.ts` (the `RawToolInput` interface, the `decision` enum, `assistantMessage`'s description)
- Modify: `lib/ai/decision.ts` (the `AiDecision` interface, one new guard)
- Test: `lib/ai/decision.test.ts`, `lib/ai/schema.test.ts`

**Interfaces:**

- Consumes: nothing from earlier tasks.
- Produces: `AiDecision.decision` widened to `"apply" | "decline" | "ask" | "explain"` — Task 3's route branches on the `"explain"` member. `resolveDecision(input: RawToolInput, answering: boolean): AiDecision` keeps its signature.

- [ ] **Step 1: Write the failing decision tests**

Append these three cases inside the existing `describe("resolveDecision", …)` block in `lib/ai/decision.test.ts`, after the `"passes decline through without requiring a spec"` case:

```ts
it("passes explain through without requiring a spec", () => {
  const d = resolveDecision(
    { decision: "explain", assistantMessage: "Pence é uma dobra costurada." },
    false,
  );
  expect(d.decision).toBe("explain");
  expect(d.assistantMessage).toBe("Pence é uma dobra costurada.");
});

it("keeps explain even when the user is answering clarifying questions", () => {
  const d = resolveDecision(
    { decision: "explain", assistantMessage: "Cava é onde a manga encaixa." },
    true,
  );
  expect(d.decision).toBe("explain");
});

it("throws on explain with a blank message instead of posting an empty bubble", () => {
  expect(() =>
    resolveDecision({ decision: "explain", assistantMessage: "   " }, false),
  ).toThrow(/explain/);
});
```

- [ ] **Step 2: Write the failing schema test**

Append this case inside the existing `describe("propose_garment tool schema", …)` block in `lib/ai/schema.test.ts`:

```ts
it("offers all four decisions", () => {
  expect(input.properties.decision.enum).toEqual([
    "apply",
    "decline",
    "ask",
    "explain",
  ]);
});
```

- [ ] **Step 3: Run both test files to verify they fail**

Run: `npx vitest run lib/ai/decision.test.ts lib/ai/schema.test.ts`

Expected: FAIL — the three decision cases fail on the type/behaviour (`"explain"` is not assignable, and no throw for a blank message), and the schema case fails with `expected [ 'apply', 'decline', 'ask' ] to deeply equal [ 'apply', 'decline', 'ask', 'explain' ]`.

- [ ] **Step 4: Widen the schema**

In `lib/ai/schema.ts`, change the interface's `decision` field:

```ts
export interface RawToolInput {
  decision: "apply" | "decline" | "ask" | "explain";
  spec?: unknown;
  questions?: unknown;
  declineReason?: string;
  assistantMessage: string;
}
```

Change the tool's `decision` property:

```ts
      decision: {
        type: "string",
        enum: ["apply", "decline", "ask", "explain"],
      },
```

Change `assistantMessage`'s description:

```ts
      assistantMessage: {
        type: "string",
        description:
          "Short chat reply, in the user's own language. When decision=explain this carries the entire answer.",
      },
```

- [ ] **Step 5: Widen the decision resolver and add the blank-message guard**

In `lib/ai/decision.ts`, widen the interface:

```ts
export interface AiDecision {
  decision: "apply" | "decline" | "ask" | "explain";
  spec: GarmentSpec;
  questions?: ClarifyQuestion[];
  declineReason?: string;
  assistantMessage: string;
}
```

Then, in `resolveDecision`, add the guard immediately after the existing `decision === "apply"` throw and before the final `return`:

```ts
// For explain the message IS the payload, so an empty one is unusable.
// Throwing puts it through the route's catch (refund + error) rather than
// charging a credit for an empty bubble.
const message =
  typeof input.assistantMessage === "string" ? input.assistantMessage : "";
if (decision === "explain" && message.trim() === "") {
  throw new Error("decision=explain without an assistantMessage");
}
```

Also extend the file's existing doc comment above `resolveDecision` — after the sentence ending "…whereas throwing makes the generate route refund the credit." add:

```
// Throws the same way for an explain carrying no message, for the same reason.
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run lib/ai/decision.test.ts lib/ai/schema.test.ts`

Expected: PASS — 9 tests in `decision.test.ts`, 4 in `schema.test.ts`.

- [ ] **Step 7: Commit**

```bash
git add lib/ai/schema.ts lib/ai/decision.ts lib/ai/decision.test.ts lib/ai/schema.test.ts
git commit -m "feat(ai): add the explain decision to the propose_garment contract"
```

---

### Task 2: Prompt sections — modeling knowledge and product facts

**Files:**

- Create: `lib/export/formats.ts`
- Modify: `lib/export/index.ts:10` (the `ExportFormat` union line becomes a re-export)
- Modify: `lib/ai/prompt.ts` (imports, a new `COST_LINES` const, the decision policy, two new sections, the blank-pattern line)
- Test: `lib/ai/prompt.test.ts`

**Interfaces:**

- Consumes: `AiDecision.decision`'s `"explain"` member from Task 1 (only as prompt text — no code dependency).
- Produces: `EXPORT_FORMATS: readonly ["svg", "dxf", "dxf-aama", "pdf-a4", "pdf-single"]` and `type ExportFormat = (typeof EXPORT_FORMATS)[number]` from `lib/export/formats.ts`, both re-exported by `lib/export/index.ts` so `components/editor/Footer.tsx`'s existing `import { exportPattern, ExportFormat } from "@/lib/export"` keeps working unchanged.

- [ ] **Step 1: Write the failing prompt tests**

Add these imports at the top of `lib/ai/prompt.test.ts`, beside the existing ones:

```ts
import { COSTS } from "@/lib/types";
import { EXPORT_FORMATS } from "@/lib/export/formats";
```

Append these four cases inside the existing `describe("buildSystem", …)` block:

```ts
it("quotes the app's real credit costs", () => {
  const s = buildSystem(state(0), false);
  for (const [action, cost] of Object.entries(COSTS)) {
    expect(s).toContain(`${action}: ${cost} credit`);
  }
});

it("lists every export format the app can actually write", () => {
  const s = buildSystem(state(0), false);
  for (const format of EXPORT_FORMATS) {
    expect(s).toContain(format);
  }
});

it("carries the knowledge sections and the explain policy", () => {
  const s = buildSystem(state(0), false);
  expect(s).toContain("# Modeling knowledge");
  expect(s).toContain("# Product facts");
  expect(s).toContain("- explain:");
});

it("blank pattern answers a question instead of clarifying it", () => {
  const s = buildSystem(state(0), false);
  expect(s).toContain("BLANK pattern");
  expect(s).toContain("a question still gets decision=explain");
});
```

- [ ] **Step 2: Run the test file to verify it fails**

Run: `npx vitest run lib/ai/prompt.test.ts`

Expected: FAIL — the file cannot even resolve `@/lib/export/formats` (module not found), which is the first thing to fix.

- [ ] **Step 3: Create the export-formats leaf module**

Create `lib/export/formats.ts`:

```ts
// The runtime list behind ExportFormat. It is a value, not just a union, so
// lib/ai/prompt.ts can render the formats MoldAI actually writes without
// importing lib/export/index.ts — which pulls in every serializer plus
// download.ts's DOM access.
export const EXPORT_FORMATS = [
  "svg",
  "dxf",
  "dxf-aama",
  "pdf-a4",
  "pdf-single",
] as const;

export type ExportFormat = (typeof EXPORT_FORMATS)[number];
```

- [ ] **Step 4: Re-export it from the export facade**

In `lib/export/index.ts`, replace line 10:

```ts
export type ExportFormat = "svg" | "dxf" | "dxf-aama" | "pdf-a4" | "pdf-single";
```

with:

```ts
import type { ExportFormat } from "./formats";

export { EXPORT_FORMATS, type ExportFormat } from "./formats";
```

The local `import type` is what `exportPattern`'s own signature uses; the `export … from` line is what keeps `@/lib/export` importers working. `exportPattern`'s `switch`/`never` exhaustiveness is unchanged because the union has the same five members.

- [ ] **Step 5: Add the prompt's imports and cost lines**

In `lib/ai/prompt.ts`, add to the imports:

```ts
import { COSTS } from "@/lib/types";
import { EXPORT_FORMATS } from "@/lib/export/formats";
```

And below the existing `MEASUREMENT_LINES` const, add:

```ts
const COST_LINES = Object.entries(COSTS)
  .map(
    ([action, cost]) => `  - ${action}: ${cost} credit${cost === 1 ? "" : "s"}`,
  )
  .join("\n");
```

- [ ] **Step 6: Extend the decision policy and add the two sections**

In `STATIC_SECTIONS`, replace the `# Decision policy` block's `decline` bullet and add an `explain` bullet, so the whole block reads:

```
# Decision policy

- apply: enough detail to draft now. Fill in the COMPLETE, UPDATED spec — never just the delta.
- ask: relevant detail is missing (neckline, sleeve, fit, length, size…). Ask 1 to 4 objective single-choice questions with options from the catalogs above; don't invent measurements or draft. Only use apply once you have enough.
- explain: the user asked a question instead of requesting a garment or an adjustment — about pattern-making (see Modeling knowledge) or about how MoldAI works (see Product facts). Answer it in assistantMessage; don't draft, don't fill in spec. If one message both asks something and requests a change, prefer apply/ask and answer inside assistantMessage.
- decline: neither a garment this spec can represent (pants, accessories) nor a question you may answer under Modeling knowledge or Product facts. Explain gently in assistantMessage; don't fill in spec.
```

Then add these two sections immediately after `# Vocabulary mapping` and before `# Out-of-range values` (`${COST_LINES}` and `${EXPORT_FORMATS.join(", ")}` interpolate — `STATIC_SECTIONS` is already a template literal):

```
# Modeling knowledge

The user may ask a question instead of ordering a garment: what a pence (dart) is, what the cava (armhole), copa (sleeve cap) or fio (grain) means, why a sleeve won't close, how graduação (grading) works, what changes between knit and woven fabric. Answer those from your pattern-making knowledge with decision=explain. Keep it short and practical — two or three sentences, plain words, no lecture — and relate it to the pattern on screen when that helps.

# Product facts

Questions about MoldAI itself are answered from these facts only.

- Credit cost per action:
${COST_LINES}
- Export formats the editor writes: ${EXPORT_FORMATS.join(", ")}. Export runs in the browser, costs no credits, and outputs the net sewing line — seam allowance is annotated, not offset into the outline.
- "Corrigir manga" re-drafts the sleeve cap for the adjusted armhole at no cost; "Ignorar" keeps the two seams divergent.
- Body measurements come from the size charts in "Medidas e grades". A pattern freezes the chart it was drafted from at its first generation, so editing a chart afterwards never rewrites an existing pattern.
- If you are not sure about a MoldAI behaviour, say you are not sure. Never invent a price, a format, a screen or a feature.
```

- [ ] **Step 7: Amend the blank-pattern line**

In `buildSystem`, extend the blank-pattern string (keep the existing text, add the final sentence):

```ts
    isEmpty
      ? 'BLANK pattern, no piece created yet. This is a from-scratch request: build the entire GarmentSpec the garment needs. If the request already provides enough, use apply; but a generic request with only the piece type (e.g. "make a t-shirt" — no gender, size, neckline, sleeve, or fit) is UNDERSPECIFIED: use decision=ask before drafting. That rule is about garment REQUESTS — a question still gets decision=explain, blank pattern or not.'
      : "A spec is already applied (below). Treat the request as an adjustment: start from the current spec and return the ENTIRE UPDATED spec with the requested changes.",
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run lib/ai/prompt.test.ts`

Expected: PASS — 10 tests.

- [ ] **Step 9: Verify the export re-export didn't break the app**

Run: `npm run build`

Expected: build succeeds (this is what proves `components/editor/Footer.tsx`'s `ExportFormat` import still resolves and `exportPattern`'s exhaustive switch still type-checks).

- [ ] **Step 10: Commit**

```bash
git add lib/export/formats.ts lib/export/index.ts lib/ai/prompt.ts lib/ai/prompt.test.ts
git commit -m "feat(ai): teach the prompt modeling knowledge and product facts"
```

---

### Task 3: Route branch and wire status

**Files:**

- Modify: `app/api/patterns/[id]/generate/route.ts` (a new `explain` branch after the `decline` branch)
- Modify: `lib/api-client.ts:16` (the `GenerateResult` status union)
- Test: `app/api/patterns/[id]/generate/route.test.ts`

**Interfaces:**

- Consumes: `AiDecision.decision === "explain"` from Task 1.
- Produces: wire `status: "answered"` on `GenerateResult`. No store change — `lib/store.ts`'s `sendMessage` branches only on `insufficient_credits` and `error`, so `"answered"` flows through `applyState` into `generationStatus: "idle"` exactly like `"ok"`.

- [ ] **Step 1: Capture ledger entries in the existing test mock**

In `app/api/patterns/[id]/generate/route.test.ts`, add a module-level variable beside `ownedPatternId`:

```ts
let lastEntries: LedgerEntry[] = [];
```

Replace the `withPatternAndWallet` mock body so it records what the route wrote to the ledger:

```ts
vi.mock("@/lib/db/pattern-wallet", () => ({
  withPatternAndWallet: vi.fn(
    async (
      patternId: string,
      _userId: string,
      fn: (
        s: PatternState,
        w: Wallet,
      ) => Promise<{ result: unknown; entries: LedgerEntry[] }>,
    ) => {
      if (patternId !== ownedPatternId) return null;
      const { result, entries } = await fn(state, wallet);
      lastEntries = entries;
      return result;
    },
  ),
}));
```

And reset it in `beforeEach`, beside `ownedPatternId = "m1";`:

```ts
lastEntries = [];
```

- [ ] **Step 2: Write the failing route tests**

Append these three cases inside the existing `describe("POST /api/patterns/[id]/generate", …)` block:

```ts
it("explain answers, keeps the debit, and neither drafts nor versions", async () => {
  const balanceBefore = wallet.balance;
  const versionBefore = state.pattern.version;
  mockPropose.mockResolvedValue({
    decision: "explain",
    spec: {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {},
    },
    assistantMessage: "Pence é a dobra costurada que dá volume à peça.",
  });

  const res = await POST(req({ message: "o que é pence?" }), ctx());
  const json = await res.json();

  expect(json.status).toBe("answered");
  expect(json.state.credits.balance).toBe(balanceBefore - 1);
  expect(state.pattern.version).toBe(versionBefore);
  expect(state.pattern.pieces).toHaveLength(0);

  const answer = state.chat.at(-1)!;
  expect(answer.author).toBe("ai");
  expect(answer.text).toBe("Pence é a dobra costurada que dá volume à peça.");
  expect(answer.chips?.[0].label).toBe("chat.creditChip");
  expect(answer.chips?.[0].tone).toBe("credit");
});

it("explain writes one debit and no refund", async () => {
  mockPropose.mockResolvedValue({
    decision: "explain",
    spec: {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {},
    },
    assistantMessage: "A cava é o recorte onde a manga encaixa.",
  });

  await POST(req({ message: "o que é cava?" }), ctx());

  expect(lastEntries.map((e) => e.type)).toEqual(["debit"]);
});

// The contrast case: explain is the only non-drafting decision that is paid.
it("decline still refunds", async () => {
  const balanceBefore = wallet.balance;
  mockPropose.mockResolvedValue({
    decision: "decline",
    spec: {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {},
    },
    declineReason: "calça",
    assistantMessage: "Ainda não faço calça.",
  });

  const res = await POST(req({ message: "faz uma calça" }), ctx());

  expect((await res.json()).status).toBe("declined");
  expect(wallet.balance).toBe(balanceBefore);
  expect(lastEntries.map((e) => e.type)).toEqual(["debit", "refund"]);
});
```

- [ ] **Step 3: Run the test file to verify it fails**

Run: `npx vitest run "app/api/patterns/[id]/generate/route.test.ts"`

Expected: FAIL — the two explain cases fail with `expected 'ok' to be 'answered'` (the route falls through to the apply path and drafts) while `"decline still refunds"` passes.

- [ ] **Step 4: Add the route branch**

In `app/api/patterns/[id]/generate/route.ts`, insert this block immediately after the closing brace of the `if (decision.decision === "decline") { … }` block and before the `// The size chart is snapshotted once…` comment:

```ts
// The one non-drafting decision that keeps its debit: the user asked a
// question and got the answer, and the AI call is as real as a draft's.
// The chip makes the charge visible in the bubble, as it is for apply.
if (decision.decision === "explain") {
  addMessage(state, {
    id: `msg-${Date.now()}-ai`,
    author: "ai",
    text: decision.assistantMessage,
    chips: [{ label: t("chat.creditChip", { cost }), tone: "credit" }],
    createdAt: Date.now(),
  });
  return {
    result: NextResponse.json({
      status: "answered",
      state: composeEditorState(state, wallet, now),
    }),
    entries,
  };
}
```

- [ ] **Step 5: Widen the wire type**

In `lib/api-client.ts`, change the `GenerateResult` status union:

```ts
export type GenerateResult =
  | {
      status: "ok" | "conflict" | "error" | "declined" | "clarify" | "answered";
      state: EditorState;
    }
  | { status: "insufficient_credits"; required: number; balance: number };
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run "app/api/patterns/[id]/generate/route.test.ts"`

Expected: PASS — 12 tests.

- [ ] **Step 7: Commit**

```bash
git add "app/api/patterns/[id]/generate/route.ts" "app/api/patterns/[id]/generate/route.test.ts" lib/api-client.ts
git commit -m "feat(api): answer chat questions with status answered, charged like an adjustment"
```

---

### Task 4: Remove the inert glossary line

**Files:**

- Modify: `components/editor/PieceDetailsPanel.tsx` (delete the trailing spacer and span)
- Modify: `messages/pt-BR.json` (delete `PieceDetailsPanel.glossaryTitle` and `PieceDetailsPanel.glossaryText`)

**Interfaces:**

- Consumes: nothing.
- Produces: nothing — this is a deletion. `PieceDetailsPanel`'s props are unchanged.

- [ ] **Step 1: Delete the panel's foot line**

In `components/editor/PieceDetailsPanel.tsx`, delete these four lines (the last children before the closing `</div>`):

```tsx
      <div className="flex-1" />
      <span className="text-muted text-meta" title={t("glossaryTitle")}>
        {t("glossaryText")}
      </span>
```

The component now ends with the `Graduar` `<Button>` followed by the closing `</div>`. Leave everything else — including the `const t = useTranslations("PieceDetailsPanel");` line, still used by the other labels — untouched.

- [ ] **Step 2: Delete the two catalog keys**

In `messages/pt-BR.json`, remove these two entries from the `PieceDetailsPanel` namespace:

```json
    "glossaryTitle": "Glossário de modelagem chega em breve",
    "glossaryText": "Glossário: o que é pence? · em breve",
```

The namespace keeps `sectionLabel`, `graduationLabel`, `baseSizeTitle`, `graduateSummary`, `allGraduated`, `graduateButton` and `closeAriaLabel`.

- [ ] **Step 3: Verify nothing still references the removed keys**

Run: `grep -rn "glossary" app components lib messages`

Expected: no output (exit code 1). Any hit is a leftover reference that must be removed.

- [ ] **Step 4: Verify the component still builds and the DOM suite is green**

Run: `npm run build && npx vitest run --project dom`

Expected: build succeeds; the `dom` project passes with no failures.

- [ ] **Step 5: Commit**

```bash
git add components/editor/PieceDetailsPanel.tsx messages/pt-BR.json
git commit -m "refactor(editor): drop the inert glossary line from the piece details panel"
```

---

### Task 5: Document the new decision in CLAUDE.md

**Files:**

- Modify: `CLAUDE.md` (the "### Generation flow" section — the decision-shape line, the `lib/ai/` bullet, and one new bullet)

**Interfaces:**

- Consumes: everything from Tasks 1–4 (documents them).
- Produces: nothing consumed by code.

- [ ] **Step 1: Update the decision shape**

In `CLAUDE.md`'s "### Generation flow (`POST /api/patterns/[id]/generate`)" section, in the first bullet, change:

```
asks `claude-sonnet-5`, via forced tool-use, for `{ decision: "apply" | "decline" | "ask", spec, questions?, declineReason?, assistantMessage }`.
```

to:

```
asks `claude-sonnet-5`, via forced tool-use, for `{ decision: "apply" | "decline" | "ask" | "explain", spec, questions?, declineReason?, assistantMessage }`.
```

- [ ] **Step 2: Extend the `lib/ai/` bullet**

In the same section's `**lib/ai/ is split by responsibility…**` bullet, after the sentence ending "never hardcode a bound in the prompt or schema." append:

```
The rule now covers prices and formats too: the prompt's `# Product facts` section renders its credit costs from `COSTS` and its format list from `EXPORT_FORMATS` (`lib/export/formats.ts` — a leaf module holding the array plus the `ExportFormat` type derived from it, so `prompt.ts` can name the formats without importing the export facade's serializers and `download.ts`'s DOM access; `lib/export/index.ts` re-exports both, so existing `@/lib/export` importers are unchanged).
```

- [ ] **Step 3: Add the `explain` bullet**

In the same section, immediately after the `ask` bullet (the one ending "…prevents the AI from asking again."), add:

```
- **`explain` is the one non-drafting decision that is _not_ refunded.** The user asked a question — about pattern-making, or about MoldAI itself — instead of ordering a garment: the route posts the answer with the credit chip, keeps the `COSTS.adjust` debit, and responds `status: "answered"` with no draft, no version bump and no size-chart snapshot. It is charged because the Anthropic call is as real as a draft's and the user got what they asked for, where `ask`/`decline` refund precisely because they delivered nothing. `resolveDecision` throws on an `explain` carrying a blank `assistantMessage` — the message _is_ the payload there — so the route's catch refunds instead of charging for an empty bubble. This replaced the planned glossary screen (issue #20): a hand-written term list would have been a second, thinner source of knowledge the chat's model already has, and it could not answer "por que minha manga não fecha?".
```

- [ ] **Step 4: Verify the claims in the text match the code**

Run: `grep -n "answered" app/api/patterns/\[id\]/generate/route.ts lib/api-client.ts && grep -n "EXPORT_FORMATS" lib/ai/prompt.ts lib/export/formats.ts lib/export/index.ts`

Expected: every file listed above prints at least one match — the doc describes code that exists.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the explain decision and the product-facts prompt section"
```

---

### Task 6: Full verification and issue evidence

**Files:**

- No source changes. Produces test output, a screenshot, and the issue update.

**Interfaces:**

- Consumes: the finished feature from Tasks 1–5.

- [ ] **Step 1: Run the whole suite**

Run: `npm test`

Expected: both projects pass, zero failures. Record the summary line and the names of the new tests (`explain answers, keeps the debit…`, `explain writes one debit and no refund`, `decline still refunds`, `quotes the app's real credit costs`, `lists every export format the app can actually write`, `carries the knowledge sections and the explain policy`, `blank pattern answers a question instead of clarifying it`, `passes explain through without requiring a spec`, `keeps explain even when the user is answering clarifying questions`, `throws on explain with a blank message instead of posting an empty bubble`, `offers all four decisions`) — the wrap-up needs real names and real output, not "tests pass".

- [ ] **Step 2: Build and lint**

Run: `npm run build && npx eslint app lib components`

Expected: build succeeds, eslint prints nothing.

- [ ] **Step 3: Start the stack on the host**

Run: `docker compose up -d db redis` then `npm run dev` (background).

The host stack is required, not the Docker dev stack: Turbopack's watcher misses edits through the Windows bind mount, and one route 404s in the container. `.env.local` must carry a working `ANTHROPIC_API_KEY` — this step makes a real, paid AI call, which is the point of the evidence.

- [ ] **Step 4: Capture the screenshot evidence**

In the browser at `http://localhost:3000`: log in, open (or create and generate) a pattern, then ask two questions in the chat — a modeling one ("o que é pence?") and a product one ("quanto custa graduar?"). Screenshot the editor showing both answers in the thread with their credit chips, the pattern version unchanged in the header, and the piece-details panel with no glossary line.

This browser run is covered by the standing rule that a resolved backlog issue needs a screenshot of the result.

- [ ] **Step 5: Confirm the money path in the ledger**

Open `/settings?section=usage` and screenshot (or note) the two new `debit` rows of 1 credit each — the proof that an answer is charged and not refunded.

- [ ] **Step 6: Rewrite and close issue #20**

Retitle to `feat(ai): answer modeling and product questions in the chat`, and replace the body's acceptance criteria with:

```markdown
- [x] A modeling question in the chat ("o que é pence?") is answered rather than
      declined, with no draft and no version bump
- [x] A question about MoldAI itself (credit costs, export formats) is answered from
      facts rendered out of the code's own constants
- [x] An out-of-scope question still declines and is refunded
- [x] An answer costs `COSTS.adjust` and shows the credit chip
- [x] The panel's "Glossário: o que é pence? · em breve" line and its catalog keys are
      removed
```

Keep the Context/Why sections but rewrite Context to describe the chat gap rather than the glossary line. Then comment with the test names + pass output and the screenshot, and close it.

```bash
gh issue edit 20 --title "feat(ai): answer modeling and product questions in the chat"
```

- [ ] **Step 7: Stop the dev server**

Stop the background `npm run dev` process. Leave `db` and `redis` running only if they were already up before Step 3.

---

## Notes for the implementer

- **Do not touch `lib/store.ts`.** `"answered"` deliberately needs no client branch; adding one would be dead code.
- **Do not add catalog keys for the answer text.** The AI's prose is model-produced and mirrors the user's language — per the i18n rule it lives outside `messages/pt-BR.json` entirely.
- **`components/editor/Footer.tsx` keeps its own `FORMATS` array.** It carries per-format catalog keys and menu order; converting it to consume `EXPORT_FORMATS` is out of scope for this plan.
- **Known trade-off, do not "fix" it:** while a question is in flight, `GeneratingOverlay` still says "traçando peças / conferindo costuras". The client can't know the message was a question until the model has decided; this is pre-existing for `ask`/`decline` too.
