# redesign-dashboard Validation

**Date**: 2026-09-01
**Spec**: `.specs/features/redesign-dashboard/spec.md`
**Diff range**: `ba0d670~1..88011c5` (commits `ba0d670` "fix(dashboard): match checklist card to redesign spacing/type", `88011c5` "fix(dashboard): remove doubled gap under the checklist card")
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

No `tasks.md` exists (Medium scope, executed as an inline 2-commit plan per the assignment). Both commits are present on `main` and match their stated intent.

| Commit    | Status  | Notes                                                           |
| --------- | ------- | --------------------------------------------------------------- |
| `ba0d670` | ✅ Done | Checklist card padding/gap/title-scale/progress-height/dividers |
| `88011c5` | ✅ Done | Removes the doubled 38px gap under the checklist card           |

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y)                                                           | Spec-defined outcome                                             | `file:line` + assertion                                                                                                                                                                                                                                                                                                                                      | Result                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| DASH-01: card padding/gap                                                           | `14px` vertical / `16px` horizontal padding, `10px` gap          | `components/dashboard/OnboardingChecklistCard.test.tsx:168` — `expect(card).toHaveClass("px-[16px]", "py-[14px]", "gap-[10px]")`; impl at `OnboardingChecklistCard.tsx:144` — `px-[16px] py-[14px] gap-[10px]`                                                                                                                                               | ✅ PASS                                                                                                                                                                                         |
| DASH-02: title scale                                                                | `text-control` (13.5px)                                          | `OnboardingChecklistCard.test.tsx:170-172` — `expect(...).toHaveClass("text-control")`; impl at `OnboardingChecklistCard.tsx:146`                                                                                                                                                                                                                            | ✅ PASS                                                                                                                                                                                         |
| DASH-03: row divider + padding                                                      | `1px` top divider (`--color-border`), `9px` vertical row padding | `OnboardingChecklistCard.test.tsx:184-197` — asserts 5 rows each `toHaveClass("border-t")`; impl at `OnboardingChecklistCard.tsx:162-165` — `border-border ... border-t py-[9px]`                                                                                                                                                                            | ✅ PASS (horizontal `2px` from `padding: 9px 2px` is not asserted — see note below; the AC's SHALL text itself only specifies vertical padding, so this is not a gap against the AC as written) |
| DASH-04: progress bar height                                                        | `5px`, distinct from the default `8px` `Progress`                | `OnboardingChecklistCard.test.tsx:175-182` — `expect(track).toHaveClass("h-[5px]")`, `.not.toHaveClass("h-2")`; impl at `progress.tsx` `PROGRESS_SIZES.thin = "h-[5px]"`, default unchanged at `h-2`                                                                                                                                                         | ✅ PASS                                                                                                                                                                                         |
| DASH-05 (P2 AC1): 16px between checklist card and pattern-grid title row when shown | exactly `16px`, no compounding                                   | `DashboardShell.test.tsx:247-266` — asserts the content column carries `pt-[22px]` once and the grid root carries neither `pt-[22px]` nor `p-[22px]`; impl: `DashboardShell.tsx:113` `gap-4 pt-[22px]` (parent) + `PatternGrid.tsx:57` `gap-4 px-[22px] pb-[22px]` (no top padding) — the `gap-4` (16px) between siblings is the only source of that spacing | ✅ PASS                                                                                                                                                                                         |
| DASH-06 (P2 AC2): 22px top inset preserved when checklist is dismissed/absent       | unchanged `22px` top inset                                       | No dedicated test renders with `checklist: null` and asserts `pt-[22px]`. Verified by code inspection only: `DashboardShell.tsx:113` applies `pt-[22px]` unconditionally on the wrapper `<div>`, not gated behind `{checklist && ...}` (that conditional wraps only the `<OnboardingChecklistCard>` child at line 114)                                       | ⚠️ Spec-precision/coverage gap — behavior is correct by construction, but untested                                                                                                              |
| DASH-06 (P2 AC3): 22px horizontal inset unchanged on every row                      | unchanged                                                        | No new test; unchanged pre-existing behavior confirmed by code read: `PatternGrid.tsx:57` `px-[22px] pb-[22px]`, `DashboardShell.tsx:122` `px-[22px] pb-[22px]` (credits/usage row)                                                                                                                                                                          | ✅ PASS (low risk, unmodified dimension)                                                                                                                                                        |

**Status**: ⚠️ 5/6 traceability rows fully test-covered; 1 (P2 AC2, folded into DASH-06) verified correct by code inspection only, no regression test guards it against a future accidental re-introduction of a `{checklist && <div className="pt-[22px]">}`-shaped bug.

Note: `spec.md`'s Requirement Traceability table has only 6 IDs (DASH-01..06) for 4 + 3 = 7 individual `SHALL`/`WHEN...THEN` acceptance-criteria bullets (P1 has 4, P2 has 3) — DASH-06 necessarily doubles up covering P2's AC2 and AC3. This is a pre-existing spec-numbering compression, not something introduced by the implementation.

---

## Discrimination Sensor

| Mutation | File:line                                              | Description                                                                                               | Killed?                                                                                                                               |
| -------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | `components/dashboard/OnboardingChecklistCard.tsx:144` | Reverted card wrapper from `gap-[10px] px-[16px] py-[14px]` back to the pre-fix `gap-[14px] p-[18px]`     | ✅ Killed — `OnboardingChecklistCard.test.tsx` "matches the redesign reference's card padding, gap and title scale" fails             |
| 2        | `components/dashboard/PatternGrid.tsx:57`              | Reverted from `px-[22px] pb-[22px]` back to the pre-fix uniform `p-[22px]` (reintroduces the doubled gap) | ✅ Killed — `DashboardShell.test.tsx` "gives the content column a single 22px top inset, not a doubled one under the checklist" fails |

**Sensor depth**: lightweight (2 mutations, proportional to a small visual-refinement feature)
**Result**: 2/2 killed — PASS ✅

**Isolation**: mutations were injected in a temporary git worktree (`git worktree add ../moldai-verify-scratch HEAD`, with `node_modules` symlinked from the main tree for a fast test run — never installed/written into the real tree). `git status --porcelain` on the real working tree was captured before sensor work (empty) and confirmed identical after `git worktree remove --force`. `git stash` was never used.

---

## Code Quality

| Principle                                                                                                                                                                                    | Status                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Minimum code                                                                                                                                                                                 | ✅                                                                                                                       |
| Surgical changes                                                                                                                                                                             | ✅                                                                                                                       |
| No scope creep — only the 6 files named in the task were touched (plus `spec.md`)                                                                                                            | ✅                                                                                                                       |
| Matches patterns — `Progress` gains a `size` variant the way `Button`/`Badge` already do (CLAUDE.md: "Tune a primitive in `components/ui/`, never with per-call-site `className` overrides") | ✅                                                                                                                       |
| Spec-anchored outcome check (asserted values match spec)                                                                                                                                     | ⚠️ 6/7 individual AC bullets have a direct assertion; 1 (P2 AC2) verified by code reading only                           |
| Every test maps to a spec requirement — no unclaimed tests                                                                                                                                   | ✅                                                                                                                       |
| Documented guidelines followed                                                                                                                                                               | `CLAUDE.md` (Design tokens / shadcn primitives section), `docs/design/screens/Dashboard.dc.html` as literal ground truth |

---

## Edge Cases

- [x] Checklist dismissed via `localStorage` flag: covered by pre-existing `OnboardingChecklistCard.test.tsx` dismiss tests (unchanged by this diff) — component renders `null`.
- [ ] Checklist dismissed/absent still gets the correct `22px` top inset on `PatternGrid` (spec's own Edge Cases section, P2 AC2): true by code construction (`DashboardShell.tsx:113`'s `pt-[22px]` is unconditional), but not independently asserted by a test using `checklist: null`.

---

## Gate Check

- **Gate command**: `npx vitest run --project dom components/dashboard` (Windows Git Bash)
- **Result**: 48 passed, 0 failed, 0 skipped, across 6 test files
- **Additional gates**: `npx tsc --noEmit -p .` — clean, no output. `npx eslint components/dashboard components/ui/progress.tsx` — clean, no output.
- **Test count before feature** (commit `ba0d670~1`, `OnboardingChecklistCard.test.tsx` + `DashboardShell.test.tsx`): 9 + 10 = 19 (plus 25 unaffected in `PatternGrid`/`Sidebar`/`CreditsCard`/`PatternCard` = 44 total in `components/dashboard`)
- **Test count after feature**: 12 + 11 = 23 (+ 25 unaffected = 48 total)
- **Delta**: +4 new tests (3 in `OnboardingChecklistCard.test.tsx`, 1 in `DashboardShell.test.tsx`)
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans (if issues found)

### Fix 1 (optional, non-blocking): add a direct regression test for DASH-06 / P2 AC2

- **Root cause**: `DashboardShell.tsx:113`'s `pt-[22px]` is unconditional (correct), but no test renders `DashboardShell` with `checklist: null` (or dismissed) and asserts the content column still carries `pt-[22px]` and the grid still gets its `22px` top inset. A future refactor that moved `pt-[22px]` onto the conditionally-rendered `OnboardingChecklistCard` branch would silently regress this and nothing would catch it.
- **Fix task**: In `components/dashboard/DashboardShell.test.tsx`, add a case (reusing the existing `checklist: null` default store state) asserting the scroll-content wrapper still carries `pt-[22px]` and `PatternGrid`'s title row is reachable with the same spacing, when no checklist card renders.
- **Priority**: Minor (behavior is already correct; this only strengthens the regression guard)
- **Status**: ✅ Applied post-verification — `DashboardShell.test.tsx` "still gives the pattern grid a 22px top inset when the checklist is dismissed" (dismisses via `localStorage`, asserts the same `pt-[22px]`/no-`p-[22px]` structure). `npx vitest run --project dom components/dashboard` re-run clean at 49 passed, 0 failed; `tsc`/`eslint` clean. Applied by the author (not re-dispatched to a fresh Verifier) since it is pure test-only, additive, zero implementation risk.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status                                     |
| ----------- | --------------- | ---------------------------------------------- |
| DASH-01     | Verified        | ✅ Verified                                    |
| DASH-02     | Verified        | ✅ Verified                                    |
| DASH-03     | Verified        | ✅ Verified                                    |
| DASH-04     | Verified        | ✅ Verified                                    |
| DASH-05     | Verified        | ✅ Verified                                    |
| DASH-06     | Verified        | ✅ Verified — Fix 1 applied, direct test added |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 6/7 individual AC bullets matched by a direct test assertion; 1 (P2 AC2, folded into DASH-06) verified correct by code reading only — flagged as a spec-precision/coverage gap, not a functional defect.

**Sensor**: 2/2 mutations killed.

**Gate**: 48 passed, 0 failed (vitest); typecheck clean; eslint clean.

**What works**: All four P1 spacing/type-scale criteria (card padding, title scale, row dividers, thin progress bar) are implemented exactly to the `.dc.html` reference values and are protected by non-shallow tests. The P2 compounded-gap bug (38px → 16px) is fixed and the regression is guarded by a real test targeting the DOM structure, not just a snapshot. Both mutation-sensor probes (reverting each fix) were killed by the new tests. Typecheck and lint are clean. No scope creep — exactly the 6 named files plus `spec.md` changed.

**Issues found**: DASH-06/P2-AC2 (22px top inset preserved when the checklist is dismissed/absent) has no dedicated test — only verified by reading `DashboardShell.tsx:113`'s unconditional `pt-[22px]`. Low risk (single unconditional class, not a branch), does not block the feature.

**Next steps**: Optional — apply Fix 1 (add the `checklist: null` spacing test) in a follow-up commit. No blocking work remains.
