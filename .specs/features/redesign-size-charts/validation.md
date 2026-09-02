# Verification Report: redesign-size-charts

## Result

PASS ✅ — both gaps the Verifier found (SZCH-04, SZCH-08 test coverage) closed in a post-verification fix round, self-verified via mutation testing. See that section below.

**Diff range covered**: `git diff HEAD~5..HEAD` (`d407b93`..`563300c`), i.e. the 5 commits:
`d407b93` feat(dashboard): widen Sidebar to support /size-charts
`becc24c` feat(size-charts): render the shared nav sidebar on /size-charts
`69862a3` feat(size-charts): restructure the library column to match the design
`035e056` feat(size-charts): match the detail column's header row to the design
`563300c` fix(size-charts): route the header-row state badges through Badge

---

## Per-AC Evidence

| AC      | Requirement                                                                                            | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                      | Verdict                                               |
| ------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| SZCH-01 | `Sidebar active="size-charts"` inside `SizeChartsShell`'s `AppShell`, `aria-current="page"`            | `components/size-charts/SizeChartsShell.tsx:39`; `components/size-charts/SizeChartsShell.test.tsx:83-92` ("marks Medidas e grades current...") asserts `aria-current="page"` on the measurements nav button                                                                                                                                                                                                                                   | Covered                                               |
| SZCH-02 | No "＋ Novo molde" button in that sidebar instance                                                     | `components/dashboard/Sidebar.tsx:86-90` (`{onNewPattern && (...)}`); `components/dashboard/Sidebar.test.tsx:110-116` ("omits the new-pattern button...") renders `active="size-charts"` with no `onNewPattern` and asserts the button is absent                                                                                                                                                                                              | Covered                                               |
| SZCH-03 | Sidebar unchanged on Dashboard/Bases do ateliê (regression)                                            | `components/dashboard/DashboardShell.tsx:62-66` and `components/slopers/SlopersShell.tsx:48-52` both still pass `onNewPattern` unconditionally; `components/dashboard/Sidebar.test.tsx:68-77` (button renders + click for `active="patterns"`); `components/dashboard/DashboardShell.test.tsx:97` and `components/slopers/SlopersShell.test.tsx:150,193` (pre-existing, still-passing tests asserting the button on the real shells)          | Covered                                               |
| SZCH-04 | Library column 252px wide                                                                              | `components/size-charts/SizeChartLibrary.tsx:74` (`w-[252px]`)                                                                                                                                                                                                                                                                                                                                                                                | **No test asserts this class** — see Gap 1            |
| SZCH-05 | Library's own title+subtitle header block; top `PageHeader` drops `subtitle`                           | `components/size-charts/SizeChartLibrary.tsx:75-82`; `components/size-charts/SizeChartsShell.tsx:34-39` (no `subtitle` prop passed); `SizeChartsShell.test.tsx:69-81` ("states the gender-scoped rule in the subtitle...") uses `findByText` (throws on duplicate matches), which would fail if `PageHeader` also rendered the subtitle — indirect but real non-duplication guard                                                             | Covered                                               |
| SZCH-06 | Two labeled sections, "Do sistema"/"Minhas grades", split by `isSystem`                                | `components/size-charts/SizeChartLibrary.tsx:70-71,85-121`; `SizeChartLibrary.test.tsx:110-130` ("groups charts under labeled system/custom sections") and `:132-142` ("omits a section header for a group with no charts")                                                                                                                                                                                                                   | Covered                                               |
| SZCH-07 | `houseStandardNote` renders once, after "Do sistema"                                                   | `components/size-charts/SizeChartLibrary.tsx:98-103`; `SizeChartLibrary.test.tsx:126-129` (`getAllByText(...).toHaveLength(1)` inside the mixed-charts test)                                                                                                                                                                                                                                                                                  | Covered                                               |
| SZCH-08 | Each card shows a 3px accent bar (olive selected / transparent otherwise)                              | `components/size-charts/SizeChartLibrary.tsx:30-36` (`w-[3px]`, `bg-olive`/`bg-transparent` on `selected`)                                                                                                                                                                                                                                                                                                                                    | **No test asserts the bar's class/color** — see Gap 1 |
| SZCH-09 | Footer: "＋ Nova grade" before import trigger                                                          | `components/size-charts/SizeChartLibrary.tsx:126-131`; `SizeChartLibrary.test.tsx:146-160` ("renders the new-chart button before the import trigger") asserts DOM order via button index                                                                                                                                                                                                                                                      | Covered                                               |
| SZCH-10 | Header badge: "Grade do sistema" (readOnly), "Grade ativa" (real `isActive`), none otherwise           | `components/size-charts/SizeChartTable.tsx:141-145`; `SizeChartTable.test.tsx:325-355` (readOnly→systemChartBadge), `:357-380` (readOnly+active→still systemChartBadge, no "Grade ativa"), `:382-407` (editable+active→activeSizeChartNote), `:409-426` (editable+inactive→no badge) — all three states independently asserted                                                                                                                | Covered                                               |
| SZCH-11 | Read-only header "Usar esta grade" button calls `activate`; absent when editable                       | `components/size-charts/SizeChartTable.tsx:172-176`; `SizeChartTable.test.tsx:325-355` asserts 2 buttons (header+bottom), clicks the header one, asserts `activate` called with `"g1"`; `:409-426` asserts the button still renders for editable-inactive (bottom-only, via `getByRole` singular — confirms exactly one)                                                                                                                      | Covered                                               |
| SZCH-12 | Bottom activate button unconditional for editable charts (regression)                                  | `components/size-charts/SizeChartTable.tsx:465-467` (outside any `readOnly`/`isActive` guard); `SizeChartTable.test.tsx:409-426` ("shows no badge for an inactive editable chart, and keeps its bottom activate button" — explicit `getByRole` assertion); `:382-407` (`matches.some(el => el.tagName !== "BUTTON")` on the active+editable case implicitly confirms a `BUTTON` match also exists, i.e. the bottom button persists there too) | Covered                                               |
| SZCH-13 | Editable second row shows override-legend caption; `systemReadOnlyNote` moved to same row for readOnly | `components/size-charts/SizeChartTable.tsx:213-223`; `SizeChartTable.test.tsx:428-450` (two tests, each asserting the correct caption present and the other's absent)                                                                                                                                                                                                                                                                         | Covered                                               |

**Coverage: 11/13 with direct test evidence; 2/13 (SZCH-04, SZCH-08) implemented correctly by inspection but with no automated assertion.**

---

## Discrimination Sensor (isolated scratch worktree, `git worktree add`, node_modules junctioned — no `git stash` used)

| #   | Mutation                                                                                                                                   | Target file                                   | Test run                    | Result                                                                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Reverted `onNewPattern` conditional — button renders unconditionally again                                                                 | `components/dashboard/Sidebar.tsx`            | `Sidebar.test.tsx`          | **Killed** — "omits the new-pattern button when the screen owns no such action" failed, found the unconditional button                                        |
| 2   | Badge shows `activeSizeChartNote` for every editable chart regardless of real `isActive` (design's own literal, wrong-for-real-data logic) | `components/size-charts/SizeChartTable.tsx`   | `SizeChartTable.test.tsx`   | **Killed** — "shows no badge for an inactive editable chart, and keeps its bottom activate button" failed, found the "Grade ativa" badge on an inactive chart |
| 3   | Flattened "Do sistema"/"Minhas grades" into one un-sectioned list                                                                          | `components/size-charts/SizeChartLibrary.tsx` | `SizeChartLibrary.test.tsx` | **Killed** — 2 failures ("groups charts under labeled system/custom sections", section-label assertions)                                                      |

All 3 mutants killed. Worktree removed after each check (`git worktree remove --force`); real tree porcelain confirmed clean of the injected changes afterward (`git status --porcelain` shows no size-charts/dashboard diffs, only a pre-existing unrelated untracked `docs/reference/pattern-catalog-benchmark/` directory dated before this verification session — not touched by this feature or this Verifier).

---

## Gate Check

- `npx vitest run --project dom components/dashboard/Sidebar.test.tsx components/size-charts` → **6 test files, 85 passed** (Sidebar 8, SizeChartLibrary 7, SizeChartTable 48, SizeChartsShell 6, SizeChartDuplicateFlow 1, ImportSizeChartDialog 15). No failures.
- `npx eslint components/dashboard/Sidebar.tsx components/size-charts components/ui/badge.tsx` → clean, no output.
- `grep -rn "text-\[" components/size-charts components/dashboard/Sidebar.tsx components/ui/badge.tsx` → no matches. New badge variants (`muted`/`olive` in `components/ui/badge.tsx:34-37`) use `text-tick`/`tracking-eyebrow` scale tokens, not bracketed values.

---

## Gaps Found (not fixed — reported for the orchestrator)

1. **SZCH-04 (252px width) and SZCH-08 (3px accent bar) have no test assertion.** Both are real, correctly-implemented ACs in spec.md (`w-[252px]` at `SizeChartLibrary.tsx:74`; `w-[3px]` accent span at `:30-36`), but the spec's own "Independent Test" line for P2 only promises to cover sections/houseStandardNote/footer order — it never commits to testing width or the accent bar, and no test in the diff does either (`grep` for `toHaveClass`/`querySelector`/`252`/`accent` in `SizeChartLibrary.test.tsx` returns nothing). This is a spec-precision gap (the AC list promises more than the Independent Test line and the implementation delivers), not a functional defect — verified correct by inspection, and this codebase does use `toHaveClass`/`querySelector` elsewhere (e.g. `DashboardShell.test.tsx`, `PatternGrid.test.tsx`) so a class-level assertion would not have been unusual here.

No other gaps found. No surviving mutants, no failing gate, no spec/implementation mismatch on the other 11 ACs.

---

## Post-Verification Fix Round

Both gaps closed by adding two tests to `SizeChartLibrary.test.tsx`:

- **SZCH-04**: `"renders the library column at the design's 252px width"` — `container.firstChild` asserted to carry `w-[252px]`.
- **SZCH-08**: `"shows an olive accent bar on the selected card, transparent otherwise"` — asserts the `aria-hidden` bar span carries `bg-olive` on the selected card and `bg-transparent` on an unselected one.

Self-verified via manual mutation (mirroring the Verifier's own discrimination sensor, done in the working tree since both mutations are single-line and immediately git-revertible — not re-dispatched to a fresh Verifier for a narrow, well-understood, additive-only test gap):

1. `w-[252px]` → `w-[230px]` on `SizeChartLibrary.tsx:74` → only the new width test failed (8/9 passed, 1 failed as expected) → reverted via `git checkout`.
2. The accent bar's `selected ? "bg-olive" : "bg-transparent"` ternary collapsed to a constant `"bg-transparent"` → only the new accent-bar test failed (8/9 passed, 1 failed as expected) → reverted via `git checkout` (confirmed clean via `git diff`).

Both mutants killed; real tree restored and confirmed identical to the pre-mutation state (`git diff components/size-charts/SizeChartLibrary.tsx` empty). Full re-run: `npx vitest run --project dom components/size-charts/SizeChartLibrary.test.tsx` → 9/9 passed. `npx eslint components/size-charts/SizeChartLibrary.test.tsx` → clean.

**Final coverage: 13/13 ACs with direct test evidence, 0 unmapped.**
