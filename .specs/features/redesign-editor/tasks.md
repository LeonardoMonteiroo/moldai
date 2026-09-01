# Editor Chrome Restructuring Tasks

## Execution Protocol (MANDATORY -- do not skip)

Implement these tasks with the `tlc-spec-driven` skill: activate it by name and follow its Execute flow and Critical Rules.

---

**Design**: `.specs/features/redesign-editor/design.md`
**Status**: Approved

---

## Test Coverage Matrix

> Generated from codebase sampling (`components/editor/*.test.tsx`, `components/shared/*.test.tsx`) and `CLAUDE.md`'s "Component tests are the `dom` vitest project" section. No separate testing-guideline doc exists beyond `CLAUDE.md` itself.

| Code Layer                                        | Required Test Type | Coverage Expectation                                                                                                                                                                                                        | Location Pattern                         | Run Command                                      |
| ------------------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------ |
| Presentational component (props → render)         | unit (`dom`)       | Every prop-driven branch this feature touches (enabled/disabled export, floating-chrome classes, status-pill text per state) asserted against real catalog text (`ptBR`) or exact class strings — the repo's existing floor | `components/**/*.test.tsx`               | `npx vitest run --project dom <file>`            |
| Shared layout primitive (`PageHeader`/`AppShell`) | unit (`dom`)       | New optional prop asserted BOTH present and absent (every other screen must render unaffected)                                                                                                                              | `components/shared/*.test.tsx`           | `npx vitest run --project dom components/shared` |
| Integration (`EditorShell`)                       | unit (`dom`)       | End-to-end wiring: header actions render, no `<footer>` landmark, save-as-base flow still completes                                                                                                                         | `components/editor/EditorShell.test.tsx` | `npx vitest run --project dom components/editor` |
| Dead-code removal (`Footer.tsx` deletion)         | none               | Build gate only — coverage already redistributed by the tasks that precede it                                                                                                                                               | -                                        | build gate only                                  |

## Gate Check Commands

| Gate Level | When to Use                              | Command                                                                                                                                       |
| ---------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Quick      | Tasks T1-T4 (isolated component changes) | `npx vitest run --project dom <touched test file(s)>`                                                                                         |
| Full       | Tasks T5-T6 (cross-component wiring)     | `npx vitest run --project dom components/editor components/shared`                                                                            |
| Build      | T7 (phase completion / final task)       | `npx vitest run --project dom components/editor components/shared && npx tsc --noEmit -p . && npx eslint components/editor components/shared` |

---

## Execution Plan

### Phase 1: Header plumbing

```
T1 → T2
```

### Phase 2: New/changed editor pieces

```
T2 → T3 → T4 → T5
```

### Phase 3: Integration & cleanup

```
T5 → T6 → T7
```

---

## Task Breakdown

### T1: Add `actions` slot to `PageHeader`

**What**: Add an optional `actions?: ReactNode` prop, rendered after the credits block and before the account menu, behind a vertical divider (mirrors the existing `(backHref || title) && <Separator/>` pattern).
**Where**: `components/shared/PageHeader.tsx`
**Depends on**: None
**Reuses**: The existing `Separator` divider pattern (`PageHeader.tsx:74-76`).
**Requirement**: EDCH-05

**Done when**:

- [x] `actions` renders when passed, with a divider before it; renders nothing extra when absent.
- [x] Every existing `PageHeader.test.tsx` assertion still passes unmodified.
- [x] New test: passing `actions` renders it; omitting it renders no extra divider/node.

**Tests**: unit (dom)
**Gate**: quick — `npx vitest run --project dom components/shared/PageHeader.test.tsx`
**Status**: ✅ Done — 16 tests passing (14 existing + 2 new), lint/typecheck clean.

---

### T2: Thread `headerActions` through `AppShell`

**What**: Add an optional `headerActions?: ReactNode` prop, passed straight to `<PageHeader actions={headerActions} .../>`.
**Where**: `components/shared/AppShell.tsx`
**Depends on**: T1
**Reuses**: T1's new `PageHeader` prop.
**Requirement**: EDCH-05

**Done when**:

- [x] `AppShell`'s `headerActions` prop reaches `PageHeader`'s `actions` prop unchanged.
- [x] Every existing `AppShell.test.tsx` assertion still passes unmodified (no screen currently passes this prop).
- [x] New test: passing `headerActions` renders it inside the header.

**Tests**: unit (dom)
**Gate**: quick — `npx vitest run --project dom components/shared/AppShell.test.tsx`
**Status**: ✅ Done — 15 tests passing (14 existing + 1 new), lint/typecheck clean.

---

### T3: Create `HeaderActions.tsx`

