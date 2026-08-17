# i18n Fase 2 — lib-generated strings into the catalog seam (inject-translator)

**Date:** 2026-08-17
**Status:** design approved, pending spec review
**Predecessor:** i18n Fase 1 (`refactor/i18n-ptbr`, merged `335c99a`) — next-intl single-locale pt-BR, without routing, 21 per-component namespaces. Fase 1 deliberately left lib-generated and model-generated strings outside the catalog; this is that follow-up.

## Goal

Move the pt-BR strings that are produced by `lib/` code (not static component chrome) out of hardcoded literals and into the `next-intl` catalog, so a second locale becomes catalog-only work. Do this **without changing the persisted Molde blob shape** (no reset migration) by keeping the drafters emitting _resolved_ strings, but via an **injected translator function** rather than hardcoded pt-BR.

Non-goal: adding a second locale. Non-goal: retranslating already-persisted molds (see Known Limitation).

## Scope

In scope — the deferred strings:

| #   | Location                               | Strings                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `lib/draft/{body,sleeve,skirt}.ts`     | piece `name` (Frente/Costas/Manga/Saia); `detailRows` labels (Folga de costura, Largura (tórax), Comprimento, Cava, Decote, Fio, Pence, Silhueta, Raio da cintura, Cintura (painel), Tipo, Cava (copa)); enum-derived values (`NECKLINE_LABELS_PT`, `SKIRT_SILHOUETTE_LABELS_PT`, sleeve longa/curta, "reto") |
| B   | `lib/editor/state.ts` `detectConflict` | ConflictInfo `title`, `description` (with `{diffCm}` + maior/menor), `suggestion`                                                                                                                                                                                                                             |
| C   | `lib/store.ts` `GENERATION_STEPS`      | 4× `label` ("passo 1/4 · silhueta"…) + 4× `pieceProgress` ("traçando peças"…)                                                                                                                                                                                                                                 |
| D   | `components/editor/TechSheetTab.tsx`   | `GARMENT_TYPE_LABELS_PT` (Blusa/Vestido/Saia/Camiseta); gender ternary (masculina/feminina)                                                                                                                                                                                                                   |

Explicitly **out of scope, by design** (documented, removed from backlog):

- **E — AI `assistantMessage` + `lib/ai.ts` system prompt / tool descriptions.** These are model output steered by the pt-BR prompt, not static UI chrome. A second locale changes the prompt's language instruction, not a catalog key. Won't-fix-by-design.
- **Numeric value formatting** (`cm()` → `"1,0 cm"` with comma decimal). This is data produced by code; it stays in the drafters. Only the _vocabulary_ labels/enum-values go through the catalog.
- The pre-existing enum→PT display-label convention is being **replaced** by the catalog for the maps listed above (A's `NECKLINE_LABELS_PT`/`SKIRT_SILHOUETTE_LABELS_PT`, D's `GARMENT_TYPE_LABELS_PT`); no other new label maps are introduced.

## Architecture

### The resolver type (framework-free seam)

```ts
// lib/i18n/translate.ts
export type Translate = (
  key: string,
  values?: Record<string, string | number>,
) => string;
```

`lib/` depends only on `Translate` — it never imports `next-intl`. `next-intl`'s `t` from both `getTranslations` (server) and `useTranslations` (client) is structurally assignable to `Translate`, so callers pass `t` directly. This keeps the pure/DB-free/framework-free character of `lib/draft/*` and `lib/editor/state.ts` intact: they receive a function.

### Server path (authors the persisted blob)

The blob keeps storing resolved pt-BR strings — **shape unchanged, no migration**. Resolution now flows through `t`:

```
route handler (getTranslations("PatternData"))
  → applyGarmentSpec(state, spec, size, t)
      → draftGarment(spec, size, t)
          → draftBody(m, style, opts, t)   // names + detailRows via t
          → draftSleeve(m, style, armhole, opts, t)
          → draftSkirt(m, style, t)
      → detectConflict(pieces, armholeLenCm, sleeveArmholeCm, t)  // title/description/suggestion via t
  → refitSleeve(state, t)   // re-drafts + re-detects → also needs t
```

