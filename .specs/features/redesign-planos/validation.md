# redesign-planos Validation

**Date**: 2026-09-01
**Spec**: `.specs/features/redesign-planos/spec.md`
**Diff range**: `e158696` ("fix(pricing): match hero padding and card-row gap to redesign")
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

No `tasks.md` exists (small-scope feature, per skill instructions — step 1 skipped). Both spec Goals are implemented in the single commit:

| Change                                                       | Status  | Notes                                   |
| ------------------------------------------------------------ | ------- | --------------------------------------- |
| Hero padding `px-[34px] py-[40px]` → `px-[34px] pt-14 pb-11` | ✅ Done | `components/pricing/PricingPage.tsx:62` |
| Card-row gap `gap-[14px]` → `gap-[18px]`                     | ✅ Done | `components/pricing/PricingPage.tsx:99` |

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y)                                                                                                                    | Spec-defined outcome                                                                                                                                            | `file:line` + assertion                                                                                                                                                                                                                                                                                                      | Result  |
| -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| PLAN-01: The system SHALL render the hero section at `padding-top: 56px` / `padding-bottom: 44px`                                            | Tailwind `pt-14` (3.5rem=56px) / `pb-11` (2.75rem=44px), verified against `Planos.dc.html:36` (`padding: 56px 34px 44px`)                                       | `components/pricing/PricingPage.tsx:62` (`className="... px-[34px] pt-14 pb-11"`) — `components/pricing/PricingPage.test.tsx:44-46` — `expect(hero).not.toBeNull(); expect(hero).toHaveClass("pt-14")` where `hero = container.querySelector('[class*="pb-11"]')`                                                            | ✅ PASS |
| PLAN-02: The system SHALL render `18px` gap between the Grátis card and the paid-plan grid, distinct from the grid's own `14px` internal gap | `gap-[18px]` on the outer row, verified against `Planos.dc.html:52` (`gap: 18px`), distinct from `Planos.dc.html:79`'s `gap: 14px` on the paid-plan grid itself | `components/pricing/PricingPage.tsx:99` (`className="flex flex-wrap items-stretch gap-[18px]"`) vs. the untouched inner grid at `PricingPage.tsx:102` (`gap-[14px]`) — `components/pricing/PricingPage.test.tsx:48-49` — `expect(cardRow).not.toBeNull()` where `cardRow = container.querySelector('[class*="gap-[18px]"]')` | ✅ PASS |

**Status**: ✅ All ACs covered. Both criteria state a precise pixel outcome and the test asserts the exact Tailwind class that encodes it (`pt-14`/`pb-11`/`gap-[18px]`), not merely "a class exists." Independently confirmed Tailwind's default spacing scale: `14 * 4px = 56px`, `11 * 4px = 44px`.

**Design source cross-check** (read `docs/design/screens/Planos.dc.html` directly, not taken on faith):

