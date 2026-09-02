# Medidas e grades Visual Refinement Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: activate it by name and follow its Execute flow and Critical Rules.

**Spec**: `.specs/features/redesign-size-charts/spec.md`
**Status**: In Progress

---

## Test Coverage Matrix

> Generated from codebase sampling (`components/dashboard/Sidebar.test.tsx`, `components/settings/SettingsShell.test.tsx`, `components/size-charts/*.test.tsx`) and spec. Guidelines found: `CLAUDE.md` ("Component tests are the `dom` vitest project — jsdom + RTL"; catalog-text assertions must compare against the exported `ptBR` object).

| Code Layer                                    | Required Test Type | Coverage Expectation                                                                                              | Location Pattern                                        | Run Command                                                                     |
| --------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Shared nav component (`Sidebar`)              | unit (RTL)         | 1:1 to spec ACs (SZCH-01..03)                                                                                     | `components/dashboard/Sidebar.test.tsx`                 | `npx vitest run --project dom components/dashboard/Sidebar.test.tsx`            |
| Screen shell (`SizeChartsShell`)              | unit (RTL)         | Sidebar wiring only — the rest of the shell is already covered by `SizeChartLibrary`/`SizeChartTable`'s own tests | `components/size-charts/SizeChartsShell.test.tsx` (new) | `npx vitest run --project dom components/size-charts/SizeChartsShell.test.tsx`  |
| Presentational component (`SizeChartLibrary`) | unit (RTL)         | 1:1 to spec ACs (SZCH-04..09)                                                                                     | `components/size-charts/SizeChartLibrary.test.tsx`      | `npx vitest run --project dom components/size-charts/SizeChartLibrary.test.tsx` |
| Presentational component (`SizeChartTable`)   | unit (RTL)         | 1:1 to spec ACs (SZCH-10..13)                                                                                     | `components/size-charts/SizeChartTable.test.tsx`        | `npx vitest run --project dom components/size-charts/SizeChartTable.test.tsx`   |
| Catalog (`messages/pt-BR.json`)               | none               | build gate only (new keys consumed by the components above)                                                       | —                                                       | build gate only                                                                 |

## Gate Check Commands

| Gate Level | When to Use                            | Command                                            |
| ---------- | -------------------------------------- | -------------------------------------------------- |
| Quick      | After a single-component task          | `npx vitest run --project dom <changed test file>` |
| Full       | After Phase 4 (all components touched) | `npx vitest run`                                   |
| Build      | Before declaring the feature done      | `npx eslint app lib components && npm run build`   |

---

## Execution Plan

Phases 1-3 are independent of each other (different files) and may be implemented in any order; Phase 4 depends on all three.

### Phase 1: Shared Sidebar

```
T1 → T2
```

### Phase 2: Library column

```
T3
```

### Phase 3: Detail column

```
T4
```

### Phase 4: Close-out

```
T5
```

---

## Task Breakdown

### T1: Widen `Sidebar` to support `/size-charts`

**What**: `active` union gains `"size-charts"`; "Medidas e grades" `NavItem` wires real `isActive`; `onNewPattern` becomes optional and its button renders conditionally.
**Where**: `components/dashboard/Sidebar.tsx`
**Depends on**: None
**Reuses**: Existing `NavItem` pattern
**Requirement**: SZCH-01, SZCH-02, SZCH-03

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] `active` accepts `"size-charts"` and marks that `NavItem` `aria-current="page"`
- [x] `onNewPattern?: () => void`; the bottom button renders only when provided
- [x] Dashboard/Slopers call sites unaffected (still always pass `onNewPattern`)
- [x] Stale "/size-charts renders no sidebar" comments removed/corrected

**Tests**: unit
**Gate**: quick

---

### T2: Render the sidebar in `SizeChartsShell`

**What**: `AppShell` receives `sidebar={<Sidebar active="size-charts" />}`; `subtitle` prop dropped (moves into the library column in T3).
**Where**: `components/size-charts/SizeChartsShell.tsx`
**Depends on**: T1
**Reuses**: `Sidebar` (T1), the `AppShell`/`Sidebar` wiring pattern from `DashboardShell.tsx`/`SlopersShell.tsx`
**Requirement**: SZCH-01

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Sidebar renders with "Medidas e grades" marked current
- [x] Top `PageHeader` no longer receives `subtitle`
- [x] New `SizeChartsShell.test.tsx` covers the sidebar wiring

**Tests**: unit
**Gate**: quick

---

### T3: `SizeChartLibrary` structure (width, header, sections, card bar, footer order)