Affected routes: `POST /api/pattern/generate` (calls `applyGarmentSpec`), `POST /api/pattern/graduate` (re-drafts via `applySizes` → `draftGarment`; if it re-drafts it needs `t`), `POST /api/pattern/conflict/resolve` (calls `refitSleeve`). Each obtains `t = await getTranslations("PatternData")` and threads it. **The credit flow (debit→draft, refund on decline/clarify/error, 402 with no debit/no AI call) is untouched** — `t` is passed alongside, changing no control flow.

`draftPiecesCm(spec, size, t)` (used by both server re-draft helpers and the client export model) gains `t` as well.

### Client path (export / tech-sheet / cut-plan)

`buildExportModel` re-drafts via `draftPiecesCm` and needs piece names for exported DXF/SVG `TEXT` and cut-plan labels. Thread `t` explicitly (confirmed decision over the blob-name-mapping alternative):

```
Footer (useTranslations("PatternData"))
  → exportPattern(pattern, format, t)
      → buildExportModel(pattern, t) → draftPiecesCm(spec, size, t)
TechSheetTab / CutPlanTab (useTranslations("PatternData"))
  → buildExportModel(pattern, t) / planCutLayout(pattern, widthCm, t)
```

`toSvg`/`toDxf`/`toDxfAama`/`toPdf` consume the already-resolved `ExportModel.pieces[].name` — no change to serializers. `exportPattern` and `planCutLayout` gain the `t` param and forward it.

A component may call `useTranslations` twice (e.g. `TechSheetTab` keeps its own `TechSheetTab` namespace and additionally takes a `PatternData` resolver for `buildExportModel`).

### Client-only strings resolved in components (no injection)

- **C — `GENERATION_STEPS`.** `lib/store.ts` drops the pt-BR `label`/`pieceProgress` literals. The store tracks the step **index** (`generationStepIndex`, 0–3) instead of a resolved label. `GeneratingOverlay` reads the index and resolves via its existing `GeneratingOverlay` namespace (`t("steps.stepLabel", {n})` / `t("steps.pieceProgress<i>")`). Cancel button unchanged. The store's `GENERATION_STEPS.length` (=4) becomes a plain constant `GENERATION_STEP_COUNT`.
- **D — `TechSheetTab`.** Delete `GARMENT_TYPE_LABELS_PT` and the gender ternary; resolve `t("garmentType." + pattern.spec.type)` and `t("gender." + pattern.spec.gender)` from the `TechSheetTab` namespace.

## Catalog changes (`messages/pt-BR.json`)

New namespace **`PatternData`**:

```jsonc
"PatternData": {
  "pieceNames": { "front": "Frente", "back": "Costas", "sleeve": "Manga", "skirt": "Saia" },
  "rows": {
    "seamAllowance": "Folga de costura",
    "chestWidth": "Largura (tórax)",
    "length": "Comprimento",
    "armhole": "Cava",
    "neckline": "Decote",
    "grain": "Fio",
    "dart": "Pence",
    "silhouette": "Silhueta",
    "waistRadius": "Raio da cintura",
    "waistPanel": "Cintura (painel)",
    "sleeveType": "Tipo",
    "sleeveCap": "Cava (copa)"
  },
  "neckline": { "straight": "reto", "V": "V", "round": "redondo" },
  "skirtSilhouette": {
    "straight": "reta", "a-line": "evase", "gore": "gode",
    "half-circle": "meia-roda", "circle": "circulo"
  },
  "sleeveType": { "short": "curta", "long": "longa" },
  "grainValue": "reto",
  "conflict": {
    "title": "Cava e manga não batem",
    "description": "A cava do corpo ficou {diffCm} cm {direction, select, larger {maior} smaller {menor} other {}} que a copa da manga — as costuras não vão fechar.",
    "suggestion": "“Corrigir manga” refaz a copa para a cava ajustada, sem custo."
  }
}
```

Additions to existing **`GeneratingOverlay`** namespace:

```jsonc
"steps": {
  "stepLabel": "passo {n}/4 · {stage}",     // OR four explicit keys — see Open decisions
  "stage1": "silhueta", "stage2": "pinças", "stage3": "costuras", "stage4": "consumo",
  "progress1": "traçando peças", "progress2": "ajustando detalhes",
  "progress3": "conferindo costuras", "progress4": "calculando consumo"
}
```

