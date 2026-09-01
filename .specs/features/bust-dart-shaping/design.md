# Bust-Apex Dart Shaping Design

**Spec**: `.specs/features/bust-dart-shaping/spec.md`
**Status**: Draft

---

## Architecture Overview

No new module, no new architecture layer. This is a formula-level change inside `lib/draft/body.ts`'s existing `bodice()` function, plus two new optional fields on `Measurements` that flow through infrastructure that already exists generically (measurement clamping, the AI's `measurementOverrides` schema, the size-chart table UI).

```mermaid
graph TD
    A[SizeChartData.baseMeasurements / chat measurementOverrides] --> B[resolveMeasurements: clamp to MEASUREMENT_RANGES]
    B --> C[draftAll to bodice: m.highBust, m.bustSpan, m.bustPointHeight]
    C --> D{bustCupDeltaCm = max(0, bust - (highBust ?? bust)) > 0?}
    D -- no --> E[dart unchanged: today's straight vertical wedge]
    D -- yes --> F[compute bust-apex point from bustSpan/bustPointHeight]
    F --> G[re-angle dart apex toward it, widen by cup-delta-derived amount]
    E --> H[dartInternals: fold line + drill holes, generic]
    G --> H
    H --> I[DraftedPiece.internalsCm — unchanged data shape]
```

The dart stays a piece-internal decoration (`InternalCm`/`internalsCm`), exactly like today. No `seamEdges`, notch, seam-graph (`#134`), or assembly-order (`#138`) change — `walkSeamPairs`/`buildAssemblyOrder` never look inside a dart's shape, only at the edge indices this feature doesn't touch.

