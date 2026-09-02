# Medidas e grades Visual Refinement Specification

## Problem Statement

`docs/design/screens/Medidas e grades.dc.html` is the redesign reference for `/size-charts`. Comparing it against `SizeChartsShell.tsx`/`SizeChartLibrary.tsx`/`SizeChartTable.tsx` found one structural gap beyond visual parity and several concrete visual/layout divergences, all reusing data the screen already fetches (no new fields, no migration).

**Structural gap (user confirmed, 2026-09-02, via free-text clarification: "1" = add the sidebar):** the design shows the app-level nav sidebar (Meus moldes / Medidas e grades / Bases e modelos) on the left, matching Dashboard and Bases do ateliê. `/size-charts` currently renders none — `components/dashboard/Sidebar.tsx` has comments treating that omission as deliberate (`// /size-charts renders no sidebar, so this entry is never the active one.`). Confirmed: add the sidebar.

## Goals

- [x] `/size-charts` renders the shared `Sidebar` (active section "Medidas e grades"), matching Dashboard/Bases do ateliê.
- [x] `SizeChartLibrary`'s width, header block (title+subtitle, currently only shown in the top `PageHeader`), section grouping ("Do sistema" / "Minhas grades" with eyebrow labels), card structure (left accent bar), and footer order match `Medidas e grades.dc.html:144-191`.
- [x] `SizeChartTable`'s header row gains the state badge and the "Usar esta grade" control for read-only (system) charts, and the override-legend caption, matching `Medidas e grades.dc.html:195-236`.
- [x] No new content, no new `User`/`SizeChart` fields, no migration — every fix repositions or regroups data the screen already has.

## Out of Scope