Additions to existing **`TechSheetTab`** namespace:

```jsonc
"garmentType": { "blouse": "Blusa", "dress": "Vestido", "skirt": "Saia", "tshirt": "Camiseta" },
"gender": { "male": "masculina", "female": "feminina" }
```

Byte-fidelity rule (from Fase 1): every migrated value is byte-identical to the current literal — same accents, same curly quotes `“ ”`, same non-breaking/special chars, same `·` middot. No wording changes.

## Enum key mapping note

Catalog keys use the **English enum values** as leaf keys (`neckline.round`, `skirtSilhouette.a-line`, `sleeveType.short`, `garmentType.tshirt`, `gender.male`), matching the code identifiers from the rename subsystem. Drafters build the key from the enum value: `t("neckline." + (style.neckline ?? "straight"))`. Keys containing `-` (`a-line`, `half-circle`) are valid ICU/JSON keys and accessed by the same string-concat pattern.

## Tests

- **Pure-function tests** (`lib/draft/garment.test.ts`, `body.test.ts`, `skirt.test.ts`, `sleeve.test.ts`, `lib/editor/state.test.ts`): pass a **stub `Translate` that returns the key verbatim** (ignoring or interpolating values as needed). Assertions that checked pt-BR content shift to asserting the **emitted key/params** — e.g. `expect(front.detailRows.some(r => r.value === "neckline.round")).toBe(true)` instead of `/redondo/i`; `expect(s.conflict!.suggestion).toContain("conflict.suggestion")` instead of `“Corrigir manga”`. This is a stricter check (verifies the drafter selected the correct token).
- **Export tests** (`lib/export/*.test.ts`): pass the same stub `t` into `buildExportModel`/`exportPattern`/`planCutLayout`. Piece-name assertions (if any) shift to keys (`pieceNames.front`).
- A minimal unit for the stub can live inline per test file, or a shared `lib/i18n/test-translate.ts` helper (`const t: Translate = (k) => k`). Prefer the shared helper (DRY).
- Full suite must stay green (currently 144 tests) after assertion updates.

## Known limitation (documented in CLAUDE.md, honest per project rule)

Persisted molds store display strings (piece names, detailRows, conflict text) in the **locale active when they were drafted**. A future locale switch will not retranslate existing molds until the next generation re-drafts them. This is acceptable at the current single-locale stage; the seam Fase 2 delivers is that all lib display-text producers (drafters, `detectConflict`, export model) now take `t`, so a second locale is catalog + prompt work with no further lib changes. This sits alongside the existing "editor opens on a blank molde / pieces regenerate from scratch" behavior, which makes the stale-snapshot window small in practice.

## Verification

1. `npm run build` (TypeScript check; the one real integration risk is `getTranslations` inside route handlers under next-intl-without-routing — build + runtime confirm it resolves the static pt-BR locale).
2. `npx eslint app lib components` clean; `prettier --check` (committed blobs LF).
3. `npm test` green (144, with updated assertions).
4. Docker E2E: generate a garment (e.g. "saia godê feminina" and a blouse with a deepened armhole to force a conflict), confirm detailRows, conflict card, generating-overlay steps, tech-sheet chips, and an exported DXF/SVG all render pt-BR identical to today — zero raw catalog keys leaking to screen or file.

## Resolved decisions

- **Generating-overlay step label:** ICU-parameterized `stepLabel` (`"passo {n}/4 · {stage}"`) with `stage` resolved from `stage<n>` and `pieceProgress` from `progress<n>`, where `n = index + 1`. Chosen over four fully explicit label keys: less duplication, and "N/4" is already a runtime index. Byte-identical on screen either way.
- **Route `t` namespace:** single `getTranslations("PatternData")` threaded through the draft path; drafters and `detectConflict` use only `PatternData.*` keys.
- **`applySizes` / graduate path:** confirm during implementation whether `applySizes` re-drafts via `draftGarment` (if so it takes `t`; if it only flips size flags without re-drafting display strings, it does not). The plan's first task must check this before threading.
