# T-Shirt Fit Calibration Tasks

## Execution Protocol (MANDATORY — do not skip)

Implement these tasks with the `tlc-spec-driven` skill: **activate it by name and follow its
Execute flow and Critical Rules.** Do not search for skill files by filesystem path. The skill
is the source of truth for the full flow (per-task cycle, sub-agent delegation, adequacy
review, Verifier, discrimination sensor).

**If the skill cannot be activated, STOP and tell the user — do not proceed without it.**

---

**Design**: `.specs/features/tshirt-fit-calibration/design.md`
**Status**: Draft

---

## Test Coverage Matrix

> Generated from codebase sampling (`lib/draft/*.test.ts`, `vitest.workspace.ts`,
> `CLAUDE.md`'s own testing section) — confirm before Execute. Guidelines found: `CLAUDE.md`
> (`npm test` = two vitest projects; `lib/**/*.test.{ts,tsx}` is the `node` project, no DOM
> setup). No project-specific coverage threshold config exists beyond that split.

| Code Layer                                                                   | Required Test Type | Coverage Expectation                                                                                                           | Location Pattern                                      | Run Command                     |
| ---------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------------------- |
| Domain drafting formulas (`lib/draft/garment.ts`, `ease.ts`, `subpieces.ts`) | unit               | All branches touched; 1:1 to TSHIRT-01..05; the explicit-override edge case (TSHIRT-05) gets its own test per overridden field | `lib/draft/garment.test.ts`, `lib/draft/ease.test.ts` | `npx vitest run --project node` |
| Comparison/reporting tool (`lib/draft/tshirtBenchmark.test.ts`)              | unit               | Structural-completeness assertions per TSHIRT-06/07/09 — no numeric pass/fail gate, per the spec's explicit decision           | `lib/draft/tshirtBenchmark.test.ts`                   | `npx vitest run --project node` |
| Regression — every other archetype (`blouse`/`dress`/`skirt`/`trousers`)     | unit               | Every existing test in scope passes unmodified (TSHIRT-08)                                                                     | `lib/draft/*.test.ts`                                 | `npm test`                      |

## Gate Check Commands

| Gate Level | When to Use                                                           | Command                         |
| ---------- | --------------------------------------------------------------------- | ------------------------------- |
| Quick      | After each Phase 1 task (single-concern domain change)                | `npx vitest run --project node` |
| Full       | After Phase 2 (comparison tool) and before declaring the feature done | `npm test`                      |
| Build      | End of feature, once, before the Verifier runs                        | `npm run build && npm run lint` |

---

## Execution Plan

Phases are ordered and run sequentially — each phase completes before the next begins, and
tasks within a phase execute in order. 6 tasks total — fits a single batch (≤ ~8), no
sub-agent dispatch needed; execute inline.

### Phase 1: Formula and constant changes

```
T1 → T2 → T3 → T4
```

### Phase 2: Comparison tool and regression sweep

```
T5 → T6
```

---

## Task Breakdown

### T1: T-shirt length formula ✅ Complete

**What**: Replace the shared blouse/tshirt length ternary in `garment.ts` with a 3-way branch
that gives `tshirt` its own `TSHIRT_HEM_DROP_CM` constant (18.5, derived and labeled per
design.md's Data Models — solved from `backLength(44) + drop - shoulderSlope(4.5) =
heightCm(58.007)` against the benchmark's size-M back/front panel height), and split the
existing shared length test into a blouse-only assertion and a new tshirt-specific one.

**Where**: `lib/draft/garment.ts` (lines ~306-312), `lib/draft/garment.test.ts` (the "reports
the blouse/tshirt body length" test, ~line 582-594)
**Depends on**: None
**Reuses**: The existing `garmentLengthCm` plumbing (`measureSeams`, `TechSheetTab`, export) —
no consumer changes.
**Requirement**: TSHIRT-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `TSHIRT_HEM_DROP_CM` is defined with an in-code comment showing the derivation (the
      equation above, plus a note that it's solved against the benchmark's size-M figure, not
      a scaled-per-size table)
- [ ] `spec.type === "tshirt"` computes `lengthCm = measurements.backLength +
    TSHIRT_HEM_DROP_CM`; `blouse` keeps `backLength + hipHeight + 5`; `dress` keeps
      `backLength` — unchanged
- [ ] The old combined test is split: "reports the blouse body length" (unchanged assertion)
      and "reports the tshirt body length" (asserts `backLength + TSHIRT_HEM_DROP_CM`)
- [ ] Gate check passes: `npx vitest run --project node`
- [ ] Test count: no fewer tests than before this task (the split adds one net test)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(draft): give the tshirt archetype its own length formula`

---

### T2: Positive knit ease for t-shirts

**What**: Add `TSHIRT_BASE_EASE_CM` (55.9, derived per design.md's Data Models — solved from
`bust/4 + ease/4 = avg(front, back) halfChest` against the benchmark's size-M panel widths,
with `bust` held at the existing `SIZE_TABLE_MALE.M` value of 100 rather than inventing a new
body measurement) to `lib/draft/ease.ts`'s `wearingEaseCm`, replacing the hardcoded `0` base
for the knit branch. Label the constant's derivation and its wide gap from the cited "loose
tee" convention (~15-20cm) directly in the comment, per TSHIRT-09 — do not present it as a
verified industry figure.

**Where**: `lib/draft/ease.ts`, `lib/draft/ease.test.ts`, `lib/draft/garment.test.ts` (the
`draftPiecesCm` width-bound assertion at ~line 519, which will need a wider upper bound now
that default tshirt ease is much larger than 0)
**Depends on**: T1 (sequenced only — no shared code; keeps single-file-at-a-time commits clean)
**Reuses**: `STRETCH_EASE_PCT`/`style.stretch` exactly as today.
**Requirement**: TSHIRT-02, TSHIRT-05 (stretch-override half), TSHIRT-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `TSHIRT_BASE_EASE_CM` exported from `ease.ts` with the derivation comment (equation +
      the "estimate, not a verified figure" caveat, matching design.md's Risks table)
- [ ] `wearingEaseCm`'s knit branch reads
      `TSHIRT_BASE_EASE_CM - (bustCm * STRETCH_EASE_PCT[style.stretch ?? "none"]) / 100`
- [ ] `ease.test.ts` gets a new case asserting the knit/default-stretch case returns
      `TSHIRT_BASE_EASE_CM` (not 0), and a case asserting an explicit `stretch: "high"` still
      reduces relative to that new base (TSHIRT-05's stretch half)
- [ ] `garment.test.ts`'s `draftPiecesCm` width assertion upper bound is widened to accommodate
      the new default ease (verify the actual drafted width and set a bound comfortably above it)
- [ ] Gate check passes: `npx vitest run --project node`
- [ ] Test count: no fewer tests than before this task (adds at least 2 new ease.test.ts cases)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(draft): give knit tees positive default wearing ease`

---

### T3: Default t-shirt collar to a rib band

**What**: Default `tshirt`'s style block to `collar: spec.style.collar ?? "band"` (was
implicitly `"none"`), and update the one existing test whose exact-match piece-id assertion
predates a default collar existing.

**Where**: `lib/draft/garment.ts` (the tshirt style-defaults object, ~line 314-322),
`lib/draft/garment.test.ts` (the "tshirt generates front/back/sleeve..." test, ~line 275-293)
**Depends on**: T2 (sequenced only — different concern, same file region as T1's edit; kept
sequential to avoid two agents touching `garment.ts` concurrently, not a true code dependency)
**Reuses**: The same `??`-default idiom the block already uses for `neckline`/`sleeve`; `COLLARS`
already includes `"band"` (no enum/schema/prompt change).
**Requirement**: TSHIRT-03, TSHIRT-05 (collar-override half)

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] A `tshirt` spec with no explicit `style.collar` drafts a `"collar"` piece (band shape,
      from `draftBandCollar`)
- [ ] The existing "tshirt generates front/back/sleeve..." test's `ids` assertion includes
      `"collar"` in the expected (sorted) array
- [ ] A new test asserts an explicit `style.collar: "none"` on a `tshirt` spec still drafts NO
      collar piece (TSHIRT-05's collar half — the override must win)
- [ ] Gate check passes: `npx vitest run --project node`
- [ ] Test count: no fewer tests than before this task (adds 1 new override test)

**Tests**: unit
**Gate**: quick

**Commit**: `feat(draft): default t-shirts to a rib collar band`

---

### T4: Band collar height 4cm → 5cm

**What**: Change `subpieces.ts`'s `BAND_COLLAR_HEIGHT_CM` from 4 to 5, citing the benchmark's
directly-comparable, grade-invariant collar-band width. Add one new assertion (none existed
before — confirmed no test file references this constant today) so the constant is guarded
going forward.

**Where**: `lib/draft/subpieces.ts` (line 321), `lib/draft/garment.test.ts` (new assertion
alongside the existing `#221` band-collar geometry tests, ~line 1583-1596)
**Depends on**: T3 (sequenced only — different file, kept in Phase 1 order)
**Reuses**: Nothing new — a flat constant change.
**Requirement**: TSHIRT-04

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `BAND_COLLAR_HEIGHT_CM = 5`, comment updated to cite the benchmark figure instead of (or
      alongside) its prior sourcing
- [ ] A new test drafts a `tshirt` (or any `collar: "band"` spec) and asserts the collar
      piece's outline y-range spans exactly 5cm (was 4)
- [ ] Gate check passes: `npx vitest run --project node`
- [ ] Test count: +1 over the previous task

**Tests**: unit
**Gate**: quick

**Commit**: `fix(draft): correct band collar height to 5cm`

---

### T5: Benchmark comparison tool

**What**: Create `lib/draft/tshirtBenchmark.test.ts` — drafts a `tshirt`/male garment at
P/M/G/GG from `SIZE_TABLE_MALE` (post T1-T4 changes), measures each piece
(front/back/sleeve/collar-band) via a `measurePiece` helper built on `curveArcLengthCm` and
`outlineCm`/`curvedSpans`, diffs against `docs/reference/tshirt-benchmark/measurements.json`,
and writes `docs/reference/tshirt-benchmark/comparison-report.md` (overwritten every run, per
the spec's Edge Cases). No numeric pass/fail gate on the deltas themselves (spec's explicit
decision) — the test asserts the report's structural completeness instead.

**Where**: `lib/draft/tshirtBenchmark.test.ts` (new file)
**Depends on**: T4 (needs every formula/constant change applied first, so the report reflects
the tuned state)
**Reuses**: `draftGarment`, `SIZE_TABLE_MALE`, `curveArcLengthCm` (`lib/draft/core.ts`),
`formatCm` (`lib/format.ts`); reads `docs/reference/tshirt-benchmark/measurements.json` via a
static import.
**Requirement**: TSHIRT-06, TSHIRT-07

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `measurePiece(piece: DraftedPiece)` returns `{perimeterCm, areaCm2,
    rectilinearPerimeterCm, curvePerimeterCm, widthCm, heightCm}` matching
      `measurements.json`'s field shape exactly
- [ ] The test drafts P/M/G/GG and measures back/front/sleeve/collar-band for each
- [ ] `docs/reference/tshirt-benchmark/comparison-report.md` is written (overwrite, not
      append) listing all 4 sizes × 4 pieces × 6 metrics, each with an "ours" value, a
      "benchmark" value, and a delta
- [ ] The test asserts: the report file exists after the run; it contains exactly 16
      piece×size rows; every row's 6 metrics are present; the "ours" figures in the report
      match what `measurePiece` independently computed for the same draft (a structural
      round-trip check, not a threshold)
- [ ] No assertion anywhere in this file gates on a delta being below any numeric bound
- [ ] Gate check passes: `npx vitest run --project node`
- [ ] Test count: new file, at least 3 tests (shape/count, report-exists, round-trip)

**Tests**: unit
**Gate**: quick

**Commit**: `test(draft): add tshirt benchmark comparison report`

---

### T6: Full regression sweep and AC8 verification

**What**: Run the full test suite and lint/build gates; fix any other pre-existing test this
feature's changes broke that wasn't already covered in T1-T4 (a stray assertion the earlier
per-task grep missed), and confirm zero non-`tshirt` archetype test was touched.

**Where**: Whichever test file(s) the full run reveals (expected: none beyond T1-T4's edits,
per the design's Risks table — this task exists to catch what that grep sweep missed, not to
plan new changes blind)
**Depends on**: T5
**Reuses**: N/A — verification task
**Requirement**: TSHIRT-08

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [ ] `npm test` passes (both vitest projects)
- [ ] `npm run build` passes (includes the TypeScript check)
- [ ] `npm run lint` passes
- [ ] `git diff` for this feature touches no `blouse`/`dress`/`skirt`/`trousers`-only code path
      or test (confirmed by reading the diff, not assumed)
- [ ] Full test count reported (before vs. after this feature, net delta explained)

**Tests**: unit
**Gate**: build

**Commit**: `test(draft): confirm tshirt calibration leaves other archetypes unchanged` (only if
any fix was needed — otherwise this task produces no commit, just a verification note in the
batch summary)

---

## Phase Execution Map

```
Phase 1 → Phase 2

Phase 1:  T1 ------→ T2 ------→ T3 ------→ T4
Phase 2:  T5 ------→ T6
```

Execution is strictly sequential — there is no intra-phase parallelism. 6 tasks total fits a
single batch; no sub-agent dispatch.

---

## Task Granularity Check

| Task                                           | Scope                                        | Status                                                 |
| ---------------------------------------------- | -------------------------------------------- | ------------------------------------------------------ |
| T1: T-shirt length formula                     | 1 constant + 1 branch, 2 files               | ✅ Granular                                            |
| T2: Positive knit ease for t-shirts            | 1 constant + 1 function, 3 files             | ✅ Granular                                            |
| T3: Default t-shirt collar to a rib band       | 1 default + 1 file, 2 test files touched     | ✅ Granular                                            |
| T4: Band collar height 4cm → 5cm               | 1 constant, 2 files                          | ✅ Granular                                            |
| T5: Benchmark comparison tool                  | 1 new file, cohesive (1 concept: comparison) | ✅ Granular                                            |
| T6: Full regression sweep and AC8 verification | Verification only, no planned file set       | ✅ Granular (verification task, not a code-layer task) |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows         | Status   |
| ---- | ---------------------- | --------------------- | -------- |
| T1   | None                   | (Phase 1 start)       | ✅ Match |
| T2   | T1                     | T1 → T2               | ✅ Match |
| T3   | T2                     | T2 → T3               | ✅ Match |
| T4   | T3                     | T3 → T4               | ✅ Match |
| T5   | T4                     | T4 (Phase 1 end) → T5 | ✅ Match |
| T6   | T5                     | T5 → T6               | ✅ Match |

No dependency points to a later phase; every arrow has a matching `Depends on` and vice versa.

---

## Test Co-location Validation

| Task | Code Layer Created/Modified                          | Matrix Requires   | Task Says    | Status |
| ---- | ---------------------------------------------------- | ----------------- | ------------ | ------ |
| T1   | Domain drafting formula (`garment.ts` length)        | unit              | unit         | ✅ OK  |
| T2   | Domain drafting formula (`ease.ts`)                  | unit              | unit         | ✅ OK  |
| T3   | Domain drafting formula (`garment.ts` style default) | unit              | unit         | ✅ OK  |
| T4   | Domain drafting formula (`subpieces.ts`)             | unit              | unit         | ✅ OK  |
| T5   | Comparison/reporting tool                            | unit              | unit         | ✅ OK  |
| T6   | Regression verification (no new code layer)          | unit (build gate) | unit / build | ✅ OK  |

No violations — every domain-layer task carries co-located unit tests; no task defers testing
to a later one.

---

## MCPs and Skills for Execution

No project MCP servers apply to this feature (drafting-formula/test-file edits only — no
Stripe, shadcn, or database work). No sub-skill beyond `tlc-spec-driven` itself is needed for
any task. All six tasks: **Tools: NONE / Skill: NONE**, confirmed above per-task.
