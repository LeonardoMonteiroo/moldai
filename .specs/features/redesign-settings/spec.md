# Configurações Visual Refinement Specification

## Problem Statement

`docs/design/screens/Configuracoes.dc.html` is the redesign reference for `/settings`. Comparing it against `SettingsShell.tsx` found two real gaps the redesign README's own "visual refinement, not content change" characterization undersold: the Perfil section is missing an "Ateliê"/"Telefone" field pair (needs new `User` columns + a migration) and an account-summary card (avatar, plan/credits progress, member-since, pattern count) that doesn't exist at all today. User confirmed (2026-09-01, via AskUserQuestion): implement the account-summary card only, using data that requires no schema migration; leave Ateliê/Telefone out.

## Goals

- [ ] The Perfil section (`?section=profile`) renders a right-rail account-summary card matching `Configuracoes.dc.html:90-111`: avatar + name/email, plan name + credits progress bar + renewal note, and a member-since + pattern-count line.
- [ ] Every field the card shows is real: plan/credits (already fetched), `User.createdAt` (already a column, no migration — just added to the existing `getUserById`/`getUserByEmail`/`createUser` selects), and a real pattern count (a new, cheap `COUNT` query, not `listPatternsForUser`'s capped, blob-parsing read).

## Out of Scope

| Feature                                                                           | Reason                                                                                                                                                                         |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| "Ateliê" and "Telefone" fields in the Perfil form (`Configuracoes.dc.html:68-79`) | Needs new `User` columns and a migration, plus `updateProfile` API changes — real schema work, not visual parity. User explicitly deferred this (AskUserQuestion, 2026-09-01). |

---

## Assumptions & Open Questions

| Assumption / decision  | Chosen default                                                                            | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                    | Confirmed? |
| ---------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Avatar initials source | `initialsFromEmail(email)`, not name-derived                                              | Matches `PageHeader`'s own avatar convention exactly — the design's static "AN" mockup value is ambiguous between name- and email-derived, so this follows the app's existing precedent rather than inventing a second initials rule.                                                                                                                                                                                        | y          |
| Blank-name display     | Falls back to showing the email as the primary (bold) line, with no redundant second line | `User.name` is nullable/can be blank; the design's mockup only shows the always-has-a-name case. Showing an empty bold line, or the email twice, would look broken.                                                                                                                                                                                                                                                          | y          |
| `UserRecord.createdAt` | Added as a required field (not optional)                                                  | The real Prisma column is non-nullable (`DateTime @default(now())`); every real `UserRecord` has one. Matches this codebase's own "unrepresentable, not merely unreachable" precedent for guaranteed-present server data (the `PatternRecord.updatedAt` decision in CLAUDE.md). Ripples into ~15 test fixtures across `app/api/*`, `lib/auth/*`, `lib/account/*` — a one-time, mechanical cost for a compile-time guarantee. | y          |

**Open questions:** none.

---

## User Stories

### P1: Account-summary card renders real data ⭐ MVP

**Acceptance Criteria**:

1. The system SHALL render the card only on the Perfil section, as a second grid column beside `ProfileSection`.
2. The system SHALL show the account's plan name and `{balance}/{total}` credits, with the same 100%-clamped progress bar `PageHeader`'s own credits bar uses.
3. The system SHALL show a renewal note citing the real `renewsInDays`.
4. The system SHALL show "Membro desde {mês por extenso} de {ano} · N moldes", where N is a real, unpadded `COUNT` of the account's patterns (not `listPatternsForUser`'s `MAX_PATTERNS_LISTED`-capped list length).

**Independent Test**: `AccountSummaryCard.test.tsx` renders the component directly asserting each field's text/attribute; `SettingsShell.test.tsx`'s existing panel-exclusivity tests updated with the two new required props.

---

## Requirement Traceability

| Requirement ID | Story                    | Phase   | Status   |
| -------------- | ------------------------ | ------- | -------- |
| STGS-01        | P1: Account-summary card | Execute | Verified |
| STGS-02        | P1: Account-summary card | Execute | Verified |
| STGS-03        | P1: Account-summary card | Execute | Verified |
| STGS-04        | P1: Account-summary card | Execute | Verified |

**Coverage:** 4 total, 4 mapped, 0 unmapped.

---

## Success Criteria

- [x] `npx vitest run --project dom components/settings` passes (61/61: 56 pre-existing + 5 new `AccountSummaryCard` tests).
- [x] `npx vitest run --project node` passes (305/305) — the `UserRecord.createdAt` addition rippled into ~15 test fixtures across `app/api/*`, `lib/auth/*`, `lib/account/*`, `lib/db/users.test.ts`, all updated.
- [x] `npx eslint` and `npx tsc --noEmit -p .` pass, full repo.
- [x] No new hex values, `text-[Npx]` sizes, or hardcoded pt-BR strings (new copy goes through `AccountSummaryCard`'s own catalog namespace).
- [x] No database migration — `createdAt` was already a column; `countPatternsForUser` is a plain `prisma.pattern.count`.
