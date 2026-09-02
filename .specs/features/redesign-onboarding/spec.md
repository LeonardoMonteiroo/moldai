# Onboarding Visual Refinement Specification

## Problem Statement

`docs/design/screens/Onboarding.dc.html` is the redesign reference for the 3-step post-signup wizard. `OnboardingShell.tsx` already matches the design's step structure closely (work-style choice, measurement-chart choice with the import/fill options correctly disabled+badged "em breve", first-piece generation) — this pass found 2 concrete visual divergences, plus one real pre-existing accessibility bug in the shared `Progress` primitive that surfaced while fixing the first divergence.

## Goals

- [ ] The step indicator is a real linear progress bar (`Onboarding.dc.html:30`), not a 3-dot stepper — the design shows no dots anywhere.
- [ ] A selected work-style/measurement option uses a `2px` olive border (`Onboarding.dc.html:161`), not `1.5px`.
- [ ] `components/ui/progress.tsx`'s `value` prop actually reaches the underlying Radix `Root`, so `aria-valuenow`/`aria-valuemax` render on the DOM for every consumer (`OnboardingShell`, `OnboardingChecklistCard`, `ChatPanel`'s generation progress) — found while writing a test for the first goal that queried `aria-valuenow` and got `null`.

## Out of Scope

| Feature                                                                                                                                                          | Reason                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Making Step 2's "Importar planilha ou tabela" / "Preencher agora" real, interactive options with the design's own error-recovery UI (`Onboarding.dc.html:63-72`) | Already a settled, documented scope decision (CLAUDE.md: "Its two 'em breve' rows are disabled+badged, not hidden") — spreadsheet import exists elsewhere in the app (`/size-charts`, #12) but was deliberately never wired into onboarding specifically. Building that flow here is new feature work, not visual parity. |

---

## Assumptions & Open Questions

None.

**Open questions:** none.

---

## User Stories

### P1: Progress indicator matches the design ⭐ MVP

**Acceptance Criteria**:

1. The system SHALL render a `role="progressbar"` element with `aria-valuenow` equal to `round((step/3)*100)`, replacing the 3-dot stepper.
2. `Progress`'s `value` prop SHALL reach the underlying Radix `Root` so `aria-valuenow`/`aria-valuemax` render on the DOM for every consumer of the shared primitive, not just visually via the indicator's inline transform.

### P2: Selected option border matches the design

**Acceptance Criteria**:

1. A selected work-style option SHALL carry a `2px` (`border-2`) olive border, not `1.5px`.

---

## Requirement Traceability

| Requirement ID | Story                           | Phase   | Status   |
| -------------- | ------------------------------- | ------- | -------- |
| ONBD-01        | P1: Progress bar                | Execute | Verified |
| ONBD-02        | P1: Progress primitive a11y fix | Execute | Verified |
| ONBD-03        | P2: Selected-option border      | Execute | Verified |

**Coverage:** 3 total, 3 mapped, 0 unmapped.

---

## Success Criteria

- [x] `npx vitest run --project dom components/onboarding components/dashboard/OnboardingChecklistCard.test.tsx components/editor/ChatPanel.a11y.test.tsx` passes (broader sweep: 270/270 across editor+dashboard+onboarding+shared).
- [x] `npx eslint components/onboarding components/ui/progress.tsx` and `npx tsc --noEmit -p .` pass.
- [x] No new hex values, `text-[Npx]` sizes, or hardcoded pt-BR strings.
