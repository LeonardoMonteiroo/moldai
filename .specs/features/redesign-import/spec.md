# Importação Visual Refinement Specification

## Problem Statement

`docs/design/screens/Importacao.dc.html` is the redesign reference for `/import`. Comparing it against `ImportShell.tsx` and its subcomponents found the screen already matches the design's substance closely — file picker, the real `.RUL` grading-rule companion (#231), piece labeling, layer mapping, and verification are all real, already-shipped features, not placeholders. Three concrete gaps were found: the account balance shown next to the paid "Importar molde" action, a mapped-roles progress count in the layer-mapping panel header, and a "no cut line mapped yet" hint overlaid on the preview canvas. User confirmed (2026-09-02, via `AskUserQuestion`): add the real balance (it requires a new account-summary fetch, reversing `ImportShell`'s documented "no credits fetch" decision — but the paid action's own cost needs a real balance beside it).

## Goals

- [ ] `VerificationPanel` shows the account's real balance ("Saldo: N créditos") next to the paid "Importar molde" action, matching `Importacao.dc.html:248`.
- [ ] `LayerMappingPanel`'s header shows "{mapped} de {total} papéis esperados mapeados", matching `Importacao.dc.html:205`.
- [ ] `LayerPreviewCanvas` overlays "Nenhuma linha de corte mapeada ainda" while no layer is mapped to the `cut` role, matching `Importacao.dc.html:115-119`.
- [ ] No fabricated data — the balance is a real fetch (the `dashboardStore`/`PageHeader` precedent: null forever on failure, no error state for a display-only figure), and the progress/hint text derive from data the store already computes (`roles`, the same `missingExpected` logic `LayerMappingPanel` already uses for its badges).

## Out of Scope

| Item                                                                                         | Reason                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scroll-wheel zoom / drag-to-pan on the preview canvas, and the draggable panel-resize handle | `ImportShell.tsx`'s own doc comment already frames this screen as "design 5g's high-fidelity target, scoped down for this first pass" — an established, documented scope cut (#11), not a fresh finding. Reproducing pan/zoom is a real interactive-engineering feature on the scale of the redesign-versions restructuring, not a visual-parity fix. |
| A generic file-type icon in `FileSummaryCard`                                                | Purely decorative chrome the design shows before the Arquivo/Formato/Peças/Tamanho fields; omitting it loses no information. Lower priority than the three real content gaps above given this is the last screen of the redesign pass.                                                                                                                |
| The top `PageHeader`'s credits pill                                                          | The design's own header for this screen has none either (unlike every other full-page screen) — `ImportShell` already matches this correctly.                                                                                                                                                                                                         |

---

## Assumptions & Open Questions

| Assumption / decision     | Chosen default                                                                                                                                                                    | Rationale                                                                                                                                                                                                                                       | Confirmed? |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Balance fetch shape       | New `credits: Credits \| null` + `loadCredits()` on `useImportStore`, called once from `ImportShell` via `useEffect`; failure leaves it `null` forever, no retry, no error banner | Mirrors `PageHeader`'s own documented precedent exactly ("the bar is simply absent until it lands... if the summary fetch fails it stays null for good") — analysis stays free either way, so a failed balance fetch must never block or alarm. | y          |
| Balance display location  | Only inside `VerificationPanel`'s footer, never the top header                                                                                                                    | The design itself only shows it there — the top header has no credits pill for this screen, matching the existing `credits={null}` passed to `AppShell`.                                                                                        | y          |
| "No cut mapped" condition | `!Object.values(roles).includes("cut")`                                                                                                                                           | Reuses the exact role map `LayerMappingPanel` already reads; no new state.                                                                                                                                                                      | y          |

**Open questions:** none.

---

## User Stories

### P1: The screen surfaces real cost/mapping context the design shows ⭐ MVP

**Acceptance Criteria**:

1. The system SHALL fetch the account's real balance once and show "Saldo: N créditos" in `VerificationPanel`'s footer when it has loaded; the line SHALL be absent (not a placeholder) while it hasn't.
2. `LayerMappingPanel` SHALL show "{mapped} de {total} papéis esperados mapeados" in its header, where `mapped`/`total` are real counts derived from the same expected-role set its own missing-role badges already use.
3. `LayerPreviewCanvas` SHALL overlay "Nenhuma linha de corte mapeada ainda" while no layer is mapped to the `cut` role, and hide it once one is.

**Independent Test**: `lib/importStore.test.ts` covers `loadCredits` (success + failure-stays-null); `VerificationPanel.test.tsx` covers the balance line's presence/absence; `ImportShell.test.tsx` covers the progress count; `LayerPreviewCanvas.test.tsx` covers the hint's presence/absence.

---

## Requirement Traceability

| Requirement ID | Story                         | Phase   | Status  |
| -------------- | ----------------------------- | ------- | ------- |
| IMPT-01        | P1: Real cost/mapping context | Execute | Pending |
| IMPT-02        | P1: Real cost/mapping context | Execute | Pending |
| IMPT-03        | P1: Real cost/mapping context | Execute | Pending |

**Coverage:** 3 total, 3 mapped, 0 unmapped.

---

## Success Criteria

- [ ] `npx vitest run --project dom components/import` and `npx vitest run --project node lib/importStore.test.ts` pass.
- [ ] `npx vitest run` (full suite) passes — no regressions.
- [ ] `npx eslint` and `npm run build` (typecheck) pass, full repo.
- [ ] No new hex values, `text-[Npx]` sizes, or hardcoded pt-BR strings.
- [ ] No database migration, no new fields — the balance reuses the existing `getAccountSummary` endpoint.
