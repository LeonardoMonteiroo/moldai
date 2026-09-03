# Pattern Creation Form Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/pattern-form-creation/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase, project guidelines, and spec — confirm before Execute. Guidelines found: `CLAUDE.md` (testing-conventions section: the two vitest projects, `renderWithIntl`, "assert against the exported `ptBR` catalog object", the `vi.mock` specifier rule), `AGENTS.md`, `vitest.workspace.ts`, `package.json` scripts. No coverage-threshold config exists, so the strong default applies on top of those conventions.

| Code Layer                                                                            | Required Test Type | Coverage Expectation                                                                                                                              | Location Pattern                            | Run Command                     |
| ------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------- |
| Pure domain logic (`lib/draft/**`, `lib/ai/**`, `lib/editor/**`, `lib/sizeCharts/**`) | unit               | All branches; 1:1 to the spec ACs the task carries; every listed edge case has a test                                                             | `lib/**/*.test.ts` (`node` project)         | `npx vitest run --project node` |
| Repository / data access (`lib/db/**`)                                                | unit               | Key query paths + the not-found/not-owned path; `vi.mock` uses the **exact specifier the subject imports** (`"./prisma"`)                         | `lib/db/*.test.ts` (`node` project)         | `npx vitest run --project node` |
| API routes (`app/api/**`)                                                             | unit               | Every path the task adds: happy + each rejection code + **an assertion that no debit occurred** on every rejection                                | `app/api/**/route.test.ts` (`node` project) | `npx vitest run --project node` |
| Client stores + API client (`lib/*Store.ts`, `lib/store.ts`, `lib/api-client.ts`)     | unit               | Success path + every failure branch the task adds (thrown `ApiError`, 402, retry reuse)                                                           | `lib/*.test.ts` (`node` project)            | `npx vitest run --project node` |
| React components (`components/**`)                                                    | unit (jsdom + RTL) | Rendered outcome per AC through `renderWithIntl`; catalog text asserted against the exported `ptBR` object, never a pasted literal or a substring | `components/**/*.test.tsx` (`dom` project)  | `npx vitest run --project dom`  |
| Type-only modules, zod schema keys, catalog entries                                   | none               | Build gate only — no behavior of their own. Each is exercised by the task that consumes it, in that same task.                                    | —                                           | build gate only                 |

## Gate Check Commands

> Generated from codebase — confirm before Execute.

| Gate Level | When to Use                                                       | Command                                                      |
| ---------- | ----------------------------------------------------------------- | ------------------------------------------------------------ |
| Quick      | Tasks touching only `lib/**` or `app/api/**` (the `node` project) | `npx vitest run --project node`                              |
| Quick-dom  | Tasks touching only `components/**` (the `dom` project)           | `npx vitest run --project dom`                               |
| Full       | Tasks that change a wire contract both projects read              | `npm test`                                                   |
| Build      | Phase completion, and any type-only / catalog-only change         | `npm test && npx eslint app lib components && npm run build` |

`npm run format` runs on every task before its commit (husky + prettier are already wired); it is not a gate of its own.

**Correction (surfaced during Batch A, verified independently and by a repo hook):** the build gate lints `app lib components` explicitly instead of the bare `npm run lint` script. That script is `eslint` with no path argument, so it crawls `.claude/worktrees/` — whose nested worktrees hold full copies of the source tree — and `docs/design/screens/support.js`, the design handoff's own editor runtime. Together those report 9 errors belonging to no file in this checkout, identical at base commit `ee32304`. `npx eslint app lib components` exits 0 and is exactly what `.husky/pre-push` and `.github/workflows/ci.yml` execute, so it is the result that actually matters. Adding the missing ignore entries to `eslint.config.mjs` is a real fix but belongs to no task in this feature.

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Pure foundations

Four leaf-module changes, all pure and DB-free. Only T2 has an intra-phase dependency; T1, T3 and T4 are independent and simply run in listed order.

```
T1 -> T2
T3
T4
```

### Phase 2: The AI call carries options, N images and the decided fields

```
T5 -> T6 -> T7
T5 -> T7
```

### Phase 3: Server wire

T9 and T10 are the naming half; T11, T12 and T13 are three cohesive behaviors on one route, layered in the order their validations run.

```
T9 -> T10
T11 -> T12
T8 -> T13
T11 -> T13
```

### Phase 4: Client plumbing

```
T14 -> T15
T14 -> T16
T14 -> T17
```

### Phase 5: UI

```
T18
T19 -> T20 -> T21
```

---

## Task Breakdown

### Phase 1: Pure foundations

#### T1: Add the per-garment-type style-field map ✅

**What**: A leaf module exporting `FormStyleField`, `FORM_STYLE_FIELDS`, `STYLE_FIELDS_BY_TYPE` and `formStyleFieldsFor(type, sleeve)`, the single source for which style controls a garment type has (and for dropping `cuff` unless the sleeve is `long`).
**Where**: `lib/draft/formFields.ts`
**Depends on**: None
**Reuses**: `GarmentType`/`SleeveLength` from `lib/types.ts`; the `lib/export/formats.ts` leaf-module precedent (no drafter import, so both projects and the client bundle can take it)
**Requirement**: PFORM-21, PFORM-22, PFORM-23

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `STYLE_FIELDS_BY_TYPE` covers all five `TYPES` members exactly as the design's table states, asserted per type
- [x] `formStyleFieldsFor` omits `cuff` for `sleeve` of `undefined`, `"none"` and `"short"`, and includes it for `"long"` — only for types whose map lists it
- [x] Every listed field name is a real optional key of `GarmentStyle` (type-level, asserted by a compile-time `satisfies`)
- [x] Module imports nothing from `lib/draft/garment.ts` or any drafter
- [x] Gate check passes: `npx vitest run --project node`
- [x] Test count: 6+ new tests pass (no silent deletions) — 13 new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(draft): map each garment type to the style fields a form can offer`

---

#### T2: Add the form spec's trust boundary and merge rule ✅

**What**: `validateFormSpec(raw): GarmentSpec | null` (rejects an absent/unrecognized `type`, then runs `validateSpec`, then drops style keys the type does not apply, `measurementOverrides` and `sleeveRefit`) and `mergeFormSpec(ai, form)` (form's `type`/`gender`/defined style keys win; the AI's `measurementOverrides` survive untouched).
**Where**: `lib/ai/formSpec.ts`
**Depends on**: T1
**Reuses**: `validateSpec` (`lib/draft/garment.ts:136`) for every enum and bound; `STYLE_FIELDS_BY_TYPE` from T1
**Requirement**: PFORM-24, PFORM-25, PFORM-27, PFORM-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `validateFormSpec` returns `null` for `undefined`, a non-object, `{}`, and `{ type: "corset" }` (PFORM-28)
- [x] An unrecognized enum value on an applicable field is dropped, and the rest of the spec still returns (PFORM-24)
- [x] `{ type: "skirt", style: { collar: "shirt" } }` returns with no `collar` key at all (PFORM-22 server half)
- [x] `sleeveRefit: true` never appears on the returned spec (PFORM-27)
- [x] `mergeFormSpec` leaves an AI style field the form did not set at the AI's value, and overwrites one the form did set (PFORM-25)
- [x] `mergeFormSpec` preserves `ai.measurementOverrides` verbatim when `form.measurementOverrides` is `{}`
- [x] Gate check passes: `npx vitest run --project node`
- [x] Test count: 12+ new tests pass (no silent deletions) — 21 new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(ai): validate a form-supplied spec and let it win over the model's`

