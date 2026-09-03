# Pattern Creation Form Validation

**Feature**: `pattern-form-creation`
**Iterations**: 1 → ❌ (2026-09-03, record kept verbatim below) · 2 → ✅ (this report)

---

## Validation: iteration 2 — PASS ✅

**Date**: 2026-09-03
**Spec**: `.specs/features/pattern-form-creation/spec.md`
**Diff range**: `ee32304..HEAD` (`192da79`). Iteration 1 covered `ee32304..f35cd42`; the new,
previously-unverified surface is `d6fb20b` (three behaviour changes found by a real 1280×900 render)
and `192da79` (the three gap fixes).
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero, read-only over the real tree
**Verdict**: **PASS** — iteration 1's one blocking gap is closed and its mutant independently
re-killed. Three non-blocking findings remain (F5–F7), one of which is a **partially-landed fix**.

### The three claimed fixes, re-derived

| Fix                                                      | Claim                                                                                    | Independent evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Confirmed?     |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| **1 — PFORM-60 clause (a), the real coverage hole**      | A new dom test kills the `.slice(0, room)` deletion                                      | Test at `components/dashboard/NewPatternForm.test.tsx:462`; assertions `expect(submitted!.images).toHaveLength(MAX_ATTACHMENT_COUNT)` (`:482`) and `expect(submitted!.images.map(i => i.base64)).toEqual([p0…p3])` (`:484`), plus a live `getAllByRole` count at `:478`. **Mutation re-run myself** (M26): deleting `Array.from(files).slice(0, room)` at `NewPatternForm.tsx:194` fails with _"expected [ <button …> …(5) ] to have a length of 4 but got 6"_. M27 additionally proves the **order** clause: `slice(0, room)` → `slice(-room)` fails with _"expected [ 'p2.jpg', 'p3.jpg', … ] to deeply equal [ 'p0.jpg', 'p1.jpg', … ]"_ | ✅ **Yes**     |
| **2 — PFORM-05 reworded to the shipped cap**             | AC states `MAX_CHAT_MESSAGE_LENGTH` minus the composed head and its separator            | `spec.md:69` now reads "…minus the length of the composed head and the blank line that separates them"; the assumption row is `spec.md:42`. Code: `const detailsMax = Math.max(0, MAX_CHAT_MESSAGE_LENGTH - head.length - 2)` at `NewPatternForm.tsx:221` — the `2` **is** the `\n\n` the AC now names (composed at `:240`). Test targets the **derived relationship**, not a literal: `NewPatternForm.test.tsx:158` — `expect(max + head.length + 2).toBe(MAX_CHAT_MESSAGE_LENGTH)`, with `head` resolved from the catalog, plus the per-choice shrink at `:162`. Mutation M33 (`- 2` → `- 1`) kills it                                    | ✅ **Yes**     |
| **3 — story-3 labels renumbered, no AC double-labelled** | `spec.md` traceability and `tasks.md` coverage agree with AC order; no AC labelled twice | Traceability now PFORM-44 → `T4, T13`, 45 → `T13`, 46 → `T19`, 47 → `T13` (`spec.md:201`–`:204`), matching AC 5–8 at `spec.md:115`–`:118`. `tasks.md`'s coverage table rows are corrected (`:942`–`:944`), T13's bullets carry 44/45/47 correctly (`:493`/`:494`/`:495`) and the substitution-notice bullet is explicitly declassified (`:492`). **But** `tasks.md:207`/`:208` (T4) and six test comments still carry the old drift — see **F5**                                                                                                                                                                                            | ⚠️ **Partial** |

### New surface — `d6fb20b`, judged and mutated

All three changes are anchored in the design handoff or in existing app behaviour, not invented:

