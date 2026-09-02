# redesign-onboarding Validation

**Date**: 2026-09-01
**Spec**: `.specs/features/redesign-onboarding/spec.md`
**Diff range**: `8fd3a06` (fix(ui): forward Progress's value prop to Radix Root) → `914c9aa` (fix(onboarding): use a real progress bar, 2px selected border)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

No `tasks.md` for this Small-scope feature (step 1 skipped per instructions). Both commits are self-contained and match the spec's 3 goals; no partial/blocked work found.

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y)                                                                                                           | Spec-defined outcome                                                                    | `file:line` + assertion                                                                                                                                                                                                                                                                                                                      | Result                                                |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| ONBD-01: System SHALL render `role="progressbar"` with `aria-valuenow = round((step/3)*100)`, replacing the dot stepper             | step1→33, step2→67                                                                      | `components/onboarding/OnboardingShell.test.tsx:76-83` — `expect(bar).toHaveAttribute("aria-valuenow", "33")`, then after `goToStep2` `expect(...).toHaveAttribute("aria-valuenow", "67")`                                                                                                                                                   | ✅ PASS                                               |
| ONBD-02: `Progress`'s `value` prop SHALL reach Radix `Root` so `aria-valuenow`/`aria-valuemax` render on the DOM for every consumer | `value={value}` forwarded to `ProgressPrimitive.Root`                                   | `components/ui/progress.tsx:27` — `value={value}` added before `{...props}`; exercised indirectly by `OnboardingShell.test.tsx:76-83`'s `aria-valuenow` assertion (no dedicated unit test exists for `progress.tsx` itself, nor for `OnboardingChecklistCard`/`ChatPanel`'s `aria-valuenow`, but neither regressed — see Blast Radius below) | ✅ PASS (see note on `aria-valuemax` precision below) |
| ONBD-03: A selected work-style option SHALL carry a `2px` (`border-2`) olive border, not `1.5px`                                    | class list contains `border-2 border-olive` when selected, not present before selection | `components/onboarding/OnboardingShell.test.tsx:88-98` — `expect(option).not.toHaveClass("border-2")` before click, `expect(option).toHaveClass("border-2", "border-olive")` after                                                                                                                                                           | ✅ PASS                                               |

**Status**: ✅ All ACs covered

**Spec-precision note (not a gap):** the commit message and spec's ONBD-02 wording claim `aria-valuenow`**and**`aria-valuemax` "never rendered" pre-fix. Independently reading `node_modules/radix-ui/dist/progress.mjs`, `aria-valuemax` is sourced from `max` (default `100`) and is set unconditionally on `Primitive.div` regardless of whether `value` is supplied — only `aria-valuenow` (and the derived `aria-valuetext`) depend on `isNumber(value)`, which was `false` pre-fix because the unset `value` prop defaulted to Radix's own internal `null`. So `aria-valuemax` was in fact already present on the DOM before this fix; only `aria-valuenow`/`aria-valuetext` were the real regression. This is a wording overstatement in the commit/spec, not a functional gap — the fix (`value={value}`) is still the complete, correct one-line fix, and no manual `aria-valuemin`/`aria-valuetext`/`aria-valuemax` setting is needed since Radix derives all three internally once `value` (and optionally `max`) are supplied.

---

## Progress A11y Bug — Independent Scrutiny

- **Bug confirmed real**: `git show 8fd3a06` shows the pre-fix `components/ui/progress.tsx` spread `{...props}` onto `ProgressPrimitive.Root` but never included `value` — it was destructured out (for the indicator's inline `transform`) and dropped. Radix's own `Progress` (`node_modules/radix-ui/dist/progress.mjs`) defaults `value: valueProp = null` when the prop is absent, and only emits `aria-valuenow`/`aria-valuetext` when `isNumber(value)` is true — so `aria-valuenow` was structurally absent from the DOM pre-fix for every consumer.
- **Fix confirmed complete**: the one-line `value={value}` addition (`components/ui/progress.tsx:27`) is sufficient. Radix computes `aria-valuemin` (always `0`), `aria-valuemax` (from `max`, already present regardless), and `aria-valuetext` (via `getValueLabel`) internally once `value`/`max` are valid numbers — no additional manual ARIA attributes are needed.
- **Blast radius verified independently**, not trusted from the spec/commit message: `grep -rn "<Progress" components/` returns exactly 3 usages — `components/onboarding/OnboardingShell.tsx:139`, `components/editor/ChatPanel.tsx:113`, `components/dashboard/OnboardingChecklistCard.tsx:159`. Matches the claimed "3 consumers" exactly.
- **No regression in the other two consumers**: `components/dashboard/OnboardingChecklistCard.test.tsx` (12/12 passed) and `components/editor/ChatPanel.a11y.test.tsx` (4/4 passed) both pass unchanged against the fixed primitive.

---

## Discrimination Sensor

| Mutation | File:line                                                 | Description                                                              | Killed?                                                                                                                                        |
| -------- | --------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | `components/ui/progress.tsx:27` (scratch)                 | Removed `value={value}` — reintroduced the pre-fix a11y bug              | ✅ Killed — `OnboardingShell.test.tsx`'s "shows a progress bar tracking the current step" failed (`aria-valuenow` expected `"33"`, got `null`) |
| 2        | `components/onboarding/OnboardingShell.tsx:188` (scratch) | Reverted selected-option border from `border-2` back to `border-[1.5px]` | ✅ Killed — "marks a selected work-style option with a 2px olive border" failed (received class list lacked `border-2`)                        |
| 3        | `components/onboarding/OnboardingShell.tsx:140` (scratch) | Changed `value={Math.round((step/3)*100)}` to `value={0}`                | ✅ Killed — "shows a progress bar tracking the current step" failed (`aria-valuenow` expected `"33"`, got `"0"`)                               |

**Sensor depth**: lightweight (3 targeted mutations, one per AC)
**Result**: 3/3 killed — PASS ✅

Performed in a temporary git worktree (`git worktree add ../moldai-verify-scratch HEAD`), `node_modules` linked via a Windows junction (no reinstall). Real worktree `git status --porcelain` was empty both before sensor work and after `git worktree remove --force`, confirming isolation — `git stash` was never used.

---

## Interactive UAT Results

Skipped per task instructions (step 7 explicitly excluded for this run).

---

## Code Quality

| Principle                                                  | Status                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimum code                                               | ✅ — 1-line fix in `progress.tsx`; `OnboardingShell.tsx` diff is a targeted swap of dot-stepper markup for `Progress` + border class change                                                                                                                                                                                                                            |
| Surgical changes                                           | ✅ — only `components/ui/progress.tsx`, `components/onboarding/OnboardingShell.tsx`, `components/onboarding/OnboardingShell.test.tsx`, plus the new spec file were touched                                                                                                                                                                                             |
| No scope creep                                             | ✅ — Step 2's disabled+badged "em breve" rows deliberately left alone, matching the settled CLAUDE.md scope decision cited in the commit message                                                                                                                                                                                                                       |
| Matches patterns                                           | ✅ — `Progress` reused via existing primitive (no new component), catalog-driven `t("stepLabel", ...)` for `aria-label`, existing Tailwind token classes (`bg-track`, `border-olive`, `bg-olive-tint`)                                                                                                                                                                 |
| Spec-anchored outcome check (asserted values match spec)   | ✅ — see AC table above; exact `33`/`67`/`"border-2", "border-olive"` values asserted, not vague presence checks                                                                                                                                                                                                                                                       |
| Per-layer Coverage Expectation met                         | ✅ — this is UI-component-only work; both new tests map 1:1 to the two visual-parity goals, and the pre-existing a11y-consumer tests (`OnboardingChecklistCard`, `ChatPanel.a11y`) cover the shared-primitive blast radius                                                                                                                                             |
| Every test maps to a spec requirement — no unclaimed tests | ✅ — both new tests carry inline comments citing `Onboarding.dc.html:30`/`:161`, matching ONBD-01/03; ONBD-02 (the primitive fix) has no dedicated new test but is exercised transitively by the ONBD-01 test plus the two untouched consumer test suites, which is an evidence gap worth naming explicitly (see below) rather than silently counting as full coverage |
| Documented guidelines followed                             | CLAUDE.md's "Tune a primitive in `components/ui/`, never with per-call-site `className` overrides" (the `Progress` fix stays inside the primitive); "Type comes from the named scale" (no new `text-[Npx]`); catalog-lookup convention for `aria-label`                                                                                                                |

**Minor gap flagged (does not change PASS verdict):** ONBD-02 has no test asserting `aria-valuenow`/`aria-valuemax` directly against `components/ui/progress.tsx` in isolation (e.g. a `Progress.test.tsx`) or against `OnboardingChecklistCard`/`ChatPanel`'s own progress bars post-fix. Coverage for those two consumers is negative evidence only (their existing test suites didn't break), not a positive assertion that `aria-valuenow` now renders there. The `OnboardingShell` test is the only place that positively asserts the fixed behavior. This is a reasonable scope boundary for a visual-parity pass but is worth a follow-up test if the primitive is touched again.

---

## Edge Cases

No edge cases enumerated in spec.md beyond the 3 ACs (Assumptions & Open Questions: "None").

---

## Gate Check

- **Gate command**: `npx vitest run --project dom components/onboarding components/dashboard components/editor components/shared`
- **Result**: 30 test files passed, 270 tests passed, 0 failed, 0 skipped
- **Test count before feature** (`OnboardingShell.test.tsx` at `8fd3a06^`): 22 tests in that file
- **Test count after feature**: 24 tests in that file (270 total across the swept directories)
- **Delta**: +2 new tests in `OnboardingShell.test.tsx`, exactly the 2 the commit message claims
- **Skipped tests**: none
- **Failures**: none
- **Additional gates**: `npx tsc --noEmit -p .` — clean (no output, exit 0). `npx eslint components/onboarding components/ui/progress.tsx` — clean (no output, exit 0).

---

## Fix Plans

None — no gaps found requiring a fix task.

---

## Requirement Traceability Update

| Requirement | Previous Status    | New Status                                                                                    |
| ----------- | ------------------ | --------------------------------------------------------------------------------------------- |
| ONBD-01     | Verified (claimed) | ✅ Verified (confirmed)                                                                       |
| ONBD-02     | Verified (claimed) | ✅ Verified (confirmed; wording overstatement on `aria-valuemax` noted, not a functional gap) |
| ONBD-03     | Verified (claimed) | ✅ Verified (confirmed)                                                                       |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 3/3 ACs matched spec outcome (1 spec-precision wording note on `aria-valuemax`, not a gap)
**Sensor**: 3/3 mutations killed
**Gate**: 270 passed, 0 failed (dom sweep); tsc clean; eslint clean

**What works**: The dot-stepper→progress-bar swap and the `border-2` selected-state fix both match `Onboarding.dc.html` (lines 30 and 161 respectively, confirmed by direct read). The pre-existing `Progress` primitive a11y bug is real (independently confirmed against Radix's own source in `node_modules/radix-ui/dist/progress.mjs`), the fix is the complete minimal fix, and the claimed 3-consumer blast radius is exactly right (verified by grep) with no regression in the other two consumers' test suites.

**Issues found**: None blocking. One minor coverage gap noted above — ONBD-02 lacks a dedicated positive-assertion test for the two non-`OnboardingShell` consumers (`OnboardingChecklistCard`, `ChatPanel`), and the "aria-valuemax never rendered" framing in the commit/spec text overstates the pre-fix bug's scope (aria-valuemax was already present; only aria-valuenow/aria-valuetext were broken).

**Next steps**: None required to close this feature. Optional low-priority follow-up: add a direct `aria-valuenow` assertion to `OnboardingChecklistCard.test.tsx`/`ChatPanel.a11y.test.tsx` next time either file is touched, to make ONBD-02's fix positively asserted for all 3 consumers rather than 1-of-3.