| Item                                                                                 | Reason                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sidebar column width (200px in the design vs the shared component's existing 186px)  | CLAUDE.md documents 186px as the deliberate, cross-screen convention (`AppShell.tsx:30`); Dashboard and Bases do ateliê already ship at 186px and were not revisited. Changing it here would silently diverge those two already-verified screens from their own design files too — out of scope for a single-screen pass.                                                                      |
| An "activate" control for a non-active custom (editable) chart, in the header row    | The design's finite state machine (`editingRule`/`dirty` demo states) never depicts a non-active custom chart, so it gives no placement for this control. The existing bottom-of-page "Usar esta grade"/"Grade ativa" button is the only real affordance for this case and stays exactly where it is; only the _read-only_ case (which the design does depict, in the header) is repositioned. |
| Select width for "Tipo de corpo" (156px in the design vs 170px today)                | 170px was already sized for the longest pt-BR body-type label; a 14px reduction is cosmetic noise, not a finding worth risking truncation for.                                                                                                                                                                                                                                                 |
| Sub-token caption sizes (design's 11px vs the app's closed-scale `text-meta` 11.5px) | CLAUDE.md: "the sweep is finished and staying at zero is the rule" — no new type-scale step is introduced for a 0.5px difference already absorbed by the nearest existing token, consistent with every prior redesign screen.                                                                                                                                                                  |

---

## Assumptions & Open Questions

| Assumption / decision                          | Chosen default                                                                                                                                      | Rationale                                                                                                                                                                                                                                                                                                                                                                                | Confirmed? |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Sidebar's `active` union gains `"size-charts"` | Widened rather than a second component                                                                                                              | Matches the existing `Sidebar` reuse pattern across Dashboard/Slopers (CLAUDE.md: "Sidebar takes active and onNewPattern as props... because /slopers renders the same component").                                                                                                                                                                                                      | y          |
| Sidebar's bottom "＋ Novo molde" button        | Made conditional (`onNewPattern` optional); omitted on `/size-charts`                                                                               | The design's Medidas e grades sidebar (`.dc.html:46-61`) has no such button — only nav + a flex spacer. Creating a blank pattern isn't this screen's action; the library column already offers "＋ Nova grade".                                                                                                                                                                          | y          |
| Top `PageHeader` subtitle                      | Dropped from the top header, moved into `SizeChartLibrary`'s own header block                                                                       | The design's top header (`.dc.html:26-42`) shows only the `h1` title, no subtitle; the subtitle text reappears verbatim inside the library column (`.dc.html:147`). Same string (`SizeCharts.subtitle`), relocated — not new copy.                                                                                                                                                       | y          |
| "Do sistema"/"Minhas grades" section grouping  | Split the existing flat `charts` list by `c.isSystem`, add two uppercase eyebrow labels                                                             | The design groups the identical `isSystem` boolean the cards already branch on (system vs custom badge text) into two labeled sections (`.dc.html:151-184`) instead of one flat list. No new field.                                                                                                                                                                                      | y          |
| `houseStandardNote` placement                  | Rendered once after the whole "Do sistema" group, not per system card                                                                               | The design shows it once, after both system cards (`.dc.html:162`), not repeated inside each card (today's per-card placement).                                                                                                                                                                                                                                                          | y          |
| Header-row state badge on `SizeChartTable`     | New badge, real state only: "Grade do sistema" when read-only, "Grade ativa" when the selected chart is actually the active one, no badge otherwise | The design's own demo data (`tagLabel: isReadOnly ? "grade do sistema" : "grade ativa"`) labels _every_ editable chart "grade ativa" regardless of real active state — an artifact of the mockup's single-editable-chart demo, not a rule to reproduce literally (it would mislabel an inactive custom chart as active). Generalizing to the real `isActive` flag is the honest reading. | y          |

**Open questions:** none.

---

## User Stories

### P1: `/size-charts` renders the shared nav sidebar ⭐ MVP

**Acceptance Criteria**:

1. The system SHALL render `Sidebar` with `active="size-charts"` inside `SizeChartsShell`'s `AppShell`, marking "Medidas e grades" as the current page (`aria-current="page"`).
2. The system SHALL NOT render a "＋ Novo molde" button inside that sidebar instance.
3. `Sidebar` SHALL continue to render "＋ Novo molde" unchanged on Dashboard and Bases do ateliê (regression guard).

**Independent Test**: `Sidebar.test.tsx` covers the new `active="size-charts"` value and the omitted button when `onNewPattern` is absent; `SizeChartsShell.test.tsx` asserts the sidebar renders with the current page marked.

### P2: `SizeChartLibrary` matches the design's structure ⭐ MVP

**Acceptance Criteria**:

1. The library column SHALL be 252px wide (`.dc.html:144`).
2. The library column SHALL render its own title + subtitle header block, and the top `PageHeader` SHALL NOT receive a `subtitle` prop for this screen.
3. Charts SHALL render under two labeled sections, "Do sistema" and "Minhas grades", derived from the existing `isSystem` flag — no new field.
4. `houseStandardNote` SHALL render once, after the "Do sistema" section, not per card.
5. Each chart card SHALL show a 3px accent bar (olive when selected, transparent otherwise) beside its existing text content.
6. The footer SHALL render "＋ Nova grade" before the import control (today's order is reversed).

**Independent Test**: `SizeChartLibrary.test.tsx` (new/extended) asserts section headings render, `houseStandardNote` appears exactly once, and DOM order of the two footer controls.

### P3: `SizeChartTable`'s header row matches the design ⭐ MVP

**Acceptance Criteria**:

1. The header row SHALL show a state badge: "Grade do sistema" when the selected chart is read-only, "Grade ativa" when it is the real active chart, and no badge otherwise.
2. A read-only chart's header row SHALL show a "Usar esta grade" button that calls the existing `activate` action; this button SHALL NOT render for an editable chart.
3. The bottom-of-page activate control SHALL keep rendering for editable charts exactly as today (regression guard — the design gives no alternative placement for that case).
4. An editable chart's second header row SHALL show the "valor ajustado à mão, fora da regra" legend (new `SizeChartTable.overrideLegend` catalog key).

**Independent Test**: `SizeChartTable.test.tsx` (extended) asserts the badge text per state, the header "Usar esta grade" button's presence/absence and click behavior, and the legend's conditional render.

---

## Requirement Traceability

| Requirement ID | Story                 | Phase   | Status   |
| -------------- | --------------------- | ------- | -------- |
| SZCH-01        | P1: Sidebar           | Execute | Verified |
| SZCH-02        | P1: Sidebar           | Execute | Verified |
| SZCH-03        | P1: Sidebar           | Execute | Verified |
| SZCH-04        | P2: Library structure | Execute | Verified |
| SZCH-05        | P2: Library structure | Execute | Verified |
| SZCH-06        | P2: Library structure | Execute | Verified |
| SZCH-07        | P2: Library structure | Execute | Verified |
| SZCH-08        | P2: Library structure | Execute | Verified |
| SZCH-09        | P2: Library structure | Execute | Verified |
| SZCH-10        | P3: Table header      | Execute | Verified |
| SZCH-11        | P3: Table header      | Execute | Verified |
| SZCH-12        | P3: Table header      | Execute | Verified |
| SZCH-13        | P3: Table header      | Execute | Verified |

**Coverage:** 13 total, 13 mapped, 0 unmapped.

---

## Success Criteria

- [x] `npx vitest run --project dom components/dashboard/Sidebar.test.tsx components/size-charts` passes (8 + 6 + 7 + 48 = 69 tests).
- [x] `npx vitest run` — full suite passes: 3089 passed, 3 skipped (no regressions).
- [x] `npx eslint app lib components` and `npm run build` (typecheck) pass, full repo.
- [x] No new hex values, `text-[Npx]` sizes, or hardcoded pt-BR strings — new copy goes through `SizeChartLibrary.systemSectionLabel`/`myChartsSectionLabel` and `SizeChartTable.systemChartBadge`/`overrideLegend`, the only new catalog keys.
- [x] No database migration, no new `SizeChart`/`User` fields — every fix reuses `isSystem`/`isActive`/existing store actions.