**What**: New component rendering "Histórico" (link to `/pattern/[id]/versions`) and "Salvar como base" (button + dialog + save notice), moved near-verbatim from `Footer.tsx`'s save-as-base state machine. The save notice becomes an `absolute top-full right-0 mt-2` anchored chip instead of an inline footer-row span.
**Where**: `components/editor/HeaderActions.tsx` (new), `components/editor/HeaderActions.test.tsx` (new)
**Depends on**: T2
**Reuses**: `Footer.tsx`'s `savingBase`/`baseName`/`baseNotice` state, `submitBase` handler, `useEditorStore`'s `saveAsSloper`, the `Dialog`/`Field`/`Input` primitives — same imports, same `useTranslations("Footer")` keys.
**Requirement**: EDCH-05, EDCH-06, EDCH-07

**Done when**:

- [ ] "Histórico" links to `/pattern/${pattern.id}/versions`.
- [ ] "Salvar como base" opens the same dialog, same disabled/title logic as `Footer.tsx` today (conflict/generating/blank).
- [ ] Save success/error notice shows the same `saveAsBaseSaved`/`saveAsBaseError` text, auto-dismisses after 6s.
- [ ] Tests migrated from `Footer.test.tsx`'s save-as-base cases (open dialog, submit, success notice, error notice, disabled state per cause) — same assertions, new render target.

**Tests**: unit (dom)
**Gate**: quick — `npx vitest run --project dom components/editor/HeaderActions.test.tsx`

---

### T4: Convert `TabBar` to floating chrome + add Exportar

**What**: Change the root wrapper from a static full-width row to an `absolute inset-x-4 top-4 z-10` translucent/blurred floating chip (`bg-surface/86 backdrop-blur-sm border-border rounded-item shadow-card`); add an `exportHref`/`exportTitle` prop pair rendering the same enabled-Link-vs-disabled-Button branch `Footer.tsx` used for Exportar.
**Where**: `components/editor/TabBar.tsx`, `components/editor/TabBar.test.tsx` (new)
**Depends on**: T3
**Reuses**: `TabBar`'s existing `TabsList`/`SizeSelector`/details-toggle JSX (unchanged); `Footer.tsx`'s enabled/disabled Exportar branch.
**Requirement**: EDCH-01, EDCH-02, EDCH-04

**Done when**:

- [ ] Root wrapper carries the floating/translucent/blur/shadow classes instead of the static-row classes.
- [ ] Exportar renders as a `Link` to `/pattern/[id]/export` when `exportHref` is set, a disabled `Button` with `exportTitle` otherwise.
- [ ] Every existing tab/size-selector/details-toggle behavior is unchanged (verified by new direct tests, since `TabBar` had no dedicated test file before).
- [ ] New `TabBar.test.tsx` covers: floating classes present, tab click switches `activeTab`, size popover opens, details toggle only shows on `pattern2d`, Exportar reflects each of the 3 disabled causes plus the enabled case.

**Tests**: unit (dom)
**Gate**: quick — `npx vitest run --project dom components/editor/TabBar.test.tsx`

---

### T5: Update `CanvasArea` — containing block, inset, status pill, tool-stack reposition

**What**: (a) `<Tabs>` root gains `relative` so `TabBar`'s new `absolute` resolves against it; (b) `PatternCanvas`'s inset changes `top-[22px]` → `top-[58px]`; (c) add an inline floating status pill (`absolute bottom-4 left-4`, rounded-full, `.float-chrome`-equivalent classes) rendering the same `statusReady`/`statusGenerating`/`statusConflict` text `Footer.tsx` computed; (d) compute `exportDisabled`/`exportDisabledTitle` (moved from `Footer.tsx`) and pass to `TabBar`; (e) move `FloatingToolbar` + measure-tool note + "Limpar medições" from `top-5 left-5`/`bottom-5 left-5` to a single stacked column at `top-[54px] left-4`.
**Where**: `components/editor/CanvasArea.tsx`, `components/editor/CanvasArea.test.tsx`
**Depends on**: T4
**Reuses**: `Footer.tsx`'s `statusText`/`exportDisabled`/`exportDisabledTitle` derivations (moved, not rewritten).
**Requirement**: EDCH-01, EDCH-02, EDCH-03, EDCH-04, edge cases (measure-tool reposition)

**Done when**:

- [ ] Status pill renders the correct text for ready/generating/conflict, in the canvas's bottom-left corner.
- [ ] `TabBar` receives working `exportHref`/`exportTitle` matching each of the 3 disabled causes plus the enabled case.
- [ ] `PatternCanvas`'s drawable region starts at `top-[58px]`.
- [ ] `FloatingToolbar`/measure note/"Limpar medições" render at the new top-left stack position, no longer overlapping the floating tab bar or the new status pill.
- [ ] Existing `CanvasArea.test.tsx` assertions about pieces/conflict/measurements/tool-selection still pass, updated only where the moved elements' positions are asserted.

**Tests**: unit (dom)
**Gate**: full — `npx vitest run --project dom components/editor components/shared`

---

### T6: Wire `EditorShell` — drop `Footer`, add `headerActions`

