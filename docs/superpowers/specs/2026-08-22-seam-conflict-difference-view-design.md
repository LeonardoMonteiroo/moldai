# The seam conflict shows its difference — design

Date: 2026-08-22
Status: approved
Issue: #19 (`feat(editor): implement the seam-conflict view-difference action`, reshaped — see "No toggle")

## Problem

`components/editor/ConflictActions.tsx` renders three chips under a seam-conflict
message. Two are live (`Corrigir manga`, `Ignorar`); the third, `Ver diferença`, is
`disabled` with an `em breve` badge and an inline comment explaining that it never had a
handler.

So when the seams diverge, everything the user is told about the divergence is a single
number: `ConflictInfoCard`'s `diferença 3,1 cm`. The two lengths that produced it — the
body's armhole and the sleeve cap — are computed by the drafter, compared by `seamCheck`,
and then thrown away. The canvas marks both seams with a dashed alert circle and neither
circle says anything about how far off it is.

Reproduced live before designing anything (dev stack, real Anthropic call,
`aprofunda a cava do corpo em 3 cm` on a size-M blouse): the pattern reached v3 with
`style.armholeDeepenCm: 3`, body armhole 22,8 cm against a 19,7 cm cap, and a persisted
`ConflictInfo` holding `diffCm: 3.1`, two bare markers, and no lengths.

## No toggle

The issue asked for a click target: "clicking _Ver diferença_ shows a real comparison".
That is the wrong shape. A seam conflict is precisely the moment the two numbers matter,
so gating them behind a button — and then a second click to put them away — adds a
control whose only job is to withhold information the user already asked for by
generating the pattern.

The decision (user, 2026-08-22): **no `Ver diferença` / `Ocultar diferença` at all.** The
comparison becomes the default presentation of a conflict, and the disabled button is
deleted. This satisfies the issue's three criteria — a real comparison beyond `diffCm`,
no disabled/badged control left behind, no debit and no mutation — by removing the gate
instead of building it.

## Design

### 1. The two lengths are derived, never persisted

`ConflictInfo` gains no fields. Both lengths are fully determined by the pattern's own
persisted `spec` plus `baseMeasurements`, and CLAUDE.md has twice removed persisted data
that was derivable from what sat beside it (`Pattern.savedAgo`, `Wallet.planLabel`);
storing an armhole length next to the `armholeDeepenCm` that produces it is the same
mistake with a third name. Deriving also repairs conflicts persisted before this change
— the `fitPieceLabel` precedent, where render-time recomputation fixed patterns drafted
against the old placement rule.

**`lib/draft/garment.ts`** exports `measureSeams(spec, baseMeasurements, t)`, a thin
wrapper over the private `draftAll` returning `{ armholeLenCm?, sleeveArmholeCm? }` —
symmetric with the existing `draftPiecesCm(spec, baseMeasurements, t)`, which is the
same wrapper returning `drafted` instead. Both lengths are `undefined` for a garment with
no armhole (a skirt), exactly as `draftAll` reports them.

**`components/editor/CanvasArea.tsx`** calls it inside a `useMemo` keyed on
`pattern.spec` / `pattern.baseMeasurements`, with `useTranslations("PatternData")` as the
`Translate` — the same client-side re-draft-in-cm that `TechSheetTab` and `CutPlanTab`
already perform through `buildExportModel`. The resulting pair is passed to
`ConflictInfoCard` and to `PatternCanvas`. Nothing is written back to the store.

### 2. `ConflictInfoCard` carries the comparison

Width goes from 172px to 212px (still inside the 268px strip `CanvasArea` already
reserves for whichever right-hand overlay is open, so the canvas layout is untouched).
Under the existing `diferença` line and separator, a comparison block:

- two rows, each a label and a value — `Cava · frente 22,8 cm`, `Cava · copa 19,7 cm`;
- under each value a proportional bar, width `length / max * 100%`, the shorter seam's
  bar showing the shortfall as a lighter remainder against the longer one;
- a closing line naming the gap and its direction: `falta 3,1 cm na copa`.

When either length is missing the card renders exactly as it does today — the
`diferença` line and the suggestion, no empty rows and no zeroed bars.

### 3. The canvas markers carry their own value

**`components/editor/PatternCanvas.tsx`** draws an `<text>` beside each dashed circle,
`fill-alert`, anchored at `cx + r + 4` so it grows away from the piece into empty grid.
This is what design `5e` specifies and what the screen has been missing: _"círculos
tracejados `#b5502f` nos pontos em conflito, **rótulos com os valores** e card lateral"_.

Which circle gets which number is decided by `[conflict.pieceAId, conflict.pieceBId]` —
`body-front` then `sleeve`, the order `detectConflict` builds the markers in — and only
when `markers.length === 2` and both lengths are present. Any other shape (a legacy blob
whose piece carried no `vertices`, so `armholeMarker` returned `null` and the array
collapsed to one) renders bare circles as today. A missing label is honest; a label on
the wrong seam is not.

### 4. `ConflictActions` loses a button

`Ver diferença`, its `Badge variant="soon"`, and the comment explaining why it was
disabled all go. Two live buttons and the `Correções não consomem crédito.` note remain.
The wrapped second row that the badge forced (badge sitting between `Corrigir manga` and
`Ignorar` at 312px) disappears with it.

### 5. Copy

Removed from `messages/pt-BR.json`: `ConflictActions.viewDiffButton`,
`ConflictActions.comingSoonBadge`.

Added to the `ConflictInfoCard` namespace: `bodyRowLabel` (`Cava · frente`),
`sleeveRowLabel` (`Cava · copa`), `valueCm` (`{value} cm`), and `gapLabel` —
`falta {diff} cm na copa` / `sobra {diff} cm na copa` behind an ICU
`{direction, select, larger {…} smaller {…}}`, mirroring the shape
`PatternData.conflict.description` already uses for the same distinction. `larger` means
the body's armhole is the longer of the two, so the cap is what falls short.

Both directions are supported even though `armholeDeepenCm` can only deepen (0–6 cm),
because the card reads the two lengths rather than the field that moved them, and
`seamCheck` compares them with `Math.abs`.

## Non-goals

- No new persisted field, no migration, no blob reset.
- No debit, no version bump, no store mutation — the comparison is render-time only, so
  the free-actions guarantee holds by construction rather than by a route check.
- No zoom-to-conflict, no seam overlay drawing, no third floating panel. The canvas
  overlay slot stays the two-way `ConflictInfoCard` / `PieceDetailsPanel` exclusivity
  that CLAUDE.md documents.

## Testing

- **node** — `lib/draft/garment.test.ts`: `measureSeams` on a blouse with
  `armholeDeepenCm: 3` returns both lengths, their absolute difference equals
  `seamCheck`'s `diffCm`, and the body's is the longer; a skirt returns both `undefined`.
- **dom** — new `components/editor/ConflictInfoCard.test.tsx`: both values and the gap
  sentence render, asserted against the exact resolved `ptBR` catalog strings (a
  substring or key-path match would pass against a missing key); with the lengths absent
  the card falls back to the diff-only layout.
- **dom** — new `components/editor/ConflictActions.test.tsx`: two enabled buttons, no
  `em breve` badge, handlers fire.
- **dom** — `components/editor/PatternCanvas.test.tsx`: a conflict with two markers
  labels each with its own value; one marker labels neither.

## Evidence

`npm test`, `npm run build`, `npx eslint app lib components`, then the live scenario
reloaded in the browser and screenshotted. The reproduction pattern keeps its conflict
persisted, so re-verifying costs no credit and no AI call.