- Line 36: `padding: 56px 34px 44px` — confirms PLAN-01's exact values. ✅
- Line 52: `gap: 18px` (plan-cards-row) — confirms PLAN-02. ✅
- Line 79: `gap: 14px` (paid-plan grid's own internal gap) — confirms this is a genuinely distinct, smaller value, and `PricingPage.tsx:102`'s `gap-[14px]` was correctly left untouched. ✅

---

## Out-of-Scope Claims — Scrutinized

The spec's job here also included not dodging real gaps by mislabeling them "already correct." All four claims were independently re-derived from source, not taken on the spec's word:

1. **`text-hero` (54px) instead of literal 44px** — Confirmed. `CLAUDE.md:32` states verbatim: `` `text-hero` (54, shared by `LandingHero` and the Planos hero headline) ``, an existing rule predating this diff. `PricingPage.tsx:67` does use `text-hero tracking-hero`. **Verdict: genuine pre-existing documented decision, not a dodge.**
   - Note (informational, not a gap in this feature): `CLAUDE.md:318` separately calls `LandingPage` "the only consumer of the `text-hero`/`tracking-hero` tokens" — an internal CLAUDE.md staleness contradicting line 32, but it predates this commit (this diff never touches `CLAUDE.md`) and is out of this feature's diff surface, so it does not affect this verdict. Flagged for awareness only.
2. **Nav shows "Dúvidas" not "Formatos"** — Confirmed. `Landing.dc.html:30` literally reads `Dúvidas` in the identical nav position where `Planos.dc.html:29` reads `Formatos`. `LandingNav.tsx:8-23`'s own comment documents it is deliberately reused by both `/` and `/planos` (#218), and `messages/pt-BR.json`'s `Landing.nav.faq` (rendered by `LandingNav.tsx:35`) is the value actually shown. **Verdict: genuine mockup-authoring inconsistency between the two design files, not a dodge** — Planos.dc.html itself is the outlier vs. Landing.dc.html's nav, matching the spec's claim exactly.
3. **`gap-6` wrapper merging two design sections** — Confirmed pre-existing. `git log -S"gap-6" -- components/pricing/PricingPage.tsx` shows the `gap-6` wrapper was introduced in commit `a41f0da` ("style(landing): match redesign's hero scale and content width, revert payment note copy"), not in `e158696`. **Verdict: genuinely pre-existing, not introduced by this pass.**
4. **Free card fixed `260px` vs. design's flexible `250-300px`** — `PricingPage.tsx:255` (`sm:w-[260px]`) is untouched by this diff (confirmed via `git show e158696`, which only touches two `className` lines). `Planos.dc.html:54` confirms `flex: 1 1 250px; min-width: 0; max-width: 300px`. 260px sits within [250,300], so `w-[260px]` is one valid point inside the design's allowed range. **Verdict: reasonable characterization, not a visible divergence** — a defensible simplification rather than a dodge, though "functionally equivalent" slightly overstates it (fixed vs. flexible do behave differently under resize); this is a cosmetic-level nuance, not a missed requirement.

**No dodges found.** All four Out-of-Scope items are accurate; none conceals unaddressed drift.

---

## Discrimination Sensor

| Mutation | File:line                                                  | Description                                                                        | Killed?                                                   |
| -------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 1        | `components/pricing/PricingPage.tsx:62` (scratch worktree) | Reverted `px-[34px] pt-14 pb-11` → `px-[34px] py-[40px]` (pre-fix uniform padding) | ✅ Killed — `expected null not to be null` at test.tsx:45 |
| 2        | `components/pricing/PricingPage.tsx:99` (scratch worktree) | Reverted `gap-[18px]` → `gap-[14px]` (pre-fix card-row gap)                        | ✅ Killed — `expected null not to be null` at test.tsx:49 |

**Sensor depth**: lightweight (2 mutations, proportional to a small visual-parity fix; not a P0/critical path)
**Result**: 2/2 killed — PASS ✅

**Isolation**: `git worktree add C:\Users\leona\Projects\moldai-scratch-verify HEAD` used (never `git stash`). Baseline `git status --porcelain` on the real tree was empty before sensor work; re-checked empty after `git worktree remove --force` — real tree confirmed untouched throughout.

---

## Interactive UAT Results

Skipped per task instructions (step 7 explicitly excluded for this run).

---

## Code Quality

| Principle                                              | Status                                                                                                                                                                                       |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No features beyond what was asked                      | ✅ — diff touches exactly 2 `className` values plus the test/spec                                                                                                                            |
| No abstractions for single-use code                    | ✅                                                                                                                                                                                           |
| No unnecessary "flexibility" added                     | ✅                                                                                                                                                                                           |
| Only touched files required for task                   | ✅ — `PricingPage.tsx`, `PricingPage.test.tsx`, `spec.md`                                                                                                                                    |
| Didn't "improve" unrelated code                        | ✅ — the untouched `gap-[14px]` inner grid and `w-[260px]` Free card confirm no adjacent drive-by edits                                                                                      |
| Matches existing patterns/style                        | ✅ — uses the project's existing Tailwind arbitrary-value convention (`px-[34px]`) alongside standard scale steps (`pt-14`/`pb-11`), consistent with surrounding code                        |
| Would senior engineer approve?                         | ✅                                                                                                                                                                                           |
| Tests map to acceptance criteria and are non-shallow   | ✅ — spot-checked P1; the new test asserts exact class names (`pt-14`, `gap-[18px]` via `class*=` substring selector), not mere presence of _a_ padding/gap class                            |
| Spec-anchored outcome check                            | ✅ — see AC table above                                                                                                                                                                      |
| Per-layer Coverage Expectation met                     | ✅ — this is a pure presentation-layer diff (2 className changes); one component test covers both, matching the project's existing `dom`-project pattern for this file                       |
| Every test in scope maps to a spec AC/edge case        | ✅ — the one new test (`PricingPage.test.tsx:40-50`) maps 1:1 to PLAN-01+PLAN-02; no unclaimed tests added                                                                                   |
| Documented project quality/testing guidelines followed | ✅ — `CLAUDE.md`'s dom-project vitest convention (`components/**/*.test.{ts,tsx}` via `renderWithIntl`) followed exactly; no hex values, `text-[Npx]`, or hardcoded pt-BR strings introduced |

---

## Edge Cases

No edge cases listed in spec.md beyond the two ACs themselves (this is a 2-value spacing fix, not a logic change). The four Out-of-Scope items function as the spec's documented "checked and rejected" edge cases — all four independently re-verified above.

---

## Gate Check

- **Gate command**: `npx vitest run --project dom components/pricing`; `npx tsc --noEmit -p .`; `npx eslint components/pricing`
- **Result**: vitest 13 passed, 0 failed, 0 skipped; tsc clean (no output, exit 0); eslint clean (no output, exit 0)
- **Test count before feature**: 12 (`PricingPage.test.tsx` prior to this commit — confirmed via diff, which adds exactly one new `it(...)` block)
- **Test count after feature**: 13
- **Delta**: +1 new test, matching spec's Success Criteria claim ("13/13, 1 new spacing test")
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans

None — no issues found.

---

## Requirement Traceability Update

| Requirement | Previous Status           | New Status                            |
| ----------- | ------------------------- | ------------------------------------- |
| PLAN-01     | Verified (author-claimed) | ✅ Verified (independently confirmed) |
| PLAN-02     | Verified (author-claimed) | ✅ Verified (independently confirmed) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 2/2 ACs matched spec outcome, 0 spec-precision gaps
**Sensor**: 2/2 mutations killed
**Gate**: 3/3 commands passed (vitest, tsc, eslint), 0 failed

**What works**: Both spacing fixes are correctly implemented, independently verified against `Planos.dc.html`'s literal values (lines 36, 52, 79), covered by a precise (not shallow) test, and confirmed to actually catch regression via mutation testing. All four Out-of-Scope claims were independently re-derived from source (CLAUDE.md, `LandingNav.tsx`, `Landing.dc.html`, git history) and hold up — none is a dodge concealing unaddressed drift.

**Issues found**: None blocking. One informational-only observation: `CLAUDE.md:318` ("LandingPage... the only consumer of the text-hero/tracking-hero tokens") is stale relative to `CLAUDE.md:32` and the actual codebase (`PricingPage.tsx` also uses `text-hero`/`tracking-hero`) — pre-existing, outside this diff's surface, not this feature's responsibility to fix.

**Next steps**: None required. Feature is done.
