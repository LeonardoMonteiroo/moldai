# Bust-Apex Dart Shaping Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user - do not proceed without it.**

---

**Design**: `.specs/features/bust-dart-shaping/design.md`
**Status**: Done

---

## Test Coverage Matrix

> Generated from codebase sampling (no dedicated testing-guidelines doc beyond `CLAUDE.md`'s `npm test` description and the two-vitest-project split in `vitest.workspace.ts`). Guidelines found: `CLAUDE.md` (Commands section), sampled `lib/measurements.test.ts`, `lib/schemas/measurements.test.ts`, `lib/sizeCharts/seed.test.ts`, `lib/draft/body.test.ts`, `lib/draft/garment.test.ts`, `components/size-charts/SizeChartTable.test.tsx`.

| Code Layer                                                     | Required Test Type        | Coverage Expectation                                                                                                                                           | Location Pattern                                               | Run Command                                                                   |
| -------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Measurement data model + zod validation boundary               | unit (`node` project)     | 1:1 to BDART-05; every `EXTENDED_MEASUREMENT_KEYS` entry cross-checked generically (existing pattern)                                                          | `lib/measurements.test.ts`, `lib/schemas/measurements.test.ts` | `npx vitest run lib/measurements.test.ts lib/schemas/measurements.test.ts`    |
| Size-chart seeding                                             | unit (`node` project)     | New seeded values assert real numbers per AD-001; existing seed-reproduces-table invariant stays green                                                         | `lib/sizeCharts/seed.test.ts`                                  | `npx vitest run lib/sizeCharts/seed.test.ts`                                  |
| Size-chart table catalog rendering                             | component (`dom` project) | Existing generic per-key tests extended to the 2 new keys (label + measurement-guide reachability)                                                             | `components/size-charts/SizeChartTable.test.tsx`               | `npx vitest run --project dom components/size-charts/SizeChartTable.test.tsx` |
| Drafting engine — `bodice()` dart math                         | unit (`node` project)     | All branches (fisheye / dress-hem / front-closure) × (delta = 0 regression, delta > 0 re-angle+widen) + boundary-clamp case; 1:1 to BDART-01/02/03/04/06/08/10 | `lib/draft/body.test.ts`                                       | `npx vitest run lib/draft/body.test.ts`                                       |
| Drafting engine — containment + seam-graph/assembly invariants | unit (`node` project)     | `DECORATION_CASES` matrix extended with cup-delta + boundary cases; seam-graph (`#134`)/assembly-order (`#138`) suites confirmed unaffected — BDART-07/09      | `lib/draft/garment.test.ts`                                    | `npx vitest run lib/draft/garment.test.ts`                                    |
| Whole feature                                                  | build gate                | Zero regressions across both vitest projects, typecheck, lint                                                                                                  | n/a                                                            | `npm test && npm run typecheck && npm run lint`                               |

**Coverage Expectation source**: no explicit repo-wide coverage threshold found (no `jest.config`/coverage gate in `vitest.workspace.ts`); the strong default (domain logic 1:1 to spec ACs + every listed edge case) is applied, matching the existing depth already sampled in `lib/draft/body.test.ts` and `lib/measurements.test.ts`.

## Gate Check Commands

| Gate Level | When to Use                                                  | Command                                           |
| ---------- | ------------------------------------------------------------ | ------------------------------------------------- |
| Quick      | After a task touching only `lib/**` (`node` project)         | `npx vitest run <affected file(s)>`               |
| Full       | After a task touching a `components/**` (`dom` project) file | `npx vitest run --project dom <affected file(s)>` |
| Build      | After the final task / phase completion                      | `npm test && npm run typecheck && npm run lint`   |

---

## Execution Plan

Phases are ordered and run sequentially - each phase completes before the next begins, and tasks within a phase execute in order.

### Phase 1: Data model foundation

```
T1 → T2 → T3
```

### Phase 2: Drafting engine

```
T4 → T5
```

---

## Task Breakdown

### T1: Add `bustPointHeight`/`bustSpan` to the Measurements model and its zod validation boundary — ✅ DONE

**What**: Add the two new optional fields to `Measurements`, `EXTENDED_MEASUREMENT_KEYS`, `MEASUREMENT_RANGES` in `lib/measurements.ts`, AND to the `.partial()` mask in `lib/schemas/measurements.ts` in the same commit — the two files are coupled (once the fields exist in `MEASUREMENT_KEYS`, the zod schema's generic base object treats them as required until the mask is updated), so landing them separately would leave an intermediate broken state.
**Where**: `lib/measurements.ts`, `lib/schemas/measurements.ts`
**Depends on**: None
**Reuses**: The `#132` `EXTENDED_MEASUREMENT_KEYS` pattern (`neckGirth`/`highBust`/`shoulderSlope`/`backWidth`/`bicep`/`rise`) verbatim, including the existing partial-mask comment's own documented cross-check with `measurements.test.ts`.
**Requirement**: BDART-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `Measurements` interface carries `bustPointHeight?: number` and `bustSpan?: number` with the same doc-comment style as the existing five extended fields
- [x] `EXTENDED_MEASUREMENT_KEYS` includes both, appended after `rise`
- [x] `MEASUREMENT_RANGES` has `bustPointHeight: { min: 18, max: 34 }` and `bustSpan: { min: 12, max: 26 }`
- [x] `MeasurementsSchema`'s `.partial()` mask includes `bustPointHeight: true, bustSpan: true`
- [x] `lib/measurements.test.ts`'s `"EXTENDED_MEASUREMENT_KEYS carries the six #132 additions"` test is updated to assert all eight keys (rename the test description to drop the now-stale "six")
- [x] `lib/schemas/measurements.test.ts`'s `FULL` fixture includes real sample values for both new keys, so the existing `it.each(EXTENDED_MEASUREMENT_KEYS)` tests exercise them meaningfully
- [x] Gate check passes: `npx vitest run lib/measurements.test.ts lib/schemas/measurements.test.ts` — 39 passed (19 + 20)
- [x] Test count: existing count + 0 new test cases (existing `it.each`/generic-loop tests automatically cover the two new keys) — confirmed, none silently removed

**Tests**: unit
**Gate**: quick

**Commit**: `feat(measurements): add bustPointHeight/bustSpan extended fields`

---

### T2: Seed `bustPointHeight`/`bustSpan` on both system size charts — ✅ DONE (merged into T1's commit)

> **SPEC_DEVIATION**: T1 and T2 turned out to be coupled the same way T1's own two files were — `lib/sizeCharts/seed.test.ts` already has two generic tests iterating `EXTENDED_MEASUREMENT_KEYS` (one asserting every extended field resolves to an in-range number for every system-chart size, one asserting every extended field grades across sizes except the size-invariant ones). Landing T1 alone left those generic tests failing on the two new keys (discovered via the repo's own pre-commit `vitest related` hook, which reverted the first commit attempt). **Reason**: this coupling wasn't visible from reading the test file's structure at Tasks-authoring time, only from actually running the suite. Fixed by implementing T2 immediately and committing T1+T2 together as one atomic commit — no task was skipped, both are fully done, just landed in the same commit rather than two.

**What**: Add the two fields to `extendedMeasurementsFor` in `lib/sizeCharts/seed.ts` as flat, per-gender constants (not size-graded), per `AD-001` (`.specs/STATE.md`) and the existing `shoulderSlope` precedent in the same function.
**Where**: `lib/sizeCharts/seed.ts`
**Depends on**: T1
**Reuses**: `shoulderSlope`'s exact "flat per-gender constant, not graded by size index" shape (same function, lines 63-68 today).
**Requirement**: BDART-05

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `extendedMeasurementsFor`'s return type and body add `bustPointHeight` (26.5 cm, cited Wave PLM "shoulder-to-apex, typical range 23-30cm" midpoint) and `bustSpan` (18.5 cm, cited Wave PLM "standard range 18-20cm" midpoint), identical for both genders (no cited source ties either to gender or bust)
- [x] The doc comment above the function's return statement cites the same two sources as `design.md`'s Research table
- [x] `lib/sizeCharts/seed.test.ts` adds a test asserting both system charts' resolved `bustPointHeight`/`bustSpan` equal the new constants at every size
- [x] Existing `buildSystemSizeChart` round-trip test (`this reproduces the original table exactly`) still passes — the two new fields don't perturb the nine-key derivation
- [x] Two pre-existing generic tests (iterating `EXTENDED_MEASUREMENT_KEYS`) updated: the size-invariant list now names `bustPointHeight`/`bustSpan` alongside `shoulderSlope`
- [x] Gate check passes: `npx vitest run lib/measurements.test.ts lib/schemas/measurements.test.ts lib/sizeCharts/seed.test.ts` — 59 passed; full `npx vitest run` — 2952 passed, 0 failed (3 pre-existing skips)
- [x] Test count: existing count + 1 new test (5 assertions) + 2 existing tests extended, no silent deletions

**Tests**: unit
**Gate**: quick

**Commit**: `feat(size-charts): seed bustPointHeight/bustSpan on system charts`

---

### T3: Add catalog entries and extend `SizeChartTable`'s generic-row tests — ✅ DONE

**What**: Add `SizeChartTable.measurement.bustPointHeight`/`.bustSpan` (short labels) and `SizeChartTable.measurementGuide.bustPointHeight`/`.bustSpan` (how-to-measure instructions) to `messages/pt-BR.json`, written per the vendored `humanizer` skill's tone rules, then extend the two existing generic tests in `SizeChartTable.test.tsx` to cover them.
**Where**: `messages/pt-BR.json`, `components/size-charts/SizeChartTable.test.tsx`
**Depends on**: T2
**Reuses**: The existing `SizeChartTable.measurement.*`/`.measurementGuide.*` catalog shape (no component code change — `SizeChartTable.tsx` already iterates `MEASUREMENT_KEYS` generically).
**Requirement**: BDART-11

**Tools**:

- MCP: NONE
- Skill: `humanizer` (apply its tone rules to the two new guide sentences before committing)

**Done when**:

- [x] `messages/pt-BR.json`'s `SizeChartTable.measurement` gains `"bustPointHeight"` ("Altura do ápice do busto") and `"bustSpan"` ("Afastamento do busto") short labels
- [x] `messages/pt-BR.json`'s `SizeChartTable.measurementGuide` gains matching how-to-measure sentences (shoulder-to-apex; apex-to-apex), same tone/length as the existing five extended-field entries — reviewed against the `humanizer` skill's rules (formal register, no first person, no em dash), no changes needed
- [x] `SizeChartTable.test.tsx`'s `"renders a row, with its catalog label, for every extended measurement"` test adds assertions for both new keys
- [x] `SizeChartTable.test.tsx` gets a new parallel case, `"exposes a guided definition for the new bustSpan measurement, reachable from its row"`, covering one of the two new keys end-to-end
- [x] Gate check passes: `npx vitest run --project dom components/size-charts/SizeChartTable.test.tsx` — 42 passed
- [x] Test count: existing count + 1 new test + assertions added to 1 existing test, no silent deletions

**Tests**: unit (component, `dom` project)
**Gate**: full

**Commit**: `feat(size-charts): add bustPointHeight/bustSpan catalog entries`

---

### T4: Implement bust-apex dart re-angling and cup-delta dart widening in `bodice()` — ✅ DONE

**What**: In `lib/draft/body.ts`'s `bodice()`, compute `bustCupDeltaCm = max(0, bust - (highBust ?? bust))` and, when it's `> 0`, (a) derive the bust-apex point from `bustSpan`/`bustPointHeight` (real value or the cited flat fallback) relative to `shoulderSlope`/`cx`, clamped into the panel's valid interior band, (b) move the dart's bust-facing apex to that point instead of straight up/down, and (c) widen the dart by `bustCupDeltaCm / 4` (per-leg half-width) on top of the existing `dartsSuppression`-derived width — identically across the fisheye (blouse/t-shirt), dress-waist-join, and front-closure branches. When `bustCupDeltaCm <= 0`, every dart must draft byte-identically to today.
**Where**: `lib/draft/body.ts`
**Depends on**: T3
**Reuses**: The existing `oneDart(side)` closure structure, `dartInternals` (unchanged, generic over polygon points), the `classifyGirthFit` negative-value clamping pattern from `lib/draft/ease.ts`.
**Requirement**: BDART-01, BDART-02, BDART-03, BDART-04, BDART-06, BDART-08, BDART-10

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `bustCupDeltaCm` is computed once per `bodice()` call, clamped to a minimum of 0 (`Math.max(0, ...)`)
- [x] The bust-apex point (`[cx ± apexXOffsetCm, apexYCm]`) is computed from `m.bustSpan ?? 18.5` and `m.bustPointHeight ?? 26.5`, with `apexXOffsetCm` clamped to `[2, halfChest - 2]` and `apexYCm` clamped to `[shoulderSlope + 4, waistY - 4]`
- [x] The fisheye dart's upper (bust-facing) apex moves to that point when `bustCupDeltaCm > 0`; its lower apex is untouched in every case
- [x] The dress-waist-join dart's single apex moves to that point when `bustCupDeltaCm > 0`
- [x] The front-closure half-panel's single dart gets the same treatment (it always uses the fisheye branch)
- [x] The back panel is provably unaffected by `highBust`/`bustSpan`/`bustPointHeight` in every case (`bustCupDeltaCm` is forced 0 when `!frontish`)
- [x] When `bustCupDeltaCm <= 0` (field absent, or `highBust >= bust` — both system charts today), every dart's points are identical, field-for-field, to the pre-change output
- [x] No `seamEdges`, notch, or piece-count change results from this task — only `internalsCm` dart-point values move (verified: `garment.test.ts`'s 219 pre-existing tests, which include the seam-graph/notch/seamEdges assertions, all pass unmodified)
- [x] `lib/draft/body.test.ts` adds: 2 regression cases (`highBust === bust`, and `highBust > bust` inverted), a re-angle+widen case per branch (fisheye/dress-hem/front-closure), a real-value-vs-fallback case, a monotonic-width case, a boundary-clamp case, and a fold-line/drill-hole generic-derivation case — 10 new tests total
- [x] Gate check passes: `npx vitest run lib/draft/body.test.ts` — 51 passed; `npx vitest run lib/draft` (full engine) — 373 passed
- [x] Test count: existing count (41) + 10 new test cases = 51, no silent deletions

> **Verifier fix-round (validation.md, iteration 1)**: the independent Verifier found a surviving mutant (the cited `/4` width divisor had only a directional `toBeGreaterThan` test, not an exact-value one) and two uncovered edge cases (bustSpan/bustPointHeight resolving independently; a real delta on a non-fitted/knit panel). Added 4 more tests to `body.test.ts` closing all three: an exact-value width-difference assertion (`widthDiff === bustCupDeltaCm/2`, confirmed to kill the surviving mutation by hand re-injecting it), two independent-field-resolution cases, and a knit-panel-has-no-effect case. Test count now 55.

**Tests**: unit
**Gate**: quick

**Commit**: `feat(draft): angle the front dart toward the bust apex when a real cup delta exists`

---

### T5: Extend containment/seam-graph invariants for the new dart geometry — ✅ DONE

> **SPEC_DEVIATION**: Instead of adding cases directly to the shared `DECORATION_CASES` array (`fixtures.ts`), added a LOCAL `BUST_APEX_CORNERS` list in `garment.test.ts`, mirroring the file's own pre-existing `MEASUREMENT_CORNERS` pattern (a local corner list crossed with every `DECORATION_CASES` spec). **Reason**: `DECORATION_CASES` is also consumed by `lib/export/model.test.ts` and other files outside this feature's stated scope — mutating the shared fixture would silently expand every one of those suites too. The local-corner-list pattern already established in this exact file achieves identical coverage (every spec × the new corners) without that blast radius. Also used `SIZE_TABLE.M` (matching every existing corner sweep in this file) rather than `SIZE_TABLE.PP` for the boundary case — the PP-specific boundary/clamp case is already covered in T4's `body.test.ts` (`BDART-07` boundary test); this task's boundary corner still exercises the same extreme `bustSpan`/`bustPointHeight` values, just crossed against the M-based matrix this file's other corner sweeps use.

**What**: Add cup-delta and boundary-value cases to `lib/draft/garment.test.ts`'s `DECORATION_CASES` containment matrix (every dart point must stay strictly inside its piece's outline), and add an explicit regression assertion that the seam graph (`#134`, `walkSeamPairs`) and assembly order (`#138`, `buildAssemblyOrder`) produce the same pair/step counts for a cup-delta garment as for an identical one with no cup delta.
**Where**: `lib/draft/garment.test.ts`
**Depends on**: T4
**Reuses**: The existing `DECORATION_CASES` matrix structure and its containment assertion helper; the existing seam-graph/assembly-order test suites' own fixtures.
**Requirement**: BDART-07, BDART-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] A local `BUST_APEX_CORNERS` matrix (real cup delta; real delta + boundary `bustSpan`/`bustPointHeight` max; real delta + boundary min) is crossed against every `DECORATION_CASES` spec and passes the existing containment assertion (`assertDecorationsContained`) unmodified — 45 new containment cases (15 specs × 3 corners)
- [x] The same matrix passes the seam-graph zero-divergence check (`BDART-07`)
- [x] A new test (`BDART-09`) asserts `measureSeamGraph(...)`'s pair count/keys AND `buildAssemblyOrder(...)`'s dart-step/seam-step/hem-step lists are identical between a cup-delta blouse and its zero-delta twin
- [x] Full project regression: `npm test` — 3010 passed, 0 failed, 3 pre-existing skips (both vitest projects); `npm run typecheck` — clean build; `npm run lint` — 6 errors/10 warnings, ALL pre-existing in vendored `.claude/skills/*` files unrelated to this feature (confirmed identical count via `git stash`/lint/`git stash pop` with this task's changes removed) — zero lint issues in any file this feature touches
- [x] Gate check passes: `npx vitest run lib/draft/garment.test.ts` — 266 passed (was 219); Build gate as above
- [x] Test count: existing count (219) + 47 new test cases (45 containment + 1 seam-graph-corners + 1 pair/step-count regression) = 266, no silent deletions

**Tests**: unit
**Gate**: build

**Commit**: `test(draft): cover bust-dart containment and seam-graph/assembly regression`

---

## Phase Execution Map

```
Phase 1 → Phase 2

Phase 1:  T1 ------→ T2 ------→ T3
Phase 1 → Phase 2 boundary:  T3 ------→ T4
Phase 2:  T4 ------→ T5
```

Execution is strictly sequential - there is no intra-phase parallelism. A single agent works one task at a time, in order.

Total: 5 tasks — fits a single batch (≤ ~8 tasks); no sub-agent offer needed, executes inline.

---

## Task Granularity Check

| Task                                | Scope                                                        | Status                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| T1: Measurements model + zod mask   | 2 tightly-coupled files, 1 concept (extended-field addition) | ✅ Granular (merge justified — see T1's own note; splitting would leave an intermediate broken schema state) |
| T2: Seed system charts              | 1 file, 1 function                                           | ✅ Granular                                                                                                  |
| T3: Catalog entries + table tests   | 1 catalog file + 1 test file, 1 concept                      | ✅ Granular                                                                                                  |
| T4: Dart re-angling logic           | 1 file (`body.ts`), 1 function's internal formula            | ✅ Granular                                                                                                  |
| T5: Containment/seam-graph coverage | 1 file (`garment.test.ts`), 1 concept (invariant extension)  | ✅ Granular                                                                                                  |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows                         | Status   |
| ---- | ---------------------- | ------------------------------------- | -------- |
| T1   | None                   | (start of Phase 1, no incoming arrow) | ✅ Match |
| T2   | T1                     | T1 → T2                               | ✅ Match |
| T3   | T2                     | T2 → T3                               | ✅ Match |
| T4   | T3                     | T3 → T4 (Phase 1 → Phase 2 boundary)  | ✅ Match |
| T5   | T4                     | T4 → T5                               | ✅ Match |

---

## Test Co-location Validation

| Task                                | Code Layer Created/Modified                                    | Matrix Requires   | Task Says                       | Status |
| ----------------------------------- | -------------------------------------------------------------- | ----------------- | ------------------------------- | ------ |
| T1: Measurements model + zod mask   | Measurement data model + zod validation boundary               | unit              | unit                            | ✅ OK  |
| T2: Seed system charts              | Size-chart seeding                                             | unit              | unit                            | ✅ OK  |
| T3: Catalog entries + table tests   | Size-chart table catalog rendering                             | component (`dom`) | unit (component, `dom` project) | ✅ OK  |
| T4: Dart re-angling logic           | Drafting engine — `bodice()` dart math                         | unit              | unit                            | ✅ OK  |
| T5: Containment/seam-graph coverage | Drafting engine — containment + seam-graph/assembly invariants | unit              | unit                            | ✅ OK  |

No task defers its own layer's tests to a later task — every task's `Done when` includes the test file(s) for the code it changes in the same commit.

---

## Tips

(carried from the skill template — no feature-specific additions)
