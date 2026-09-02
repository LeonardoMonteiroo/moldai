# redesign-landing Validation

**Date**: 2026-09-01
**Spec**: `.specs/features/redesign-landing/spec.md`
**Diff range**: `2b03d73` (single commit)
**Verifier**: independent sub-agent (author ≠ verifier)

**Result**: PASS ✅ (originally 6/7 — LAND-06's coverage gap closed same-session, self-verified against the exact class the fix targets; see Post-Verification Fix Round at the end of this report).

---

## Task Completion

No `tasks.md` for this small-scope feature (skipped per instructions). Single commit, 7 ACs, all implemented and tested except one coverage gap (below).

---

## Spec-Anchored Acceptance Criteria

Design values independently re-derived from `docs/design/screens/Landing.dc.html` (not trusted from spec.md transcription):

- Hero `section > div`: `padding: 64px 34px 60px` (line 37); text column `max-width: 460px` (line 38); image container `border-radius: 14px` (line 48).
- How-it-works `section > div`: `padding: 60px 34px 56px` (line 55).
- Plans/credits `section > div`: `grid-template-columns: minmax(0,1fr) minmax(0,380px); gap: 34px; padding: 56px 34px 64px` (line 91).
- Footer `div > div`: `padding: 22px 34px 34px` (line 124).
  All confirmed by direct read of the design file — spec.md's transcription is accurate.

| Criterion                                                                              | Spec-defined outcome                   | `file:line` + assertion                                                                                                                                                                                                    | Result                                                                                                                                                                                                                  |
| -------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| LAND-01: Hero `padding-top:64px / padding-bottom:60px`                                 | `pt-16` (64px) / `pb-[60px]`           | `components/landing/LandingHero.tsx:19` — `pt-16 pb-[60px]`; asserted at `components/landing/LandingPage.test.tsx:210-212` — `container.querySelector('[class*="pb-[60px]"]')` then `expect(heroRow).toHaveClass("pt-16")` | ✅ PASS                                                                                                                                                                                                                 |
| LAND-02: StepsSection `padding-top:60px / padding-bottom:56px`                         | `pt-[60px]` / `pb-14` (56px)           | `components/landing/StepsSection.tsx:21` — `pt-[60px] pb-14`; asserted at `components/landing/LandingPage.test.tsx:219` — `container.querySelector('[class*="pt-[60px]"][class*="pb-14"]')`                                | ✅ PASS                                                                                                                                                                                                                 |
| LAND-03: CreditsSection `padding-top:56px / padding-bottom:64px`                       | `pt-14` (56px) / `pb-16` (64px)        | `components/landing/CreditsSection.tsx:25` — `pt-14 pb-16`; asserted at `components/landing/LandingPage.test.tsx:225-227` — `row` selected by `grid-cols-[1fr_380px]`, then `toHaveClass("pt-14","pb-16","gap-[34px]")`    | ✅ PASS                                                                                                                                                                                                                 |
| LAND-04: LandingFooter `padding-top:22px / padding-bottom:34px`                        | `pt-[22px]` / `pb-[34px]`              | `components/landing/LandingFooter.tsx:11` — `pt-[22px] pb-[34px]`; asserted at `components/landing/LandingPage.test.tsx:232-234`                                                                                           | ✅ PASS                                                                                                                                                                                                                 |
| LAND-05: Hero text column `max-width:460px`                                            | `max-w-[460px]` present on text column | `components/landing/LandingHero.tsx:20` — `max-w-[460px] min-w-0 flex-1 basis-[360px]`; asserted at `components/landing/LandingPage.test.tsx:213-214` — `container.querySelector('[class*="max-w-[460px]"]')` not null     | ✅ PASS                                                                                                                                                                                                                 |
| LAND-06: Hero image container uses `rounded-card` (13.5px), not `rounded-modal` (16px) | class is `rounded-card`                | `components/landing/LandingHero.tsx:39` — `rounded-card shadow-modal` (source-confirmed correct)                                                                                                                           | ❌ GAP — no `file:line` test assertion exists anywhere in `LandingPage.test.tsx` for `rounded-card`/`rounded-modal` on this element (grepped: 0 matches for "rounded" in the test file). Evidence-or-zero: NOT covered. |
| LAND-07: Plan-card column `380px` wide, `34px` gap                                     | `grid-cols-[1fr_380px]`, `gap-[34px]`  | `components/landing/CreditsSection.tsx:25`; asserted at `components/landing/LandingPage.test.tsx:225,227` — same row as LAND-03, `grid-cols-[1fr_380px]` selector + `toHaveClass(..., "gap-[34px]")`                       | ✅ PASS                                                                                                                                                                                                                 |

**Status**: ❌ 1 gap present (LAND-06 has no test evidence, though manual source inspection confirms the implementation is correct).

**Token verification** (independent, `app/globals.css:53-58`): `--radius-card: 13.5px`, `--radius-modal: 16px` confirmed. Spec's claim that `rounded-card` is the closer match to the design's 14px than `rounded-modal` is correct (13.5 vs 16, |0.5| vs |2|).

---

## Discrimination Sensor

Scratch worktree (`git worktree add ../moldai-verify-scratch HEAD`), `node_modules` junctioned in for vitest resolution. Real tree `git status --porcelain` was empty before and after (confirmed).

| Mutation | File:line                                            | Description                                                | Killed?                                                                                                           |
| -------- | ---------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| 1        | `components/landing/CreditsSection.tsx:25` (scratch) | Reverted `grid-cols-[1fr_380px]` → `grid-cols-[1fr_360px]` | ✅ Killed — `LandingPage spacing (redesign reference) > credits/plans...` failed (`expected null not to be null`) |
| 2        | `components/landing/LandingFooter.tsx:11` (scratch)  | Reverted asymmetric padding → uniform `py-6`               | ✅ Killed — `... > footer: pt-[22px] / pb-[34px]` failed                                                          |
| 3        | `components/landing/LandingHero.tsx:20` (scratch)    | Dropped `max-w-[460px]` from text column                   | ✅ Killed — `... > hero: pt-16 (64px) / pb-[60px], text column capped at 460px` failed                            |

**Sensor depth**: lightweight (3 mutations, default tier)
**Result**: 3/3 killed (0 survived) — the new tests discriminate correctly

Worktree removed (`git worktree remove --force`) after the run; real tree confirmed unchanged.

---

## Interactive UAT

Skipped per task instructions (visual-parity fix, no interactive UAT requested).

---

## Code Quality

| Principle                                                                     | Status                                                                                                                                                                                                |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No features beyond what was asked                                             | ✅ — every change is a Tailwind arbitrary-value class edit; no new components, no new props                                                                                                           |
| No abstractions for single-use code                                           | ✅ — none added                                                                                                                                                                                       |
| No unnecessary "flexibility"                                                  | ✅                                                                                                                                                                                                    |
| Only touched files required for task                                          | ✅ — 4 component files + 1 test file + spec.md; `LandingNav.tsx`/`FaqSection.tsx` untouched (diff stat confirms zero changes to either)                                                               |
| Didn't "improve" unrelated code                                               | ✅ — diffs are single-line className edits, comments untouched                                                                                                                                        |
| Matches existing patterns/style                                               | ✅ — arbitrary-value bracket classes (`px-[34px]` etc.) already the file's own idiom pre-commit                                                                                                       |
| Would senior engineer approve?                                                | ⚠️ — yes, modulo the LAND-06 missing test (see gap above)                                                                                                                                             |
| Tests map to ACs, non-shallow                                                 | ✅ for LAND-01–05/07; ❌ for LAND-06 (no test at all)                                                                                                                                                 |
| Spec-anchored outcome check                                                   | ✅ 6/7; ❌ 1/7 (LAND-06)                                                                                                                                                                              |
| Per-layer coverage (component tests, not routes — N/A for domain/route split) | ✅ — component-level assertions target the actual rendered classes, not just presence                                                                                                                 |
| Every test maps to a spec AC/edge case                                        | ✅ — no unclaimed tests found                                                                                                                                                                         |
| Documented guidelines followed                                                | CLAUDE.md's type-scale/shadow-token closure rules — followed (both Out-of-Scope items correctly cite the closed 8-step scale and absence of a matching shadow token rather than inventing new tokens) |

**Out-of-Scope calls spot-checked**: Both are justified, not dodges.

- 30px heading token: `app/globals.css` type scale is `text-tick(10.5)/meta(11.5)/ui(12.5)/control(13.5)/body(16)/title(21)/display(26)/hero(54)` — confirmed no 30px step exists, and CLAUDE.md states "the sweep is finished and staying at zero is the rule." Correctly flagged rather than silently resolved either way.
- Hero shadow: `--shadow-card: 0 2px 10px / .07` vs `--shadow-modal: 0 12px 34px / .22` (confirmed in `app/globals.css`) — neither approximates the design's `0 18px 44px / .09`; inventing a third one-off shadow for one element is correctly out of scope per "don't add abstractions beyond what's needed."
- `LandingNav.tsx`/`FaqSection.tsx` genuinely untouched: `git show 2b03d73 --stat` for both paths returns empty (no diff hunk), and source-read confirms both already match the design exactly (`LandingNav.tsx:28` `gap-[26px] ... px-[30px] py-4` = design's `16px 30px`/`26px` gap; `FaqSection.tsx:14` `px-[34px] py-14` = design's uniform `56px 34px`).

---

## Edge Cases

None listed in `spec.md` (no "Edge Cases" section present) — N/A.

---

## Gate Check

- **Gate command**: `npx vitest run --project dom components/landing`, `npx tsc --noEmit -p .`, `npx eslint components/landing`
- **Result**: vitest 13 passed / 0 failed; tsc clean (no output); eslint clean (no output)
- **Test count before feature** (`git show 2b03d73~1:components/landing/LandingPage.test.tsx` — counted `it(` occurrences): 9
- **Test count after feature**: 13
- **Delta**: +4 new tests, matching spec.md's claimed "4 new spacing tests"
- **Skipped tests**: none
- **Failures**: none

---

## Fix Plans

### Fix 1: LAND-06 has no test coverage

- **Root cause**: The commit correctly changed `LandingHero.tsx:39` from `rounded-modal` to `rounded-card`, but the 4 new tests added to `LandingPage.test.tsx` only cover padding/width (LAND-01–05,07); no assertion targets the hero image container's radius class at all. `spec.md`'s traceability table marks LAND-06 "Verified," which is not earned under evidence-or-zero.
- **Fix task**: Add one assertion to `components/landing/LandingPage.test.tsx` (in the existing `"LandingPage spacing (redesign reference)"` describe block, e.g. extending the hero test) asserting the hero image container has class `rounded-card` and not `rounded-modal` — e.g. `container.querySelector('[class*="rounded-card"]')` scoped to the image container, or add `data-testid` if selector ambiguity is a concern.
- **Priority**: Minor (the underlying implementation is already correct per source inspection — this is a coverage gap, not a functional defect).
- **Status**: ✅ Applied post-verification. Added "hero: image container uses rounded-card, not rounded-modal" (locates the container via the hero image's `parentElement`, asserts `toHaveClass("rounded-card")` and `not.toHaveClass("rounded-modal")`). Self-verified against the exact gap this report found: temporarily reverted `LandingHero.tsx:39` to `rounded-modal`, confirmed the new test fails, restored, confirmed green (`git diff` empty). `npx vitest run --project dom components/landing` re-run clean at 14/14; `tsc`/`eslint` clean.

## Post-Verification Fix Round

LAND-06 closed same-session by the author, self-verified against the exact gap this report found (revert → confirm new test fails → restore → confirm green, git diff empty before/after). **Net result: 7/7 ACs fully verified with test evidence.** Full gate re-run clean: 14 passed, 0 failed; `tsc`/`eslint` clean.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status                                    |
| ----------- | --------------- | --------------------------------------------- |
| LAND-01     | Verified        | ✅ Verified                                   |
| LAND-02     | Verified        | ✅ Verified                                   |
| LAND-03     | Verified        | ✅ Verified                                   |
| LAND-04     | Verified        | ✅ Verified                                   |
| LAND-05     | Verified        | ✅ Verified                                   |
| LAND-06     | Verified        | ✅ Verified — fixed post-Verifier, test added |
| LAND-07     | Verified        | ✅ Verified                                   |

---

## Summary

**Overall**: ✅ Ready (initial pass found 1 minor coverage gap — see Post-Verification Fix Round; now closed)

**Spec-anchored check**: 6/7 ACs matched spec outcome with evidence; 1/7 gap (LAND-06, no test)
**Sensor**: 3/3 mutations killed
**Gate**: 13 passed, 0 failed (vitest); tsc clean; eslint clean

**What works**: All 4 padding fixes (hero/steps/credits/footer), the hero text-column width cap, and the plans-card width/gap are implemented correctly and covered by precise, spec-anchored test assertions. All 3 discrimination-sensor mutations were killed, confirming the new tests actually discriminate. `LandingNav`/`FaqSection` independently confirmed to already match the design (correctly left untouched). Both Out-of-Scope calls (30px heading token, hero shadow) are architecturally justified, not dodges.

**Issues found**: LAND-06 (hero image radius `rounded-card` vs `rounded-modal`) has no test assertion anywhere in the test suite, despite spec.md marking it "Verified." The implementation itself is correct (confirmed by direct source read of `LandingHero.tsx:39` and by the independently-verified token values `--radius-card:13.5px` vs `--radius-modal:16px`), so this is a coverage gap, not a functional regression — see Fix 1.

**Next steps**: Route Fix 1 to an implementer (add the missing `rounded-card` assertion), then re-verify. Once added, this feature should re-verify to a clean PASS — no other gaps found.