| Change                                                                                                        | Design/app anchor (verified)                                                                                                                                                                                                                                                                                                                                          | Test                                                                                                                                                                                         | Discriminating?                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Field column scrolls (`max-h-[55vh] overflow-y-auto`), footer outside it — `NewPatternForm.tsx:264`           | No design value to check (the reference form is shorter), but the fix is structural and `overflow-y-auto` on a native bounded scroller matches existing repo practice (`OnboardingShell.tsx:134`, `SizeChartsShell.tsx:86`, `VersionCompare.tsx:281`), and the in-code comment names the Radix definite-height reason `ScrollArea`'s local `fill` exists for          | `NewPatternForm.test.tsx:572` — `closest("div.overflow-y-auto")` non-null, `toHaveClass("max-h-[55vh]")`, `column.contains(submitBtn) === false`                                             | ✅ M30 (drop `overflow-y-auto`) and M31 (`55vh` → `92vh`) both killed. ⚠️ Structural proxy, not a measurement — jsdom has no layout, so the class name and the DOM containment are the strongest assertions available                                                                                                                         |
| Every `SelectTrigger` at 36px (`data-size="default"`), footer `Button`s stay `sm` (32px)                      | `docs/design/screens/Dashboard.dc.html`: `MoldAIUI.Input` and every `MoldAIUI.SelectTrigger` carry `hint-size="100%,36px"`; the two footer `Button`s carry `size="sm" hint-size="auto,32px"`. Primitive contract checked: `components/ui/select.tsx:40` maps `data-[size=default]:h-9` / `data-[size=sm]:h-8`, `input.tsx:11` is `h-9`, `button.tsx:34` `sm` is `h-8` | `NewPatternForm.test.tsx:178` (every `[data-slot="select-trigger"]` is `data-size="default"`, plus the name input's `h-9`) and `:188` (both footer buttons `data-size="sm"`)                 | ✅ M28 (re-add `size="sm"` to the style trigger) killed by `:178`; M29 (drop `size="sm"` from the submit button) killed by `:188`. ⚠️ `:178` asserts no **count**, so it would pass vacuously if the selects stopped rendering — covered indirectly by `:209`/`:261`/`:309`                                                                   |
| Chart default falls back to the **system female** chart when none is active — `NewPatternForm.tsx:152`–`:156` | Matches the app's existing bootstrap: a blank pattern is seeded from the system female chart, and `pickSizeChartForGeneration` falls back to the system chart for the spec's gender. The defect was real: the form defaults to `blouse`, and the chart it picks decides the drafted gender (PFORM-41), so `list[0]` handed a new account the male block               | `NewPatternForm.test.tsx:404` — fixture `CHARTS_NONE_ACTIVE` ordered male-first, neither active; asserts the trigger reads the female chart and `submitted!.sizeChartId === "sc-f"` (`:413`) | ✅ M32 (delete the `isSystem && gender === "female"` preference, reverting to `list[0]`) killed. ❌ M34 (drop only the `isSystem &&` half) **survived** — the fixture's two charts are both `isSystem`, so the test cannot tell the _system_ female chart from any female chart, which is what its own title claims. Non-blocking: see **F6** |

### Discrimination Sensor — iteration 2

**Depth**: 9 behaviour-level mutations, all aimed at the new or previously-unguarded surface (iteration 1's
26 mutations on the routes, stores and pure modules are not re-run — those files are unchanged in
`ee32304..HEAD` beyond this commit pair). Run in a throwaway `git worktree` at `192da79` with
`node_modules` junctioned in; the real tree was never mutated. Full-file run each time
(`npx vitest run --project dom components/dashboard/NewPatternForm.test.tsx`, 47 tests).

| #   | Mutation                                                                            | File:line                                     | Killed by                                 | Killed?                        |
| --- | ----------------------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------- | ------------------------------ |
| M26 | Deleted the per-batch cap: `Array.from(files).slice(0, room)` → `Array.from(files)` | `components/dashboard/NewPatternForm.tsx:194` | `:462` — "expected length of 4 but got 6" | ✅ Killed (was M25's survivor) |
| M27 | Kept the **last** N instead of the first: `slice(0, room)` → `slice(-room)`         | `NewPatternForm.tsx:194`                      | `:484` — ordered `toEqual` fails          | ✅ Killed                      |
| M28 | Re-added `size="sm"` to the style `SelectTrigger`                                   | `NewPatternForm.tsx:351`                      | `:178` — `data-size` "sm" vs "default"    | ✅ Killed                      |
| M29 | Dropped `size="sm"` from the submit `Button`                                        | `NewPatternForm.tsx:495`                      | `:188`                                    | ✅ Killed                      |
| M30 | Removed `overflow-y-auto` from the field column                                     | `NewPatternForm.tsx:264`                      | `:572` — `closest(...)` is null           | ✅ Killed                      |
| M31 | Changed the bound: `max-h-[55vh]` → `max-h-[92vh]`                                  | `NewPatternForm.tsx:264`                      | `:576`                                    | ✅ Killed                      |
| M32 | Removed the female-chart preference, reverting to `list[0]`                         | `NewPatternForm.tsx:154`                      | `:404`                                    | ✅ Killed                      |
| M33 | Off-by-one in the details reserve: `- head.length - 2` → `- 1`                      | `NewPatternForm.tsx:221`                      | `:158`                                    | ✅ Killed                      |
| M34 | Dropped only the `isSystem &&` half of the fallback predicate                       | `NewPatternForm.tsx:154`                      | —                                         | ❌ **Survived** (47/47 green)  |

**Result**: 8/9 killed; the single survivor is a harmless clause on behaviour no AC or Done-when
states, so no fix task blocks completion — PASS

**Isolation**: pre-sensor baseline was ` M skills-lock.json` + 4 untracked skill dirs. Every mutation
was applied inside `.claude/worktrees/verify2` and confined to one file
(`components/dashboard/NewPatternForm.tsx`); each was reverted with `git checkout --` **inside that
worktree**, never in the real tree, and no `git stash` was used at any point. The worktree was removed
with `git worktree remove --force` and pruned. The real tree's porcelain afterwards adds
` M docs/reference/tshirt-benchmark/comparison-report.md` — a whitespace/table-alignment reflow of a
benchmark doc, in no mutation set, and the same file iteration 1 saw appearing and disappearing from
concurrent activity. Left untouched per the read-only mandate.

### Acceptance criteria — delta only

The 35 ACs iteration 1 confirmed are not re-derived. Re-checked because the fixes touched them:

| Criterion                                      | Spec-defined outcome                                                                           | `file:line` + assertion                                                                                                                                      | Result                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------- |
| **PFORM-05** (reworded)                        | `maxLength === MAX_CHAT_MESSAGE_LENGTH − head.length − 2`                                      | `NewPatternForm.test.tsx:158` — `expect(max + head.length + 2).toBe(MAX_CHAT_MESSAGE_LENGTH)`; shrink-per-choice at `:162`; code at `NewPatternForm.tsx:221` | ✅ PASS (was ⚠️ spec-precision) |
| **PFORM-60** clause (a) "accept up to the cap" | at most `MAX_ATTACHMENT_COUNT` held, the **first** ones, in order                              | `NewPatternForm.test.tsx:462` → `:478`/`:482`/`:484`; killed by M26 and M27                                                                                  | ✅ PASS (was ❌ GAP)            |
| **PFORM-60** clause (b) "add cell stops"       | add cell absent at 4                                                                           | `NewPatternForm.test.tsx:439` (line-shifted from `:378`), unchanged                                                                                          | ✅ PASS                         |
| **PFORM-40 / 46** (line-shifted by the fixes)  | all owned charts listed, selected id submitted / select disabled + reason, `sizeChartId: null` | `NewPatternForm.test.tsx:366`, `:379`, `:393` and `:417`, `:426` — same assertions iteration 1 cited, at new line numbers; all 47 tests in the file pass     | ✅ PASS                         |
| PFORM-03, 10, 20–23, 61–63                     | unchanged                                                                                      | `NewPatternForm.test.tsx:142`, `:199`, `:209`/`:225`/`:243`, `:261`/`:292`/`:301`, `:309`/`:324`, `:336`/`:345`, `:489`, `:509`/`:526`, `:540`               | ✅ PASS                         |

**Status**: **36/36 ACs covered with spec-anchored evidence** · 0 GAP · 0 spec-precision gaps
(PFORM-05's was closed by rewording, not by weakening a test).

### Gate Check

- `npx vitest run --project node` → **2663 passed, 3 skipped** (144 files passed, 1 skipped) — exit 0
- `npx vitest run --project dom` → **733 passed** (70 files) — exit 0
- **Total: 3396 passed, 3 skipped, 0 failed.** Iteration 1 measured 3391; delta **+5**, exactly the
  4 tests `d6fb20b` added and the 1 `192da79` added. **No test count decrease, no assertion weakened** —
  both new commits are pure additions to the test file plus the fix's own code lines.
- `npx eslint app lib components` → exit 0 · `.claude/hooks/check-conventions.mjs` → exit 0, no output
- `npm run build` → not re-run by the verifier (a `next dev` server shares `.next`; a second dev server
  runs from another worktree). The author reported it green; TypeScript breakage would surface as a
  vitest transform error, which it did not.
- The 3 skips are pre-existing and outside this diff surface.

### Code Quality (iteration 2 surface only)

| Principle                                        | Status                                                                                                                                                                                                                                                         |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimum code                                     | ✅ Three narrow edits (one wrapper class, three prop removals, one `find` clause) plus one test.                                                                                                                                                               |
| Surgical changes                                 | ✅ One production file and its test touched across both commits.                                                                                                                                                                                               |
| No scope creep                                   | ⚠️ Not creep, but **undeclared**: `d6fb20b`'s three changes have no task entry, no AC and no assumption row (F7).                                                                                                                                              |
| Matches patterns                                 | ✅ Native bounded scroller has four precedents in `components/`; `data-size` is the primitive's own contract; the female fallback mirrors `seedPatternState`/`pickSizeChartForGeneration`. No `text-[Npx]`, no hex, no direct `fetch`; the hook is clean.      |
| Spec-anchored outcome check                      | ✅ 36/36 asserted values match the spec's own outcome.                                                                                                                                                                                                         |
| Per-layer Coverage Expectation                   | ✅ The component-layer hole iteration 1 found is closed; routes/domain unchanged.                                                                                                                                                                              |
| Every test maps to an AC / edge case / Done-when | ⚠️ **4 unclaimed tests** — `:178`, `:188`, `:404`, `:572` map to the design reference and a field-render defect, not to any spec AC or Done-when (F7).                                                                                                         |
| Documented guidelines followed                   | ✅ `CLAUDE.md`: fixture strings are test data (not catalog text) so plain literals are correct at `:410`; `vi.mock` specifiers unchanged and exact; catalog text still compared through `translatorFor`/`ptBR`; the `dom` project used for a component change. |

### Findings (iteration 2)

#### F5 — Fix 3 is only partly landed: the story-3 relabel stopped at `spec.md` and two `tasks.md` regions · Minor (traceability hygiene, not coverage)

`spec.md`'s traceability rows, `tasks.md`'s coverage table, T4's `**Requirement**` header, T13's bullets
and T19's bullet are all correct now. Three places still carry the pre-fix numbering, so the claim
"no AC is double-labelled" does not hold:

- `tasks.md:207` labels T4's "a `requestedId` **absent from the list** falls through" as **PFORM-46** —
  but PFORM-46 is now the _form's_ failed chart fetch, which `spec.md:203` maps to T19 and `tasks.md:722`
  already labels. PFORM-46 therefore names two different criteria in two different tasks.
- `tasks.md:208` labels "the no-`requestedId` path is byte-for-byte unchanged" as **PFORM-45**; under the
  corrected order that is **PFORM-44** (AC 5). PFORM-44 is on T4's `**Requirement**` line (`:197`) with no
  bullet carrying it.
- Six test comments still hold the old offset: `components/dashboard/NewPatternForm.test.tsx:416`
  (chart-load failure labelled PFORM-47, should be 46), `lib/db/sizeChart.test.ts:649` (fall-through
  labelled PFORM-46), `app/api/patterns/[id]/generate/route.test.ts:1255` (labelled PFORM-44 for the
  substitution-notice consequence `tasks.md:492` just declassified), `:1279` and `:1301` (labelled
  PFORM-45, should be 44), `:1327` (labelled PFORM-46, should be 45).

**All eight story-3 ACs remain genuinely covered** — the evidence rows in iteration 1's table locate each
one and every cited test still passes — so this is a labelling defect only. **Fix**: relabel those two
T4 bullets and the six comments. Docs/comments only, no code or assertion change.

#### F6 — M34: the `isSystem` half of the new chart fallback is unpinned · Informational

`NewPatternForm.tsx:154`'s predicate `c.isSystem && c.gender === "female"` can be reduced to
`c.gender === "female"` with all 47 tests green, because `CHARTS_NONE_ACTIVE`
(`NewPatternForm.test.tsx:66`–`:79`) holds two charts that are **both** `isSystem: true`. The test's own
title says "the **system** female chart", which the fixture cannot discriminate. Not a fix task: the
user-visible defect the change exists for (a _male_ block for a blouse) is fully pinned by M32, no AC or
Done-when states which female chart wins, and preferring a custom female chart over the system one is
not obviously wrong. If the clause is meant to be load-bearing, adding a non-system female chart ahead
of the system one in the fixture is a one-line pin.

#### F7 — `d6fb20b` has no task, no AC and no assumption row · Minor (process/traceability)

The commit changes three real behaviours and adds four tests, none of which trace to a spec AC, a listed
edge case or a Done-when criterion: the two `data-size` tests, the scroll test and the chart-default
test. Two of the three are design-fidelity fixes anchored in `Dashboard.dc.html` (verified above), which
the spec's Success Criteria never enumerate; the third is a **default-selection decision** — exactly the
class of Execute-time decision fix 2 just taught this feature to record, having added the PFORM-05 row at
`spec.md:42`. **Fix**: add a `T23` entry to `tasks.md` with these four Done-when bullets, and one
assumption row for "which chart the form pre-selects when none is active". Docs only.

### Summary — iteration 2

**Overall**: ✅ Ready, with three docs-only follow-ups.

**Spec-anchored check**: 36/36 ACs matched the spec-defined outcome · 0 GAP · 0 spec-precision gaps
**Sensor**: 9 injected, 8 killed, 1 survivor on unspecified behaviour (non-blocking)
**Gate**: 3396 passed, 0 failed, 3 pre-existing skips · eslint clean · conventions hook clean

**What changed since iteration 1.** The one blocking gap is genuinely closed, and I re-killed it without
taking the author's word for it: deleting `Array.from(files).slice(0, room)` now fails with a length
assertion, and the ordering clause is load-bearing too (taking the last four instead of the first four
also fails). PFORM-05 is no longer a spec-precision gap — the AC states the derived cap, the assumption
row records why, and the test asserts the relationship against the imported constant rather than a
frozen number, which is the shape that survives a change to either side. `d6fb20b`'s three changes are
all real defects with real anchors (the design file states 36px for the selects and 32px only for the
footer buttons; the male-block-for-a-blouse default contradicted the app's own bootstrap), and all three
of its tests discriminate under mutation.

**What is still open** (none blocking): the story-3 relabel stopped short of T4's own bullets and six
test comments, so PFORM-46 still names two criteria (F5); the `isSystem` half of the new fallback is
unpinned by its fixture (F6); and `d6fb20b` itself is undocumented in `tasks.md`/`spec.md` (F7).

**Next steps**: land F5's relabel, F7's `T23` + assumption row, and optionally F6's one-line fixture
change. All three are documentation or fixture edits — no production change, no re-verification of
coverage required.

---

# Iteration 1 record (superseded verdict, kept per the skill's keep-the-record rule)

**Date**: 2026-09-03
**Spec**: `.specs/features/pattern-form-creation/spec.md`
**Diff range**: `ee32304..f35cd42` (22 commits, 49 files, +6157/−287)
**Verifier**: independent sub-agent (author ≠ verifier), evidence-or-zero
**Verdict**: ❌ **FAIL** — 1 genuine surviving mutant on an uncovered AC clause (PFORM-60, first clause). Everything else is green.

All line citations below are against the **committed** blobs at `f35cd42`. Two files
(`components/dashboard/NewPatternForm.tsx`, `components/dashboard/NewPatternForm.test.tsx`) and
`docs/reference/tshirt-benchmark/comparison-report.md` were being modified in the real working tree by
concurrent activity **during** this verification (see Isolation, below); those uncommitted edits are
outside this diff range and were not evaluated.

---

## Task Completion

| Task   | Status  | Notes                                                                                                                                                                                                                                                                                                                                   |
| ------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1–T21 | ✅ Done | All 21 planned tasks committed, one commit each, Conventional Commits respected.                                                                                                                                                                                                                                                        |
| T22    | ✅ Done | Added mid-Execute with a `SPEC_DEVIATION` note (adds `assembly` alongside `hasImage`/`imageCount` to `ChatMessageSchema`). Reviewed: the scope increase is one line in the same object, carries its own per-key round-trip coverage, and is justified — `assembly` was being destroyed on every read by the identical defect. Accepted. |

---

## Spec-Anchored Acceptance Criteria

### P1: The form creates a real drafted pattern

| Criterion                                                                                                            | Spec-defined outcome                                           | `file:line` + assertion                                                                                                                                                                                                                                                                                                                    | Result                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| **PFORM-01** activate "Preencher formulário" → replace dialog content with the form step, same dialog, no navigation | form step rendered; no route push; dialog not closed           | `components/dashboard/NewPatternDialog.test.tsx:101` — `expect(screen.getByLabelText(tForm.field.name)).toBeInTheDocument(); expect(push).not.toHaveBeenCalled(); expect(props.onOpenChange).not.toHaveBeenCalled()`                                                                                                                       | ✅ PASS                                                                                                                            |
| **PFORM-02** "Voltar" → chooser step, every entered value still present                                              | typed name survives form → chooser → form                      | `NewPatternDialog.test.tsx:135` — `expect(screen.getByLabelText(tForm.field.name)).toHaveValue("Blusa gola alta")` after the round trip                                                                                                                                                                                                    | ✅ PASS                                                                                                                            |
| **PFORM-03** name input capped at `MAX_PATTERN_NAME_LENGTH` (80) via its own `maxLength`                             | `maxlength === 80`, from the constant                          | `NewPatternForm.test.tsx:124` — `expect(screen.getByLabelText(F.name)).toHaveAttribute("maxlength", String(MAX_PATTERN_NAME_LENGTH))`                                                                                                                                                                                                      | ✅ PASS                                                                                                                            |
| **PFORM-04** empty name → create under `PatternData.newPatternName`, submit not blocked                              | default name used, no rejection                                | `lib/db/pattern.test.ts:338` (omitted name keeps `t("newPatternName")`), `:348` (blank name falls back), `app/api/patterns/route.test.ts:222`/`:232` (whitespace-only and non-string still create a default-named pattern), `lib/dashboardStore.test.ts:297` (blank name is omitted from the body)                                         | ✅ PASS                                                                                                                            |
| **PFORM-05** details textarea capped at `MAX_CHAT_MESSAGE_LENGTH` via its own `maxLength`                            | `maxlength === MAX_CHAT_MESSAGE_LENGTH`                        | `NewPatternForm.test.tsx:137` — `expect(max + head.length + 2).toBe(MAX_CHAT_MESSAGE_LENGTH)`; `:144` asserts the reserve shrinks per style choice. Implementation caps at `MAX_CHAT_MESSAGE_LENGTH − head.length − 2`, i.e. **strictly smaller than the spec states**.                                                                    | ⚠️ **Spec-precision gap** (see Findings F2)                                                                                        |
| **PFORM-06** submit → exactly one `Pattern`, then exactly one generation, then navigate to `/pattern/[id]`           | 1 create, 1 generate, 1 push to the returned id                | `lib/dashboardStore.test.ts:267` — `expect(api.createPattern).toHaveBeenCalledTimes(1); expect(api.generate).toHaveBeenCalledTimes(1); expect(result).toEqual({status:"ok", id:"p1"})`; `components/dashboard/DashboardShell.test.tsx:214` — `expect(push).toHaveBeenCalledWith("/pattern/form-1"); expect(push).toHaveBeenCalledTimes(1)` | ✅ PASS                                                                                                                            |
| **PFORM-07** in flight → both footer actions and every form control disabled, dialog refuses to close                | controls `disabled`, dismissal blocked                         | `NewPatternForm.test.tsx:536` — name/details/type/back/submit all `toBeDisabled()`; `NewPatternDialog.test.tsx:175` — Escape leaves `onOpenChange` uncalled and the close button absent; `DashboardShell.test.tsx:293` — end-to-end via `creatingFromForm`                                                                                 | ✅ PASS (assertion covers both footer actions + 3 representative controls; `disabled={submitting}` is applied uniformly in source) |
| **PFORM-08** 402 → dialog open, that code's own message, id retained, next submit reuses it                          | `pendingPatternId` kept; second submit issues no second create | `lib/dashboardStore.test.ts:366` — `expect(pendingPatternId).toBe("p1")`, then `expect(api.createPattern).toHaveBeenCalledTimes(1)` after a second successful submit; `DashboardShell.test.tsx:267` end-to-end; `NewPatternForm.test.tsx:549`/`:560` render `errors.insufficient_credits` + the buy-credits link                           | ✅ PASS                                                                                                                            |
| **PFORM-09** any other failure → dialog open, wire code on `actionError`, values intact                              | `actionError === <wire code>`, form still filled               | `lib/dashboardStore.test.ts:398` — `expect(actionError).toBe("message_too_long")` from a thrown `ApiError(400,"message_too_long")`; `DashboardShell.test.tsx:243` — failure message rendered, `push` not called, `getByLabelText(field.name)` still `toHaveValue("Blusa")`, `ActionErrorNotice.message` still present                      | ✅ PASS                                                                                                                            |
| **PFORM-10** submit action states the real `COSTS.adjust` cost                                                       | the resolved credit-cost string with `COSTS.adjust`            | `NewPatternForm.test.tsx:154` — `expect(screen.getByText(tCredit("creditCost", { cost: COSTS.adjust }))).toBeInTheDocument()`                                                                                                                                                                                                              | ✅ PASS                                                                                                                            |
| **PFORM-11** `POST /api/patterns` name over the cap or with a NUL → 400 `invalid_name`, no `Pattern`                 | 400 + `invalid_name`, neither create path called               | `app/api/patterns/route.test.ts:190` (exactly 80 accepted), `:200` (81 → 400 `invalid_name`, `createPattern` and `createPatternFromState` both `not.toHaveBeenCalled()`), `:212` (NUL → same)                                                                                                                                              | ✅ PASS                                                                                                                            |

### P1: Structured style choices reach the drafter unchanged

| Criterion                                                                                                                              | Spec-defined outcome                                                   | `file:line` + assertion                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Result  |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **PFORM-20** each style control is a select whose default is an explicit "deixar a IA decidir"; no value sent while selected           | default option rendered; field absent from `formSpec`                  | `NewPatternForm.test.tsx:164` (every select shows `t("styleAuto")`), `:180` — `expect(submitted!.formSpec.style).toEqual({})`, `:198` (switching back removes it again)                                                                                                                                                                                                                                                                                                                                                                | ✅ PASS |
| **PFORM-21** a type that does not apply a field → do not render its control                                                            | control absent                                                         | `NewPatternForm.test.tsx:216` (skirt: no neckline/sleeve/collar/cuff/frontClosure), `:256` (blouse: no waistband), `:232`/`:247` (frontClosure only for blouse); map itself pinned at `lib/draft/formFields.test.ts:19`–`:71` per type                                                                                                                                                                                                                                                                                                 | ✅ PASS |
| **PFORM-22** sleeve not `long` → do not render the cuff control                                                                        | cuff absent until sleeve = long                                        | `NewPatternForm.test.tsx:264` (appears only after `long`, disappears on change away), `:279` (a chosen cuff is dropped from the submitted spec); `lib/draft/formFields.test.ts:90`/`:96`/`:102`                                                                                                                                                                                                                                                                                                                                        | ✅ PASS |
| **PFORM-23** garment-type change → reset every style field the new type does not apply                                                 | inapplicable value gone from the submitted `formSpec`                  | `NewPatternForm.test.tsx:291` — asserted on `submitted!.formSpec.style`, not on state; `:300` (control reads the default again when the type changes back)                                                                                                                                                                                                                                                                                                                                                                             | ✅ PASS |
| **PFORM-24** route resolves the form spec through `validateSpec` before any use                                                        | unrecognized enum discarded, not defaulted                             | `lib/ai/formSpec.test.ts:72` — `expect("neckline" in spec!.style).toBe(false); expect(spec!.style.sleeve).toBe("long")`; `:82` (a bogus waistband is dropped rather than substituting its `"straight"` default)                                                                                                                                                                                                                                                                                                                        | ✅ PASS |
| **PFORM-25** on `apply` with a form spec → overwrite each `type`/`gender`/`style` field the form set; leave the rest at the AI's value | persisted spec carries the form's value; unset fields keep the model's | `app/api/patterns/[id]/generate/route.test.ts:948` (`spec.type === "skirt"` over the model's `"tshirt"`), `:968` (collar/sleeve/neckline matrix — `expect(state.pattern.spec?.style[field]).toBe(formValue)`), `:1000` (unset `neckline` stays `"V"`), `:1028` (`measurementOverrides.waist === 80` **and** `baseMeasurements.waist === 80`, proving it reached the drafter), `:1107` (merge does not run on ask/decline/explain); pure half at `lib/ai/formSpec.test.ts:148`–`:232`                                                   | ✅ PASS |
| **PFORM-26** the form's explicit choices appear in that request's system prompt                                                        | section present, JSON embedded, after the blank-pattern `ask` rule     | `lib/ai/prompt.test.ts:285` — `expect(s).toContain(JSON.stringify(formSpec))`; `:294` — `expect(section).toBeGreaterThan(blankRule)`; `:308` — `toContain("do NOT ask about it")` / `"do NOT contradict it in assistantMessage"`; `:280` (exactly once); `:317` (`STATIC_SECTIONS` untouched); `lib/ai/index.test.ts:410` (reaches the SDK's captured `system` blocks); route seam at `route.test.ts:1057` — `expect(mockPropose.mock.calls[0][1].formSpec).toEqual({type:"blouse", measurementOverrides:{}, style:{collar:"shirt"}})` | ✅ PASS |
| **PFORM-27** route never accepts `style.sleeveRefit` from a form spec                                                                  | key absent from the returned spec                                      | `lib/ai/formSpec.test.ts:112` — `expect("sleeveRefit" in spec!.style).toBe(false)` with `sleeveRefit: true` in the input                                                                                                                                                                                                                                                                                                                                                                                                               | ✅ PASS |
| **PFORM-28** form spec whose `type` is absent/unrecognized → 400 `invalid_form_spec`, before any debit or AI call                      | 400 + code, balance unchanged, `proposeGarment` not called             | `route.test.ts:927` — 5-case matrix (`{}`, a string, `{type:"corset"}`, an array, `null`): `expect(res.status).toBe(400)`, `error === "invalid_form_spec"`, `wallet.balance === balanceBefore`, `lastEntries === []`, `mockPropose` `not.toHaveBeenCalled()`; pure half at `lib/ai/formSpec.test.ts:20`–`:39`                                                                                                                                                                                                                          | ✅ PASS |

### P1: A molde is drafted from a size chart chosen per molde

> The task file's ID labels for this story's ACs 5–8 have drifted (see Findings F3). The rows below are keyed to the **spec's own** per-story numbering.

| Criterion                                                                                                                                          | Spec-defined outcome                                                         | `file:line` + assertion                                                                                                                                                                                                                                                                                                                                                                                  | Result  |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| **PFORM-40** chart select populated from `GET /api/size-charts`, every owned chart, system and custom                                              | all returned entries listed; the selected id is submitted                    | `NewPatternForm.test.tsx:321` — both `CHARTS` entries rendered as options, `expect(submitted!.sizeChartId).toBe("sc-m")` after choosing the second; `:334` (defaults to the account's active chart)                                                                                                                                                                                                      | ✅ PASS |
| **PFORM-41** the selected chart's own `gender` is the request's spec gender                                                                        | persisted `spec.gender` is the chart's, and the pick is asked for it         | `route.test.ts:1176` — `expect(state.pattern.spec?.gender).toBe("male")` with the model returning `"female"`, and `expect(getSizeChartForGeneration.mock.calls[0][2]).toBe("male")`; `:1201` (the same gender reaches the prompt's form spec)                                                                                                                                                            | ✅ PASS |
| **PFORM-42** owned `sizeChartId` + no pieces → frozen via `seedPatternSizeSnapshot`                                                                | `pattern.sizeChartName` is the requested chart's                             | `route.test.ts:1144` — `expect(getSizeChartForGeneration.mock.calls[0][4]).toBe(REQUESTED_CHART_ID)` and `expect(state.pattern.sizeChartName).toBe("Masculino do ateliê")`; the test double honours `requestedId`, so dropping the argument fails. Pure/repo halves: `lib/sizeCharts/compute.test.ts:145`, `lib/db/sizeChart.test.ts:630`                                                                | ✅ PASS |
| **PFORM-43** `sizeChartId` naming no owned chart → 400 `invalid_size_chart` before any debit, AI call or mutation                                  | 400 + code, no debit, no propose, pick never reached                         | `route.test.ts:1232` — `error === "invalid_size_chart"`, `wallet.balance` unchanged, `lastEntries === []`, `mockPropose` and `getSizeChartForGeneration` both `not.toHaveBeenCalled()`; reader's two causes answer identically at `lib/db/sizeChart.test.ts:692`/`:697`/`:707`                                                                                                                           | ✅ PASS |
| **PFORM-44** (spec AC 5) no `sizeChartId` → existing active-then-system pick and its substitution notice unchanged                                 | ownership read skipped, `requestedId` null, existing notice behaviour intact | `route.test.ts:1282` — `expect(getSizeChartGenderForUser).not.toHaveBeenCalled(); expect(getSizeChartForGeneration.mock.calls[0][4]).toBeNull(); expect(state.pattern.sizeChartName).toBe("Feminino adulto · ABNT")`; notice path still pinned at `:866`/`:888`; `:1305` (blank id treated as absent). `lib/sizeCharts/compute.test.ts:203` pins undefined/null/"" as identical to omitting the argument | ✅ PASS |
| **PFORM-45** (spec AC 6) `sizeChartId` for a pattern that already has pieces → ignored, snapshot untouched                                         | pick not called, `sizeChartName` unchanged                                   | `route.test.ts:1330` — `expect(getSizeChartForGeneration).not.toHaveBeenCalled(); expect(state.pattern.sizeChartName).toBe("Feminino adulto · ABNT")`                                                                                                                                                                                                                                                    | ✅ PASS |
| **PFORM-46** (spec AC 7) chart list cannot load → select disabled with a stated reason, submission still allowed, falls back to the account's pick | select `disabled`, reason on screen, `sizeChartId: null` submitted           | `NewPatternForm.test.tsx:356` — `expect(screen.getByText(t("chartLoadFailed"))).toBeInTheDocument()` + `expect(getByRole("combobox",{name:F.sizeChart})).toBeDisabled()`; `:365` — `expect(submitted!.sizeChartId).toBeNull()`; store omits the key at `lib/dashboardStore.test.ts:314`                                                                                                                  | ✅ PASS |
| **PFORM-47** (spec AC 8) account-active chart never changed as a side effect                                                                       | `setActiveSizeChart` not called                                              | `route.test.ts:1369` — `expect(setActiveSizeChart).not.toHaveBeenCalled()`; it is mocked purely so "not called" is a real assertion, not an import-list claim                                                                                                                                                                                                                                            | ✅ PASS |

### P1: Several photos reach the generation call

| Criterion                                                                                                                      | Spec-defined outcome                                                            | `file:line` + assertion                                                                                                                                                                                                                                                                                                                                                                                                                             | Result                  |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- |
| **PFORM-60** accept up to `MAX_ATTACHMENT_COUNT` photos; stop rendering the add cell at that many                              | (a) at most 4 held; (b) add cell gone at 4                                      | (b) `NewPatternForm.test.tsx:378` — `expect(queryByRole("button",{name:t("addPhoto")})).not.toBeInTheDocument()` after uploading exactly `MAX_ATTACHMENT_COUNT`. **(a) has no assertion anywhere**: no test picks more than the cap in one multi-select batch, and removing `pickPhotos`' `.slice(0, room)` leaves all 42 dom tests green (sensor M25). The route-level cap is separately covered (PFORM-65).                                       | ❌ **GAP** (clause (a)) |
| **PFORM-61** a picked file goes through `prepareImage` before being held                                                       | the held photo is `prepareImage`'s output, not the raw file                     | `NewPatternForm.test.tsx:396` — `expect(submitted!.images.map(i => i.base64)).toEqual(["a.jpg","b.jpg"])`, i.e. exactly the mocked `prepareImage` return; rejection path at `:416`. "Before any decode work" is `prepareImage`'s own property, pinned at `lib/editor/attachment.test.ts:17`/`:25`                                                                                                                                                   | ✅ PASS                 |
| **PFORM-62** a `prepareImage` rejection → surface that rejection's own reason, keep already-added photos                       | the specific `AttachmentErrorCode` message; earlier photos retained             | `NewPatternForm.test.tsx:416` — `expect(screen.getByText(ptBR.AttachmentChips.errors.too_large)).toBeInTheDocument()` then `expect(submitted!.images.map(i=>i.base64)).toEqual(["kept.jpg"])`; `:433` (`unsupported_type` gets its own message, not a generic one)                                                                                                                                                                                  | ✅ PASS                 |
| **PFORM-63** each held photo has a remove control that removes only that photo                                                 | the other two survive, in order                                                 | `NewPatternForm.test.tsx:447` — removes index 1 of three, `expect(submitted!.images.map(i=>i.base64)).toEqual(["a.jpg","c.jpg"])`                                                                                                                                                                                                                                                                                                                   | ✅ PASS                 |
| **PFORM-64** wire carries `images: [{mediaType, data}]` and no singular `image`                                                | `images` array on the body; `image` key absent                                  | `lib/api-client.contract.test.ts:189` — body `toEqual({message, images:[{mediaType:"image/jpeg", data:"AAAA"}]})`; `:220` (`images: []` omits the key); `lib/store.test.ts` and `lib/importStore.test.ts` assert `not.toHaveProperty("image")` on the options; route side at `route.test.ts:576` (N=1/2/4 matrix) and `:682` (an old singular `image` key is treated as no attachment, exact `toEqual({answering:false, importContext:undefined})`) | ✅ PASS                 |
| **PFORM-65** non-array / over-count / bad entry / over combined ceiling → 400 `invalid_attachment` before any debit or AI call | 400 + code, no debit, no propose, on every shape                                | `route.test.ts:502` — 4-case matrix, each asserting `status 400`, `error === "invalid_attachment"`, `wallet.balance` unchanged, `lastEntries === []`, `mockPropose` not called; `:462` (bad mediaType), `:480` (over per-image ceiling), `:530` (over combined ceiling), `:554` (exactly ON the combined ceiling is accepted — pins `MAX_GENERATE_BODY_BYTES`' derivation from both sides). Pure half: `lib/editor/attachment.test.ts:126`–`:206`   | ✅ PASS                 |
| **PFORM-66** N valid attachments → exactly N image blocks on the final user turn, in order, ahead of that turn's text          | full content array equals N image blocks then one text block                    | `lib/ai/index.test.ts:321` (N=2) and `:336` (N=4) — `expect(lastContent()).toEqual([imageBlock("a"),…,{type:"text",text:"uma blusa com gola V"}])`, an exact whole-array match so both count and order are load-bearing; `:351` (per-entry media type preserved), `:374`/`:379` (no images / `[]` → turns unchanged), `:389` (non-user final turn drops rather than mis-attaches)                                                                   | ✅ PASS                 |
| **PFORM-67** persisted `ChatMessage` records `imageCount`; no image bytes persisted                                            | `imageCount === N`, `hasImage === true`, base64 absent from the serialized blob | `route.test.ts:619` — `expect(userTurn.hasImage).toBe(true); expect(userTurn.imageCount).toBe(3); expect(JSON.stringify(state)).not.toContain(data)` (asserted against the **serialized** state, so a payload hidden anywhere fails); survival across a read-modify-write at `lib/db/pattern.test.ts:211` (one case per flag); optimistic half at `lib/store.test.ts`                                                                               | ✅ PASS                 |
| **PFORM-68** `hasImage` with no `imageCount` → `ChatBubble` renders exactly one attachment                                     | the ICU singular form                                                           | `components/editor/ChatBubble.test.tsx:97` — `expect(screen.getByText(t("imagesAttached",{count:1}))).toBeInTheDocument()` **and** `expect(queryByText(t("imagesAttached",{count:2}))).not.toBeInTheDocument()`; `:76` (count 3 → plural), `:107` (no flags → no chip). Resolved through `translatorFor`, correct for an ICU plural whose raw catalog value no rendered text ever equals                                                            | ✅ PASS                 |

**Status**: 35/36 ✅ · 1 ❌ GAP (PFORM-60 clause (a)) · 1 ⚠️ spec-precision gap (PFORM-05)

---

## Payload / Conjunction Check

Applied to every named field in a persisted record or emitted call. All three targets the
orchestrator called out assert **value or state**, not mere invocation:

| Target                                         | Field                                               | Assertion targets the value?                                                                                                                                                  |
| ---------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Persisted `ChatMessage`                        | `imageCount`                                        | ✅ `route.test.ts:619` `toBe(3)`; mutant hardcoding `1` killed (M21)                                                                                                          |
| Persisted `ChatMessage`                        | `hasImage`                                          | ✅ `toBe(true)`; mutant omitting it while keeping `imageCount` killed (M20)                                                                                                   |
| Persisted `ChatMessage`                        | no base64 anywhere                                  | ✅ `expect(JSON.stringify(state)).not.toContain(data)` — the serialized blob, not the message object                                                                          |
| Persisted `ChatMessage`                        | survives the read boundary                          | ✅ per-key round trip, `lib/db/pattern.test.ts:211`; grouped-assertion trap explicitly avoided in the test's own comment                                                      |
| Persisted `spec` after `mergeFormSpec`         | `type`, `style.*`, `gender`, `measurementOverrides` | ✅ each read off `state.pattern.spec` by value; `measurementOverrides` additionally asserted on `state.pattern.baseMeasurements`, so it is proven to have reached the drafter |
| Frozen snapshot after a per-molde chart choice | `sizeChartName`                                     | ✅ `toBe("Masculino do ateliê")` — a _different_ name from the default, and the test double only returns it when `requestedId` matches                                        |
| `proposeGarment` call                          | `images`                                            | ✅ full array with per-entry `mediaType`/`base64`; `:652`/`:682` use exact `toEqual` on the whole options object, so an extra or missing key fails                            |
| `proposeGarment` call                          | `formSpec`                                          | ✅ `toEqual({type, measurementOverrides, style})` by value                                                                                                                    |
| `api.generate` call                            | `formSpec`/`sizeChartId`/`images`                   | ✅ `lib/dashboardStore.test.ts:267` asserts the whole third argument by equality                                                                                              |

---

## Discrimination Sensor

**Depth**: P0-full (paid path + trust boundaries). 26 behavior-level mutations, all in a throwaway
`git worktree` at `f35cd42` with `node_modules` junctioned in; the real tree was never mutated.

| #   | Mutation                                                                                                            | File                                          | Killed?                                       |
| --- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------- |
| M1  | Removed the explicit-`type` guard, letting `validateSpec`'s `"blouse"` default through (PFORM-28)                   | `lib/ai/formSpec.ts:41`                       | ✅ Killed                                     |
| M2  | `mergeFormSpec` spread order reversed — the model's style wins over the form's (PFORM-25)                           | `lib/ai/formSpec.ts:96`                       | ✅ Killed                                     |
| M3  | `mergeFormSpec` spreads `form.measurementOverrides` over `ai`'s                                                     | `lib/ai/formSpec.ts:108`                      | ⚠️ **Survived — equivalent mutant** (see F1)  |
| M3b | `mergeFormSpec` takes `form.measurementOverrides` outright, dropping the model's                                    | `lib/ai/formSpec.ts:108`                      | ✅ Killed                                     |
| M4  | Route substitutes `"female"` instead of rejecting an unowned `sizeChartId` (PFORM-43)                               | `generate/route.ts:142`                       | ✅ Killed                                     |
| M5  | Route silently drops an invalid `images` list instead of 400ing (PFORM-65)                                          | `generate/route.ts:97`                        | ✅ Killed                                     |
| M6  | Route stops forwarding `sizeChartId` to `getSizeChartForGeneration` (PFORM-42)                                      | `generate/route.ts:351`                       | ✅ Killed                                     |
| M7  | Route stops overriding the spec gender from the chart (PFORM-41)                                                    | `generate/route.ts:331`                       | ✅ Killed                                     |
| M8  | `pickSizeChartForGeneration` ignores `requestedId` entirely (PFORM-42)                                              | `lib/sizeCharts/compute.ts:88`                | ✅ Killed                                     |
| M9  | `validateAttachmentInputs` count ceiling off by one (PFORM-65)                                                      | `lib/editor/attachment.ts:231`                | ✅ Killed                                     |
| M10 | `validateAttachmentInputs` combined-size ceiling not enforced (PFORM-65)                                            | `lib/editor/attachment.ts:239`                | ✅ Killed                                     |
| M11 | `withImages` puts the text block ahead of the image blocks (PFORM-66)                                               | `lib/ai/index.ts:41`                          | ✅ Killed                                     |
| M12 | `withImages` emits only the first image block (PFORM-66)                                                            | `lib/ai/index.ts:41`                          | ✅ Killed                                     |
| M13 | `ChatMessageSchema` drops `imageCount`/`hasImage`/`assembly` again (T22)                                            | `lib/schemas/pattern.ts:37`                   | ✅ Killed                                     |
| M14 | `createPattern` ignores the supplied name (PFORM-04)                                                                | `lib/db/pattern.ts:135`                       | ✅ Killed                                     |
| M15 | Create route name cap off by one (`>` → `>=`) (PFORM-11)                                                            | `app/api/patterns/route.ts:56`                | ✅ Killed                                     |
| M16 | Create route stops rejecting a NUL byte in the name (PFORM-11)                                                      | `app/api/patterns/route.ts:56`                | ✅ Killed                                     |
| M17 | `createFromForm` creates a new `Pattern` on every retry (PFORM-08)                                                  | `lib/dashboardStore.ts:130`                   | ✅ Killed                                     |
| M18 | `createFromForm` clears `pendingPatternId` on a 402 (PFORM-08)                                                      | `lib/dashboardStore.ts:150`                   | ✅ Killed                                     |
| M19 | api-client sends the list under the old singular `image` key (PFORM-64)                                             | `lib/api-client.ts:308`                       | ✅ Killed                                     |
| M20 | Route persists `imageCount` but not `hasImage` (PFORM-67)                                                           | `generate/route.ts:208`                       | ✅ Killed                                     |
| M21 | Route hardcodes `imageCount: 1` (PFORM-67)                                                                          | `generate/route.ts:208`                       | ✅ Killed                                     |
| M22 | Route drops `mergeFormSpec` from the `apply` branch (PFORM-25)                                                      | `generate/route.ts:324`                       | ✅ Killed                                     |
| M23 | `validateFormSpec` drops the raw-value identity check, accepting a defaulted value as an explicit choice (PFORM-24) | `lib/ai/formSpec.ts:62`                       | ✅ Killed                                     |
| M24 | `validateFormSpec` uses the blouse field list for every type (PFORM-22 server half)                                 | `lib/ai/formSpec.ts:59`                       | ✅ Killed                                     |
| M25 | `NewPatternForm.pickPhotos` drops `.slice(0, room)` — a multi-select can exceed the cap (PFORM-60)                  | `components/dashboard/NewPatternForm.tsx:185` | ❌ **Survived** (42/42 dom tests still green) |

**Result**: 24/26 killed, 1 equivalent mutant, **1 genuine survivor** → ❌

**Isolation**: pre-sensor baseline was ` M skills-lock.json` + 4 untracked skill dirs. After each mutation
the scratch worktree reported only `?? sensor.py`; both worktrees were removed with
`git worktree remove --force` and pruned. The real tree's porcelain afterwards additionally shows
` M components/dashboard/NewPatternForm.tsx`, ` M components/dashboard/NewPatternForm.test.tsx` and
` M docs/reference/tshirt-benchmark/comparison-report.md`. **None of those three is in the sensor's
mutated file set** (which was confined to `lib/ai/*`, `lib/sizeCharts/compute.ts`,
`lib/editor/attachment.ts`, `lib/schemas/pattern.ts`, `lib/db/pattern.ts`, `lib/dashboardStore.ts`,
`lib/api-client.ts` and the two route files, all inside the scratch). The `NewPatternForm.tsx` diff is a
half-finished `size="sm"` removal with broken indentation and the test file gains a
`CHARTS_NONE_ACTIVE` case — concurrent editing by another actor in this session, not sensor residue.
Left untouched per the read-only mandate.

---

## Code Quality

| Principle                                            | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimum code                                         | ✅ Every new module is a leaf or a single cohesive pair; no speculative abstraction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Surgical changes                                     | ✅ The three "stale caller" absorptions (T6, T14, T15) are each justified by a gate that cannot pass without them, and each documents the deliberate compile-error handoff.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| No scope creep                                       | ✅ One exception, declared: T22's `assembly` key (SPEC_DEVIATION, reviewed and accepted).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Matches patterns                                     | ✅ Follows the repo's own precedents throughout: leaf-module (`lib/export/formats.ts`), `validateSpec` trust boundary, `createPatternFromImport` store shape, `pendingPatternId`, drop-or-clamp-never-throw, additive-optional blob fields with no migration.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Spec-anchored outcome check                          | ⚠️ 35/36 assert the spec's own value; PFORM-05 asserts a _tighter_ value than the spec states (F2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Per-layer Coverage Expectation                       | ⚠️ Domain logic 1:1; both routes cover happy + each rejection code + **an explicit no-debit assertion on every rejection** (verified case by case). Component layer misses PFORM-60 clause (a).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Every test maps to a spec AC / edge case / Done-when | ✅ Spot-checked story 2 end to end; every new test carries its own `PFORM-NN` or `#NN` comment. No unclaimed tests found.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Documented guidelines followed                       | ✅ `CLAUDE.md`: catalog text asserted against the exported `ptBR` object (never a pasted pt-BR literal or a substring); `translatorFor` used correctly for the one ICU-plural value; `vi.mock` specifiers match what each subject imports (checked in `NewPatternForm.test.tsx`, `route.test.ts`, `sizeChart.test.ts`); the two vitest projects respected per layer; no `text-[Npx]`, no hex, no direct `fetch`; catalog lookups keyed by the EN enum value with no `Record<Enum,string>` label map; the icon-only add/remove controls carry both `aria-label` and `title`; the failure notice uses the amber `notice` token, not the red alert token. `.claude/hooks/check-conventions.mjs` exits 0. |

**Note on the reviewed asymmetry** (`validateFormSpec`'s per-type drop vs `formStyleFieldsFor`'s
render-time cuff gating): **harmless, not a real hole.** The server keeps a `cuff` a short-sleeved form
would never have offered, but `lib/draft/garment.ts:464-468` gates cuff drafting on
`style.sleeve === "long" && style.cuff === "straight"`, so a forged `{type:"blouse", style:{sleeve:"short",
cuff:"straight"}}` draws no cuff piece and no `cuff-hem` seam pair — it is a stored no-op. It also grants
nothing the legitimate path does not: the AI-facing tool schema already accepts `cuff` for every
body-having type, so the identical spec is reachable by typing "punho reto" in chat. PFORM-22 is worded
as a _render_ obligation only, so the server is under no matching duty. Tightening
`validateFormSpec` to re-apply the sleeve gate would be defensible hygiene but is not required by any AC
and would add a second place where the two lists can disagree.

---

## Edge Cases

- [x] Every optional field untouched → still a real draft from garment type alone — `NewPatternForm.test.tsx:485` (message names the type), route's ordinary `apply` path.
- [x] Whitespace-only details + no style set → non-empty message naming the garment type — `NewPatternForm.test.tsx:519`, `:485`.
- [x] Account with no size charts → the lazy system-chart seeding `listSizeChartsForUser` already performs — `lib/db/sizeChart.test.ts:231`.
- [~] Same photo picked twice → held twice, not deduplicated. **True by construction** (`pickPhotos` appends unconditionally) but **no test asserts it**. Minor.
- [x] Dialog closed after a failed submit that already created a `Pattern` → the blank `Pattern` is left in the list. No cleanup code exists, and `pendingPatternId` is component/store-local; nothing to assert.
- [~] Garment type for which no style control applies → no style region. **Structurally unreachable**: every entry of `STYLE_FIELDS_BY_TYPE` includes `fit` (`lib/draft/formFields.test.ts:64`/`:68`), and the form renders one `Field` per applicable control rather than a wrapping labelled group, so an empty labelled group cannot occur. The edge case as written is vacuous.

---

## Gate Check

- **Gate command**: `npm test && npx eslint app lib components && npm run build` (Build level, per tasks.md)
- `npx vitest run --project node` → **2663 passed, 3 skipped** (144 files passed, 1 skipped) — exit 0
- `npx vitest run --project dom` → **728 passed** (70 files) — exit 0
- **Total: 3391 passed, 3 skipped, 0 failed** — matches the author's reported figure independently.
- `npx eslint app lib components` → exit 0, clean.
- `.claude/hooks/check-conventions.mjs` → exit 0, no output.
- `npm run build` → **not re-run** by the verifier (a `next dev` server shares `.next`); the author reported it green with 33 static pages, and `npx tsc`-level breakage would surface as a vitest transform error, which it did not.
- **Test count before feature** (base `ee32304`): 3391 − (13+21+11+4+9+8+7+4+6+6+13+16+10+7+4+2+15+4+4+42+13+6 new) ≈ 3146 claimed by the task log; delta as recorded in tasks.md is consistent and monotonic across the 22 commits (3229 → 3391 at the checkpoints the task file records).
- **Skipped tests**: 3, all pre-existing and outside this diff surface (one skipped file).
- **Assertion weakening**: none found. Every migrated test (T6, T7, T10, T11, T14, T15, T16, T18, T20) changed argument shape only; spot-checked `lib/ai/prompt.test.ts:264` which now pins `buildSystem === STATIC_SECTIONS + dynamic` structurally rather than against a stored snapshot — equal or stronger.
- **Note**: the two vitest runs were taken before the concurrent uncommitted `NewPatternForm.*` edits appeared; `npx eslint` was run after them and is still clean.

---

## Findings

### F1 — M3 survived: equivalent mutant, not a coverage gap · Informational

`mergeFormSpec`'s `measurementOverrides: ai.measurementOverrides` can be replaced with
`{...ai.measurementOverrides, ...form.measurementOverrides}` with no test failing. This is an
**equivalent mutant**: `validateFormSpec` unconditionally emits `measurementOverrides: {}`
(`lib/ai/formSpec.ts:72`), so the only value the merge can ever receive for `form` makes the two
expressions identical. T2's Done-when scopes the guarantee to exactly that condition ("preserves
`ai.measurementOverrides` verbatim **when `form.measurementOverrides` is `{}`**"), and the stronger
mutant that actually changes behavior (M3b, taking the form's outright) is killed. **No fix task.**

### F2 — PFORM-05's stated outcome is not the shipped one · Minor (spec text, not code)

The spec says the textarea is capped at `MAX_CHAT_MESSAGE_LENGTH`. It is actually capped at
`MAX_CHAT_MESSAGE_LENGTH − head.length − 2` (`NewPatternForm.tsx:212`), reserving room for the composed
head so the field cannot accept a submit the route then rejects with `message_too_long` after a create
round trip. This is a **deliberate improvement**, recorded in T19's conventions-review scope note and
asserted by a derived-relationship test rather than a literal — the right shape. But `spec.md` was never
updated, so PFORM-05 reads as satisfied when the literal criterion is not met. **Fix: amend PFORM-05's
wording** (or add the reserve as an explicit clause). No code change.

### F3 — Story-3 requirement IDs have drifted by one · Minor (traceability hygiene)

`spec.md` states IDs are "numbered per story block ... so each story's acceptance criteria map to its
IDs in order." For the size-chart story that mapping is broken downstream:

- `tasks.md` T13's Done-when labels "no substitution notice when the request named its own chart"
  as PFORM-44, but spec AC 5 (PFORM-44) is _"no `sizeChartId` → keep the existing pick and its
  substitution notice unchanged"_. Everything after it shifts: AC 5 is labelled PFORM-45,
  AC 6 PFORM-46, and PFORM-47 is used for **two different** ACs (AC 7 in T19, AC 8 in T13).
- Consequently two rows of `spec.md`'s own traceability table point at the wrong tasks:
  PFORM-46 → `T4, T8, T13` (AC 7 is the _form's_ failed chart fetch, which is T19) and
  PFORM-47 → `T19` (AC 8 is the route's `setActiveSizeChart` guarantee, which is T13).

**All four ACs are genuinely covered** — the evidence rows above locate each one — so this is a
documentation defect, not a coverage gap. **Fix: relabel T13/T19's Done-when bullets and correct the
two traceability rows.**

### F4 — PFORM-60's "accept up to `MAX_ATTACHMENT_COUNT`" half is untested · Major (blocks PASS)

**Root cause.** `pickPhotos` enforces the client-side cap with `Array.from(files).slice(0, room)`
(`components/dashboard/NewPatternForm.tsx:185`), but the `<input multiple>` lets one pick exceed the cap
and **no test ever picks more than `MAX_ATTACHMENT_COUNT` in a single batch**. The existing coverage
uploads exactly 4 (`:378`), 3 (`:447`) or 2 (`:396`) files, so `.slice(0, room)` is never exercised.
Verified empirically: removing the slice leaves all 42 `NewPatternForm.test.tsx` tests green (sensor M25).

**Impact if it regressed.** Not a money or security hole — `validateAttachmentInputs` refuses the
over-count list server-side _before any debit or Anthropic call_ (`route.test.ts:502`, fully covered).
But the 400 resolves to `NewPatternForm`'s generic `errors.fallback` message, so the user would see
"Não foi possível gerar o molde. Tente novamente." after a `Pattern` had already been created, with
nothing on screen naming the real cause and a retry that can never succeed until they remove photos.

**Fix task.**

- **What**: add one dom test asserting the client-side per-batch cap.
- **Where**: `components/dashboard/NewPatternForm.test.tsx`, in the `— photos` describe.
- **Verify**: `user.upload(photoInput(), <MAX_ATTACHMENT_COUNT + 2 files>)`; assert exactly
  `MAX_ATTACHMENT_COUNT` remove controls render and `submitted!.images` has length
  `MAX_ATTACHMENT_COUNT` holding the **first** four in order.
- **Done when**: the test passes on the current source and **fails** when
  `.slice(0, room)` is removed from `pickPhotos` (re-run the mutation to confirm).
- **Priority**: Major (a spec clause with zero coverage), but Minor in blast radius. One test, no
  production change required.

---

## Requirement Traceability Update

| Requirement                                  | Previous Status    | New Status                                                              |
| -------------------------------------------- | ------------------ | ----------------------------------------------------------------------- |
| PFORM-01, 02, 03, 04, 06, 07, 08, 09, 10, 11 | Verified (claimed) | ✅ Verified                                                             |
| PFORM-05                                     | Verified (claimed) | ⚠️ Verified with a spec-precision gap (F2)                              |
| PFORM-20, 21, 22, 23, 24, 25, 26, 27, 28     | Verified (claimed) | ✅ Verified                                                             |
| PFORM-40, 41, 42, 43, 44, 45, 46, 47         | Verified (claimed) | ✅ Verified (ID labels in `tasks.md`/traceability need correcting — F3) |
| PFORM-60                                     | Verified (claimed) | ❌ **Needs Fix** — clause (a) uncovered (F4)                            |
| PFORM-61, 62, 63, 64, 65, 66, 67, 68         | Verified (claimed) | ✅ Verified                                                             |

---

## Summary

**Overall**: ⚠️ Issues — one narrow, one-test gap away from Ready.

**Spec-anchored check**: 35/36 ACs matched the spec-defined outcome · 1 GAP · 1 spec-precision gap
**Sensor**: 26 injected, 24 killed, 1 equivalent, **1 survived**
**Gate**: 3391 passed, 0 failed, 3 pre-existing skips · eslint clean · conventions hook clean

**What works.** The trust boundaries are the strongest part of this feature and they hold under
pressure: every rejection path on both routes asserts _no debit and no `proposeGarment` call_, and each
of those assertions was independently confirmed to fail when the guard is removed — the unowned
`sizeChartId`, the malformed `images` list, both attachment ceilings, the missing form-spec `type`, the
name cap and its NUL check. `mergeFormSpec`'s "the user's explicit choice wins" is structural, not
hoped-for: the reversed spread, the dropped merge, and the accepted-default variants all die.
`validateFormSpec`'s subtle raw-value identity check (`value !== rawStyle[field]`) — the thing that stops
a `validateSpec` default from becoming an explicit user choice — is discriminated. PFORM-66's coverage
uses whole-array `toEqual`, so both the count and the order of the image blocks are load-bearing.
`imageCount` is asserted by value with a hardcoded-`1` mutant killed, and the no-bytes-persisted check
runs against the _serialized_ blob. T22's per-key round-trip design (rather than one grouped assertion)
is exactly right and kills the regression it was written for. Catalog discipline is clean throughout:
every enum member has a `NewPatternForm.value.*` entry, the ICU plural is resolved through
`translatorFor` rather than compared to a raw catalog string, and the now-false
`formOption.comingSoonTitle`/`comingSoonBadge` keys are gone with their last caller.

**Issues found.**

1. **F4 (Major, blocks PASS)** — PFORM-60's "accept up to `MAX_ATTACHMENT_COUNT`" has no test; the
   per-batch `.slice(0, room)` can be deleted with all 42 dom tests still green. One test fixes it.
2. **F2 (Minor)** — PFORM-05's spec text states a cap the code deliberately tightens. Amend the spec.
3. **F3 (Minor)** — story-3 requirement IDs drift by one in `tasks.md`, and two rows of `spec.md`'s
   traceability table point at the wrong tasks. Coverage is real; labels are wrong.
4. **Informational** — M3 is an equivalent mutant (no action). The `cuff` server/render asymmetry the
   author flagged is **not a hole** (the drafter gates on `sleeve === "long"`, and chat already reaches
   the same spec). Concurrent uncommitted edits to `NewPatternForm.tsx`/`.test.tsx` and
   `comparison-report.md` were present in the real tree during verification, are outside this diff
   range, and were left untouched.

**Next steps**: land the single F4 test (assert it fails with `.slice(0, room)` removed), correct the
F2 spec wording and the F3 ID labels, then re-verify. Fix→re-verify iteration 1 of 3.