**What**: Remove the `footer={<Footer .../>}` prop and the `Footer` import; add `headerActions={<HeaderActions pattern={pattern} conflictActive={conflict !== null} generating={generationStatus === "generating"} />}`.
**Where**: `components/editor/EditorShell.tsx`, `components/editor/EditorShell.test.tsx`
**Depends on**: T5
**Reuses**: T3's `HeaderActions`.
**Requirement**: EDCH-05

**Done when**:

- [ ] `EditorShell` no longer imports or renders `Footer`.
- [ ] `AppShell` receives `headerActions` with the three required props.
- [ ] Existing `EditorShell.test.tsx` assertions about the footer landmark/Footer content are replaced with equivalent assertions against the new header-action location (never just deleted).
- [ ] Full save-as-base round trip (open → submit → notice) still passes end to end through `EditorShell`.

**Tests**: unit (dom)
**Gate**: full — `npx vitest run --project dom components/editor components/shared`

---

### T7: Delete `Footer.tsx` and `Footer.test.tsx`

**What**: Remove the now-fully-dead files once nothing imports them.
**Where**: `components/editor/Footer.tsx` (delete), `components/editor/Footer.test.tsx` (delete)
**Depends on**: T6
**Reuses**: N/A

**Done when**:

- [ ] `grep -r "editor/Footer"` (and bare `from "./Footer"`) returns no matches outside `.specs/`.
- [ ] Full build gate passes: `npx vitest run --project dom components/editor components/shared && npx tsc --noEmit -p . && npx eslint components/editor components/shared`.
- [ ] Total test count for `components/editor` + `components/shared` is ≥ the pre-feature count (net coverage did not shrink — some Footer tests were 1:1 relocated, some redundant ones may have merged, but nothing was silently dropped).

**Tests**: none (deletion only — coverage already redistributed by T3/T4/T6)
**Gate**: build — `npx vitest run --project dom components/editor components/shared && npx tsc --noEmit -p . && npx eslint components/editor components/shared`

---

## Phase Execution Map

```
Phase 1 → Phase 2 → Phase 3

Phase 1:  T1 ------→ T2
Phase 2:  T3 ------→ T4 ------→ T5
Phase 3:  T6 ------→ T7
```

7 tasks total — at the ≤~8-task inline-execution threshold, no sub-agent delegation offer required (`implement.md`).

---

## Task Granularity Check

| Task                                     | Scope                                                                                     | Status                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| T1: `PageHeader` `actions` slot          | 1 component (1 file + its test)                                                           | ✅ Granular                                                                                                   |
| T2: `AppShell` `headerActions` threading | 1 component (1 file + its test)                                                           | ✅ Granular                                                                                                   |
| T3: `HeaderActions.tsx`                  | 1 new component + its test                                                                | ✅ Granular                                                                                                   |
| T4: `TabBar` floating + Exportar         | 1 component + its test                                                                    | ✅ Granular                                                                                                   |
| T5: `CanvasArea` chrome updates          | 1 component (5 cohesive sub-changes, same file, same containing-block concern) + its test | ⚠️ OK — cohesive (all 5 sub-changes are the single concern of "reposition floating chrome inside CanvasArea") |
| T6: `EditorShell` wiring                 | 1 component + its test                                                                    | ✅ Granular                                                                                                   |
| T7: Delete `Footer.tsx`                  | 1 deletion                                                                                | ✅ Granular                                                                                                   |

---

## Diagram-Definition Cross-Check

| Task | Depends On (task body) | Diagram Shows                        | Status   |
| ---- | ---------------------- | ------------------------------------ | -------- |
| T1   | None                   | (start of Phase 1)                   | ✅ Match |
| T2   | T1                     | T1 → T2                              | ✅ Match |
| T3   | T2                     | T2 → T3 (Phase 1 → Phase 2 boundary) | ✅ Match |
| T4   | T3                     | T3 → T4                              | ✅ Match |
| T5   | T4                     | T4 → T5                              | ✅ Match |
| T6   | T5                     | T5 → T6 (Phase 2 → Phase 3 boundary) | ✅ Match |
| T7   | T6                     | T6 → T7                              | ✅ Match |

---

## Test Co-location Validation

| Task | Code Layer Created/Modified | Matrix Requires | Task Says  | Status |
| ---- | --------------------------- | --------------- | ---------- | ------ |
| T1   | Shared layout primitive     | unit (dom)      | unit (dom) | ✅ OK  |
| T2   | Shared layout primitive     | unit (dom)      | unit (dom) | ✅ OK  |
| T3   | Presentational component    | unit (dom)      | unit (dom) | ✅ OK  |
| T4   | Presentational component    | unit (dom)      | unit (dom) | ✅ OK  |
| T5   | Presentational component    | unit (dom)      | unit (dom) | ✅ OK  |
| T6   | Integration (`EditorShell`) | unit (dom)      | unit (dom) | ✅ OK  |
| T7   | Dead-code removal           | none            | none       | ✅ OK  |