---

#### T3: Accept a list of attachments at the wire's trust boundary ✅

**What**: Add `MAX_ATTACHMENT_COUNT = 4`, `MAX_ATTACHMENTS_TOTAL_BASE64_CHARS = 8 * 1024 * 1024` and `validateAttachmentInputs(value): WireAttachment[] | null`, which rejects a non-array, an empty array, an over-count array, any entry `validateAttachmentInput` rejects, and a combined `data` length over the total ceiling.
**Where**: `lib/editor/attachment.ts`
**Depends on**: None
**Reuses**: `validateAttachmentInput` (`lib/editor/attachment.ts:192`) per entry, so the per-image contract stays defined once
**Requirement**: PFORM-60, PFORM-65

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Returns `null` for `undefined`, `null`, `{}`, `[]`, and an array of `MAX_ATTACHMENT_COUNT + 1` valid entries
- [x] Returns `null` when any single entry has an unknown media type, empty `data`, or `data` over `MAX_ATTACHMENT_BASE64_CHARS`
- [x] Returns `null` when the combined `data` length exceeds `MAX_ATTACHMENTS_TOTAL_BASE64_CHARS` even though every entry is individually valid
- [x] Returns the entries in the order received for a valid 1-, 2- and 4-entry array
- [x] A single 6 MB attachment (today's per-image ceiling) is still accepted, so the existing single-image case is unchanged
- [x] Gate check passes: `npx vitest run --project node`
- [x] Test count: 9+ new tests pass (no silent deletions) — 11 new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(editor): validate a list of attachments, not just one`

---

#### T4: Let a caller request a specific size chart for generation ✅

**What**: `pickSizeChartForGeneration(charts, activeSizeChartId, gender, requestedId?)` — when `requestedId` names a chart in the list, return it with `rejectedActive: null`; otherwise every existing branch is unchanged.
**Where**: `lib/sizeCharts/compute.ts`
**Depends on**: None
**Reuses**: the existing `SizeChartChoice` shape, so no caller sees a new return type
**Requirement**: PFORM-42, PFORM-45, PFORM-46

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A `requestedId` in the list is returned even when it does not match `gender` and even when a different chart is active, with `rejectedActive: null` (PFORM-42)
- [x] A `requestedId` absent from the list falls through to the existing active-then-system-then-first path, and `rejectedActive` is reported exactly as before (PFORM-46)
- [x] Every pre-existing test in `lib/sizeCharts/compute.test.ts` still passes untouched, proving the no-`requestedId` path is byte-for-byte unchanged (PFORM-45) — the diff is insertions only
- [x] Gate check passes: `npx vitest run --project node`
- [x] Test count: 4+ new tests pass, 0 existing tests changed or deleted

**Tests**: unit
**Gate**: quick

**Commit**: `feat(size-charts): let a generation request name the chart it drafts from`

---

### Phase 2: The AI call carries options, N images and the decided fields

#### T5: Extract the propose-call's inputs into one options type ✅

**What**: A type-only module exporting `ProposeImage` (moved from `lib/ai/index.ts`) and `ProposeOptions { answering; images?; importContext?; formSpec? }`, so `prompt.ts` and `index.ts` can both name it without a cycle.
**Where**: `lib/ai/options.ts`
**Depends on**: None
**Reuses**: the existing `ProposeImage` declaration verbatim; `ImageMediaType` from `lib/editor/attachment.ts`
**Requirement**: PFORM-26, PFORM-64 (enabling)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `ProposeImage` and `ProposeOptions` exported; `lib/ai/index.ts` re-exports `ProposeImage` so no external importer breaks
- [x] `npm run build`'s TypeScript check passes with no `any` and no new lint error
- [x] Gate check passes — `npm test` 3229 passed, `npm run build` clean, lint clean.

> **Lint invocation, for every later `build`-gate task (T21):** the repo-root `lint` script is a bare `eslint`, which crawls `.claude/worktrees/` and the vendored skill scripts and reports 9 errors belonging to no file in this checkout — identically at this batch's base commit `ee32304`, so they are not a regression. The invocation `.husky/pre-push` and `.github/workflows/ci.yml` actually run is **`npx eslint app lib components`**, which exits 0. Use that one; a repo hook blocks the bare script.

**Tests**: none — type-only module, "none" row of the coverage matrix; its two consumers (T6, T7) carry the behavior tests
**Gate**: build

**Commit**: `refactor(ai): name the propose call's inputs as one options type`

---

#### T6: Render the decided fields into the dynamic prompt section ✅

**What**: `buildDynamicSection(state, opts)` and `buildSystem(state, opts)` take `ProposeOptions`, and emit a new `# Fields already decided by the user` section (with the closing "prefer apply over ask" sentence) only when `opts.formSpec` is present.
**Where**: `lib/ai/prompt.ts`
**Depends on**: T5
**Reuses**: the existing `lines.push` composition and the `importContext` section as the shape to copy; `STATIC_SECTIONS` untouched so its cache breakpoint is unaffected
**Requirement**: PFORM-26

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] With no `formSpec`, the produced string is byte-identical to the pre-change output for the same state (asserted against a snapshot built in the test, not a stored file)
- [x] With a `formSpec`, the section appears exactly once, contains `JSON.stringify(formSpec)`, and appears **after** the blank-pattern `ask` instruction it overrides (index comparison, not just presence) — the Risks table's first row
- [x] The section instructs the model not to ask about, and not to contradict, a listed field
- [x] `STATIC_SECTIONS` is not modified
- [x] Gate check passes: `npx vitest run --project node`
- [x] Test count: 6+ new tests pass, existing `lib/ai/prompt.test.ts` cases migrated to the options object with no assertion weakened — 9 new tests; the migration changed argument shape only, every assertion kept verbatim

