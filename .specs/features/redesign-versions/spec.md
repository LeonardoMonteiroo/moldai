# Histórico de versões Visual & Structural Refinement Specification

## Problem Statement

`docs/design/screens/Versoes.dc.html` is the redesign reference for `/pattern/[id]/versions`. Comparing it against `VersionsShell.tsx`/`VersionList.tsx`/`VersionCompare.tsx` found a real structural gap beyond visual parity: the design unifies "browse versions" and "compare two versions" into ONE mechanism — a horizontal row of version cards (each with a real drafted-geometry thumbnail) where clicking any two cards selects them as "De"/"Para" for the comparison panel below. Today these are two independent mechanisms: `VersionList` is a vertical list with a "Restaurar" button per row and no thumbnails or selection; `VersionCompare` owns its own pair of "De"/"Para" `<Select>` dropdowns, entirely decoupled from the list. User confirmed (2026-09-02, via `AskUserQuestion`): implement the full restructuring.

## Goals

- [ ] Version cards render in a horizontal scrollable row, each with a real drafted-geometry thumbnail (not a fake icon), matching `Versoes.dc.html:114-144`.
- [ ] Clicking a card selects it as "De" or "Para" for the compare panel below, per the design's own swap/replace logic (`Versoes.dc.html:243-249`); selection state is shared between the card row and the compare panel (lifted into `VersionsShell`).
- [ ] `VersionCompare` becomes a controlled component (reads `fromVersion`/`toVersion` from its parent) with no `<Select>` dropdowns of its own.
- [ ] The "O que mudou" panel matches the design's row layout (label · range · delta) instead of a 2-column card grid, and gains a "Restaurar v{from}" action.
- [ ] The compare canvas gains the legend row (dashed/solid swatches + "v{from} → v{to}") and the "Frente · Costas · Manga"-style caption, the latter derived from the real drafted piece names, never a hardcoded garment-specific string.
- [ ] No fabricated data: every rendered field traces to a real `PatternVersionEntry` field or something derivable from it (spec/sizeTable via `draftGarment`/`measureSeams`/`planCutLayout`, all already in use).

## Out of Scope

| Item                                                                                                                                              | Reason                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The design's per-card "reason note" paragraph (e.g. "Cava alargada 1,2 cm a pedido; consumo subiu um pouco.") in the "O que mudou" panel's footer | `PatternVersionEntry` has no free-text description field — only a machine-readable `reason` enum (`generate`/`adjust`/`graduate`/`conflict_fix`/`restore`) and `cost`. The design's mockup invents this sentence per version; fabricating one for real patterns would violate the no-mock-data rule. Omitted rather than invented — the diff rows above it already state what changed numerically. |
| The thumbnail's `miniTransform` consumption-driven scale trick (design line 299: card art subtly scales with fabric consumption)                  | A decorative flourish with no accessible signal — the real thumbnail already shows the real drafted silhouette, which is the honest signal. Not reproduced.                                                                                                                                                                                                                                        |
| Card-thumbnail caching/memoization beyond React's own re-render behavior                                                                          | Out of scope for a visual/structural parity pass; `draftGarment` is already called per-version-pair on every compare re-render in the current code with no reported performance issue, and a version list is small (single digits to low tens of rows in practice).                                                                                                                                |

---

## Assumptions & Open Questions