**What**: 252px width; own title+subtitle header block; charts split into "Do sistema"/"Minhas grades" sections; `houseStandardNote` once; 3px card accent bar; footer button-before-import order.
**Where**: `components/size-charts/SizeChartLibrary.tsx`, `messages/pt-BR.json`
**Depends on**: None
**Reuses**: Existing `charts`/`selectedId`/`select`/`create` store bindings; existing `isSystem`/`isActive` fields
**Requirement**: SZCH-04, SZCH-05, SZCH-06, SZCH-07, SZCH-08, SZCH-09

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Column is `w-[252px]`
- [x] Header block renders `SizeCharts.title`/`SizeCharts.subtitle`
- [x] Two labeled sections render, split by `c.isSystem`
- [x] `houseStandardNote` renders exactly once, after the system section
- [x] Each card shows the 3px accent bar
- [x] Footer: "＋ Nova grade" precedes the import trigger in DOM order

**Tests**: unit
**Gate**: quick

---

### T4: `SizeChartTable` header row (badge, read-only activate button, override legend)

**What**: Header row gains a real-state badge and, for read-only charts, a "Usar esta grade" button; editable charts' second row gains the override-legend caption; `systemReadOnlyNote` repositioned into that same row.
**Where**: `components/size-charts/SizeChartTable.tsx`, `messages/pt-BR.json`
**Depends on**: None
**Reuses**: Existing `readOnly`/`isActive`/`activate` bindings; existing bottom activate button (left unconditional, unchanged)
**Requirement**: SZCH-10, SZCH-11, SZCH-12, SZCH-13

**Tools**:

- MCP: NONE
- Skill: NONE

**Done when**:

- [x] Badge shows "Grade do sistema" (readOnly), "Grade ativa" (real `isActive`), or nothing
- [x] Read-only header row shows "Usar esta grade" calling `activate(selectedId)`; absent when editable
- [x] Bottom activate button still renders unconditionally (regression guard)
- [x] Editable second row shows the override-legend caption; `systemReadOnlyNote` moved into that row for readOnly

**Tests**: unit
**Gate**: quick

---

### T5: Full verification + spec traceability + commit

**What**: Full `dom`+`node` suites, `eslint`, `npm run build`, `moldai-conventions` review pass; spec traceability table flipped to Verified.
**Where**: `.specs/features/redesign-size-charts/spec.md`
**Depends on**: T1, T2, T3, T4
**Reuses**: n/a

**Done when**:

- [x] `npx vitest run` passes (no regressions) — 3089 passed, 3 skipped
- [x] `npx eslint app lib components` and `npm run build` pass
- [x] `moldai-conventions` review run on the diff, findings addressed — 1 HIGH finding (bracketed `text-[10px]`/`tracking-[0.08em]` on the two new state badges), fixed by adding `Badge` variants `muted`/`olive` (`components/ui/badge.tsx`) and routing `SizeChartTable`'s badges through them
- [x] Spec traceability table updated to Verified

**Tests**: none
**Gate**: build

---

## Phase Execution Map

```
Phase 1 → Phase 4
Phase 2 → Phase 4
Phase 3 → Phase 4

Phase 1:  T1 ------→ T2
T1 ------→ T5
T2 ------→ T5
Phase 2:  T3 ------→ T5
Phase 3:  T4 ------→ T5
```

Execution is sequential within a phase; Phases 1-3 have no dependency on each other and are executed one after another inline (single session, no sub-agents — the feature fits well under the ~8-task batch budget).

---

## Task Granularity Check

| Task                             | Scope                                    | Status      |
| -------------------------------- | ---------------------------------------- | ----------- |
| T1: Widen `Sidebar`              | 1 component                              | ✅ Granular |
| T2: Wire sidebar into shell      | 1 file (wiring only)                     | ✅ Granular |
| T3: `SizeChartLibrary` structure | 1 component (+ catalog keys it consumes) | ✅ Granular |
| T4: `SizeChartTable` header row  | 1 component (+ catalog keys it consumes) | ✅ Granular |
| T5: Close-out                    | Verification only, no new code           | ✅ Granular |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows         | Status   |
| ---- | ---------------------- | --------------------- | -------- |
| T1   | None                   | None                  | ✅ Match |
| T2   | T1                     | T1 → T2               | ✅ Match |
| T3   | None                   | (Phase 2, standalone) | ✅ Match |
| T4   | None                   | (Phase 3, standalone) | ✅ Match |
| T5   | T1, T2, T3, T4         | Phase 1/2/3 → Phase 4 | ✅ Match |

---

## Test Co-location Validation

| Task                       | Code Layer Created/Modified | Matrix Requires | Task Says | Status |
| -------------------------- | --------------------------- | --------------- | --------- | ------ |
| T1: Sidebar                | Shared nav component        | unit            | unit      | ✅ OK  |
| T2: SizeChartsShell wiring | Screen shell                | unit            | unit      | ✅ OK  |
| T3: SizeChartLibrary       | Presentational component    | unit            | unit      | ✅ OK  |
| T4: SizeChartTable         | Presentational component    | unit            | unit      | ✅ OK  |
| T5: Close-out              | none (verification only)    | none            | none      | ✅ OK  |
