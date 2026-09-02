# Autenticação Visual Refinement Specification

## Problem Statement

`docs/design/screens/Autenticacao.dc.html` is the redesign reference shared by Login/Signup/PasswordReset/Verify (one card layout, `docs/design/README.md`). Comparing it against the shipped cards found the structure, copy, and field layout already match almost exactly (unsurprising — `LoginCard`/`SignupCard` already shipped the design's "Continuar com Google" button, #235). Two concrete, verifiable divergences remain.

## Goals

- [ ] Signup's card matches the design's wider `420px` width (`cardWidth` logic in `Autenticacao.dc.html:179`), instead of reusing the 380px every other auth card correctly uses.
- [ ] The password-requirement hint the design shows under Signup's password field (`Autenticacao.dc.html:75`) exists in the shipped card, with copy stating only the rule this app actually enforces.

## Out of Scope

| Feature                                                                                                                                          | Reason                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Consolidating the 4 near-identical page-wrapper blocks (`app/login`, `app/signup`, `app/verify`, `app/password-reset`) into one shared component | A code-quality refactor, not a visual divergence — out of scope for a redesign-parity pass.     |
| Login/PasswordReset/Verify card width                                                                                                            | Design's `cardWidth` is 380px for every state except signup/signupSent — already correct today. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default                                                                                       | Rationale                                                                                                                                                                                                                                                      | Confirmed? |
| --------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Password hint copy    | "Mínimo de 8 caracteres." (not the design's literal "Mínimo de 8 caracteres, com letras e números.") | `lib/account/settings.ts`'s `MIN_PASSWORD_LENGTH`/`MAX_PASSWORD_LENGTH` are the only enforced rule — no letters+numbers complexity check exists anywhere in the validation path. Copying the design's literal text would promise a rule the app doesn't check. | y          |

**Open questions:** none.

---

## User Stories

### P1: Signup card matches the design's width ⭐ MVP

**Acceptance Criteria**:

1. The system SHALL render `app/signup/page.tsx`'s card at `max-w-[420px]`.

**Independent Test**: Read the rendered className (no dedicated page-level test exists in this repo for any of the 4 auth page shells — consistent with existing convention, verified by `find app/{signup,login,verify,password-reset} -name "*.test.tsx"` returning nothing).

### P2: Signup shows its real password requirement

**Acceptance Criteria**:

1. The system SHALL render a password-requirement hint under Signup's password field, sourced from `Signup.passwordHint` in the catalog.
2. The hint text SHALL name only `MIN_PASSWORD_LENGTH`, never an unenforced complexity rule.

**Independent Test**: `SignupCard.test.tsx` asserts the hint renders and its text contains the real `MIN_PASSWORD_LENGTH` value while not matching a letters+numbers claim.

---

## Requirement Traceability

| Requirement ID | Story             | Phase   | Status   |
| -------------- | ----------------- | ------- | -------- |
| AUTH-01        | P1: Card width    | Execute | Verified |
| AUTH-02        | P2: Password hint | Execute | Verified |

**Coverage:** 2 total, 2 mapped, 0 unmapped.

---

## Success Criteria

- [x] `npx vitest run --project dom components/auth` passes (52/52).
- [x] `npx eslint components/auth app/signup` and `npx tsc --noEmit -p .` pass.
- [x] No new hex values, `text-[Npx]` sizes, or hardcoded pt-BR strings (`passwordHint` goes through the catalog).
