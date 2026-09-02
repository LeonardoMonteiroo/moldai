# Bases do ateliê Visual Refinement Specification

## Problem Statement

`docs/design/screens/Bases do atelie.dc.html` is the redesign reference for `/slopers`. Comparing it against `SlopersShell.tsx`/`SloperGrid.tsx`/`SloperCard.tsx` found one gap beyond visual parity — search + garment-type filtering, present in the design and already shipped on the Dashboard's `PatternGrid` (same store-slice shape: `search`/`typeFilter`/`filteredX`), but entirely absent from `/slopers` (`useSlopersStore` has no such state at all). User confirmed (2026-09-02, via `AskUserQuestion`): implement it, replicating the Dashboard's existing pattern.

The remaining divergences are visual/content-placement fixes reusing data the screen already has (no new fields, no migration).

## Goals

- [ ] `/slopers` gets real search (by name) + garment-type filter, mirroring `dashboardStore`'s `search`/`typeFilter`/`filteredPatterns` shape and `PatternGrid`'s control layout, matching `Bases do atelie.dc.html:112-129`.
- [ ] The screen's description text moves from the top `PageHeader` into the content column, next to the count label, matching `Bases do atelie.dc.html:105-110` — and is rewritten to explain the mechanism (open a pattern, "Salvar como base"), per the design's own copy.
- [ ] Each card shows a garment-type badge overlaid on its thumbnail, matching `Bases do atelie.dc.html:149`.
- [ ] The empty state (zero slopers) gains a "Ir para meus moldes" CTA, matching `Bases do atelie.dc.html:137-139`; a distinct "no matches" state covers a nonzero list that a search/filter narrows to zero.
- [ ] No new content beyond what's needed for search/filter — everything else repositions or restyles data the screen already fetches.

## Out of Scope

| Item                                                                                                                   | Reason                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| The type-filter's option list matching the design's 4 illustrative types (Blusa/Vestido/Saia/Calça, omitting Camiseta) | The design's own `SLOPERS` demo data simply never includes a t-shirt sloper — not a deliberate scope cut. `PatternGrid`'s existing filter already lists all 5 `GARMENT_TYPES`; matching that established, already-shipped precedent is more correct than reproducing the mockup's illustrative subset. |
| `SloperCard`'s "⋯" menu opacity/hover behavior                                                                         | Already matches the design (`opacity-0` + `group-hover:opacity-100`) — verified, no change needed.                                                                                                                                                                                                     |

---

## Assumptions & Open Questions

| Assumption / decision              | Chosen default                                                                                                                                                                                                                                                                | Rationale                                                                                                                                                                                                                                             | Confirmed? |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Search/filter implementation shape | New `search`/`typeFilter` fields + `setSearch`/`setTypeFilter` actions on `useSlopersStore`, plus a pure `filteredSlopers()` function                                                                                                                                         | Mirrors `lib/dashboardStore.ts`'s `search`/`typeFilter`/`filteredPatterns` exactly — same pattern, different store, per the user's explicit choice to replicate it.                                                                                   | y          |
| Subtitle copy revision             | Replaced with the design's own text: "Uma base nasce de um molde: abra um molde no editor e use "Salvar como base" para guardá-lo aqui como ponto de partida reutilizável." (curly quotes, matching the existing `Slopers.emptyDescription` convention in the same namespace) | Reviewed via the `humanizer` skill: sourced directly from the design mockup, no AI-writing tells, curly quotes already established in this namespace, formal register preserved.                                                                      | y          |
| Empty-state CTA button variant     | `outline`, per the design (`Bases do atelie.dc.html:138`), even though `PatternGrid`'s own empty-state button is the default variant                                                                                                                                          | Matches this screen's own design file, which is explicit about it; the two screens' empty states already differ in destination (`/` vs. creating a pattern directly), so the visual divergence from `PatternGrid` is not an inconsistency to resolve. | y          |
| Badge label source                 | `TechSheetTab.garmentType.*` (already used for `SloperCard`'s meta line)                                                                                                                                                                                                      | No new catalog data — same lookup, second location.                                                                                                                                                                                                   | y          |

**Open questions:** none.

---

## User Stories

### P1: Search and garment-type filter work on `/slopers` ⭐ MVP

**Acceptance Criteria**:

1. The system SHALL filter the sloper grid by a case-insensitive substring match on `name`, live as the user types into a search input.
2. The system SHALL filter the sloper grid by `garmentType` via a select control offering "Todos os tipos" plus every `GarmentType`.
3. The system SHALL distinguish "zero slopers at all" (with the design's empty-state CTA) from "search/filter narrowed a nonzero list to zero" (a different message, no CTA), mirroring `PatternGrid`'s `isTrulyEmpty`/`hasNoMatches` split.

**Independent Test**: a new pure `filteredSlopers()` unit test (mirroring `filteredPatterns`'s own test shape) plus `SloperGrid.test.tsx` covering both empty branches and a live filter interaction.

### P2: Screen matches the design's content layout ⭐ MVP

**Acceptance Criteria**:

1. The system SHALL render the count label and description text together in the content column (not the top header), with `AppShell` receiving no `subtitle` for this screen.
2. Each card SHALL show a garment-type `Badge` (`variant="quiet" size="chip"`) positioned over its thumbnail's top-left corner.
3. The zero-slopers empty state SHALL include a button linking to `/`.

**Independent Test**: `SlopersShell.test.tsx` (subtitle relocation) and `SloperCard.test.tsx`/`SloperGrid.test.tsx` (badge, empty-state CTA).

---

## Requirement Traceability

| Requirement ID | Story              | Phase   | Status  |
| -------------- | ------------------ | ------- | ------- |
| SLPR-01        | P1: Search/filter  | Execute | Pending |
| SLPR-02        | P1: Search/filter  | Execute | Pending |
| SLPR-03        | P1: Search/filter  | Execute | Pending |
| SLPR-04        | P2: Content layout | Execute | Pending |
| SLPR-05        | P2: Content layout | Execute | Pending |
| SLPR-06        | P2: Content layout | Execute | Pending |

**Coverage:** 6 total, 6 mapped, 0 unmapped.

---

## Success Criteria

- [ ] `npx vitest run --project dom components/slopers` and `npx vitest run --project node lib/slopersStore.test.ts` (or equivalent) pass.
- [ ] `npx vitest run` (full suite) passes — no regressions.
- [ ] `npx eslint` and `npm run build` (typecheck) pass, full repo.
- [ ] No new hex values, `text-[Npx]` sizes, or hardcoded pt-BR strings.
- [ ] No database migration, no new `Sloper` fields — filtering runs client-side over the already-fetched list, matching `PatternGrid`.