| Assumption / decision               | Chosen default                                                                                                                                                                                                                                                                                       | Rationale                                                                                                                                                                                                                                 | Confirmed? |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Selection state shape               | `{ from: number; to: number }` (version numbers, not ids) lifted into `VersionsShell`, passed down to both `VersionList` and `VersionCompare`                                                                                                                                                        | Matches the design's own `select(version)` logic exactly (`Versoes.dc.html:243-249`), and version numbers are already the natural key the UI displays.                                                                                    | y          |
| Card thumbnail source               | Real drafted pieces via `draftGarment(v.spec, v.sizeTable[v.baseSize], t)`, rendered through the same `OutlineShape` helper `VersionCompare` already uses                                                                                                                                            | No new drafting logic — reuses the exact function/helper already in this file. Never a fake icon.                                                                                                                                         | y          |
| "Frente · Costas · Manga" caption   | Derived from `drafted.to.pieces.map(p => p.name)`, joined by " · "                                                                                                                                                                                                                                   | `Piece.name` is already the drafter's own localized display name (the same string the canvas/tech sheet show) — deriving it here avoids a hardcoded, garment-specific catalog string that would be wrong for a skirt or trousers pattern. | y          |
| Reason-note paragraph               | Omitted (see Out of Scope)                                                                                                                                                                                                                                                                           | No backing field; fabricating one would violate CLAUDE.md's no-mock-data rule.                                                                                                                                                            | y          |
| `VersionCompare`'s dropdown removal | `fromLabel`/`toLabel`/`versionOption` catalog keys removed (nothing else reads them)                                                                                                                                                                                                                 | The interaction model no longer has dropdowns; these keys become dead. Consistent with the repo's existing rename-not-alias precedent for keys nothing else can read.                                                                     | y          |
| Restore affordances                 | Two independent triggers, both routing through the same `ConfirmModal` + `onRestore(id)` callback already in `VersionsShell`: a "Restaurar" button per non-current card (stops click propagation so it doesn't also select the card), and a "Restaurar v{from}" button in the compare panel's footer | Matches the design's two restore entry points (`Versoes.dc.html:136`, `:199`) without inventing a third mechanism.                                                                                                                        | y          |
| Badge colors                        | New `Badge` variant `oliveSolid` (solid olive bg, white text) for "Para"; the existing `olive` variant (from redesign-size-charts) reused for "De"                                                                                                                                                   | "Para" needs a heavier visual weight than any existing variant provides; "De" already matches an existing token combination — no need for a second new variant.                                                                           | y          |

**Open questions:** none.

---

## User Stories

### P1: Version cards are the single selection mechanism ⭐ MVP

**Acceptance Criteria**:

1. The system SHALL render each version as a card in a horizontal row (not a vertical list), each showing a real drafted-geometry thumbnail, `v{n}`, relative time, reason, and cost.
2. Clicking a card SHALL select it as "De" or "Para" per the design's swap/replace rule: clicking the current "Para" swaps De/Para; clicking the current "De" is a no-op; clicking any other version replaces "De" with the old "Para" and sets the clicked version as the new "Para".
3. The current/active version's card SHALL show "Versão atual" instead of a restore button; every other card SHALL show a "Restaurar" button that opens the existing confirm-restore flow without changing the compare selection.
4. Selected cards SHALL show a "De" or "Para" badge; the "VERSÕES" section header SHALL show the total-credits-spent figure and the "clique em duas para comparar" hint.

**Independent Test**: `VersionList.test.tsx` (new) covers rendering, the three branches of the selection rule, the restore-vs-select click isolation, and the current-version badge.

### P2: `VersionCompare` is a controlled comparison panel ⭐ MVP

**Acceptance Criteria**:

1. `VersionCompare` SHALL accept `fromVersion`/`toVersion` (numbers) from its parent instead of owning its own selection state or rendering `<Select>` controls.
2. The "O que mudou" panel SHALL render one row per metric (label · range · delta), with a `—` delta and muted color when unchanged, matching the design's row layout.
3. The panel SHALL include a "Restaurar v{from}" action routing through the existing confirm-restore flow.
4. The compare canvas SHALL show the dashed/solid legend row and a piece-name caption derived from the real drafted pieces.

**Independent Test**: `VersionCompare.test.tsx` (updated) covers the controlled-props contract, the row layout with a real zero-delta case, the restore action, and the derived caption.

---

## Requirement Traceability

| Requirement ID | Story                  | Phase   | Status  |
| -------------- | ---------------------- | ------- | ------- |
| VERS-01        | P1: Version cards      | Execute | Pending |
| VERS-02        | P1: Version cards      | Execute | Pending |
| VERS-03        | P1: Version cards      | Execute | Pending |
| VERS-04        | P1: Version cards      | Execute | Pending |
| VERS-05        | P2: Controlled compare | Execute | Pending |
| VERS-06        | P2: Controlled compare | Execute | Pending |
| VERS-07        | P2: Controlled compare | Execute | Pending |
| VERS-08        | P2: Controlled compare | Execute | Pending |

**Coverage:** 8 total, 8 mapped, 0 unmapped.

---

## Success Criteria

- [ ] `npx vitest run --project dom components/versions` passes.
- [ ] `npx vitest run` (full suite) passes — no regressions.
- [ ] `npx eslint` and `npm run build` (typecheck) pass, full repo.
- [ ] No new hex values, `text-[Npx]` sizes, or hardcoded pt-BR strings.
- [ ] No database migration, no new `PatternVersion` fields, no fabricated data.