**Scope note**: this commit also updates the one `buildDynamicSection` call in `lib/ai/index.ts` (a single argument, `{ answering, importContext }`). That caller is broken by this task's own signature change, and leaving it stale made `lib/ai/index.test.ts`'s importContext case fail — the gate cannot pass without it, and weakening that test is not an option. T7 rewrites the same call anyway.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(ai): tell the model which fields the user already decided`

---

#### T7: Attach N image blocks to the final turn ✅

**What**: Replace `withImage` with `withImages(turns, images)` emitting one image block per entry in order ahead of the text block, and change `proposeGarment(state, opts)` to the options object, forwarding `formSpec` to `buildDynamicSection`.
**Where**: `lib/ai/index.ts`
**Depends on**: T5, T6
**Reuses**: the existing `withImage` content-block construction, extended to a loop; `ANTHROPIC_OPTIONS` and the two-block system prompt unchanged
**Requirement**: PFORM-66

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] For N of 1, 2 and 4 images the final message's `content` is N image blocks followed by exactly one text block carrying the turn's text (PFORM-66)
- [x] With no images the turns are returned unchanged (identity, not a re-wrapped single-element content array) — also pinned for `images: []`
- [x] The pre-existing "final turn is not a user turn" guard still drops the attachment rather than mis-attaching it, pinned by its own test — the Risks table's third row
- [x] `formSpec` reaches `buildDynamicSection`, asserted through the mocked SDK's captured `system` argument
- [x] Gate check passes: `npx vitest run --project node` — 2577 passed
- [x] Test count: 7+ new tests pass, existing `lib/ai/index.test.ts` cases migrated to the options object with no assertion weakened — 8 new tests; the N=1 case is the pre-existing #18 test, migrated rather than duplicated

> **Handoff to T11 — the tree does not typecheck until T11 lands.** `proposeGarment`'s new signature leaves exactly one compile error, `app/api/patterns/[id]/generate/route.ts:150` (`Expected 2 arguments, but got 4`), which is the design's Risks-table safety mechanism working as intended: every caller of the renamed wire becomes a compile error. That file is T11's `Where`, and T11 rewrites this call anyway (it has to add `images`, `formSpec` and `sizeChartId`). The `node` project stays green throughout because the route's own tests mock `@/lib/ai`. **Do not run a `build`-gated check between Phase 2 and T11.**

**Tests**: unit
**Gate**: quick

**Commit**: `feat(ai): send every attached image as its own content block`

---

### Phase 3: Server wire

#### T8: Read a size chart's gender under the ownership scope ✅

**What**: `getSizeChartGenderForUser(sizeChartId, userId): Promise<Gender | null>` — an ownership-scoped read returning `null` for a chart that is missing or not the caller's — plus a `requestedId?` parameter on `getSizeChartForGeneration` forwarded straight to `pickSizeChartForGeneration`.
**Where**: `lib/db/sizeChart.ts`
**Depends on**: T4
**Reuses**: the `(id, userId)`-scoped, never-throwing, never-leaking-existence contract every `lib/db/*` reader already follows; `pickSizeChartForGeneration` from T4
**Requirement**: PFORM-42, PFORM-43

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Returns the chart's own `gender` for a chart the account owns
- [x] Returns `null` for an id that does not exist and for one owned by another account, with the same value for both so it is not an existence oracle
- [x] Never throws for a malformed or missing blob
- [x] `getSizeChartForGeneration` forwards `requestedId` and is unchanged when it is absent — the absent path stays pinned by the four pre-existing tests in its own describe block
- [x] `vi.mock` names `"./prisma"`, the exact specifier the subject imports (CLAUDE.md's silent-mismatch rule)
- [x] Gate check passes: `npx vitest run --project node` — 2584 passed
- [x] Test count: 6+ new tests pass (no silent deletions) — 7 new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(size-charts): read a chart's gender under the account's own scope`

---

#### T9: Let a pattern be created under a caller-supplied name ✅

**What**: `createPattern(userId, t, name?)` seeds `state.pattern.name` with `name` when given and with `t("newPatternName")` otherwise.
**Where**: `lib/db/pattern.ts`
**Depends on**: None
**Reuses**: `seedPatternState`'s existing name assignment (`lib/editor/state.ts:149`)
**Requirement**: PFORM-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A supplied name lands on the persisted blob's `pattern.name`
- [x] An omitted name still resolves `t("newPatternName")`, so every existing caller is unchanged — and a blank name falls back to it too
- [x] Gate check passes: `npx vitest run --project node` — 2588 passed
- [x] Test count: 3+ new tests pass (no silent deletions) — 4 new tests

**Tests**: unit
**Gate**: quick

**Commit**: `feat(patterns): let createPattern take the name it should start under`

---

#### T10: Accept and validate a name on the create route ✅

**What**: `POST /api/patterns` reads an optional `name`, rejects one over `MAX_PATTERN_NAME_LENGTH` or carrying a NUL byte with 400 `invalid_name` and no `Pattern` created, and treats an absent or blank name as "use the default".
**Where**: `app/api/patterns/route.ts`
**Depends on**: T9
**Reuses**: `hasNulByte` + the same cap check `PATCH /api/patterns/[id]` already runs (`app/api/patterns/[id]/route.ts:48`); `POST /api/slopers`'s `invalid_name` code
**Requirement**: PFORM-04, PFORM-11

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A valid name creates the pattern under it (PFORM-04)
- [x] A name of exactly `MAX_PATTERN_NAME_LENGTH` is accepted; one character more answers 400 `invalid_name` (PFORM-11)
- [x] A NUL byte answers 400 `invalid_name` (PFORM-11)
- [x] Every rejection asserts `createPattern` was never called — and `createPatternFromState` too, so neither create path runs
- [x] An absent, non-string or blank `name` still creates a default-named pattern, so the existing `api.createPattern()` shape is unchanged — the name is passed only when present, so the two-argument call is byte-for-byte what it was
- [x] The `sloperId` branch and the `create` rate-limit bucket are untouched, pinned by their existing tests
- [x] The route carries a comment stating why a bad `name` rejects while a bad `sloperId` is tolerated (design's Risks table, fifth row)
- [x] Gate check passes: `npm test` — 3263 passed
- [x] Test count: 6+ new tests pass (no silent deletions) — 6 new tests

**Tests**: unit
**Gate**: full

**Commit**: `feat(patterns): accept a name on create, rejecting an unusable one`

---

#### T11: Move the generate wire from one image to a list ✅

**What**: Replace the route's singular `image` handling with `images` — the `images` key on `GenerateBodySchema` (replacing `image`), `validateAttachmentInputs` before any debit, `MAX_GENERATE_BODY_BYTES` re-derived from `MAX_ATTACHMENTS_TOTAL_BASE64_CHARS`, `imageCount` on the persisted `ChatMessage` (new optional field on the interface), and the list forwarded through `proposeGarment`'s options object.
**Where**: `app/api/patterns/[id]/generate/route.ts` (plus the `images` key in `lib/schemas/pattern.ts` and the `imageCount` field in `lib/types.ts` — merged in per the reference's "absorb the blocking dependency so the task is self-testable" rule, since a schema key or a type field alone has no testable behavior)
**Depends on**: T3, T7
**Reuses**: the existing `invalid_attachment` code and its pre-debit placement; `validateAttachmentInputs` from T3; `ProposeOptions` from T5
**Requirement**: PFORM-64, PFORM-65, PFORM-67

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A valid 1-, 2- and 4-entry `images` array reaches `proposeGarment` in order, asserted on the mocked call (PFORM-64)
- [x] A malformed, empty, over-count, over-per-image and over-combined-cap `images` each answer 400 `invalid_attachment`, and each asserts **no debit and no `proposeGarment` call** (PFORM-65)
- [x] An omitted `images` key behaves exactly as a text-only request does today
- [x] The persisted user `ChatMessage` carries `hasImage: true` and `imageCount: N`, and no base64 appears anywhere in the persisted state (asserted by searching the serialized blob) (PFORM-67)
- [x] A request sending the old singular `image` key is treated as carrying no attachment, not as a silent one-image request
- [x] `MAX_GENERATE_BODY_BYTES` is computed from `MAX_ATTACHMENTS_TOTAL_BASE64_CHARS`, not a second literal — pinned behaviourally from both sides: a request exactly ON the combined ceiling is accepted (the pre-change ceiling refused it as `bad_body`), one byte past it answers `invalid_attachment` rather than `bad_body`
- [x] Gate check passes: `npm test` — 3275 passed
- [x] Test count: 10+ new tests pass, existing image tests migrated with no assertion weakened — 13 new tests; the single-image case is #18's own test migrated into the N=1/2/4 matrix rather than duplicated, and every assertion it carried (the debit, the forwarded payload, `hasImage`) is kept

**Scope note** — two additions, both found by the `migration-safety` agent run on this task's own diff:

1. `imageCount` had to be listed on `ChatMessageSchema` as well, not only on the `ChatMessage` interface. `z.object` strips a key it does not name, and the strip is not confined to the response: `lockPattern` returns the PARSED state and `savePattern` writes that same object straight back, so the field would have been deleted from the row by the next mutating turn while still satisfying this task's own write-side assertion. Pinned by a read-modify-write round-trip test in `lib/db/pattern.test.ts`, verified to fail with the schema key removed.
2. The schema comment on the `image` to `images` rename was wrong and is corrected: a caller still sending `image` is indistinguishable from a text-only request and is charged as one, it is not refused. That is exactly why the rename had to make every caller a compile error.

**Pre-existing defect, reported and deliberately NOT fixed here** (outside every task's `Where` in this feature): `hasImage` and `assembly` are absent from that same `ChatMessageSchema` and are destroyed on every read-then-write today, so the "imagem enviada" chip and the assembly-order disclaimer both vanish one turn after they are earned. Needs its own ticket, fix and coverage.

**Tests**: unit
**Gate**: full

**Commit**: `feat(patterns): carry every attached image on the generate wire`

---

#### T12: Honor a form-supplied spec on the generate route ✅

**What**: Read `formSpec` through `validateFormSpec`, answer 400 `invalid_form_spec` when present-but-unusable (before any debit or AI call), forward it into the prompt via `ProposeOptions`, and apply `mergeFormSpec` to the returned spec in the `apply` branch before `applyGarmentSpec`.
**Where**: `app/api/patterns/[id]/generate/route.ts`
**Depends on**: T2, T7, T11
**Reuses**: `validateFormSpec`/`mergeFormSpec` from T2; the existing pre-transaction validation block's placement
**Requirement**: PFORM-24, PFORM-25, PFORM-26, PFORM-27, PFORM-28

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A `formSpec` with no `type`, a non-object `formSpec`, and one naming an unrecognized type each answer 400 `invalid_form_spec` with no debit and no `proposeGarment` call (PFORM-28) — plus an array and a literal `null`, the two other shapes `validateFormSpec` refuses
- [x] With the AI stubbed to return a contradicting `collar`/`sleeve`/`type`, the persisted spec carries the form's values (PFORM-25) — and a contradicting `neckline` too
- [x] A style field the form left unset keeps the AI's returned value in the persisted spec (PFORM-25)
- [x] A `measurementOverrides` entry the AI returned survives the merge (PFORM-25) — asserted on the persisted spec AND on the drafted `baseMeasurements`, so it is proven to have reached the drafter, not merely been stored
- [x] `formSpec` reaches the prompt (PFORM-26) — asserted at this layer as the validated spec reaching `proposeGarment`'s options. The rest of that chain is pinned where it lives, since this route's tests mock `@/lib/ai` wholesale: `lib/ai/index.test.ts:410` asserts `formSpec` reaches the mocked SDK's captured `system` blocks (T7), and `lib/ai/prompt.test.ts:281-309` asserts the section's content and its position after the blank-pattern `ask` instruction (T6)
- [x] An omitted `formSpec` leaves the whole flow unchanged, pinned by the route's existing tests — plus one explicit test that no `formSpec` reaches the options and the model's spec persists verbatim
- [x] The merge runs only in the `apply` branch — `ask`, `decline` and `explain` are untouched, each pinned by its own case asserting the pattern's spec, version and piece list are all unchanged
- [x] Gate check passes: `npm test` — 3291 passed
- [x] Test count: 10+ new tests pass (no silent deletions) — 16 new tests

**Scope note**: this commit also adds `formSpec: z.unknown().optional()` to `GenerateBodySchema`. A zod key has no behavior of its own and `body.formSpec` is a compile error without it, so it is absorbed here on the same "absorb the blocking dependency so the task is self-testable" rule T11 applied to `images`. It stays `z.unknown()` because `validateFormSpec` needs the RAW value: it decides field by field whether the request already named a value `validateSpec` recognizes, which anything coerced or defaulted at the schema layer would have destroyed.

**Tests**: unit
**Gate**: full

**Commit**: `feat(patterns): let a form's explicit choices override the model's spec`

---

#### T13: Draft from a caller-named size chart ✅

**What**: Read `sizeChartId`, resolve its gender through `getSizeChartGenderForUser` before the transaction (400 `invalid_size_chart` on `null`), use that gender for the spec and the prompt, and pass the id into `getSizeChartForGeneration` so `seedPatternSizeSnapshot` freezes the requested chart on a first draft.
**Where**: `app/api/patterns/[id]/generate/route.ts`
**Depends on**: T8, T11
**Reuses**: `getSizeChartGenderForUser` and the `requestedId` parameter from T8; the existing `isFirstDraft` branch and its substitution-notice path
**Requirement**: PFORM-41, PFORM-42, PFORM-43, PFORM-44, PFORM-45, PFORM-46, PFORM-47

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A `sizeChartId` the account owns is frozen into the snapshot on a first draft, with `sizeChartName` matching that chart (PFORM-42) — the test double honours `requestedId` and returns a second, differently-named chart for it, so a route that dropped the argument fails rather than passing on the default
- [x] The spec's `gender` becomes the chart's own gender even when the AI returned the other one (PFORM-41) — asserted on the persisted spec and on the gender the pick is asked for
- [x] A `sizeChartId` naming a nonexistent chart, and one owned by another account, each answer 400 `invalid_size_chart` with no debit and no `proposeGarment` call (PFORM-43) — both reach this route as the same `null`, deliberately, so it cannot become an existence oracle; the reader's own two causes are covered in `lib/db/sizeChart.test.ts` (T8)
- [x] With a valid `sizeChartId`, no substitution notice message is appended (`rejectedActiveName` is null by construction) (PFORM-44)
- [x] An omitted `sizeChartId` leaves the active-then-system pick and its substitution notice unchanged, pinned by the route's existing tests (PFORM-45) — plus one test asserting the ownership read is not even performed and the pick receives no requested id
- [x] A `sizeChartId` sent for a pattern that already has pieces leaves the frozen snapshot untouched (PFORM-46)
- [x] `User.activeSizeChartId` is never written by this route (PFORM-47) — `setActiveSizeChart` is mocked purely so "not called" is a real assertion rather than a claim resting on the import list
- [x] Gate check passes: `npm test` — 3301 passed
- [x] Test count: 9+ new tests pass (no silent deletions) — 10 new tests

**Scope note**: also adds `sizeChartId: z.unknown().optional()` to `GenerateBodySchema`, on the same absorb-the-blocking-dependency rule T11 and T12 applied. `sizeChartId` is read tolerantly (absent, non-string or blank means "no chart named") because that case has a well-defined fallback, the account's active chart — the same tolerance `POST /api/patterns` gives `sloperId`. Only an id that genuinely resolves to nothing is refused, since substituting there would draft from measurements nobody asked for.

**Tests**: unit
**Gate**: full

**Commit**: `feat(patterns): draft from the size chart the request names`

---

### Phase 4: Client plumbing

#### T14: Move the API client to the new generate contract ✅

**What**: `generate(patternId, message, opts?)` with `{ answering?, images?, formSpec?, sizeChartId?, importContext? }`, sending `images` as `{mediaType, data}` entries; and `createPattern(opts?)` taking `{ sloperId?, name? }`.
**Where**: `lib/api-client.ts`
**Depends on**: T10, T11, T12, T13
**Reuses**: the existing `PAYWALL`/`handled` contract and the `PreparedAttachment.base64` → wire `data` rename already documented there
**Requirement**: PFORM-06, PFORM-64

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `generate` posts `images` as an array of `{mediaType, data}` and omits the key entirely when no attachment is passed — including for `images: []`, which the route refuses outright, so the client never produces it
- [x] `formSpec` and `sizeChartId` are omitted from the body when not passed (`JSON.stringify` drops `undefined`) — pinned by the text-only case's exact `toEqual({ message })`
- [x] `createPattern({ name })` posts the name; `createPattern()` still posts `{}`
- [x] `PAYWALL` stays the only `handled` list on `generate`
- [x] `lib/api-client.contract.test.ts` still passes, or is updated in this same commit with no assertion weakened — the two migrated cases changed argument shape only
- [x] Gate check passes: `npx vitest run --project node` — 2639 passed
- [x] Test count: 7+ new tests pass (no silent deletions) — 8 new cases

**Scope note** — three callers this task's own signature change breaks, absorbed here on T6's precedent (a stale caller the gate cannot pass around):

1. `lib/slopersStore.ts`'s `api.createPattern(sloperId)` and the two tests asserting that call's shape — `lib/slopersStore.test.ts` (`node`, so the quick gate fails without it) and `components/slopers/SlopersShell.test.tsx` (`dom`, which mocks the api-client directly and is caught by the pre-commit hook's `vitest related`, not by this task's own gate). Both move to `{ sloperId }`.
2. `components/onboarding/OnboardingShell.tsx`'s `api.generate(id, msg, true)` and its `dom` test's matching assertion, both moved to `{ answering: true }`. Argument shape only; no assertion weakened.
3. `lib/store.ts` and `lib/importStore.ts` are deliberately left broken — the same handoff Phase 2 made to T11. They are T15's and T16's own `Where`, `npx tsc --noEmit` reports exactly those two files and nothing else, and both stores' tests mock `api.generate`, so the `node` project stays green in between.

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(api-client): send attachments, a form spec and a chart id`

---

#### T15: Migrate the editor composer's single attachment ✅

**What**: `sendMessage(message, opts)` takes `opts.images` (the composer still supplies at most one), sends it through the new client signature, and records `imageCount` alongside `hasImage` on the optimistic user message.
**Where**: `lib/store.ts`
**Depends on**: T14
**Reuses**: the existing optimistic-append block (`lib/store.ts:261`) and its rollback on cancel
**Requirement**: PFORM-64, PFORM-67

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] One attachment still reaches `api.generate` and the optimistic message carries `hasImage: true` and `imageCount: 1`
- [x] A text-only send passes no `images` key and sets neither field — asserted on the call's own third argument (`not.toHaveProperty("images")`), since `toHaveBeenCalledWith` ignores an `undefined` property and would have passed either way
- [x] `cancelGeneration`'s rollback still removes the optimistic message unchanged — pinned for an attachment-marked message specifically
- [x] Gate check passes: `npx vitest run --project node` — 2643 passed
- [x] Test count: 4+ new tests pass, existing `lib/store.test.ts` image cases migrated with no assertion weakened — 4 new tests; the three migrated cases changed argument shape only, and `imageCount` is asserted as the list's real length so a hardcoded `1` fails

**Scope note**: also updates `components/editor/ChatPanel.tsx`'s one `sendMessage` call, the only caller of the option this task renames (`image` to `images`), wrapping its at-most-one attachment in a list. The composer's own UI is unchanged and stays capped at one photo per turn, per the spec's Out of Scope table.

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(editor): send the composer's attachment through the images list`

---

#### T16: Migrate the import reconstruction's attachment

**What**: `createPatternFromImport` passes its single rendered preview through the new `images` option.
**Where**: `lib/importStore.ts`
**Depends on**: T14
**Reuses**: the existing `prepareImage` call and `image_failed` code, unchanged
**Requirement**: PFORM-64

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] The preview reaches `api.generate` as a one-entry `images` array on both the first call and the `clarify` retry
- [ ] `pendingPatternId` reuse, `insufficient_credits`, `image_failed` and the checklist ping are all unchanged, pinned by existing tests
- [ ] Gate check passes: `npx vitest run --project node`
- [ ] Test count: 2+ new tests pass, 0 existing tests weakened

**Tests**: unit
**Gate**: quick

**Commit**: `refactor(import): send the reconstruction preview through the images list`

---

#### T17: Create and generate a pattern from the form

**What**: `createFromForm(input)` on the dashboard store — create (with the name) or reuse `pendingPatternId`, generate once with the message, `formSpec`, `sizeChartId` and prepared images, return the id for `ok`/`conflict`/`clarify`/`declined`, and on failure set `actionError` and return the code.
**Where**: `lib/dashboardStore.ts`
**Depends on**: T14
**Reuses**: `createPatternFromImport` (`lib/importStore.ts`) as the structural template — `pendingPatternId`, `insufficient_credits` as its own code, `errorCode(err)` for the rest, pre-resolved catalog strings passed in
**Requirement**: PFORM-06, PFORM-07, PFORM-08, PFORM-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] A successful submit calls `createPattern` once then `generate` once and resolves to the id (PFORM-06)
- [ ] `status: "clarify"` and `status: "declined"` both resolve to the id without a second generate call (spec's Assumptions)
- [ ] A 402 sets `insufficient_credits`, keeps `pendingPatternId`, and a second call reuses that id instead of creating another `Pattern` (PFORM-08)
- [ ] A thrown `ApiError` sets `actionError` to its wire code and resolves to that code, leaving `pendingPatternId` set so a retry is still cheap (PFORM-09)
- [ ] `creatingFromForm` is true for the whole round trip and false in every exit path, including the throwing one (PFORM-07)
- [ ] The store passes no catalog key or pt-BR literal of its own — `message` arrives pre-resolved
- [ ] Gate check passes: `npx vitest run --project node`
- [ ] Test count: 9+ new tests pass (no silent deletions)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(dashboard): create and generate a pattern from the form's input`

---

### Phase 5: UI

#### T18: Say how many images a turn carried

**What**: `ChatBubble` renders `t("imagesAttached", { count: message.imageCount ?? 1 })` in place of the fixed `imageAttached` chip, with the plural ICU entry replacing the old key in the catalog.
**Where**: `components/editor/ChatBubble.tsx`
**Depends on**: T11
**Reuses**: the existing chip markup and its `bg-primary-foreground/15` tinting note
**Requirement**: PFORM-68

**Tools**:

- MCP: NONE
- Skill: `humanizer` (the new catalog value is display copy)

**Done when**:

- [ ] A message with `imageCount: 3` renders the plural form; one with `imageCount: 1` renders the singular
- [ ] A message with `hasImage: true` and no `imageCount` renders the singular form (PFORM-68)
- [ ] A message with neither renders no chip
- [ ] Assertions compare against the resolved `ptBR` catalog value, never a pasted pt-BR literal or a substring
- [ ] The old `imageAttached` key is removed, and no call site still reads it
- [ ] Gate check passes: `npx vitest run --project dom`
- [ ] Test count: 4+ new tests pass (no silent deletions)

**Tests**: unit (jsdom + RTL)
**Gate**: quick-dom

**Commit**: `feat(editor): say how many images a chat turn carried`

---

#### T19: Build the form step

**What**: `NewPatternForm` — name, garment type, size chart (loaded from `GET /api/size-charts`, disabled with a reason on failure), the per-type style selects each defaulting to "deixar a IA decidir", the photo row capped at `MAX_ATTACHMENT_COUNT` with per-photo removal, the details textarea, the stated `COSTS.adjust` cost, and the composed message — plus its own `NewPatternForm` catalog namespace.
**Where**: `components/dashboard/NewPatternForm.tsx`
**Depends on**: T1, T17
**Reuses**: `Field`/`FieldLabel`/`Input`/`Select`/`Textarea`/`Button`/`Badge` from `components/ui`; `formStyleFieldsFor` from T1; `prepareImage` and `MAX_ATTACHMENT_COUNT`; `garmentType.*` catalog keys; `api.listSizeCharts`; `/import`'s `VerificationPanel` as the "state the real cost next to the paid action" precedent
**Requirement**: PFORM-03, PFORM-05, PFORM-10, PFORM-20, PFORM-21, PFORM-22, PFORM-23, PFORM-40, PFORM-47, PFORM-60, PFORM-61, PFORM-62, PFORM-63

**Tools**:

- MCP: `shadcn` (registries: `["@shadcn"]`) only if a primitive turns out to be missing — every one the design needs is already installed
- Skill: `humanizer` (the whole namespace is display copy), `moldai-conventions` (review before commit)

**Done when**:

- [ ] Name input carries `maxLength={MAX_PATTERN_NAME_LENGTH}`; details textarea carries `maxLength={MAX_CHAT_MESSAGE_LENGTH}` (PFORM-03, PFORM-05)
- [ ] Every style select's default option is the "deixar a IA decidir" entry and submitting with it selected omits that field from `formSpec` (PFORM-20)
- [ ] Selecting `skirt` renders no neckline/sleeve/collar/cuff/front-closure control; selecting `blouse` renders no waistband control (PFORM-21)
- [ ] The cuff control appears only after sleeve is set to `long`, and disappears when it changes away (PFORM-22)
- [ ] Changing the garment type clears every now-inapplicable style value, asserted on the submitted `formSpec` (PFORM-23)
- [ ] The chart select lists every entry `listSizeCharts` returned, and the submitted `sizeChartId` is the selected one (PFORM-40)
- [ ] A failed chart fetch renders the select disabled with its stated reason and submit still fires with `sizeChartId: null` (PFORM-47)
- [ ] The add cell disappears at `MAX_ATTACHMENT_COUNT` held photos (PFORM-60)
- [ ] A `prepareImage` rejection renders that file's own reason and leaves already-held photos in place (PFORM-62)
- [ ] Each photo's remove control removes only that photo (PFORM-63)
- [ ] The submit label states `COSTS.adjust` (PFORM-10)
- [ ] The composed message names the garment type and every selected style value, resolved from catalog lookups keyed by the EN enum value — never a hand-written `Record<Enum, string>`
- [ ] No hardcoded pt-BR string and no hex color; `.claude/hooks/check-conventions.mjs` clean
- [ ] Catalog assertions compare against the resolved `ptBR` object, never a pasted literal
- [ ] Gate check passes: `npx vitest run --project dom`
- [ ] Test count: 18+ new tests pass (no silent deletions)

**Tests**: unit (jsdom + RTL)
**Gate**: quick-dom

**Commit**: `feat(dashboard): build the new-pattern form step`

---

#### T20: Turn the chooser into a two-step dialog

**What**: `NewPatternDialog` gains `step: "options" | "form"`, enables the form option (no badge, no reason `title`), renders `NewPatternForm` on the form step at the design's `460px` width, blocks dismissal while submitting, and drops the now-false `formOption.comingSoonTitle` catalog entry.
**Where**: `components/dashboard/NewPatternDialog.tsx`
**Depends on**: T19
**Reuses**: the existing `Option` sub-component and `Dialog` composition; `Dashboard.dc.html:239` (420px chooser) and `:282` (460px form) for the two widths
**Requirement**: PFORM-01, PFORM-02

**Tools**:

- MCP: NONE
- Skill: `moldai-conventions` (review before commit)

**Done when**:

- [ ] Activating the form option switches to the form step without navigating (PFORM-01)
- [ ] "Voltar" returns to the chooser with values already typed still present after switching back (PFORM-02) — proven by asserting a typed name survives a form → chooser → form round trip
- [ ] The form option renders enabled, with no `soon` badge and no reason `title`
- [ ] `onOpenChange` is a no-op while `submitting`, so an Escape press and an overlay click both leave the dialog open
- [ ] The dialog's stale "em breve" assertions in `NewPatternDialog.test.tsx` are rewritten in this same commit, not deleted
- [ ] Gate check passes: `npx vitest run --project dom`
- [ ] Test count: 8+ new tests pass (no silent deletions)

**Tests**: unit (jsdom + RTL)
**Gate**: quick-dom

**Commit**: `feat(dashboard): open the new-pattern form from the chooser`

---

#### T21: Wire the form to the store and the editor

**What**: `DashboardShell` passes `createFromForm` and `creatingFromForm` into the dialog and navigates to `/pattern/[id]` on success; a returned failure code keeps the dialog open with `actionError` already set by the store.
**Where**: `components/dashboard/DashboardShell.tsx`
**Depends on**: T17, T20
**Reuses**: the existing `handleStartFromPrompt`/`openPattern` navigation and the already-rendered `ActionErrorNotice`
**Requirement**: PFORM-06, PFORM-07, PFORM-08, PFORM-09

**Tools**:

- MCP: NONE
- Skill: `moldai-conventions` (review before commit)

**Done when**:

- [ ] A successful submit navigates to `/pattern/<returned id>` exactly once (PFORM-06)
- [ ] A failure leaves the dialog open, renders the form's own message for the returned code, and leaves `ActionErrorNotice` showing behind it (PFORM-09)
- [ ] Controls are disabled and the dialog undismissable while `creatingFromForm` is true (PFORM-07)
- [ ] A 402 followed by a second submit issues no second `createPattern` (PFORM-08), asserted end to end through the shell
- [ ] Gate check passes: `npm test && npx eslint app lib components && npm run build`
- [ ] Test count: 6+ new tests pass (no silent deletions)

**Tests**: unit (jsdom + RTL)
**Gate**: build

**Commit**: `feat(dashboard): create a pattern from the form and open its editor`

---

## Phase Execution Map

```
Phase 1 then Phase 2 then Phase 3 then Phase 4 then Phase 5

Phase 1:
  T1 -> T2
  T3
  T4
Phase 2:
  T5 -> T6 -> T7
  T5 -> T7
Phase 3:
  T9 -> T10
  T11 -> T12
  T8 -> T13
  T11 -> T13
Phase 4:
  T14 -> T15
  T14 -> T16
  T14 -> T17
Phase 5:
  T18
  T19 -> T20 -> T21
```

Execution is strictly sequential — there is no intra-phase parallelism. A single agent (or batch worker) works one task at a time, in listed order. Tasks with no arrow into them have no dependency; they still run in the order listed.

**Batch packing** (~7 tasks per worker, whole phases only): P1+P2 = 7 → batch A; P3 = 6 → batch B; P4 = 4 → batch C; P5 = 4 → batch D.

---

## Task Granularity Check

| Task                              | Scope                                               | Status                                                                                                                                                                                                                         |
| --------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| T1: style-field map               | 1 leaf module                                       | ✅ Granular                                                                                                                                                                                                                    |
| T2: form spec validate + merge    | 1 module, 2 cohesive pure functions                 | ✅ Granular (2-3 related things in one file)                                                                                                                                                                                   |
| T3: attachment list validator     | 1 function + 2 constants in an existing file        | ✅ Granular                                                                                                                                                                                                                    |
| T4: `requestedId` preference      | 1 function                                          | ✅ Granular                                                                                                                                                                                                                    |
| T5: propose options type          | 1 type-only module                                  | ✅ Granular                                                                                                                                                                                                                    |
| T6: prompt section                | 1 function's signature + 1 new section              | ✅ Granular                                                                                                                                                                                                                    |
| T7: N image blocks                | 1 function + 1 signature in one file                | ✅ Granular                                                                                                                                                                                                                    |
| T8: chart gender read             | 1 new reader + 1 forwarded parameter                | ✅ Granular                                                                                                                                                                                                                    |
| T9: `createPattern` name          | 1 function                                          | ✅ Granular                                                                                                                                                                                                                    |
| T10: create route name validation | 1 endpoint                                          | ✅ Granular                                                                                                                                                                                                                    |
| T11: generate route `images`      | 1 endpoint + the schema key and type field it needs | ⚠️ 3 files, justified — a zod key and an optional interface field have no testable behavior of their own; splitting them out would produce an unverified commit, which the reference's "merge backward" rule exists to prevent |
| T12: generate route `formSpec`    | 1 endpoint, 1 behavior                              | ✅ Granular                                                                                                                                                                                                                    |
| T13: generate route `sizeChartId` | 1 endpoint, 1 behavior                              | ✅ Granular                                                                                                                                                                                                                    |
| T14: API client contract          | 2 functions in one file                             | ✅ Granular (one wire contract)                                                                                                                                                                                                |
| T15: editor store migration       | 1 store action                                      | ✅ Granular                                                                                                                                                                                                                    |
| T16: import store migration       | 1 store action                                      | ✅ Granular                                                                                                                                                                                                                    |
| T17: `createFromForm`             | 1 store action                                      | ✅ Granular                                                                                                                                                                                                                    |
| T18: image-count chip             | 1 component + its own catalog key                   | ✅ Granular                                                                                                                                                                                                                    |
| T19: the form component           | 1 component + its own catalog namespace             | ✅ Granular (one component; its namespace is not separately testable)                                                                                                                                                          |
| T20: two-step dialog              | 1 component                                         | ✅ Granular                                                                                                                                                                                                                    |
| T21: shell wiring                 | 1 component                                         | ✅ Granular                                                                                                                                                                                                                    |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body)              | Diagram Shows           | Status   |
| ---- | ----------------------------------- | ----------------------- | -------- |
| T1   | None                                | (no inbound arrow)      | ✅ Match |
| T2   | T1                                  | T1 → T2                 | ✅ Match |
| T3   | None                                | (no inbound arrow)      | ✅ Match |
| T4   | None                                | (no inbound arrow)      | ✅ Match |
| T5   | None                                | (no inbound arrow)      | ✅ Match |
| T6   | T5                                  | T5 → T6                 | ✅ Match |
| T7   | T5, T6                              | T5 → T7, T6 → T7        | ✅ Match |
| T8   | T4 (cross-phase)                    | T8 → T13 outbound only  | ✅ Match |
| T9   | None                                | (no inbound arrow)      | ✅ Match |
| T10  | T9                                  | T9 → T10                | ✅ Match |
| T11  | T3, T7 (cross-phase)                | — (cross-phase, exempt) | ✅ Match |
| T12  | T2, T7 (cross-phase), T11           | T11 → T12               | ✅ Match |
| T13  | T8, T11                             | T8 → T13, T11 → T13     | ✅ Match |
| T14  | T10, T11, T12, T13 (cross-phase)    | — (cross-phase, exempt) | ✅ Match |
| T15  | T14                                 | T14 → T15               | ✅ Match |
| T16  | T14                                 | T14 → T16               | ✅ Match |
| T17  | T14                                 | T14 → T17               | ✅ Match |
| T18  | T11 (cross-phase)                   | — (cross-phase, exempt) | ✅ Match |
| T19  | T1 (cross-phase), T17 (cross-phase) | — (cross-phase, exempt) | ✅ Match |
| T20  | T19                                 | T19 → T20               | ✅ Match |
| T21  | T17 (cross-phase), T20              | T20 → T21               | ✅ Match |

Cross-phase dependencies point strictly backward and, per the checker's own rule, are validated by the forward-phase check rather than needing a per-phase diagram arrow.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified            | Matrix Requires  | Task Says        | Status |
| ---- | -------------------------------------- | ---------------- | ---------------- | ------ |
| T1   | Pure domain logic (`lib/draft`)        | unit             | unit             | ✅ OK  |
| T2   | Pure domain logic (`lib/ai`)           | unit             | unit             | ✅ OK  |
| T3   | Pure domain logic (`lib/editor`)       | unit             | unit             | ✅ OK  |
| T4   | Pure domain logic (`lib/sizeCharts`)   | unit             | unit             | ✅ OK  |
| T5   | Type-only module                       | none             | none             | ✅ OK  |
| T6   | Pure domain logic (`lib/ai`)           | unit             | unit             | ✅ OK  |
| T7   | Pure domain logic (`lib/ai`)           | unit             | unit             | ✅ OK  |
| T8   | Repository (`lib/db`)                  | unit             | unit             | ✅ OK  |
| T9   | Repository (`lib/db`)                  | unit             | unit             | ✅ OK  |
| T10  | API route                              | unit (route)     | unit             | ✅ OK  |
| T11  | API route (+ schema key, + type field) | unit (route)     | unit             | ✅ OK  |
| T12  | API route                              | unit (route)     | unit             | ✅ OK  |
| T13  | API route                              | unit (route)     | unit             | ✅ OK  |
| T14  | API client                             | unit             | unit             | ✅ OK  |
| T15  | Client store                           | unit             | unit             | ✅ OK  |
| T16  | Client store                           | unit             | unit             | ✅ OK  |
| T17  | Client store                           | unit             | unit             | ✅ OK  |
| T18  | React component (+ catalog entry)      | unit (jsdom+RTL) | unit (jsdom+RTL) | ✅ OK  |
| T19  | React component (+ catalog namespace)  | unit (jsdom+RTL) | unit (jsdom+RTL) | ✅ OK  |
| T20  | React component                        | unit (jsdom+RTL) | unit (jsdom+RTL) | ✅ OK  |
| T21  | React component                        | unit (jsdom+RTL) | unit (jsdom+RTL) | ✅ OK  |

T5 is the only `Tests: none`, and it matches the matrix's own "none" row: a type-only module has no behavior, and both its consumers (T6, T7) carry behavior tests in their own commits.

---

## Requirement Coverage

All 36 spec requirements map to at least one task; no requirement is unmapped.

| Requirement range    | Tasks              |
| -------------------- | ------------------ |
| PFORM-01, 02         | T20                |
| PFORM-03, 05, 10     | T19                |
| PFORM-04             | T9, T10            |
| PFORM-06             | T14, T17, T21      |
| PFORM-07, 08, 09     | T17, T21           |
| PFORM-11             | T10                |
| PFORM-20             | T19                |
| PFORM-21, 22, 23     | T1, T19            |
| PFORM-24, 25, 27, 28 | T2, T12            |
| PFORM-26             | T6, T12            |
| PFORM-40, 47         | T19                |
| PFORM-41, 44         | T13                |
| PFORM-42, 45, 46     | T4, T8, T13        |
| PFORM-43             | T8, T13            |
| PFORM-60             | T3, T19            |
| PFORM-61, 62, 63     | T19                |
| PFORM-64             | T11, T14, T15, T16 |
| PFORM-65             | T3, T11            |
| PFORM-66             | T7                 |
| PFORM-67             | T11, T15           |
| PFORM-68             | T18                |
