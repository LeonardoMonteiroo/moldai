# Planos Visual Refinement Specification

## Problem Statement

`docs/design/screens/Planos.dc.html` is the redesign reference for the public `/planos` pricing screen. `PricingPage.tsx` already carries an extensive, explicitly-documented redesign pass (its own header comment cites `docs/decisions.md` for deliberate deviations: the plan-card border treatment, the annual toggle, the payment note). Comparing every literal spacing value against the reference found only 2 concrete divergences left; everything else — including two values that look like drift but are documented, deliberate decisions — already matches.

## Goals

- [ ] Hero section padding matches the design's asymmetric `56px` top / `44px` bottom (`Planos.dc.html:36`), not a uniform `40px`.
- [ ] The gap between the Grátis card and the paid-plan grid matches the design's `18px` (`Planos.dc.html:52`), not `14px` (which is correctly the _internal_ gap of the paid-plan grid itself, per `Planos.dc.html:79` — a different, smaller value for a different gap).

## Out of Scope

| Feature                                                                                                                                                                      | Reason                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Planos headline using `text-hero` (54px) instead of the design's literal `44px`                                                                                              | Not a drift — CLAUDE.md documents this as a deliberate, existing decision: `--text-hero` "sits above `--text-display`... shared by LandingHero and the Planos hero headline." Reusing the closed 8-step scale's existing top step rather than adding a 9th token for one headline.                                                                                                                                                                                                                  |
| Nav showing "Formatos" instead of "Dúvidas" as the middle item (`Planos.dc.html:29`)                                                                                         | `LandingNav` is one shared component reused by both `/` and `/planos` (confirmed in `LandingNav.tsx`'s own comment, #218) and correctly shows "Dúvidas" on both — matching `Landing.dc.html`'s nav exactly. `Planos.dc.html`'s "Formatos" reads as a mockup-authoring inconsistency between the two design files (same nav, drawn twice, one file has a typo/placeholder difference), not a real per-page requirement — there's no third nav variant described anywhere in `docs/design/README.md`. |
| Merging the design's two separate sections (plan-cards padding `34px/34px/8px`, costs padding `34px/34px/20px`) into `PricingPage`'s single wrapper with an internal `gap-6` | An existing, reasonable simplification already in the shipped code (not introduced by this pass) — splitting back into two literally-padded sections for a ~15-20px total spacing difference is disproportionate churn for a page this deliberately already built.                                                                                                                                                                                                                                  |
| Free card's fixed `260px` width vs. the design's flexible `250-300px` range                                                                                                  | Functionally equivalent at the viewport widths this page targets; not a visible divergence.                                                                                                                                                                                                                                                                                                                                                                                                         |

---

## Assumptions & Open Questions

None — both fixes cite an exact, unambiguous value from `Planos.dc.html`, and every Out-of-Scope item above is a verified non-issue, not a deferred one.

**Open questions:** none.

---

## User Stories

### P1: Hero and card-row spacing match the design ⭐ MVP

**Acceptance Criteria**:

1. The system SHALL render the hero section at `padding-top: 56px` / `padding-bottom: 44px`.
2. The system SHALL render `18px` of gap between the Grátis card and the paid-plan grid, distinct from the paid-plan grid's own `14px` internal gap.

**Independent Test**: `PricingPage.test.tsx` asserts the hero container carries `pt-14`/`pb-11` (Tailwind's exact 56px/44px steps) and the card row carries `gap-[18px]`.

---

## Requirement Traceability

| Requirement ID | Story                     | Phase   | Status   |
| -------------- | ------------------------- | ------- | -------- |
| PLAN-01        | P1: Hero/card-row spacing | Execute | Verified |
| PLAN-02        | P1: Hero/card-row spacing | Execute | Verified |

**Coverage:** 2 total, 2 mapped, 0 unmapped.

---

## Success Criteria

- [x] `npx vitest run --project dom components/pricing` passes (13/13, 1 new spacing test).
- [x] `npx eslint components/pricing` and `npx tsc --noEmit -p .` pass.
- [x] No new hex values, `text-[Npx]` sizes, or hardcoded pt-BR strings.
