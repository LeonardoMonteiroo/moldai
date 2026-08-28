# Creating a Pattern from a DXF import — design

Date: 2026-08-28
Status: proposed
Issue: follow-up to #238 (visual layer preview + grouped layer mapping)

## Problem

`/import` (#11) is read-and-verify only: it parses a DXF, lets the user map layers to a
role (`cut`/`seam`/`notch`/`grain`/`ignore`), and shows a verification checklist — but
"Importar molde" has always been a disabled button badged "em breve"
(`VerificationPanel.tsx`). No imported file has ever become a real `Pattern`.

The file that motivated #238 (`oskar_combined_cm.dxf`) has no name-based layer vocabulary
at all — its layers are named by RGB color + linetype — so #238 gave the user a visual
preview to identify layers by sight. This spec is the next step: turning a verified import
into an actual `Pattern` row the user can open, edit via chat, and export.

## Why this is not "populate `pattern.pieces` from the parsed geometry"

`buildExportModel` (`lib/export/model.ts:186-190`) throws if `pattern.spec` is absent, and
never reads `pattern.pieces` at all — every export re-drafts from scratch via
`draftPiecesCm(spec, baseMeasurements, t)`. Grading, seam-conflict detection, and chat
regeneration all have the same dependency on `spec`. An imported DXF has no `GarmentSpec` —
only traced geometry. Storing that geometry directly into `Pattern.pieces` would produce a
row that renders once in the editor and then breaks the moment the user asks the AI to
adjust anything, tries to grade a size, or exports.

Reconstructing an approximate `GarmentSpec` from the imported geometry — via a real
Anthropic call, grounded in measured piece dimensions and user-assigned piece labels, not
vision alone — was chosen instead, after two rounds of the human partner confirming the
resulting Pattern will be an ordinary AI-drafted Pattern (MoldAI's own formulas), not a
faithful trace of the original file. That divergence is real and is surfaced to the user
in the AI's own reply, not hidden.

## Design

### 1. Piece detection and labeling (`lib/import/`, pure, no DOM)

`lib/import/types.ts` gains:

```ts
export type PieceLabel =
  | "front"
  | "back"
  | "sleeve"
  | "collar"
  | "cuff"
  | "waistband"
  | "skirtFront"
  | "skirtBack"
  | "trouserFront"
  | "trouserBack"
  | "other";

export const PIECE_LABELS: PieceLabel[] = [
  "front",
  "back",
  "sleeve",
  "collar",
  "cuff",
  "waistband",
  "skirtFront",
  "skirtBack",
  "trouserFront",
  "trouserBack",
  "other",
];
```

New `lib/import/pieces.ts`:

```ts
export interface DetectedPiece {
  key: string; // stable per doc — index into doc.entities
  widthCm: number | null;
  heightCm: number | null;
  suggestedLabel?: PieceLabel; // from a nearby TEXT entity, best-effort
}

export function detectPieces(
  doc: DxfDocument,
  roles: Record<string, LayerRole>,
  unitScaleToCm: number | null,
): DetectedPiece[];
```

One entry per closed polyline whose layer resolves to the `"cut"` role — the same
`pieceCandidates` filter `computeVerification` already applies. `widthCm`/`heightCm` are
the entity's own bbox scaled by `unitScaleToCm`; both are `null` when the unit is unknown
rather than assuming cm (the existing `unitUnknown` check already surfaces that gap; this
reuses it instead of guessing).

`suggestedLabel` is best-effort, never required: a small fixed synonym map (`FRENTE`→
`front`, `COSTAS`→`back`, `MANGA`→`sleeve`, `GOLA`→`collar`, `PUNHO`→`cuff`, `CINTURA`/
`FAIXA`→`waistband`) is matched against any `TEXT` entity whose anchor point falls inside
the piece's own bbox (the same bbox/midpoint-inside check `computeVerification` already
uses for grainline detection). Ambiguous or unmatched text leaves `suggestedLabel` unset —
never a wrong guess forced into the UI.

### 2. Store (`lib/importStore.ts`)

New state, recomputed alongside `roles` (in `setRoleForLayers`, the same place
`computeVerification` already recomputes):

```ts
pieces: DetectedPiece[];
pieceLabels: Record<string, { label: PieceLabel; customName?: string }>;
hoveredPieceKey: string | null;
creating: boolean;
```

New actions:

- `setPieceLabel(key, label, customName?)` — `customName` only meaningful when
  `label === "other"`.
- `setHoveredPieceKey(key: string | null)` — mirrors `setHoveredLayers`, at piece
  granularity.
- `createPatternFromImport(image: PreparedAttachment): Promise<string | null>` — builds the
  short pt-BR chat message and the `importContext` text (§4), calls
  `api.createPattern()` then `api.generate(id, message, undefined, image, importContext)`.
  On `status: "clarify"`, resends once with `answering: true` and a fixed catalog fallback
  message (the `OnboardingShell.step3.autoDefaultMessage` precedent). Returns the new
  pattern id on `"ok"`/`"conflict"`; otherwise sets `actionError` and returns `null` —
  the `dashboardStore.create()` "resolve to null, don't reject" precedent.

All new fields reset alongside `doc`/`analysis` in `reset()`.

### 3. Reconstruction context (`lib/import/reconstructMeta.ts`, pure)

```ts
export function buildReconstructionContext(
  fileName: string,
  pieces: DetectedPiece[],
  pieceLabels: Record<string, { label: PieceLabel; customName?: string }>,
): string;
```

Produces the plain-English technical block sent as the new `importContext` wire field
(§4) — never persisted, never shown in the chat transcript (the same treatment `image`
already gets: `hasImage` is the only trace it leaves). One line per detected piece:
label (or "unlabeled"), measured width×height in cm, or "unit unknown" when
`unitScaleToCm` was null file-wide. States plainly that this is a real, professional
pattern file, not a hand sketch, and that user-assigned labels are ground truth to be
trusted over the attached image's own visual read.

### 4. Prompt and wire changes

`lib/ai/prompt.ts`'s `buildSystem` gains an optional 3rd parameter,
`importContext?: string`. When present, one additional system-prompt section instructs
the model to:

- trust the measured dimensions and user-assigned labels over its own visual estimate;
- prefer `decision: "ask"` or `"decline"` over guessing when labels/dimensions don't
  clearly indicate a garment type or fit;
- state in `assistantMessage`, in the user's own language, that this is an AI
  reconstruction from an imported reference and may diverge from the original file.

`lib/ai/index.ts`'s `proposeGarment(...)` threads `importContext` through to
`buildSystem`. `app/api/patterns/[id]/generate/route.ts` accepts an optional
`importContext` string field on the request body (length-capped, e.g. 4000 chars),
validated the same way `image` already is, and passes it through — never persisted.
`lib/api-client.ts`'s `generate()` gains a trailing optional `importContext` parameter.

This is the only change to a shipped, tested code path (`generate`) in the whole design;
everything else is new, additive code. No new route, no new AI tool/schema — the existing
`propose_garment` tool and `resolveDecision` (`apply`/`ask`/`decline`/`explain`) are reused
unchanged, so credit debit/refund, insufficient-credits handling, and the resulting
Pattern's seam-conflict/export/grading all work exactly as they do for any other
AI-drafted pattern, because the result _is_ an ordinary AI-drafted pattern.

### 5. Components

- New `components/import/PieceLabelPanel.tsx` — one row per `DetectedPiece`: a `Select`
  over `PIECE_LABELS` (catalog lookup, `t("pieceLabel." + value)`, plus "Outro" revealing a
  free-text input), pre-filled from `suggestedLabel` when present and still overridable,
  measured dimensions shown as plain text. Hovering/focusing a row calls
  `setHoveredPieceKey`. Marking a piece is optional — the panel never blocks anything.
- `components/import/LayerPreviewCanvas.tsx` — reads `hoveredPieceKey` and renders one
  additional highlighted overlay path for that specific polyline (a fixed accent color and
  thicker stroke, layered on top — a spotlight, distinct from the existing per-layer
  isolate/dim behavior driven by `hoveredLayers`, which is unaffected).
- `components/import/VerificationPanel.tsx` — the button is enabled once
  `analysis.pieceCount > 0` (and disabled while `creating`), labeled with the real cost
  (`t("createButton", { cost: COSTS.adjust })`). On click: render the layer preview to an
  image (new small DOM-only helper reusing `prepareImage`'s existing pipeline — draw each
  `LayerPreviewSegment` onto a canvas, convert to a `File`, call `prepareImage`), call
  `createPatternFromImport`, and on success `router.push` to `/pattern/${id}`. On failure,
  an inline error resolved from `actionError` via the catalog (the existing
  `ImportPickErrorCode` pattern, widened with a new `ImportCreateErrorCode`).
- `components/import/ImportShell.tsx` — renders `<PieceLabelPanel />` alongside the
  existing `LayerMappingPanel`/`VerificationPanel` grid.

### 6. i18n (`messages/pt-BR.json`, `Import` namespace)

New keys: `piecesSectionLabel`, `pieceCustomNamePlaceholder`, `pieceLabel.*` (one per
`PieceLabel` value), `createButton` (repurposed — was the "em breve" label), `creatingLabel`,
`createError`, `autoDefaultMessage`, `reconstructionShortMessage` (the short pt-BR chat
message template, taking `{fileName}`). `createComingSoon` is removed along with the
`soon`-badge button it labeled.

### 7. Testing

- `lib/import/pieces.test.ts` — role filtering, bbox/unit-scale math (including the
  unit-unknown case), synonym-based label suggestion (including the ambiguous/no-match
  case).
- `lib/import/reconstructMeta.test.ts` — output content for labeled, unlabeled, and
  unit-unknown pieces.
- `lib/ai/prompt.test.ts` — extended for the new `importContext` section, including that it
  is absent when the parameter is omitted (every existing chat-generate call).
- `app/api/patterns/[id]/generate/route.test.ts` — `importContext` accepted, length-capped,
  never persisted onto the `ChatMessage`.
- `components/import/PieceLabelPanel.test.tsx` — render, select interaction, hover calls
  the store, "Outro" reveals the free-text field.
- `components/import/ImportShell.test.tsx` / `VerificationPanel.test.tsx` — replaces the
  existing "em breve, disabled" test (`describe("ImportShell — creating a pattern is 'em
breve'...")`) with: enabled once `pieceCount > 0`, calls `createPatternFromImport`,
  navigates on `"ok"`/`"conflict"`, shows an error notice on failure, auto-resends once on
  `"clarify"`.

## Explicitly out of scope

- Reconstructing notches, darts, internals, or seam topology from the imported geometry —
  the resulting Pattern is a normal AI-drafted one; none of that geometry is derivable from
  a role-mapped DXF regardless.
- Any form of manual vertex editing — doesn't exist anywhere in the app today, and isn't
  needed here: if the reconstruction is wrong, the user regenerates via ordinary chat, the
  same as any other AI-drafted pattern.
- Wiring parsed `.RUL` grading deltas to geometry (a separate, previously-deferred item;
  unaffected by this work).
- Any change to the `Pattern`/`Piece`/`PatternState` blob shape. The output of this feature
  is a Pattern created through the existing `createPattern` + `generate` path — no new
  fields, no migration.
