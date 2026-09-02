# redesign-auth Validation

**Date**: 2026-09-01
**Spec**: `.specs/features/redesign-auth/spec.md`
**Diff range**: `6b46bdd` (single commit)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

No `tasks.md` for this Small-scope feature (per skill guidance, step 1 skipped). Both spec.md Goals items are implemented in the diff.

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y)                                                                                      | Spec-defined outcome                              | `file:line` + assertion                                                                                                                                                                                                                                                    | Result  |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| AUTH-01: signup card renders at `max-w-[420px]`                                                                | exact class `max-w-[420px]` on the card wrapper   | `app/signup/page.tsx:18` - `className="bg-surface border-border rounded-card shadow-card my-auto w-full max-w-[420px] border p-7"` (source read, no automated test — spec's own Independent Test method is manual className read)                                          | ✅ PASS |
| AUTH-02.1: password-requirement hint renders under Signup's password field, sourced from `Signup.passwordHint` | hint text visible, catalog-sourced                | `components/auth/SignupCard.tsx:164` - `<FieldDescription>{t("passwordHint")}</FieldDescription>`; `components/auth/SignupCard.test.tsx:70` - `expect(screen.getByText(ptBR.Signup.passwordHint)).toBeInTheDocument()`                                                     | ✅ PASS |
| AUTH-02.2: hint names only `MIN_PASSWORD_LENGTH`, never an unenforced complexity rule                          | text contains "8", does not claim letters+numbers | `components/auth/SignupCard.test.tsx:71` - `expect(ptBR.Signup.passwordHint).toContain(String(MIN_PASSWORD_LENGTH))`; `:72` - `expect(ptBR.Signup.passwordHint).not.toMatch(/letras e números/)`; catalog value at `messages/pt-BR.json:660` - `"Mínimo de 8 caracteres."` | ✅ PASS |

**Status**: ✅ All ACs covered

**Load-bearing claim independently verified**: read `lib/account/settings.ts` directly (not taking spec.md's word for it). `validateNewPassword` (lines 18–24) checks only `password.length >= MIN_PASSWORD_LENGTH && password.length <= MAX_PASSWORD_LENGTH` — no regex, no character-class check, no complexity rule of any kind. The catalog copy ("Mínimo de 8 caracteres.") accurately describes the only rule enforced. Confirmed.

---

## Discrimination Sensor

| Mutation | File:line                 | Description                                                                                  | Killed?                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------- | ------------------------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1        | `app/signup/page.tsx:18`  | Reverted `max-w-[420px]` → `max-w-[380px]`                                                   | ❌ Survived (18/18 SignupCard tests still pass) — **expected, not a gap**: no test file exists anywhere under `app/{signup,login,verify,password-reset}` (confirmed via `find`, empty result before mutation), matching the spec's own Independent Test method ("read the rendered className … no dedicated page-level test exists … consistent with existing convention"). No fix task warranted; this is a scoped, acknowledged absence of coverage across all 4 auth shells, not new to this diff. |
| 2        | `messages/pt-BR.json:660` | Reverted `passwordHint` → design's literal `"Mínimo de 8 caracteres, com letras e números."` | ✅ Killed — `components/auth/SignupCard.test.tsx:72` failed as expected: `expected 'Mínimo de 8 caracteres, com letras e …' not to match /letras e números/`                                                                                                                                                                                                                                                                                                                                          |

**Sensor depth**: lightweight (2 mutations, proportional to a small visual-parity fix)
**Result**: 1/2 killed by test; the 1 survivor is a documented, spec-acknowledged structural absence of automated page-shell tests, not a weak assertion. **Sensor: PASS** (no discriminating gap found in code the spec claims is test-covered).

**Isolation**: scratch git worktree at a temp path, `node_modules` symlinked in (no reinstall). `git status --porcelain` on the real tree was empty before sensor work and empty after `git worktree remove --force`.

---

## Code Quality

| Principle                                                | Status                                                                                                                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimum code                                             | ✅ 5 lines added across page/component, 1 catalog key, 1 test                                                                                                           |
| Surgical changes                                         | ✅ Only `app/signup/page.tsx`, `components/auth/SignupCard.tsx`, its test, `messages/pt-BR.json` touched                                                                |
| No scope creep                                           | ✅ Login/PasswordReset/Verify cards untouched; 4-page-wrapper-block consolidation correctly left out of scope per spec.md                                               |
| Matches patterns                                         | ✅ Uses the existing `FieldDescription` shadcn primitive (`components/ui/field.tsx:141`), not a new one; catalog lookup via `t("passwordHint")`, not a hardcoded string |
| Spec-anchored outcome check (asserted values match spec) | ✅                                                                                                                                                                      |
| Per-layer Coverage Expectation met                       | ✅ for AUTH-02 (component-level, 1:1); AUTH-01 has no page-level test convention in this repo (confirmed structural, not a gap in this diff)                            |
| Every test maps to a spec requirement                    | ✅ the one new test (`SignupCard.test.tsx:68-73`) maps directly to AUTH-02                                                                                              |
| Documented guidelines followed                           | CLAUDE.md's "UI labels come from catalog lookups" and shadcn primitive-reuse rules — followed                                                                           |

---

## Edge Cases

Spec.md lists no explicit Edge Cases section beyond the Out of Scope table (checked: neither out-of-scope item was touched).

---

## Gate Check

- **Gate command**: `npx vitest run --project dom components/auth`, `npx tsc --noEmit -p .`, `npx eslint components/auth app/signup`
- **Result**: vitest 52 passed, 0 failed, 0 skipped; tsc clean (no output); eslint clean (no output)
- **Test count before feature**: 51 (52 − 1 new test added by this commit, confirmed by diff stat `+12` lines adding one `it(...)`)
- **Test count after feature**: 52
- **Delta**: +1 new test
- **Skipped tests**: none
- **Failures**: none

---

## Requirement Traceability Update

| Requirement | Previous Status           | New Status                            |
| ----------- | ------------------------- | ------------------------------------- |
| AUTH-01     | Verified (author-claimed) | ✅ Verified (independently confirmed) |
| AUTH-02     | Verified (author-claimed) | ✅ Verified (independently confirmed) |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 3/3 ACs matched spec outcome, 0 spec-precision gaps
**Sensor**: 1/2 killed; 1 survivor is a documented structural non-gap (no page-shell test convention exists anywhere in this repo, not introduced or hidden by this diff)
**Gate**: 3/3 commands passed (vitest, tsc, eslint)

**What works**: Signup card renders at 420px; password hint renders from the catalog, states only the real `MIN_PASSWORD_LENGTH` rule, and is asserted not to claim the unenforced letters+numbers complexity rule the design's literal copy would have implied. The load-bearing claim (`lib/account/settings.ts` has no complexity check) was independently verified by reading the file directly.

**Issues found**: None requiring a fix task.

**Next steps**: None. Feature is done.
