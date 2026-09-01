# Editor Chrome Restructuring Specification

## Problem Statement

`docs/design/screens/Editor.dc.html` (the redesign reference for the app's most complex screen) shows a materially different chrome layout than the shipped `EditorShell`: the tab bar floats as a translucent chip over the canvas instead of occupying its own row; the bottom `Footer` bar is gone entirely, with its three actions redistributed (Exportar → a floating button beside the tabs; Salvar como base / Histórico → the header); and the status line ("N cópias · base M · unidade cm") becomes a floating pill at the canvas's bottom-left corner. The redesign README characterized the Editor as content-identical to today ("sem mudanças de conteúdo identificadas"), which undersells this gap — it's a real chrome restructuring, not a spacing tweak. User confirmed (2026-09-01, via AskUserQuestion): implement the full restructuring.

## Goals

- [ ] `Footer.tsx` is removed; `AppShell`'s `footer` slot is unused by the editor.
- [ ] The tab bar (Molde 2D / Prova 3D / Ficha técnica / Plano de corte + size selector + piece-details toggle + a new Exportar button) renders as a floating translucent chip over the canvas, matching `Editor.dc.html:451-477`'s structure and spacing.
- [ ] "Histórico" and "Salvar como base" render in the page header, next to the credits pill, matching `Editor.dc.html:44-48`.
- [ ] The status line renders as a floating pill at the canvas's bottom-left corner, matching `Editor.dc.html:487-489`.
- [ ] No behavior regresses: every disabled/title/notice rule Footer enforced today (export gated on conflict/generating/blank, save-as-base same gating, save success/error notice) still holds in the new locations.
- [ ] All existing accessibility guarantees survive (footer landmark's removal is fine — AppShell already renders it conditionally; every relocated control keeps its accessible name/role).

## Out of Scope

| Feature                                                                                                                      | Reason                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renaming the `Footer` i18n namespace                                                                                         | `ExportFormatList.tsx` (the `/export` screen) already reads `useTranslations("Footer")` for format descriptions — the namespace is already shared across components, not 1:1 with a file. Renaming it would drag the `/export` screen into this diff for no behavior change. Every relocated string keeps its existing `Footer.*` key. |
| The `FloatingToolbar` (cursor/measure tool selector) redesign                                                                | Not depicted anywhere in `Editor.dc.html` — the mockup simply omits this real, keyboard-documented feature (same class of gap as the Dashboard screenshot cutting off before the credits row). Its position only moves because the new floating tab bar would otherwise physically overlap it (see Assumptions).                       |
| Prova 3D / Ficha técnica / Plano de corte tab content                                                                        | Each already has its own mature component (`Proof3DTab`, `TechSheetTab`, `CutPlanTab`); only the shared floating chrome that sits above all four tabs is in scope.                                                                                                                                                                     |
| Any change to what "Salvar como base" or "Exportar" actually do (their gating logic, the save dialog, the destination route) | Only _where_ these controls render changes, not their behavior — same disabled rules, same copy, same destinations.                                                                                                                                                                                                                    |

---

## Assumptions & Open Questions

| Assumption / decision                                     | Chosen default                                                                                                                                                                                             | Rationale                                                                                                                                                                                                                              | Confirmed?                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `FloatingToolbar` (cursor/measure) position               | Move from `top-5 left-5` to `top-[54px] left-4`, clearing the new floating tab bar's ~46px height + margin                                                                                                 | The design never shows this control, so there's no reference value; the only real constraint is "don't overlap the tab bar," which dictates a `top` at least as large as the tab bar's height                                          | y (documented, not re-asked — see rationale) |
| Where "Limpar medições" renders                           | Moves from `bottom-5 left-5` (which the new status pill now occupies) to the same top-left stack as `FloatingToolbar`, appearing below the measure-tool note when measurements exist                       | It's tool-context-specific (only relevant mid-measurement), so co-locating it with the tool that produces it reads better than an unrelated bottom-left slot the design has already claimed for status text                            | y                                            |
| Where the "Salvar como base" success/error notice renders | A small `role="status"/"alert"` chip anchored under the header action group (`absolute` positioned, not a page-wide banner), auto-dismissing after 6s exactly as today                                     | The header row has no spare width for the same inline placement Footer used; a full banner would be new UI ceremony for a fire-and-forget confirmation. This is the narrowest change that preserves today's exact timing/tone behavior | y                                            |
| `PageHeader`'s new `actions` slot                         | Additive optional prop, rendered after the credits pill and before the account menu, behind a vertical divider — mirrors the existing `(backHref \|\| title) && <Separator />` pattern already in the file | Keeps "AppShell builds the header from data props, no screen hand-rolls one" intact — this is one more named slot, not an escape hatch                                                                                                 | y                                            |
| Floating tab bar's vertical clearance for canvas content  | Bump `PatternCanvas`'s inset from `top-[22px]` to `top-[58px]` (matches `Editor.dc.html:227`'s `top: 58px` exactly)                                                                                        | The design cites this value directly; it's the clearance a ~32px-tall floating bar at `top:14px` plus margin needs before real content starts                                                                                          | y                                            |

**Open questions:** none — all resolved above.

---

## User Stories

### P1: Tab bar becomes floating chrome over the canvas ⭐ MVP

**User Story**: As a user editing a pattern, I want the tab/size/export controls to float over the canvas the way the approved redesign shows, so the canvas gets the full-bleed feel the design intends instead of losing a dedicated row to a static toolbar.

**Acceptance Criteria**:

1. The system SHALL render the tab bar as an `absolute`-positioned element inside the canvas region (not a flow sibling above it), with a translucent background, backdrop blur, and card shadow (`Editor.dc.html:453`, `.float-chrome`: `background: rgba(255,255,255,.86)`, `backdrop-filter: blur(6px)`, `box-shadow: var(--shadow-card)`, `border: 1px solid var(--color-border)`).
2. The system SHALL render an "Exportar" button inside that floating row, disabled with the same title-per-cause rules `Footer.tsx` enforces today (conflict / generating / blank pattern), linking to `/pattern/[id]/export` when enabled (`Editor.dc.html:474`).
3. WHILE the tab bar floats over the canvas THEN drawn pattern pieces SHALL start no higher than `58px` from the canvas region's top edge, so they never render under the floating bar.
4. The system SHALL preserve every existing TabBar behavior unchanged: active-tab styling, the size-selector popover, and the piece-details toggle (only visible on the `pattern2d` tab).

**Independent Test**: Render `CanvasArea` in a `dom` test with a drafted pattern and assert the tab bar container carries the floating/translucent classes, the Exportar button reflects each disabled cause via its `title`, and pattern content clears the 58px inset.

---

### P2: Footer's actions move to the header and a floating status pill

**User Story**: As a user, I want "Salvar como base" and "Histórico" reachable from the header and the pattern's status line visible near the canvas, matching the approved design, with the exact same gating and copy Footer had.

**Acceptance Criteria**:

1. The system SHALL render "Histórico" (linking to `/pattern/[id]/versions`) and "Salvar como base" (opening the existing save dialog) in the page header, after the credits pill (`Editor.dc.html:45-48`).
2. IF the pattern has a conflict, is generating, or has no drafted pieces THEN "Salvar como base" SHALL render disabled with the same `saveAsBaseDisabledTitle` Footer used.
3. WHEN a base is saved successfully or fails THEN the system SHALL show the same `saveAsBaseSaved`/`saveAsBaseError` message, auto-dismissing after 6 seconds, in its new anchored position near the header actions.
4. The system SHALL render the status pill (ready/generating/conflict text) as a floating element at the canvas's bottom-left corner (`Editor.dc.html:487-489`), using the exact same `statusReady`/`statusGenerating`/`statusConflict` copy and pluralization Footer used.
5. `EditorShell` SHALL no longer pass a `footer` element to `AppShell`.

**Independent Test**: Render `EditorShell` end to end (existing test harness) and assert Histórico/Salvar-como-base render in the header region (not a `<footer>`), the status pill renders inside the canvas region, and the save-as-base flow (open dialog → submit → notice → auto-dismiss) still works.

---

## Edge Cases

- IF `pattern.pieces.length === 0` (blank pattern) THEN both Exportar (in the floating tab bar) and Salvar como base (in the header) SHALL render disabled with their existing "nothing drafted" reasoning — unchanged from Footer's current `exportDisabledBlankTitle`/`saveAsBaseDisabledTitle`.
- WHILE `activeTool === "measure"` and at least one measurement exists THEN the "Limpar medições" button SHALL render in the top-left tool stack (below `FloatingToolbar`), not at the bottom-left corner now occupied by the status pill.
- IF the save-as-base dialog is open WHEN the header's credits bar or account menu changes width (long plan name, etc.) THEN the dialog itself is unaffected (it's a `Dialog` portal, not header-relative).
- WHILE generating THEN the floating tab bar area SHALL keep showing `GeneratingOverlay` instead (unchanged from today — `CanvasArea.tsx`'s existing `isGenerating ? <GeneratingOverlay/> : <TabBar/>` branch is preserved, just with `GeneratingOverlay` now also needing floating positioning to match — see Design for exact treatment).

---

## Requirement Traceability

| Requirement ID | Story                            | Phase   | Status                                                                                                                     |
| -------------- | -------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------- |
| EDCH-01        | P1: Floating tab bar             | Execute | Verified                                                                                                                   |
| EDCH-02        | P1: Floating tab bar             | Execute | Verified                                                                                                                   |
| EDCH-03        | P1: Floating tab bar             | Execute | Verified — fixed post-Verifier, sensor mutation now killed; see `validation.md`                                            |
| EDCH-04        | P1: Floating tab bar             | Execute | Verified                                                                                                                   |
| EDCH-05        | P2: Header actions + status pill | Execute | Verified                                                                                                                   |
| EDCH-06        | P2: Header actions + status pill | Execute | Verified — fixed post-Verifier, sensor mutation now killed; see `validation.md`                                            |
| EDCH-07        | P2: Header actions + status pill | Execute | ⚠️ Spec-precision gap — text/tone verified, 6s auto-dismiss timing untested (pre-existing, not fixed); see `validation.md` |
| EDCH-08        | P2: Header actions + status pill | Execute | Verified                                                                                                                   |
| EDCH-09        | P2: Header actions + status pill | Execute | Verified — fixed post-Verifier, position now independently asserted; see `validation.md`                                   |

**Coverage:** 9 total, 9 mapped to tasks (see `tasks.md`), 0 unmapped.

---

## Success Criteria

- [x] `npx vitest run --project dom components/editor components/shared` passes (197/197, after the post-Verifier fix round added 9 tests) — see `validation.md` for the full history: a first pass found EDCH-03/EDCH-06 uncovered (confirmed by surviving discrimination-sensor mutations), both closed same-session with self-verified fixes.
- [x] `npm run lint`/`npx eslint components/editor components/shared` and `npx tsc --noEmit -p .` pass.
- [x] `Footer.tsx` and `Footer.test.tsx` are deleted (their coverage is redistributed, not dropped).
- [x] No new hex values, `text-[Npx]` sizes, or hardcoded pt-BR strings introduced (verified by grep across every touched file; every relocated string keeps its existing `Footer.*`/`TabBar.*`/`CanvasArea.*` key).