**Approach already decided in Specify** (not re-litigated here): re-angle the existing dart shape rather than convert it to a side-seam/French dart. That was presented as an explicit trade-off and confirmed by the user (see `spec.md`'s Assumptions table, "Dart topology").

---

## Research: sourced formulas

Per the Knowledge Verification Chain (codebase → docs → Context7 → web search), the codebase and its own docs have no bust-apex formula to reuse (confirmed by reading `body.ts`/`sleeve.ts`/`ease.ts`/`measurements.ts` in Specify), so this went to a web search — the same tier of sourcing `body.ts` already cites (Aldrich, ikatbag.com, dresspatternmaking.com, muellerundsohn.com):

| Quantity                                                     | Cited value                                                                                                                                                                   | Source                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Apex-to-apex (bust span)                                     | "standard range 18–20 cm" (full range 15–23+ cm)                                                                                                                              | [Wave PLM, "How to Take Bust Point Measurement"](https://blog.waveplm.com/mastering-bust-point-measurement-from-apex-to-apex-and-shoulder-to-apex-accuracy/)                                                                                                                                               |
| Center-front to apex (horizontal)                            | half of apex-to-apex, plus ~0.5 cm ease                                                                                                                                       | [In the Folds, "How to draft a bodice block"](https://inthefolds.com/blog/2016/2/22/how-to-draft-a-bodice-block)                                                                                                                                                                                           |
| Shoulder-to-apex (vertical)                                  | "typical range 23–30 cm"                                                                                                                                                      | [Wave PLM, "How to Take Bust Point Measurement"](https://blog.waveplm.com/mastering-bust-point-measurement-from-apex-to-apex-and-shoulder-to-apex-accuracy/)                                                                                                                                               |
| Full-Bust-Adjustment amount from a high-bust/full-bust delta | "for every 1 inch difference beyond the base cup, add/subtract ½ inch to the pattern" — i.e. **half the raw circumference delta is the amount added to a HALF-front pattern** | Industry-standard FBA convention, consistently stated across [Cashmerette](https://blog.cashmerette.com/2020/10/how-to-calculate-the-size-of-a-full-bust-adjustment.html) and [Closet Core Patterns](https://blog.closetcorepatterns.com/bodice-fitting-6-how-to-do-full-bust-adjustments-for-any-bodice/) |

**Refinement vs. the spec's rough phrasing:** the spec's AC1 described `bustPointHeight` loosely as a "vertical offset from the waist." The cited, standard measurement name is **shoulder-to-apex** (vertical distance from the shoulder seam down to the bust point) — which also maps directly onto `bodice()`'s own coordinate frame, since `shL`'s y-coordinate is already `shoulderSlope`. This design defines `bustPointHeight` as shoulder-to-apex and computes `apexYCm = shoulderSlope + bustPointHeightCm`. This does not change any acceptance criterion (AC1 only requires the axis to point at a derived apex point) — it fixes the exact anchor to the real, citable, user-measurable reference instead of an arbitrary one, and it is what the size-chart UI's measurement-guide text will instruct the user to measure.

**No cited source ties bust span or shoulder-to-apex to bust circumference by a formula** (both read as frame/torso characteristics with a "standard/typical" band, not a girth-proportional rule) — this mirrors the codebase's own existing precedent for `shoulderSlope` (`lib/sizeCharts/seed.ts`: "a frame characteristic... NOT graded across sizes"). So both new fields' fallback is the **cited band's midpoint, applied flat across every size** — not scaled by bust — exactly like `shoulderSlope`'s existing seeded constant, not like `backWidth`'s bust-proportional one.

---

## Code Reuse Analysis

### Existing Components to Leverage

| Component                                    | Location                                                              | How to Use                                                                                                                                                                                                           |
| -------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXTENDED_MEASUREMENT_KEYS` pattern (`#132`) | `lib/measurements.ts`                                                 | Add `bustPointHeight`, `bustSpan` the same way `neckGirth`/`highBust`/`backWidth`/`bicep`/`rise` were added: optional field, `MEASUREMENT_RANGES` entry, inline fallback at the one drafter call site that reads it. |
| `resolveMeasurements` clamping               | `lib/measurements.ts`                                                 | Already generic over every `MEASUREMENT_RANGES` key — no change needed beyond the table entry.                                                                                                                       |
| AI `measurementOverrides` schema             | `lib/ai/schema.ts:82-93`                                              | Already derives its `properties` from `Object.entries(MEASUREMENT_RANGES)` — no schema/prompt code change needed.                                                                                                    |
| Size-chart table UI                          | `components/sizeCharts/SizeChartTable.tsx` (reads `MEASUREMENT_KEYS`) | Already renders every key generically — only the two catalog entries (`SizeCharts.measurement.*`, `SizeCharts.measurementGuide.*`) are new.                                                                          |
| `classifyGirthFit`'s negative-value handling | `lib/draft/ease.ts:94-100`                                            | Same "clamp to zero, no class/effect below it" pattern reused for `bustCupDeltaCm`.                                                                                                                                  |
| `dartInternals`                              | `lib/draft/core.ts`                                                   | Fully generic over dart polygon points — already computes fold line + drill holes from whatever `ptsCm`/`apexesCm` a drafter hands it. No change.                                                                    |
| `zod` extended-key mask                      | `lib/schemas/measurements.ts:40-45`                                   | Add `bustPointHeight: true, bustSpan: true` to the existing literal mask, mirroring `neckGirth`/`backWidth`/`bicep`/`rise`.                                                                                          |
| `extendedMeasurementsFor`                    | `lib/sizeCharts/seed.ts:41-86`                                        | Add the two new fields' flat-constant fallback (per gender, not per size — the `shoulderSlope` precedent at line 68), so both system charts carry an explicit, editable value rather than leaving it implicit.       |

### Integration Points

| System                | Integration Method                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Drafting engine       | `bodice()` in `lib/draft/body.ts` — the only code that reads the two new fields and computes the apex/dart-width math.                                                                           |
| Size-chart validation | `lib/sizeCharts/validate.ts`'s `MEASUREMENT_KEYS` re-export already covers new keys generically; `lib/schemas/measurements.ts`'s zod schema needs the two-line mask addition above.              |
| AI layer              | None beyond the automatic schema derivation — no new `GarmentStyle` field, no prompt change (this mirrors how `highBust`-driven armhole depth already works with zero AI-prompt visibility).     |
| i18n catalog          | `messages/pt-BR.json`'s `SizeCharts.measurement.*` / `SizeCharts.measurementGuide.*` — two new keys each.                                                                                        |
| Tests                 | `lib/draft/body.test.ts`, `lib/draft/garment.test.ts` (containment matrix), `lib/measurements.ts`'s own range/key-list tests, `lib/schemas/measurements.test.ts`, `lib/sizeCharts/seed.test.ts`. |

---

## Components

### `Measurements` (data model change)

- **Purpose**: Carry the two new optional fields.
- **Location**: `lib/measurements.ts`
- **Interfaces**: add to the `Measurements` interface, `EXTENDED_MEASUREMENT_KEYS`, `MEASUREMENT_RANGES`.
- **Dependencies**: none new.
- **Reuses**: the `#132` extended-field pattern verbatim.

### `bodice()` bust-apex math (the only real logic change)

- **Purpose**: Compute the bust apex point and dart-width delta, re-angle the front dart(s) toward it when a real cup delta exists.
- **Location**: `lib/draft/body.ts`, inside `bodice()`, adjacent to the existing `if (fitted) { ... dartsStruct ... }` block.
- **Interfaces** (new local helpers, not exported — this stays as internal to `body.ts` as `armCtrlX`'s own math):
  - `bustCupDeltaCm(bust, highBust): number` — `Math.max(0, bust - (highBust ?? bust))`.
  - `bustApexPointCm(m, shoulderSlope): Pt` — `[cx ± (bustSpanCm/2 + 0.5), shoulderSlope + bustPointHeightCm]`, each of `bustSpanCm`/`bustPointHeightCm` resolved from `m.bustSpan`/`m.bustPointHeight` when present, else the flat cited fallback constants, then clamped into the panel's valid interior band (see Error Handling below).
- **Dependencies**: `m.highBust`, `m.bustSpan`, `m.bustPointHeight`, the panel's own already-computed `shoulderSlope`, `cx`, `waistY`, `halfChest`.
- **Reuses**: the existing `oneDart(side)` closure — only the apex coordinates it returns change; the polygon/fold/notch construction around it is untouched.

### `extendedMeasurementsFor` (seed formula)

- **Purpose**: Give both system charts an explicit, editable, real value for the two new fields instead of leaving them undefined.
- **Location**: `lib/sizeCharts/seed.ts`
- **Interfaces**: extend the function's return type and body with the two flat cited constants (per gender — `shoulderSlope`'s precedent, not graded by size index).
- **Dependencies**: none.
- **Reuses**: the `shoulderSlope` "flat per-gender constant, not size-graded" precedent exactly (same file, lines 63-68).

---

## Data Models

```typescript
// lib/measurements.ts
export interface Measurements {
  // ...unchanged core + existing extended fields...
  bustPointHeight?: number; // shoulder seam → bust apex, vertical (cm)
  bustSpan?: number; // apex-to-apex, horizontal (cm)
}

export const EXTENDED_MEASUREMENT_KEYS: (keyof Measurements)[] = [
  "neckGirth",
  "highBust",
  "shoulderSlope",
  "backWidth",
  "bicep",
  "rise",
  "bustPointHeight",
  "bustSpan",
];
```

`MEASUREMENT_RANGES` additions (bounds a little wider than the cited "typical" bands, matching how every existing range already extends past the average case — e.g. `bust: {70,140}` vs. an average adult range):

```typescript
bustPointHeight: { min: 18, max: 34 }, // cited typical band 23-30
bustSpan: { min: 12, max: 26 },        // cited typical band 15-23(+)
```

**Relationships**: both are `EXTENDED_MEASUREMENT_KEYS` on `Measurements`, so they inherit every existing pipeline (chart storage, AI override clamping, size-chart table rendering) with no relationship changes elsewhere.

---

## Formulas (the feature's actual behavior)

All in `lib/draft/body.ts`'s `bodice()`, guarded by the existing `fitted` flag (already `style.darts && !opts.knit`) — no effect on an unfitted/knit panel, matching Edge Case 3.

```
bustCupDeltaCm      = max(0, bust - (highBust ?? bust))
hasCupDelta         = bustCupDeltaCm > 0                 // the P1/P2 gate

bustSpanCm          = m.bustSpan ?? 18.5                 // cited standard-range midpoint, flat (frame trait, not size-graded)
bustPointHeightCm   = m.bustPointHeight ?? 26.5          // cited typical-range midpoint, flat (frame trait, not size-graded)

apexXOffsetCm       = clamp(bustSpanCm / 2 + 0.5, 2, halfChest - 2)   // cited: half apex-to-apex + 0.5cm ease
apexYCm             = clamp(shoulderSlope + bustPointHeightCm, shoulderSlope + 4, waistY - 4)

halfFrontFbaCm      = bustCupDeltaCm / 2                 // cited FBA convention: half the raw delta goes to one half-front
extraDartHalfWidthCm = halfFrontFbaCm / 2                // that half-front amount is this dart's full width; dartHalfWidth is a half-width

// existing: dartHalfWidth = max(0.9, dartsSuppression / 8)
dartHalfWidth = hasCupDelta
  ? existingDartHalfWidth + extraDartHalfWidthCm
  : existingDartHalfWidth  // AC-04/P2: byte-identical when no real delta
```

Apex re-angling (only the apex(es) pointing _toward the bust_, i.e. above the waist):

- **Fisheye dart** (blouse/t-shirt, non-dress-hem): `apexTop` moves from `[dx, waistY - dartRiseCm]` to `[cx ± apexXOffsetCm, apexYCm]` (sign matching the dart's own side); `apexBottom` (below the waist, no anatomical target) is untouched.
- **Dress waist-join dart** (single apex, already above the waist): that one apex moves the same way, from `[dx, waistY - dartRiseCm]` to `[cx ± apexXOffsetCm, apexYCm]`.
- **Front-closure half-panel**: same fisheye-branch treatment as above (it never sets `isDressHem`, per its own gating).
- The dart's base/leg points (`[dx ± dartHalfWidth, waistY]`, on the fisheye's own seam end for the dress case) do **not** move horizontally in `x` beyond the `dartHalfWidth` growth above — `dx` itself (`cx + side*dartOffset`) is unchanged, so notches, the fold-line's lower endpoint, and every index into `pts`/`seamEdges` stay exactly where they are today.

`hasCupDelta` is false for both system charts (`highBust` seeded `=== bust`) and for every existing chart/pattern that predates this feature (field absent) — so this whole block is a no-op for them, satisfying P2 without a separate flag.

---

## Error Handling Strategy

| Error Scenario                                                                                             | Handling                                                                                                                                 | User Impact                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `highBust` entered greater than `bust` (inverted/typo)                                                     | `bustCupDeltaCm` clamps to 0 via `Math.max(0, ...)` — no negative width, no inverted dart                                                | Dart drafts exactly as if no cup data were given; no error surfaced (mirrors `classifyGirthFit`'s existing negative-ease handling)        |
| Extreme `bustSpan`/`bustPointHeight` at range boundaries, combined with a small `waist`/`backLength` chart | `apexXOffsetCm`/`apexYCm` clamp into the panel's own valid interior band (`[2, halfChest-2]` / `[shoulderSlope+4, waistY-4]`) before use | Dart stays a valid, contained polygon; apex may sit closer to the panel's structural limit than the raw formula implies, never outside it |
| A garment/gender combination with no dart at all (knit, unfitted)                                          | `fitted` gate is unchanged — this feature's code path isn't reached                                                                      | Identical to today: no dart, nothing to re-angle                                                                                          |
| A pattern's frozen `sizeTable` predates these fields                                                       | Same as every other extended field (`#132`) — fields read `undefined`, `hasCupDelta` is false                                            | Byte-identical redraft to before this feature shipped                                                                                     |

---

## Risks & Concerns

| Concern                                                                                                                                                   | Location                            | Impact                                                                                                                                                                | Mitigation                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The FBA-derived width is routed entirely into dart width rather than a true slash-and-spread (which would also add a little side-seam/armhole fullness)   | `lib/draft/body.ts`'s `bodice()`    | For a large cup delta (e.g. a D/E-cup-range `bustCupDeltaCm`), the resulting single dart could look unusually wide compared to a professionally graded multi-dart FBA | Explicitly the scope this feature's Assumptions table already accepted ("re-angle the existing dart" over the structurally bigger French-dart alternative); flagged again here so a future feature (the deferred French/side-seam dart) has a named reason to exist                                                                                       |
| `garment.test.ts`'s `DECORATION_CASES` containment matrix doesn't yet include any fixture with a real `highBust`/`bustSpan`/`bustPointHeight` combination | `lib/draft/garment.test.ts`         | Without new cases, the containment invariant this feature depends on (AC-05) is unverified at the boundary values                                                     | Tasks phase adds boundary-value cases (`bustSpan`/`bustPointHeight` at `MEASUREMENT_RANGES` min/max, paired with the smallest chart size) to the existing matrix rather than a separate ad hoc test                                                                                                                                                       |
| Two-line literal mask in `lib/schemas/measurements.ts` (line ~40-45) is hand-maintained, not derived from `EXTENDED_MEASUREMENT_KEYS`                     | `lib/schemas/measurements.ts:13-30` | A future extended field could be added to `Measurements` without updating this mask, silently rejecting it at the zod boundary                                        | Out of this feature's scope to refactor (pre-existing pattern, all six current keys already hand-listed) — Tasks phase just adds the two new keys the same way, and a test already pins the mask against `EXTENDED_MEASUREMENT_KEYS` per the file's own comment (verify in Tasks; if absent, note as a pre-existing gap, not one this feature introduces) |

> No security, auth, or performance concerns — this is pure client/server-shared arithmetic on already-trusted, already-clamped numeric fields.

---

## Tech Decisions

| Decision                                                  | Choice                                                                      | Rationale                                                                                                                            |
| --------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `bustPointHeight` reference frame                         | Shoulder-to-apex (not waist-to-apex as the spec's rough phrasing suggested) | Matches the real, citable, user-measurable convention; maps directly onto `shL`'s existing `y = shoulderSlope` coordinate            |
| Fallback scaling                                          | Flat per-gender constant, not graded by size/bust                           | No cited source ties either quantity to bust circumference; mirrors the existing `shoulderSlope` precedent exactly                   |
| Where the extra width goes                                | Entirely into dart width (not a broader slash-and-spread)                   | Matches the "re-angle, don't restructure" choice already confirmed in Specify; named as a Risk above for a future feature to revisit |
| Only the upper (bust-facing) apex of a fisheye dart moves | The lower apex (toward the hip) has no anatomical target                    | Keeps the hip/hem-side suppression exactly as today — no regression there                                                            |

**Project-level decisions to record** (appended to `.specs/STATE.md` as `AD-001`/`AD-002` once this design is confirmed): the shoulder-to-apex reference-frame convention and the "flat, not bust-scaled" fallback rule for frame-characteristic extended measurements, since a future feature (waist/hip ease, sleeve silhouette) will face the identical "is this a girth-proportional or a flat frame trait" question.
