# Landing Visual Refinement Specification

## Problem Statement

`docs/design/screens/Landing.dc.html` is the redesign reference for the public `/` landing page. `LandingNav`, `CreditsSection`'s dynamic price/credit figures (`PLAN_CREDITS`/`PLAN_PRICE_CENTS`/`formatBRL`), and every section's copy already match exactly. Comparing every section's literal padding/gap/width values against the reference found 5 concrete, verifiable spacing divergences — all asymmetric top/bottom padding a uniform `py-N` utility rounds away, plus one wrong radius token and one missing width cap.

## Goals

- [ ] `LandingHero`, `StepsSection`, `CreditsSection`, `LandingFooter` each match `Landing.dc.html`'s literal padding values exactly (not the nearest uniform Tailwind step).
- [ ] `LandingHero`'s text column caps at the design's `460px`; its image container uses the same `--radius-card` (14px-equivalent) every other card on this page uses, not `--radius-modal` (16px).
- [ ] `CreditsSection`'s plan card matches the design's `380px` width and `34px` gap.

## Out of Scope

| Feature                                                                             | Reason                                                                                                                                                                                                                                                                                                                    |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Section heading size (`text-display`, 26px) vs. the design's literal `30px`         | No token in `app/globals.css`'s closed 8-step scale sits at 30px, and CLAUDE.md states that scale's sweep is finished ("staying at zero is the rule"). Introducing a new token for 3 headings on one page is an architecture-scope decision, not a visual-parity fix — flagged, not silently matched or silently ignored. |
| Hero image's exact shadow softness (`0 18px 44px rgba(28,28,25,.09)` in the design) | Neither `--shadow-card` (`0 2px 10px / .07`) nor `--shadow-modal` (`0 12px 34px / .22`) is a close match, and inventing a third one-off shadow value for a single element isn't warranted. Left on the pre-existing `shadow-modal`.                                                                                       |
| `LandingNav`                                                                        | Already matches the design's `16px 30px` padding / `26px` gap exactly.                                                                                                                                                                                                                                                    |
| `FaqSection`                                                                        | Already matches the design's `56px` uniform padding exactly.                                                                                                                                                                                                                                                              |

---

## Assumptions & Open Questions

None.

**Open questions:** none — every fix below cites an exact, unambiguous value from `Landing.dc.html`.

---

## User Stories

### P1: Every section's padding matches the design's literal values ⭐ MVP

**Acceptance Criteria**:

1. The system SHALL render `LandingHero`'s row at `padding-top: 64px` / `padding-bottom: 60px` (`Landing.dc.html:37`).
2. The system SHALL render `StepsSection`'s row at `padding-top: 60px` / `padding-bottom: 56px` (`Landing.dc.html:55`).
3. The system SHALL render `CreditsSection`'s row at `padding-top: 56px` / `padding-bottom: 64px` (`Landing.dc.html:91`).
4. The system SHALL render `LandingFooter`'s row at `padding-top: 22px` / `padding-bottom: 34px` (`Landing.dc.html:124`).

### P2: Hero column width/radius and plans-card width/gap match the design

**Acceptance Criteria**:

1. `LandingHero`'s text column SHALL cap at `max-width: 460px` (`Landing.dc.html:38`).
2. `LandingHero`'s image container SHALL use `rounded-card`, not `rounded-modal` (`Landing.dc.html:48`'s `border-radius: 14px` matches `--radius-card`, not `--radius-modal`).
3. `CreditsSection`'s plan-card column SHALL be `380px` wide with a `34px` gap from the left column (`Landing.dc.html:91`).

---

## Requirement Traceability

| Requirement ID | Story               | Phase   | Status   |
| -------------- | ------------------- | ------- | -------- |
| LAND-01        | P1: Section padding | Execute | Verified |
| LAND-02        | P1: Section padding | Execute | Verified |
| LAND-03        | P1: Section padding | Execute | Verified |
| LAND-04        | P1: Section padding | Execute | Verified |
| LAND-05        | P2: Width/radius    | Execute | Verified |
| LAND-06        | P2: Width/radius    | Execute | Verified |
| LAND-07        | P2: Width/radius    | Execute | Verified |

**Coverage:** 7 total, 7 mapped, 0 unmapped.

---

## Success Criteria

- [x] `npx vitest run --project dom components/landing` passes (13/13, 4 new spacing tests).
- [x] `npx eslint components/landing` and `npx tsc --noEmit -p .` pass.
- [x] No new hex values, `text-[Npx]` sizes, or hardcoded pt-BR strings (all fixes are Tailwind arbitrary-value class edits only).
