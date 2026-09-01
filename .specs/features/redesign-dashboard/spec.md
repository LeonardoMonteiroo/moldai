# Dashboard Visual Refinement Specification

## Problem Statement

The MoldAI redesign handoff (`docs/design/README.md`, `docs/design/screens/Dashboard.dc.html`, `docs/design/screenshots/dashboard.png`) is the source of truth for the Dashboard screen's visual layout. The 4 content/behavior changes it called for already shipped (#232-#235). What's left is a pixel-level comparison of `components/dashboard/*` against the reference — closing real spacing/type-scale divergences within the existing `moldai-ui` token vocabulary, not new content.

## Goals

- [ ] Every spacing/typography value in the Dashboard's onboarding checklist card and its surrounding layout matches the `.dc.html` reference exactly (not "close enough").
- [ ] No new tokens, colors, or copy introduced — only existing `moldai-ui` tokens and the existing i18n catalog.

## Out of Scope

| Feature                                                                     | Reason                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PageHeader`/`AppShell` header chrome (wordmark, credits pill, avatar menu) | Shared across all 11 screens, not Dashboard-specific; already a real working dropdown (richer than the static `.dc.html` mockup) — a header-wide pass is its own cross-cutting piece of work, not incidental Dashboard scope. |
| Pattern card hover/empty states, `PatternGrid` search/filter controls       | Compared against the reference and already match (same tokens, same structure, same 4-column grid, same hover-reveal "…" button) — no divergence found.                                                                       |
| Spacing between `PatternGrid` and the `CreditsCard`/`RecentUsageCard` row   | Not visible in `dashboard.png` (screenshot is cut off before that region) — no reference to compare against, so no claim is made either way.                                                                                  |
| Loading/error states (`role="status"` / `role="alert"` full-screen states)  | Structure and copy already match the `.dc.html`'s skeleton/error `sc-if` branches; no styling divergence found.                                                                                                               |

---

## Assumptions & Open Questions

| Assumption / decision                                                          | Chosen default                                                                                                             | Rationale                                                                                                                                                                                                                                                                  | Confirmed? |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| No live browser render was captured (no dev stack running)                     | Compare `.dc.html` exact style values + `dashboard.png` against the current TSX/Tailwind classes read directly from source | The `.dc.html` carries literal inline `style` px values, which is a reliable ground truth without needing to boot Postgres/Redis/Mailpit and complete a signup+verify flow per screen                                                                                      | y          |
| Checklist item font-size (design: 13px for item title) vs. nearest scale token | Leave item title on `text-ui` (12.5px) — do not change                                                                     | 13px has no matching token (`text-ui`=12.5, `text-control`=13.5) and the gap is small/ambiguous either direction; the header title's 13.5px, by contrast, is an exact match to an unused existing token (`text-control`), which is the class of divergence this pass fixes | y          |

**Open questions:** none — all resolved above.

---

## User Stories

### P1: Checklist card matches the reference's spacing and type scale ⭐ MVP

**User Story**: As a user of the redesigned Dashboard, I want the "Comece com o pé direito" card's internal spacing and heading size to match the approved design, so the shipped screen isn't a visibly looser/heavier version of what was signed off.

**Why P1**: This is the only concrete, verifiable divergence with a reference value to check against.

**Acceptance Criteria**:

1. The system SHALL render the checklist card with `14px` vertical / `16px` horizontal padding and `10px` gap between its header row, progress bar, and item list (`docs/design/screens/Dashboard.dc.html:128`, `padding: 14px 16px`, `gap: 10px`).
2. The system SHALL render the checklist card's title ("Comece com o pé direito · N de 5") at the `text-control` (13.5px) scale (`Dashboard.dc.html:130`, `font-size: 13.5px`).
3. The system SHALL render a `1px` top divider (`--color-border`) between consecutive checklist items, with `9px` vertical row padding (`Dashboard.dc.html:140`, `border-top: 1px solid var(--color-border)`, `padding: 9px 2px`).
4. The system SHALL render the checklist's progress bar at `5px` height (`Dashboard.dc.html:135`, `height: 5px`), distinct from the default `Progress` primitive's `8px` height used elsewhere (`ChatPanel`'s generation progress).

**Independent Test**: Render `OnboardingChecklistCard` with a `dom`-project RTL test and assert the rendered classes/styles carry the exact values above.

---

### P2: No compounded gap between the checklist card and the pattern grid

**User Story**: As a user, I want consistent spacing between the Dashboard's stacked sections, so the gap after the checklist card doesn't read as an accidental extra block of whitespace.

**Why P2**: A real, measurable layout bug (not a subjective judgment call) — `DashboardShell`'s `gap-4` (16px) and `PatternGrid`'s own `pt-[22px]` currently stack, producing 38px between the checklist card and the "N moldes" row where the reference specifies a flat `16px` between every direct child of the content column (`Dashboard.dc.html:104`, one `padding: 22px` wrapper with `gap: 16px`).

**Acceptance Criteria**:

1. WHEN the checklist card is shown THEN the system SHALL render exactly `16px` of vertical space between the checklist card's bottom edge and the pattern grid's title row.
2. WHEN the checklist card is dismissed or absent (`checklist` is `null`) THEN the system SHALL still render `22px` of top inset before the pattern grid's title row (unchanged from today).
3. The system SHALL preserve the existing `22px` horizontal inset on every row (unchanged).

**Independent Test**: Inspect the rendered class list of the wrapping elements in a `dom` test (or visually in the running dev server) and confirm no double-padding remains.

---

## Edge Cases

- IF the onboarding checklist has been dismissed (`localStorage` flag set) THEN the pattern grid SHALL still get the correct `22px` top inset on its own (P2, AC2) — covered by existing `OnboardingChecklistCard` dismiss tests plus the new spacing assertion.
- IF `credits`/`checklist` are still `null` (pre-first-paint) THEN no layout change in this spec applies (unaffected paths).

---

## Requirement Traceability

| Requirement ID | Story                           | Phase   | Status   |
| -------------- | ------------------------------- | ------- | -------- |
| DASH-01        | P1: Checklist card spacing/type | Execute | Verified |
| DASH-02        | P1: Checklist card spacing/type | Execute | Verified |
| DASH-03        | P1: Checklist card spacing/type | Execute | Verified |
| DASH-04        | P1: Checklist card spacing/type | Execute | Verified |
| DASH-05        | P2: No compounded gap           | Execute | Pending  |
| DASH-06        | P2: No compounded gap           | Execute | Pending  |

**Coverage:** 6 total, 6 mapped to tasks (implicit — Tasks phase skipped, Medium scope, <10 tasks), 0 unmapped.

---

## Success Criteria

- [ ] `npx vitest run --project dom components/dashboard` passes with new assertions covering DASH-01..06.
- [ ] `npm run lint` and `npm run build` (typecheck) pass.
- [ ] No new hex values, `text-[Npx]`, or hardcoded pt-BR strings introduced (mechanical hook + `moldai-conventions` agent both clean).
