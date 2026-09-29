# Drafting engine

> This is the _why_. For the operative rule, see [`../architecture/drafting.md`](../architecture/drafting.md).
> For universal, cross-cutting rules, see the root [`CLAUDE.md`](../../CLAUDE.md).

### Drafting engine (`lib/draft/*`)

- **Pieces are drafted from measurements, not deltas.** `lib/measurements.ts` defines `Measurements` (bust, waist, shoulder, … — `shoulder` is the half-width from the body's center line to the shoulder tip, not the full shoulder seam) plus the legacy `SIZE_TABLE` (female)/`SIZE_TABLE_MALE` (male) tables, now used only as seed data for the two system size charts and the pre-generation bootstrap default.
- **#132: `Measurements` widened past the original nine proportional keys.** Those nine (`bust`, `waist`, `hip`, `hipHeight`, `backLength`, `shoulder`, `skirtLength`, `shortSleeveLength`, `longSleeveLength`) are `CORE_MEASUREMENT_KEYS` and stay required — `assertResolvedMeasurements` (below `resolveMeasurements`) still demands every one, on every base row. Six more are `EXTENDED_MEASUREMENT_KEYS`, and every one of them is **optional** — a chart, or a pattern's already-frozen `sizeTable` snapshot, can simply not have it. Each is read by exactly the drafter it lets a user override, and falls back to the exact proportion it replaces when a chart doesn't set it:

  ```
  neckGirth     → body.ts neckHalf = neckGirth/6 + offset            → falls back to bust/14 + offset
  highBust      → body.ts armholeDepthBase = (highBust ?? bust)/8 + offset → falls back to bust/8 + offset
  shoulderSlope → body.ts shoulderSlope                              → falls back to 4.0 female / 4.5 male (a flat constant either way)
  backWidth     → body.ts BACK PANEL ONLY: armCtrlX = backWidth/2 + wearingEase, at midArmY → falls back to (shoulderHalf + halfChest)/2 - 1
  bicep         → sleeve.ts bicep = (bicep ?? bust*BICEP_PROPORTION_OF_BUST) + wearingEase  → falls back to bust*BICEP_PROPORTION_OF_BUST + wearingEase
  rise          → trousers.ts riseCm = rise (crotch depth, waist to seat)   → falls back to hip/4 + 4
  ```

  `backWidth` earned a real design correction mid-review, worth recording so it isn't repeated: `armCtrlX` is the armhole curve's own control point, at a height strictly between the shoulder tip and the underarm — roughly shoulder-blade/upper-chest height, which is exactly where `SizeChartTable.measurementGuide.backWidth` sends the user's tape ("axila a axila pelas costas, na altura das omoplatas"). `halfChest` — the underarm-level width, where front, back and sleeve all meet — stays bust-derived for **both** panels, always; a first version of this wired `backWidth` into `halfChest` instead (seeded as `bust/2` purely so the fallback formula stayed a no-op), which meant the seeded "across-back" value was ~46cm at a 92cm bust while a real tape measures ~36-38cm there. A user who actually measured and entered that real number got a back panel roughly 5cm narrower per side than intended — the exact fit failure this issue exists to prevent, and it was only caught because a reviewer checked the _present_ case, not just the (byte-identical, well-tested) _absent_ one. `armholeLenCm` still sums front + back (#139), so the sleeve cap resizes to a changed back automatically; no new seam-conflict path was introduced.

  **Seeding is a no-op for four of the six fields, and deliberately not for the other two.** The two seeded system charts (`lib/sizeCharts/seed.ts`'s `extendedMeasurementsFor`) populate `neckGirth`/`highBust`/`shoulderSlope`/`bicep` with the exact value that reproduces the fallback formula above — `neckGirth = bust*3/7` (so `neckGirth/6 == bust/14`), `highBust = bust` (the legacy tables never modelled a cup difference, so "no assumption" is the honest default), `shoulderSlope` = the same per-gender constant, `bicep = bust*0.3` (the existing `BICEP_PROPORTION_OF_BUST`) — so populating a brand-new account's system chart with these four changes **nothing** about what it drafts. `backWidth` is seeded as `bust*0.4` (~36.8cm at bust=92) instead: a real across-back proportion, not a value chosen to cancel out algebraically. It is a field where populating the system chart is an intentional geometry change — a pattern drafted after this shipped has a genuinely different (more anatomically honest) back than one drafted before it, at the same bust. `rise` (#128) is the other non-no-op field, for a different reason: it's graded per size (`(male ? 27 : 26) + 0.5 * sizeIndex`, the same linear-step shape `skirtLength`/`hipHeight` already use) rather than reproducing `trousers.ts`'s own hip-derived fallback — there was nothing to reproduce until #128 shipped a drafter that reads it.

  **No migration, and none is needed.** A pattern snapshots its size chart once, at first generation (see Size charts below) — an existing pattern's frozen `sizeTable` predates all six EXTENDED keys entirely, so it keeps taking every fallback path forever and keeps drafting exactly as it always has. Only a pattern generated for the first time _after_ this shipped snapshots a chart that already has `backWidth` set, and picks up the real value. This falls straight out of the existing snapshot-once rule (same as a size chart's `name`/`bodyType` never retroactively touching an in-progress pattern) — don't "fix" the difference with a backfill; there's nothing broken to fix.

- `resolveMeasurements(base, overrides)` applies chat-driven `measurementOverrides` onto an already-resolved base row (clamped to `MEASUREMENT_RANGES`); the base row comes from the pattern's frozen `sizeTable` snapshot (see Size charts). No size/gender table lookup happens here anymore.
- `GarmentType` = `"blouse" | "dress" | "skirt" | "tshirt" | "trousers"`. A `GarmentSpec` (`type` + `gender` (`"female" | "male"`) + `measurementOverrides` + `style`) plus a resolved `Measurements` row flow into `draftGarment(spec, baseMeasurements, t)` (`lib/draft/garment.ts`), which calls the per-block drafters (`body.ts`, `sleeve.ts`, `skirt.ts`, `trousers.ts`, shared helpers in `core.ts`) to build each `Piece`'s outline/guide/grainline/dart in cm and lay them into one computed `viewBox` (`autoLayout`). The engine doesn't know `SizeLabel` — it's a plain per-chart `string` now, not the old fixed `"PP"|"P"|"M"|"G"|"GG"` union.
- `tshirt` is a knit archetype (round neck, no darts, short sleeves by default) drafted through the same `body`/`sleeve` drafters, with `knit: true` in `BlockOpts` and those style defaults pre-filled in `draftGarment`.
- Outlines: `outlinePath` (`core.ts`) takes a flat cm point list plus drafter-supplied `curvedSpans: [number, number][]` — only marked ranges (neckline, armhole, sleeve cap) get Catmull-Rom-derived Bézier curves with tangents locked at span edges; every other edge is a straight `L`. No global smoothing pass, no `curvedIds` — curvature is per-edge-range, opt-in per drafter.
- Each drafter attaches its own `piece.detailRows` (label/value pairs) — the old fixed `PieceDetails` shape is gone.
- **A decoration is placed from the piece's own boundary, never from its bounding box.** The bbox is a superset of the piece, so a constant offset measured from it lands _outside_ the outline wherever the piece is scooped (a neckline) or tapered (a sleeve hem) — and both shipped that way. The body grainline started at `y = 3` cm from the bbox top, which put it inside the neck opening for **every** front bodice (measured: 4.6 cm outside a round neck, 6.9 cm on a male t-shirt, 17.6 cm on a max-depth V); since the grainline reaches all five export formats, that was a data defect, not a screen one. It now starts at `neckDrop + 3` — 3 cm below the piece's own neckline. The canvas label was the other half: `place()` anchors it at `bbox-left + 6` and `PatternCanvas` drew it `text-anchor: start` at a fixed 11 px, but "MANGA · 2×" is wider than a size-M sleeve's bicep (68–75 px of text against 64 px of piece), so it spilled past the outline. Placement that depends on the _rendered text's_ width can't live in the drafter, so `lib/canvas/pieceLabel.ts`'s `fitPieceLabel` recomputes it at render time from `piece.vertices` — a scanline for the piece's real horizontal span at the label's baseline, then the largest size up to `MAX_LABEL_FONT_SIZE` that fits — which also repairs patterns drafted before the fix. A piece with no `vertices` (blobs predating the measure tool's snap) keeps the stored anchor, so `piece.label` survives as the legacy fallback only; it is also why nobody noticed that it ignores `bbox.minX`/`minY` and is correct purely because every drafter happens to normalize its outline to 0,0. `estimateTextWidth`'s 0.7em advance is deliberately wider than Archivo's real uppercase average, so a mis-estimate shrinks the label instead of overflowing the piece — `getComputedTextLength()` would be exact but needs a render pass, and jsdom doesn't implement it, which would put the rule beyond a test's reach. The invariant is guarded generically, not per-case: `garment.test.ts`'s containment suite asserts every grainline and dart point of every piece lies inside its own outline across seven garment/style combinations. (Note the design prototype puts each label _below_ its piece rather than inside it; contained-inside is what the bug report asked for and what shipped.)
- **#124: notches are typed (`single`/`double`/`triple`), drafter-derived, and never persisted or user-movable** — `DraftedPiece.notches` (`core.ts`'s `NotchCm`: `type` + `outerCm` on the net outline + `innerCm` nudged inward), following the same derive-don't-store precedent as `measureSeams`/`fitPieceLabel`/`foldEdge`. The three types are told apart purely by how far the tick reaches — `NOTCH_DEPTH_CM` (0.3/0.6/0.9 cm) — which is simultaneously the AC's own "printable size" (3 mm/6 mm), not a second number to keep in sync. `core.ts` exports the geometry primitives every drafter calls: `notchAt(point, tangent, insideRef, type)` orients the tick's inward normal by biasing toward `insideRef` — a point the caller knows lies inside the piece — so it points into the fabric regardless of which winding direction that outline happens to walk (drafters mix clockwise/counter-clockwise, the same problem `lib/export/offset.ts` self-calibrates for on a whole outline); `notchAtVertex` derives the tangent from a vertex's own neighbours (exact at a straight-edge midpoint like a `foldEdge` endpoint, a good approximation at a smooth symmetric peak like the sleeve cap apex); `pointAndTangentAtCm`/`notchAtArcLengthCm` walk `distCm` from one vertex toward another along the same Catmull-Rom/Bézier geometry `curveArcLengthCm` measures, clamped to the segment's own length. `place()` (`core.ts`) translates `outerCm`/`innerCm` into a `Piece.notches` entry (`PieceNotch`, px, the same two-point-line shape as `grainline`). **Superseded by #263:** `insideRef` is gone — every drafted outline is now normalized to one canonical winding (`normalizeWinding`, called from `garment.ts`'s `draftAll` right after each piece is drafted), so `notchAt` derives its inward normal from a fixed formula instead of a caller-supplied interior point, and `notchAtVertex`/`notchAtArcLengthCm` run their own derived tangent through `canonicalTangent` first (correct for the outline they're actually given, ahead of that later normalization pass). See `docs/architecture/drafting.md`.
- **Mated notches share one computed distance, not two independent guesses.** `body.ts`'s `bodice()` computes `pitchNotchCm`/`basePitchNotchCm` (`min(8, armholeEdgeLenCm * 0.7)`, off the actual and the un-deepened armhole respectively) and returns both from `draftBody`; `garment.ts`'s `draftAll` picks whichever matches the armhole the sleeve's cap was ACTUALLY drafted against (refit or not — the same actual/base choice it already makes for `sleeveArmhole`) and hands that single number into `draftSleeve`'s new `pitchNotchCm` parameter. Both pieces then place their pitch notch by walking that identical value from their own underarm vertex, so a front's single notch and the sleeve's own single-side notch land at truly matching positions "generated as pairs from the same computation" by construction, not by coincidence — verified in `garment.test.ts` across the full `DECORATION_CASES` matrix (chord-distance-from-underarm matches within 0.2 cm) plus the seam-conflict case (deliberately diverges when unrefit, exactly mirroring the seam's own divergence). Single marks the front, double the back — standard pattern-making convention — and the sleeve's single/double pair sits on opposite cap sides (bilaterally symmetric, so either physical arm can be cut from the same flat piece by flipping fabric); the cap's third notch (the apex, marking where the shoulder seam meets the cap) is deliberately excluded from that cross-check, since it has no single body-side counterpart to pair with (the shoulder point is a plain corner vertex on both the front AND back panels, not itself notched).
- **Every other notch is placed by direct convention, not by cross-piece coordination.** A hem-fold notch (single) sits at every piece's own `foldEdge` hem-end vertex (body panels and every skirt silhouette). A dress bodice's hem/waist-join edge additionally gets: double notches at its two outer corners (`hemL`/`hemR`) mirrored by the skirt panel's own waist-edge corners when `draftSkirt`'s new `isDressWaist` parameter is true (`garment.ts` passes `spec.type === "dress"`) — both sewn edges are the identical length by construction (`dressWaistHalfCm`, #79/#177 — straight/a-line always was; a circle/gore/half-circle skirt only became true once #177 moved the bodice hem off the hip and, for half-circle specifically, split the panel's one waist arc between the two bodice halves — see Seam-conflict detection above), so the corners are a real join, not an approximation; and single notches at each dart's leg-seam intersections, only for the dress-hem (single-ended) dart, since the fisheye (double-ended) dart on a non-dress piece is fully internal and touches no edge to notch.
- **#127: `Piece`/`DraftedPiece` carry a typed `internals` channel — darts (now zero or more per piece, not "at most one"; that premise was already false before this issue, since #122 had made `darts` an array), each dart's own fold line, and its drill hole(s).** `lib/draft/core.ts`'s `InternalCm` union (`dart`/`foldLine`/`drillHole` ship geometry; `pleat`/`styleLine`/`placementMark` are reserved — no drafter emits any of the three yet **— superseded by #244 below: `skirt.ts`'s `pleatFoldPlacement` is the `pleat` kind's first real emitter**) is the cm-space shape a drafter attaches to `DraftedPiece.internalsCm`; `place()` translates it into `Piece.internals` (`PieceInternal`, px, path strings for path-shaped kinds like `notches`/`grainline` already do). `core.ts`'s `dartInternals(ptsCm, fold, apexesCm)` is the one place a dart's own three marks are derived together: the fold line is the dart's own press line (apex-to-apex for a double-ended/fisheye dart, apex-to-seam-midpoint for a single-ended one) — a different concept from the piece's own cut-on-fold axis (`foldEdge`/`fold`, unchanged by this issue) — and each free apex (not a seam end) gets a drill hole `DRILL_HOLE_SETBACK_CM` (1.25 cm, within the 1.0–1.5 cm convention) short of the point, clamped to 90% of the fold segment's own length. `body.ts`'s `bodice()` is the one drafter that builds darts; it now returns `internalsCm` instead of the old `dartsCm`. **Migration:** the legacy `Piece.darts?: { d: string }[]` field (#122's array, not a single dart) is superseded but kept readable — no new draft ever writes it, and `lib/types.ts`'s `resolvePieceInternals(piece)` maps an old blob's `darts` into the same `PieceInternal[]` shape at render time, the `savedAgo` precedent (no reset migration). `PatternCanvas` renders every internal kind distinctly (dart: solid path; foldLine: dashed line; drillHole: small open circle) via that same resolver. Export's `ExportPiece` keeps its own existing `darts` field (always freshly rebuilt by `buildExportModel`, never persisted, so it has no legacy shape to reconcile) and adds two siblings, `internalFoldLines`/`drillHoles`, built from the same `internalsCm`. `toDxf` writes a dart's fold line as a `LINE` and a drill hole as both a `POINT` and a `CIRCLE`, all on the existing `INTERNO` layer; `toDxfAama` writes the fold line as a `LINE` on layer 8 (joining the dart it belongs to) and the drill hole as a `CIRCLE` on layer 13 — D6673's own reserved drill-hole layer, closing that half of issue #2 (see `toDxfAama` below). `toSvg`/`toPdf` draw the fold line as a fine dotted line in the dart's own color and the drill hole as a small open ink circle; `toPlt` shares the dart's own pen for the fold line and adds a dedicated `PLT_PENS.drillHole` pen, emitting the hole via HPGL/2's native `CI` (circle) command.
- **#129/#130/#131 (Wave 2/W4): three small sub-piece drafters — collar, cuff+placket, waistband — live in `lib/draft/subpieces.ts`, each sized from a MEASURED edge on an already-drafted piece, never a proportion of the bust/waist.** `GarmentStyle` gained three closed enums (`lib/types.ts`): `collar?: "none" | "convertible"`, `cuff?: "none" | "straight"`, `waistband?: "none" | "straight"` — `validateSpec` clamps each the same way `neckline`/`sleeve`/`skirt` already do, and `lib/ai/schema.ts`/`prompt.ts` render the same exported `COLLARS`/`CUFFS`/`WAISTBANDS` constants (`lib/draft/garment.ts`) rather than a hardcoded duplicate. Because there is no third value for an unsupported shape (mandarin collar, shaped cuff, contoured waistband) to fall into, the AI's only path for one is `decline`/`ask` — never a silent substitution — and `prompt.ts`'s own catalog lines spell that out; on-screen, the drafted piece's own detail row says the rest are "em breve" (there is no dedicated style-picker UI these fields could otherwise disable+badge in, since `GarmentStyle` is chat-driven, not form-driven).
  - **Collar** (`draftCollar`): `body.ts`'s `bodice()` exposes two more `seamEdges` per panel, `necklineLeft`/`necklineRight` (the same `[cf, hpsL]`/`[hpsR, wrap-to-cf]` index pair its own neckline `curvedSpans` already use). `draftAll` sums all four (front+back, both halves) via `curveArcLengthCm` into the real drafted neckline circumference and drafts the collar's own straight neckline-seam edge to exactly that length — applies to any body-having garment (blouse/dress/tshirt) with `style.collar === "convertible"`, qty 1 (cut on fold at center back).
  - **Cuff + placket** (`draftCuff`/`draftPlacket`): `sleeve.ts` exposes `seamEdges.hem` (the straight edge between its two hem vertices); `draftAll` measures it and adds `WRIST_EASE_CM` (a flat knit/woven table, `sleeve.ts` — the issue's own "not a proportion" instruction, since the hem is bicep-derived and far wider than an actual wrist) to size the cuff's own seam. Only reachable with `style.sleeve === "long"` — a short/sleeveless spec simply never drafts the cuff branch, the same "type-mismatched style field is unused" precedent skirt-only fields already follow on a bodice. The placket is fixed-dimension (not measured — only the cuff's own AC requires that), qty 2 each (one per sleeve).
  - **Waistband** (`draftWaistband`): reuses `skirt.ts`'s existing `seamEdges.waist`, summed across the panel's own `qty` (the closed waist loop is `qty` copies of one drafted panel's waist arc, not one panel's share of it) plus a fixed `WAISTBAND_OVERLAP_CM` closure allowance. **Superseded by #319/#320 below:** that raw summed edge is what a panel's own dart/pleat widens without ever narrowing back down, so this sizing was silently cutting the band to the panel's cru (unsuppressed) waist rather than the waist its darts/pleats actually leave — see the entry at the end of this file for why, and for `presentedEdgeLenCm`, the fix. Applies to the standalone skirt archetype (`spec.type === "skirt"`) and, since #128, to trousers too (summed across both the front AND back panel's own measured waist edges — see the trousers bullet below) — a dress's skirt panel joins the bodice directly at the natural waist instead (the pre-existing `waist-join-front`/`-back` pairs, and #177's own tracked gap there); waistband and waist-join never both apply to the same garment. **Defaults ON** (`style.waistband ?? "straight"`), unlike collar/cuff's default-off: a skirt or trousers with no waistband is the exact defect #131 exists to fix, so both draft one unless a request explicitly sets `"none"`. The button/zip closure position is a placement mark the issue's own decision deferred ("needs the internal-geometry channel... emit the band without the mark and say so") — #127 later added exactly that channel (`InternalCm`'s reserved `placementMark` kind), but that decision was settled and is deliberately not reopened here; the waistband's own detail row still says the mark is missing.
  - **Seam graph:** each new piece declares its own `seamEdges` and is paired into `lib/draft/garment.ts`'s `seamPairs` the same way every other mated pair is (`collar-neckline`, `cuff-hem`, `waistband-waist`) — a collar/cuff/waistband that stopped matching its own seam would be exactly as detectable as an armhole/cap mismatch. All three are `fixable: false` (there is no automatic resolution for any of them, the same "equal by construction" regression-guard shape as `shoulder`/`side`/`sleeve-underarm`) and measure at (or within floating-point noise of) zero `diffCm` by construction, verified within the AC's own 0.3 cm bound in `garment.test.ts`'s "seam graph (#134)" suite — tighter than `seamCheck`'s general 1 cm `SEAM_TOLERANCE_CM`.
  - **Export:** no export-format code changed — every format already draws whatever `ExportModel`/`Piece` it's handed, so the four new pieces flow into every DXF/PDF/SVG/PLT format and `CutPlanTab`'s nesting automatically, the same way #8/#135/#136 already made that true for any new piece. `model.test.ts`'s "cut-line area growth is within 5% of perimeter x allowance" invariant (#123) needed a small fixed floor added to its tolerance (`6 * allowance²`) once these small, mostly-rectangular band pieces existed: a mitred uniform offset legitimately grows a shape's area by `perimeter × allowance` **plus** a real per-corner correction (exactly `allowance²` per 90° corner for a plain rectangle) that a flat 5% relative bound has no room for once a piece's perimeter is short enough for that correction to matter — a large, curve-heavy body panel never noticed it; a ~5 cm-tall band does. This is the offset math behaving correctly, not a defect the fix is papering over.
- **#128 (Wave 2/W5): a fifth archetype, `trousers` — a straight-leg block only (the issue's own scope decision; tapered/wide/flared/cargo are follow-ups), front + back panels plus a waistband, all in `lib/draft/trousers.ts`.** Unlike a bodice/skirt panel, a trouser leg's front and back are each a genuinely asymmetric single-leg shape (the inseam and outseam are different edges, not mirror halves of one centre line) — so neither declares a `foldEdge`; both are cut `qty: 2` (one leg mirrors the other by flipping the fabric, not by folding it). Front and back deliberately share the same rise depth, total length and hip quarter-width (an equal front/back split, the same simplification `skirt.ts`'s own `hip/4` panel already makes) — only the crotch curve's own extension differs (the back's own seat curve reaches further out than the front's), which is what keeps the inseam and outseam an _identical_ length front vs back by construction (both are plumb verticals sharing the same dy, independent of the crotch extension that tells them apart). Each panel gets one waist dart, the same single-ended (apex-to-seam-midpoint) shape `body.ts`'s own dress-hem dart already uses. **Total length had no per-size measurement to fall back to at the time** — #132 added only `rise` (crotch depth), not a leg-length field — so `style.trouserLengthCm` (AI/user-settable, `STYLE_LIMITS`-clamped like `skirtLengthCm`) defaulted to a flat per-gender constant (`TROUSER_DEFAULT_LENGTH_CM`), the same "not graded across sizes" shape `shoulderSlope`'s own flat per-gender constant already uses for a different field. **Fixed in #326 below:** `waistToFloor` (promoted to CORE by #269, after this entry was written) is exactly the missing per-size measurement, and an explicit or defaulted `trouserLengthCm` now grades against it the same fraction-of-reference-row way `skirtLengthCm` already grades against `skirtLength` (#249). **`rise` is read when the chart has it, falling back to `hip/4 + 4`** (a documented crotch-depth proportion) when it doesn't — both seeded system charts already carry a real, per-size-graded `rise` (see the measurement-vocabulary section above), so the fallback is a robustness path, not the common case.
  - **Seam graph:** five pairs, all `fixable: false`. `trouser-front-rise`/`trouser-back-rise` are **self-pairs** — each panel's own centre-front/back edge (the fly seam, the back rise seam) sewn to the mirrored copy of itself, the same self-pair shape `sleeve.ts`'s own two underarm edges already use for its own left/right mirror seam — trivially exact (comparing a curve to itself). `trouser-inseam`/`trouser-outseam` pair front vs back, exact by construction (see above). `trouser-waistband-waist` reuses `draftWaistband` **verbatim, not forked** (`lib/draft/subpieces.ts`, #131's own "reused by the trousers block" acceptance criterion) — summed across both panels' own measured waist edges (each times its own `qty`), the same "closed circumference, not one panel's share of it" rule the skirt's own waistband pairing already follows; verified within 0.3 cm in `garment.test.ts`'s "seam graph (#134)" suite, the same bound #129/#130/#131's own pairs are held to.
  - **Prova 3D (`/pattern/[id]`'s 3D fitting preview) did not cover trousers, until #254.** `lib/proof3d/mesh.ts`'s `buildProofMesh` used to only recognize the body/sleeve/skirt piece ids — a trousers pattern's pieces (`trouser-front`/`trouser-back`) matched none of them, so it silently returned a bare mannequin with zero garment shells instead of failing or saying so. `Proof3DTab` treated `spec.type === "trousers"` as an explicit, named gap (`notSupportedForTrousers`) rather than rendering an unlabeled/empty preview indistinguishable from a bug — the same "surface the limitation where the user meets it" rule this tab's own beta badge already follows — but extending the mesh builder to trousers was explicitly out of scope for that issue.
  - **#254: closes that gap by moving the 2D-to-3D correspondence into the drafters themselves.** `DraftedPiece` gained an optional `placementCm` (`lib/draft/core.ts`'s `PlacementCm`: a `Proof3DRole` tag — `"torso-front"`/`"torso-back"`/`"sleeve"`/`"skirt"`/`"trouser-front"`/`"trouser-back"`/`"accessory"` — plus a reserved 6D translation/rotation transform, GarmentCode's own "every panel carries 6D placement parameters" precedent the issue cites), set by `body.ts`/`sleeve.ts`/`skirt.ts`/`trousers.ts`/`subpieces.ts`. Every archetype's own transform is the identical no-op today (`NO_PLACEMENT_TRANSFORM`/`ACCESSORY_PLACEMENT_CM`) — `mesh.ts` still derives the REAL stack position (girth-scanned ring heights, a sleeve/trouser-leg's own left/right lateral offset) from the drafted geometry at build time, per CLAUDE.md's derive-don't-store rule; the channel exists so a future drafter with a genuinely non-zero placement doesn't have to fight it. `mesh.ts`'s `buildProofMesh` now finds pieces via a role-keyed `findByRole` instead of `findPiece(pieces, "body-front")`-style literal id matches, and gains a trousers branch: two mirrored leg shells, each stacked from its own front+back panel's scanned width (no further doubling, since a trouser panel — unlike a bodice/skirt panel — is NOT mirrored about its own centre line). Heights (waist/rise/hem) are read off each panel's own public `seamEdges` vertices (`edgeDeepYCm` — the deepest of a named edge's two endpoints, not their midpoint, since the `rise` edge is a diagonal from the waist down to the crotch, not a horizontal one like `waist`/`hem`), and the width scan itself (`scanWidthAtY`, max‑x minus min‑x at a given height) needs no assumed centre axis at all — both deliberately engine-agnostic, never assuming a fixed coordinate convention like "the waist sits at local y=0" (true for `lib/draft/trousers.ts`'s own moldai panel, false for the `freesewing` engine's own Titan-based one). `Proof3DTab.notSupportedForTrousers` is removed (trousers now produces a real, non-empty `ProofMesh`); the remaining `notSupportedFor.{hoodie,coat,shirt}` gap stays, since those three archetypes are drafted ONLY by the `"freesewing"` engine's own designs, which declare no `placementCm` role (unlike its tshirt/blouse/skirt/trousers designs, see below). Every `subpieces.ts` sub-piece (collar/cuff/waistband/placket/button-stand) declares `placementCm` too (`role: "accessory"`), satisfying the "every drafter sets it" shape the issue asked for, but `mesh.ts` builds no 3D shell for any of them — an honest, narrower gap, not a silent one.
  - **#254 code-review finding, fixed in the same PR: `findByRole` alone would have silently regressed every freesewing-drafted tshirt/blouse/skirt/trousers preview.** The `freesewing` engine's own design wrappers (`lib/draft/engine/freesewing/designs/{tshirt,blouse,skirt,trousers}.ts`) happen to reuse the EXACT SAME piece ids moldai's own drafters do (`"body-front"`/`"body-back"`/`"sleeve"`/`"skirt"`/`"trouser-front"`/`"trouser-back"`) — which is precisely what made the OLD literal-id `findPiece` lookup work for a freesewing-drafted pattern too, by id-naming coincidence, never by declaration. Switching to role-only matching without teaching those same four wrapper files to declare `placementCm` (mirroring the exact role each `id` already implied) would have gone from "a bare mannequin only for trousers" to "a bare mannequin for every freesewing-drafted archetype this preview used to render" — the review caught it before it shipped. `lib/proof3d/mesh.test.ts`'s own "freesewing engine (#254 code-review finding)" suite drafts a real pattern through `draftGarment(engine: "freesewing", …)` and asserts a non-empty shell for each of the four types, closing the exact gap no earlier test (`mesh.test.ts` or otherwise) exercised.
  - **`components/dashboard/PatternGrid.tsx` had its own hardcoded `GARMENT_TYPES` array**, independent of `lib/draft/garment.ts`'s `TYPES` — the exact "duplicated fact" mistake this file's own convention section warns about (`Wallet.planLabel`, `FREE_PLAN_CREDITS`, `FORMAT_KEYS`, `PLAN_IDS`). Left alone, the dashboard's garment-type filter would have simply never offered "Calça" for a real, drafted archetype. Now imports `TYPES` directly.
- **#259: `style.riseCm` — a signed waist-RISE style offset, deliberately kept OUT of `Measurements`/`EXTENDED_MEASUREMENT_KEYS` even though it modifies the same `rise` (crotch depth) concept — the category error CLAUDE.md already calls out for `fit`: a design choice ("cintura alta"/high-waisted vs. "gancho baixo"/low-rise) is not a body dimension, and conflating the two would mean a chart's own graded `rise` gets silently overwritten by whatever the AI/user last asked for stylistically. A first cut of `trousers.ts` floored the resulting `bodyRiseCm + style.riseCm` well above the waist dart's own fixed depth (`DART_DEPTH_CM + 5`) to keep the dart apex clear of the crotch curve — code review caught, and a direct execution confirmed, that this silently attenuated a fully in-range, legitimate request (`bodyRiseCm=20` + `riseCm=-10` floored to 15, delivering only half the requested "gancho baixo" change) for any chart whose body rise sits near `STYLE_LIMITS.riseCm`'s own span, with no adjustment reported anywhere — the exact silent-substitution `validateSpec`/`checkEngineSupport` are supposed to be the only things allowed to do, and even they must announce it (`describeSpecAdjustments`). **Fixed by making the DART depth adapt to the available rise room instead of bending the rise to fit a fixed dart** (`Math.min(DART_DEPTH_CM, riseCm * 0.6)`, an internal derived value, never a spec field) — `riseCm` itself is only floored at a bare non-positive guard (`Math.max(1, …)`) for a pathological custom chart, never a value a legitimate in-range request could reach. `skirt.ts` needed no equivalent guard: shifting the panel's waist edge by an offset has no analogous "fixed internal feature it could overrun" the way the trouser dart did.
- **#137: the drafted-ease report — `lib/draft/easeReport.ts`'s `buildEaseReport(pattern, t)` — is the second geometric fit answer in the app, alongside `seamCheck`'s armhole/cap comparison.** It states how much ease the FINISHED garment actually has at bust/waist/hip, deliberately distinct from `wearingEaseCm` (the ease the drafter was merely _asked_ for): a style adjustment, a dart, or a silhouette can make the two diverge. Pure, DB-free, redrafts via the same `draftPiecesCm`/`measureSeamGraph` (#134) `buildExportModel` already uses — no new blob key, so it works unchanged on a pattern drafted before this issue. Per girth: a scanline (`polygonSpanAt`, the `lib/canvas/pieceLabel.ts`'s `horizontalSpanAt` precedent — curved spans read as their chord) reads the piece's real width at a height derived from public data only (a `seamEdges` vertex, or a raw `Measurements` field like `backLength`/`hipHeight` — never an internal per-drafter formula), then subtracts whatever any `internalsCm` dart removes at that same height (its own leg polygon, scanned identically, gives exactly the fabric its fold takes up — full width at the seam end, tapering to zero at the apex). That single mechanism handles every drafter's dart shape generically (`body.ts`'s fisheye AND dress-hem darts, `trousers.ts`'s waist dart) without this module knowing any of their suppression formulas. **Bust:** front+back at the armhole's own underarm height, only for a bodice (blouse/dress/tshirt) — a skirt or trousers has none. **Waist:** front+back at `backLength` for a bodice (coincides with the hem for a dress, #79); the trousers panels' own top edge WITH dart subtraction (the true, sewn waist); a standalone skirt's real `seamEdges.waist` arc length (silhouette-agnostic, no dart to subtract, the same edge the waistband sizing already measures **— superseded by #319/#320 below: a pleated skirt panel has no dart, but does have a declared pleat take-up, which this same arc-length reading now also subtracts**). **Hip:** a skirt panel (standalone or a dress's) at `hipHeight` below its own waist — but ONLY for the straight/a-line silhouette; a circle/gore/half-circle panel is drafted from polar coordinates, where a horizontal scanline reads a meaningless width, so hip is reported `unavailable` (`unsupportedSilhouette`) rather than a wrong number. A skirt-less bodice reads hip at `backLength + hipHeight`, still inside the same panel. Trousers read the panel's own top edge again, this time WITHOUT dart subtraction (`includeDarts: false`) — a waist dart shapes the waist, it doesn't remove hip fabric, and the block happens to draft both at the identical height, so subtracting there would collapse hip into waist. A girth with no matching panel is `unavailable` (`noPanel`) — trousers' missing bust is the issue's own named example, generalised to any bust-less garment. **Cap ease** ("cap arc minus full armhole arc") is read straight off the existing seam graph's own `"armhole-cap"` entry (`aLenCm`/`bLenCm`), not a bespoke number. **Fit class** comes from `lib/draft/ease.ts`'s new `classifyGirthFit(girth, easeCm)` — band boundaries are the MIDPOINTS between consecutive `FIT_CLASSES`' own `FIT_EASE_CM` figures (never a second, competing scale), so a measured ease and `wearingEaseCm`'s requested one are judged on the one table `lib/ai/prompt.ts` already renders `FIT_CLASSES` from. Negative ease (a knit) classifies as `close`, not an error. `TechSheetTab` renders the report as its own card (bust/waist/hip rows: finished cm, body cm, diff cm/%, fit class — reusing the existing `PatternData.fit.*` catalog lookup — plus cap-ease chips), replacing the old single bust-only `chipEase` chip that showed _requested_ ease under the same word "folga" a measured number now owns unambiguously; an `unavailable` girth renders as a stated reason, never a silent gap. `lib/ai/prompt.ts`'s `buildSystem` also embeds the report as JSON (a no-op identity `Translate`, since the whole prompt is deliberately English/i18n-free) so an `explain` answer about fit can cite the real numbers instead of guessing from the spec alone.

---

## The drafting engine is a swappable choice, not the only code path (#266 → #267)

**Decided and built.** `lib/draft/engine/{types,capability,moldai,registry,facade,
conformance.test}.ts` are the interface; `"moldai"` is the only engine registered.
No second engine was added by this issue — that was an explicit acceptance criterion,
not an oversight — so everything below that reads as forward-looking ("when a second
engine exists...") describes a seam that is real and load-bearing today even though
only one implementation stands behind it.

**The rule this changed.** [`conventions.md`](../architecture/conventions.md) says
"Don't add abstractions beyond what's needed", citing `/settings` and
`/pattern/[id]/versions` deliberately having no Zustand store. One implementation
behind an interface is exactly the shape that rule warns about, and it is being
granted an explicit exception here. The exception is not "we might swap engines one
day" — that is precisely the speculative argument the rule exists to refuse. It is
that three things were impossible while the engine was implicit, and all three came
out of measurement rather than taste.

**Why the question came up at all.** #266 asked whether Freesewing should replace the
~4,000 lines of hand-written drafters, on the grounds that writing them from scratch was
an unexamined default with no decision record. It was a fair charge. The spike ran
against `@freesewing/*@4.10.1` and the full evidence is in
`docs/reference/freesewing-spike/README.md`; the answer was **decline the swap, on cost
rather than on capability**: adopting their t-shirt block means ~7 new _required_
measurements (`wrist` and `waistToArmpit` have no counterpart in our `Measurements` at
all, and their `shoulderSlope` is degrees where ours is a cm drop), which is a
`SizeChartData` wire-shape change — the expensive kind. On top of that, 50 options on
Teagan alone against one small validated `GarmentSpec`; every one of their 74 design
packages ships `i18n/en.json` only, and `@freesewing/i18n@4.10.1` is not keyed by locale
at all, so there is no pt-BR slot to fill; and there is no sub-piece composition layer —
Teagan drafts no collar band, where ours lands within 0.08 cm of the benchmark.

**But "should we replace ours?" and "can we ever try another one?" were the same
question, and that is the actual defect.** Any engine trial was a one-way rewrite of
`garment.ts`. Three consequences, each concrete:

1. **A candidate cannot be scored in-repo.** #266's own fourth acceptance criterion —
   draft the benchmark t-shirt with another engine and compare on the same metrics — had
   to be run in a throwaway project outside the repo, and its numbers are therefore not
   reproducible by `npm test`. With a registry, `tshirtBenchmark.test.ts` scores any
   registered engine on one harness.
2. **"Best engine per archetype" is not expressible.** The spike found Freesewing
   genuinely ahead on the armhole/sleevecap pair — `@freesewing/library`'s sleeve
   iterates the cap up to 50 times and converges to **0.42–1.71 mm** measured across our
   four benchmark sizes, against our 1 cm (10 mm) `SEAM_TOLERANCE_CM` plus a
   manual "Corrigir manga" — and genuinely behind on collars. Neither fact can be acted on while
   the engine is a compile-time constant.
3. **Our own drafters have no stated contract.** Which `Measurements` keys each one
   requires, which `GarmentType`s and `GarmentStyle` fields it honours, are implicit in
   the code. An engine that must _declare_ them makes a gap reportable instead of
   silently defaulted.

**What made this cheap enough to be worth doing.** The feared blocker was a geometry
model mismatch: Freesewing paths are explicit cubic Béziers with arbitrary control
points, while `DraftedPiece.outlineCm` is a `Pt[]` vertex list whose curves are
Catmull-Rom-derived from `curvedSpans`. Measured, by flattening Teagan's seam paths at N
samples per curve op and comparing our own `curveArcLengthCm` against Freesewing's
`Path.length()`: **8 samples per curve reproduces the true arc length to 0.009 cm**, at
36 vertices against today's 14; even 2 samples (0.368 cm) is inside `SEAM_TOLERANCE_CM`.
So **`DraftedPiece` needs no type change** — which is what keeps the blast radius off
the 13 non-test files and 5,215 LOC that read `outlineCm`/`curvedSpans`/`seamEdges`.
Persistence is untouched either way: `Piece.outline` is already an SVG `d` string.

The consumer surface is likewise already an interface in all but name. Every one of the
nine call sites of `draftPiecesCm`/`measureSeams`/`measureSeamGraph`/`draftGradedOverlays`/
`draftGarment` reads `DraftedPiece` and nothing else.

**Three invariants the abstraction must not lose.** Each is an existing rule, extended —
not a new idea:

- **The engine is frozen per pattern at its first generation**, alongside `sizeTable` and
  `sizeChartName`: an additive blob key, absent meaning `"moldai"`, no reset migration.
  Without it, changing the engine silently redraws every existing pattern's geometry on
  its next regeneration. This is the same reason a pattern snapshots its size chart
  instead of resolving it live, and the same additive-blob shape `savedAgo` and
  `sizeChartName` already established.
- **A capability gap is surfaced, never substituted.** An engine that cannot satisfy a
  chart's measurements, or cannot draft a requested `GarmentType`/style combination, must
  report that where the user meets it — the `pickSizeChartForGeneration` /
  `rejectedActive` precedent, which exists precisely because discarding the fact of a
  fallback meant nothing could report it.
- **The seam graph stays ours and stays engine-agnostic.** An engine supplies geometry
  plus `seamEdges`; it never supplies conflict or manufacturability semantics.
  `lib/draft/seams.ts` and `lib/draft/assembly.ts` must not gain an engine branch. Note
  #266's premise needed narrowing here: Freesewing has no _declarative_ mated-seam check
  (`@freesewing/core` has no seam-pair or topology concept; `Path.length()` is the only
  primitive), but it does target mated seam length by construction and does surface
  failures through `store.flag.*`, used by 51 of the 91 packages installed. What is
  genuinely ours is the declarative, whole-garment, per-pair _reported_ graph and the
  assembly order walked from it.

Also, `lib/ai/prompt.ts` and `lib/ai/schema.ts` must render their enums and numeric
bounds from the **active engine's** declared capability rather than module-level
`TYPES`/`STYLE_LIMITS`, or the standing "never tell the model a range the validator does
not enforce" rule breaks the day a second engine exists.

**The honest close.** If those three capabilities are not worth the indirection, the
right outcome is to close #267 rather than build a seam nobody crosses — and that
sentence is in the issue too. What is settled is the direction and the reasoning; the
build is not a foregone conclusion.

**Not part of this decision: the spike found a shipped fit defect in our own `tshirt`
archetype, resolved by #282.** Our size-M `body-back` was a whole mirrored panel 78.0 cm
wide, so two of them made a 156 cm finished chest on a 100 cm body — 56% wearing ease,
where Freesewing's Teagan at published defaults holds 18.0% flat across the same four
sizes. The cause was `TSHIRT_BASE_EASE_CM = 55.9` (`lib/draft/ease.ts`), solved
_backwards_ from the benchmark's size-M panel width with the arithmetic in its own
comment. That figure could not bear the weight: `docs/reference/tshirt-benchmark/`'s own
`segment-measurements.md` reads the same panel span as 49.09 cm rather than 79.99 and
already flags the discrepancy, and our collar band — sized from the _measured_ neckline
arc, independent of `halfChest` — lands within 0.08 cm of the benchmark at M, which says
the reference's "M" really is a ~100 cm-chest garment, not a 155.9 cm one. **#282's fix:**
the constant is now `TSHIRT_BASE_EASE_PCT = 18` — a percentage of bust, not a flat cm
figure, because that is the shape the resolved reference (Teagan, flat 18.0% across
P/M/G/GG) actually has; a flat cm constant cannot hold a flat ease _ratio_ across a
graded run the way the reference does. Relatedly, #242's −17.52 cm back armhole gap is
constant to 0.06 cm across all four sizes, which is the signature of a fixed-length curve
rather than a graded armhole error, and points at the back **neckline** — a separate,
still-open defect. **A corollary for anyone reading `comparison-report.md`: before #282,
our drafter was fitted to that benchmark and Freesewing was not, so its "ours is closer"
deltas were circular for width/perimeter; after #282 the `moldai` tshirt rows should read
farther from the benchmark's contested `widthCm`, not closer, and that is the correct
direction. Its two representation-dependent metrics (the curve/straight perimeter split,
and the orientation-dependent bounding box) remain not comparable across engines at
all.**

**Resolved by #282.** `TSHIRT_BASE_EASE_CM` is now `18` (cm), converging from two named
sources instead of the backwards benchmark derivation: the ~15–20 cm hand-drafting "loose
tee" band, and FreeSewing's own Teagan holding 18.0% flat on the ~100 cm-chest body this
benchmark's "M" really is. A male-M tshirt now drafts a 118.0 cm finished bust girth,
matching Teagan, not 155.9 cm. The corollary above now applies to **height only** — our
back panel's `widthCm` at M (59.00) lands on the same figure Freesewing's does, so width is
no longer a self-fulfilling comparison, but `TSHIRT_HEM_DROP_CM` (`garment.ts`) still
carries the identical backwards-from-benchmark provenance for panel height, unresolved by
this issue. `areaCm2`, freed of the width calibration, moved **away** from the benchmark
(our own back panel is now the larger delta of the two engines) — the correct direction,
since the old "closer" reading was the circularity this issue removed, not a real fit
signal.

### Build-time decisions the design above didn't settle in advance

**Two verbs, one rule, for what happens to a value that doesn't fit.** `validateSpec`
(`lib/draft/garment.ts`) narrows _untrusted wire data_ to the _app's_ vocabulary and may
substitute a default for garbage — that's what a trust boundary does, not a silent
feature substitution. `checkEngineSupport` (`lib/draft/engine/capability.ts`) narrows an
_already-valid_ spec to what the _active engine_ can honor, and may only report, never
substitute — a legitimate stated intent (the caller already chose "shirt collar", not
"gnorf") must never be silently swapped for something else. `validateSpec` stays
app-level and unparameterized by engine on purpose: it is called from pure,
pattern-free `lib/ai/decision.ts`/`lib/ai/formSpec.ts`, and `lib/schemas/garment.ts`'s
persisted-blob schema must keep accepting every value any pattern ever persisted under
any engine, forever — narrowing it to one engine's vocabulary would strip fields off
older patterns, the identical failure class the `GarmentStyleSchema` fix below
describes. The safety net for keeping the two separate is
`capability.test.ts`'s own invariant: every registered engine's capability is a subset
of the app-level vocabulary.

**The capability declaration is a leaf module; the registry is not, on purpose.**
`lib/draft/vocabulary.ts` and `lib/draft/engine/capability.ts` import only types and
each other — nothing from `garment.ts` or any drafter. `lib/draft/engine/moldai.ts`
(which imports `garment.ts`'s `draftAll`), `registry.ts` and `facade.ts` are "heavy" —
importing any of them pulls the whole drafter tree into the caller's bundle. This
matters because `NewPatternForm` (a client component, disabling an unsupported garment
type in its `Select`) reads `MOLDAI_CAPABILITY` directly rather than going through the
registry, so a client bundle never pays for drafting logic it only needs to ask "is
this type supported" of.

**`PatternVersion.engine` is a real column, argued honestly.** The engine cannot
change after a pattern's freeze, so `version.engine === pattern.engine` always holds
today — "restore would use the wrong engine otherwise" is not a real risk and doesn't
belong in the justification. The real argument is narrower: `/pattern/[id]/versions`
never loads the `Pattern` blob at all (`VersionList`/`VersionCompare` draft directly
from a `PatternVersionEntry`), so without the column those two components have no way
to know which engine drafted a historical version. It is also principled the same way
`recordVersion`'s existing comment already is: a version row omits pieces because
`draftGarment` is deterministic from `spec` + `sizeTable`; the engine is a third input
to that determinism, and omitting it means the row no longer fully determines its own
geometry.

**Acceptance criterion 6, read literally.** It asks that `lib/ai/prompt.ts`/`schema.ts`
render their **enums and numeric bounds** from the active engine's capability — and
that is exactly what changed. The hand-written English prose (the trousers-are-
straight-leg-only note, the three-collar taxonomy, "# Vocabulary mapping") still
describes `"moldai"` specifically. Moving ~40 lines of the highest-leverage prompt text
behind an indirection would have bought nothing while a single engine is registered;
revisit if a second one lands. The prompt-cache prefix this touches is guarded by a
pinned sha256 test (`prompt.test.ts`) over `staticSectionsFor("moldai") +
JSON.stringify(toolFor("moldai"))` — the one assertion that would actually catch an
accidental byte change to what Anthropic caches, since every other test here checks a
substring or a structural property, never the whole rendered text.

**Two real, pre-existing bugs the #267 audit surfaced, of the identical shape.**
`lib/schemas/garment.ts`'s `GarmentStyleSchema` named 11 of `GarmentStyle`'s 16 fields;
`collar`/`cuff`/`waistband`/`frontClosure`/`trouserLengthCm` were silently stripped from
`Pattern.spec.style` on every read-modify-write, because `z.object` drops unnamed keys
and `savePattern` writes the parsed object straight back — the same failure
[`generation-flow.md`](../architecture/generation-flow.md) already documents for
`ChatMessage`'s `hasImage`/`assembly`. Fixed first, ahead of the
engine-capability work, since a capability declaration about supported style fields
would otherwise describe fields that don't survive persistence (issue #268, closed).
`lib/schemas/pattern.ts`'s `ConflictInfoSchema` has the identical strip bug for
`ConflictInfo.entries` (#134's multi-divergence list) — found, not fixed here, tracked
separately.

**#318 is a third instance of the same class, and the first to destroy geometry rather
than metadata.** `lib/schemas/piece.ts`'s `PieceSchema` never named `Piece.internals`,
so every dart, fold line, drill hole and pleat #127 introduced was stripped on every
read and deleted from the row on the next mutating turn — for the entire life of the
field. Fixing the schema cannot restore what is already gone; an affected pattern
regains its marks the next time an `apply` turn redrafts its pieces from `spec`. A
full audit of `PatternStateSchema` against `lib/types.ts` at that point found exactly
one remaining gap in the persisted tree — `ConflictInfo.entries` above — which is now
also fixed, closing #324 alongside #318.

**A style-field capability gap is reachable for `"moldai"` itself, not only a
hypothetical second engine.** `validateSpec` does not gate style fields by
`spec.type` — it happily resolves `style.collar` on a `type: "trousers"` spec, which
`MOLDAI_CAPABILITY.styleFieldsByType.trousers` does not list. `checkEngineSupport`
reports this as a `styleField` gap today, drafts anyway with the field dropped
(matching what silently happened before this issue), and now says so in a
`tone: "notice"` chat bubble. `styleFieldsByType` was built as ground truth by reading
every drafter directly, which surfaced a separate, adjacent finding, left unfixed at
the time: `lib/draft/formFields.ts`'s own `STYLE_FIELDS_BY_TYPE` offered a "fit"
control for `tshirt`/`skirt`/`trousers` that no drafter read for those types (`tshirt`
reads `stretch` instead; `skirt`/`trousers` don't read `fit` or `stretch` at all —
their own wearing ease is a fixed constant). Left standing, a user could pick "solto"
on a saia, be charged for the generation, and get back the exact geometry "justo"
would have produced — a control that silently did nothing, the CLAUDE.md failure
mode this whole audit exists to catch. The note above that `capability.test.ts`
documents the three cases was itself inaccurate: that test only ever asserted `fit:
FIT_CLASSES` as part of a generic enum-subset check; the three-case documentation
lived solely in `capability.ts`'s own comment.

**#327 closed this gap** by removing `fit` from `formFields.ts`'s `tshirt`/`skirt`/
`trousers` entries, which is all that was needed: `NewPatternForm`'s rendering,
`changeType`'s prune and `validateFormSpec`'s server-side narrowing all read the same
map, so the control simply stops being offered (and a value already in state is
pruned on a type change, the same as any other inapplicable field). `formFields.ts`'s
own table and `MOLDAI_CAPABILITY.styleFieldsByType` now agree on every moldai type;
`formFields.test.ts`'s "agrees with `MOLDAI_CAPABILITY.styleFieldsByType`" case pins
that agreement so it cannot silently drift apart again.

---

## Registering GarmentCode as a second engine is declined for now, on every axis measured (#269)

**Decided, evidence only — nothing built or registered.** Full numbers in
`docs/reference/garmentcode-spike/README.md`, run against `pygarment==2.0.2` in a throwaway
Docker container. Scope note, precise on purpose: this declines registering **GarmentCode**
as a second engine **now**. It says nothing about FreeSewing, which is a separate, still-open
question (#266) that the swappable-engine decision above did not resolve either — that entry
declined a wholesale swap of our drafters, on cost, not the FreeSewing candidate itself.
**Since written, that question was answered the other way:** the entry below registers
FreeSewing as a second engine for seven garment types. The contrast is the point — the seam
#267 built was crossed by one candidate and not the other, which is what a seam is for.

**Why the question came up at all.** #267 built the engine seam specifically so a candidate
could be measured instead of argued about. GarmentCode (`maria-korosteleva/GarmentCode`,
MIT, Python) is a different kind of candidate than FreeSewing: cross-language, so none of the
"cheap because in-process" reasoning that made the FreeSewing spike affordable carries over.
#269 asked for the cost to be measured before anyone proposed registering it.

**What this cost, measured, and why it is worse on every axis than the FreeSewing question
already declined.** Four independent findings, each sufficient on its own:

1. **The engine seam can't host a subprocess/HTTP engine as written.** `DraftingEngine.draft`
   is synchronous, and three `"use client"` components (`CanvasArea.tsx`, `VersionList.tsx`,
   `VersionCompare.tsx`) call the facade inside `useMemo` during render. A cross-language
   engine needs the seam changed twice — async, plus a client-redraw story — before an adapter
   is even possible.
2. **A GarmentCode draft has a measured ~2 s floor that does not amortize.** Median 1989.6 ms
   warm, ~300x FreeSewing's measured 6.6 ms/draft, driven by `scipy.optimize.minimize` fitting
   the sleeve cap — an iterative cost intrinsic to the design, not process-warmup noise. Against
   `withPatternAndWallet`'s 30 s transaction budget (already spending 5–12 s on the Anthropic
   call) and the facade's N+1-per-grade call pattern, a 4-size grade alone costs ~8 s of
   GarmentCode time — a real risk of timing out the held Postgres lock.
3. **The measurement-vocabulary gap is larger than FreeSewing's, and for a structural reason.**
   ~15 new required inputs (vs. FreeSewing's ~7), because GarmentCode's body model is an
   anthropometric/3D-pose vocabulary (line heights, inclination angles), not a tape-measure one.
   `shoulder_incl` is confirmed degrees by source (`np.deg2rad`) against our cm-drop
   `shoulderSlope` — the identical unit mismatch FreeSewing's `shoulderSlope` had, found
   independently a second time.
4. **The one scenario that could justify the cost doesn't hold.** GarmentCode has no coat,
   jacket, lining, interfacing, or facing concept anywhere in its codebase (grep-confirmed,
   zero matches) — it cannot cover the outerwear archetypes our drafters don't.

**The honest close.** None of these four is close, and they are independent — even resolving
the seam-sync problem leaves the other three standing. This is a firmer decline than the
FreeSewing wholesale-swap question: that one turned on `SizeChartData` cost alone, against a
candidate that was otherwise fast, in-process, and fit-competitive in places. GarmentCode is
slow, cross-language, vocabulary-incompatible, and archetype-incapable at once. If any of
these four facts changes — a faster fitting method ships upstream, or a coat/jacket body
class is added — the question is worth re-measuring; nothing here forecloses that.

## Registering FreeSewing as a second engine: `tshirt`/`blouse`/`skirt`/`trousers`/`hoodie` shipped, `dress` declined (#269)

The #266→#267 spike work above graduated: `"freesewing"` is registered in
`lib/draft/engine/registry.ts` alongside `"moldai"`, each archetype backed by one pinned
`@freesewing/*@4.10.1` design package under `lib/draft/engine/freesewing/designs/` (Teagan,
Diana, Sandy, Titan, Hugo — the upstream codename confined to one aliased import line per
file, never leaking into an identifier, error message, or catalog key). `MOLDAI_CAPABILITY`
and `FREESEWING_CAPABILITY` (`lib/draft/engine/capability.ts`) each declare their own
`types`/`styleEnumsByType`/`styleFieldsByType`/measurement keys independently — a type
supported by one engine and not the other is an honest omission, never a stale or partial
entry (`checkEngineSupport`'s own contract).

**The measurement-vocabulary cost was real but one-time, and turned out cheap per archetype
after the first round.** Registering `tshirt`/`blouse` first required 14 genuinely new
`CORE_MEASUREMENT_KEYS` plus promoting 4 out of `EXTENDED_MEASUREMENT_KEYS` — a real
migration-safety review, a real backfill script
(`scripts/backfill-freesewing-measurements.ts`) run against every persisted
`Pattern`/`SizeChart`/`Sloper`/`PatternVersion` row before the shared Zod schema
(`lib/schemas/measurements.ts`) could be tightened. `trousers` (Titan) needed 6 MORE new keys
(`crossSeam`/`crossSeamFront`/`knee`/`seatBack`/`waistBack`/`waistToUpperLeg`) — a fitted
front/back-split trouser block needs measurements moldai's own straight-leg simplification
never modeled — triggering a second migration-safety round and a second backfill. `hoodie`
(Hugo) needed exactly ONE more key, `head` — already `CORE_MEASUREMENT_KEYS` since the very
first round specifically because it was added anticipating this hoodie use case (see
`lib/measurements.ts`'s own comment: "a hood's own sizing input"). Every one of Hugo's other
12 required measurements mapped onto an existing key via the same alias convention Sandy's
own `skirt.ts` established (`hip`→`hips`, `hipHeight`→`waistToHips`,
`shoulder*2`→`shoulderToShoulder`) — verified against a live draft, not assumed from name
overlap.

**`hoodie` has no moldai equivalent, by design, not by oversight.** A raglan sleeve (no
shoulder seam — a diagonal seam runs from underarm to neckline instead), a 3-piece hood
(`hoodSide`×4 + `hoodCenter`×2, `@freesewing/library`'s own shared three-part-hood module) and
ribbed cuffs/waistband are constructions `body.ts`/`sleeve.ts` have no equivalent for, and
building a native moldai raglan/hood drafter from scratch was explicitly out of scope for this
registration — `MOLDAI_CAPABILITY.types` deliberately omits `"hoodie"`, and `garment.ts`'s own
`draftAll` throws (`no drafter wired for garment type "hoodie"`) rather than silently returning
an empty pattern if a caller ever reaches it for that type on the `"moldai"` engine — a
defensive backstop that became necessary the moment a real "engine-exclusive" `GarmentType`
existed for the first time (every prior type was moldai-supported, so this failure mode was
latent, never reachable).

**Two real findings from building Hugo's own wrapper, recorded rather than silently
"fixed":**

- Hugo's own `waistband`/`cuff`/`neckBinding`/`hoodCenter` parts are each a plain rectangle,
  but ALL FOUR are hidden by default behind an internal `expand` setting this app has no
  reason to toggle (verified by reading each source file directly — `if (expand) {...} else
{ ...; return part.hide() }`). Fighting that setting for zero geometric gain would have been
  pointless: `lib/draft/engine/freesewing/designs/hoodie.ts` instead reuses
  `lib/draft/subpieces.ts`'s own `draftCuff`/`draftWaistband` (already the same "measured
  rectangle" shape) and a newly-exported `straightBand` primitive for `hoodCenter`, each sized
  from THIS design's own measured edges — the same "measure what was actually drafted"
  discipline `skirt.ts`/`trousers.ts` already follow, not a competing formula. (`neckBinding`
  itself stayed undrafted at this point in the registration — see #341, below, for when it
  was finally built and why the wait was worth it.)
- Front's/back's own raglan seam and the sleeve's own matching `raglanFront`/`raglanBack` edge
  measure a genuine (if small, 0.3–0.6 cm at size M) gap in both directions — unlike Titan's
  inseam/outseam (an internal fitting loop forces an exact match), Hugo's own
  `front.mjs`/`back.mjs`/`sleeve.mjs` each draft their own portion of this seam independently,
  with nothing enforcing agreement. Declared `easeCm: 0` (an honest small residual, not a
  fudged zero), comfortably inside `SEAM_TOLERANCE_CM` (1 cm) at every size checked.

**`dress` was evaluated and declined — not deferred, not silently dropped.** The only two
FreeSewing candidates tagged for a dress shape are Sophie (a strapless slip dress with a
built-in bra cup, no sleeve, no skirt-silhouette choice) and Sasha (a fully lined dress with an
integrated pocket, 16 parts — far more complex than any archetype registered so far). Neither
maps to moldai's own dress concept (a fitted bodice ending at the natural waist, joined to a
skirt panel with a choice of 4 silhouettes) closely enough to make "dress" mean the same thing
across engines. A third option — composing the already-registered `blouse`/`tshirt` bodice
wrapper with the already-registered `skirt` wrapper, joined by a new bodice-hem-to-skirt-waist
seam pair, mirroring how moldai's own `garment.ts` assembles ITS dress — was considered but
not built: it would need verifying the two edges' lengths are actually compatible (Diana's own
hem may be looser than Sandy's fitted waist) before committing, and was set aside rather than
rushed. `FREESEWING_CAPABILITY.types` omits `"dress"`; revisit if a closer-fitting FreeSewing
dress design ships upstream, or if the bodice+skirt composition is worth building out.

**Not yet built, tracked separately, not silently claimed as done:** the three remaining new
archetypes the original registration plan named (`coat`, `hoodie`, `shirt`) — `hoodie` shipped
here; `shirt` remains untouched. `coat` is in progress (measurement vocabulary landed, the
design wrapper itself does not exist yet as of this entry) — see the follow-up entry below for
which upstream design was picked and why. Fase 5 (UI engine selection in `NewPatternForm`) and
a final cross-archetype benchmark/docs pass remain open too.

## `coat` shipped on Jett, picked over 5 siblings, with a real data-quality catch on `hpsToWaistFront` (#269)

All 6 FreeSewing designs tagged for a coat/jacket shape were drafted live before picking one.
Lunetius is dramatically cheaper (1 part, 8 required measurements, all already CORE) but is a
sleeveless Roman-style cloak — the same kind of semantic mismatch that ruled out Sophie/Sasha
for `dress`, not a genuine modern coat. The other five are all real lined/tailored outerwear:
**Jett** (17 parts: a lined bomber-style jacket with a ribbed waistband/collar/cuff and a welt
pocket) is the cheapest; Devon (23), Jaeger (25), Carlton (26) and Carlita (30) are full
tailored overcoats, each with proportionally more lining/pocket/collar construction. Jett was
picked as the cheapest design that still means "a real coat."

Jett's own required measurements need exactly one genuinely new key: `hpsToWaistFront` (front
bodice length — shoulder to waist over the front, distinct from the existing `backLength`,
which is nape to waist over the _back_). Every one of Jett's other 17 required measurements
already maps onto an existing key, the same alias discipline `skirt.ts`/`hoodie.ts` already
established.

**The first version of `hpsToWaistFront` had a real data-quality bug, caught by a
migration-safety review before the backfill ever ran with `--apply`.** Seeded the same way the
trousers-follow-up keys were (interpolated from `@freesewing/models` at each row's own bust
girth), it turned out NOT to track `backLength` consistently: the female table's own
front-minus-back delta drifted from -2.4cm (PP) to +0.1cm (GG) — flipping sign partway through
the size run, which no real body does. Traced to the source itself:
`@freesewing/models`'s own `neckstimate.mjs` comments `hpsToWaistFront: [400, 460], // FIXME:
Estimate` — flagged as rough by FreeSewing's own maintainers, unlike every other key this repo
has sourced from that package so far. Fixed by deriving `hpsToWaistFront` as `backLength +
FRONT_BACK_LENGTH_DELTA_CM` (a flat, per-gender constant — female +3.0cm, male +1.0cm,
reflecting a typical bust-curvature allowance) instead: monotonic by construction, since it
grows in exact lockstep with `backLength`'s own per-size grading, and never touches the
flagged-as-estimate upstream figure at all. `scripts/backfill-freesewing-measurements.ts`'s own
`backfillRow` was updated the same way, deriving from each row's own already-present
`backLength` rather than interpolating — the one key in `NEW_KEYS` that isn't bust-derived.

**`jett.ts` shipped drafting six pieces**: `body-front`/`body-back` (qty 2, no fold — a real
center-front placket and a real center-back seam, unlike every knit-adjacent archetype
registered so far), `sleeve`, `cuff`, `collarRibbing` (folded), `waistband`. The lining
(front/back/sleeve) and the welt pocket (welt + bag) were investigated and deliberately
deferred, not silently dropped: unlike Hugo's hood/pocket deferrals (simple "hidden by default"
rectangles), Jett's lining pieces genuinely change op count/arrangement across measurement
sets — a structural instability, not just missing effort, so declaring their geometry with
confidence would need more verification than this round did.

Two real boundary bugs were caught by live-draft verification across two measurement sets
(female M and a very different male row) before trusting any edge declaration:

- **`armholePitch`/`frontArmholePitch` is a pitch NOTCH, not the armhole-to-shoulder corner.**
  Using it as `shoulderTip` made front+back's armhole sum ~23cm short of the sleeve's own cap —
  an implausible gap. `s3ArmholeSplit` is the actual merged-curve endpoint; switching to it
  dropped the gap to a stable ~11.5cm (kept as real, measured ease — see below).
- **Back's shoulder/neckline split has no reliable named point at all.** Every candidate
  (`s3CollarSplit`, `s3ArmholeSplit`, `"shoulder"`, `"cbShoulder"`) is stale — snapshotted at
  path-build time, then reassigned by a later-drafted part sharing the same `points` object, so
  its current value no longer matches the frozen path. Declared the whole remaining span as one
  combined `shoulderNeckline` edge instead of force-splitting it.

**`easeCm` on the armhole-cap and shoulder pairs is a real measured value, not an assumed 0** —
Jett is a woven tailored jacket, the first archetype registered where "sew these two edges
exactly to length" isn't the right model. Computed dynamically from the drafted geometry
(`capCm - (frontArmholeCm + backArmholeCm)`, the same "measured, not assumed" discipline
`skirt.ts`'s circle-skirt waist ease already established) and cross-checked for stability across
genders (~11.4–11.6cm for armhole-cap, ~±0.1–0.3cm for shoulder, both times) rather than
asserting the raw lengths match — that assertion is tautological once the pair's own ease is
subtracted, so cross-gender stability is what actually stands in for a correctness check here.

**The collar-to-neckline seam pair was written, then removed.** Front's neckline alone
(~11–12cm) against the collar's own doubled neckline-attach edge (~54–58cm) was 4–5x too large
to be plausible ease, unlike the armhole-cap/shoulder gaps above. `collarRibbing` still ships —
its own geometry is correct — but this round doesn't claim to cross-validate it against the
neckline it will eventually attach to.

The full slice (measurement vocabulary, backfill, GarmentType plumbing, `jett.ts`) landed
together once the backfill ran with `--apply` against the dev database and confirmed idempotent
on a second run, per this repo's standing rule of never tightening `CORE_MEASUREMENT_KEYS`
without the backfill having already run against real data.

## `shirt` shipped on Simon, zero new measurement keys, and a full yoke/two-front construction (#269)

Simon (a classic button-front shirt, 12 real parts) was the only candidate seriously considered
for `shirt` — its sibling Simone is the same block with an FBA/bust-dart variant, and this repo
has never branched a design by gender (every other archetype registered so far uses one design
for both `spec.gender` values), so Simon was picked without a multi-candidate bake-off. Verified
directly against `Simon.patternConfig.measurements`: **zero new measurement keys** — all 13
required measurements already map onto existing CORE keys via the same alias convention every
prior archetype established (`chest`→`bust`, `hips`→`hip`, `waistToHips`→`hipHeight`,
`shoulderToShoulder`→`shoulder*2`, etc.) — the cheapest registration of any archetype so far on
that axis.

Simon exposes real construction variants FreeSewing's own design didn't force a single answer
on — 6 named `cuffStyle`s, separate-vs-cut-on plackets on both the button and buttonhole side.
Surfaced to the user via `AskUserQuestion` before writing any code; the answer ("proceed now,
fixing one simple variant of each") is why `shirt.ts` fixes every one of these at its simplest
value: `cuffStyle: "straightBarrelCuff"` (the one of the six that reduces to a plain rectangle,
matching the shape `draftCuff` actually draws — the other five are all shaped/curved),
`separateButtonPlacket`/`separateButtonholePlacket` left at their own `false` default (already
the simplest, cut-on placket), `buttonPlacketStyle`/`buttonholePlacketStyle` left at their own
`"classic"` default.

**`shirt.ts` ships six-to-eight pieces depending on sleeve length**: `body-back` (cut on fold,
cut off at the yoke seam — verified live: `@freesewing/brian`'s own `back.mjs` sets
`cutlist.addCut({cut:1, onFold:true})`, which Simon inherits unchanged), `yoke` (cut ×2 per
Simon's own cutlist — self + lining, verified via its own `store.cutlist.setCut({cut:2, ...})`),
`body-front-right`/`body-front-left` (two genuinely different pieces, not a mirrored panel —
verified live: `frontRight`'s own draft calls `macro('flip')` first, `frontLeft`'s does not, and
each appends a differently-shaped placket edge; both cut ×1, not on fold, since Simon's own
`front.mjs` explicitly sets `cutlist.setCut({cut:1, from:'fabric'})` with no fold flag), `sleeve`
(cut ×2, structurally identical whether short or long — both branches share the same named
boundary points), and — only for the "long" sleeve style — `cuff`. Simon's own `sleeveStyle`
option is a real short/long branch (verified against `sleeve.mjs` directly): short skips the
cuff construction entirely for a folded hem, so `shirt.ts` doesn't draft a cuff piece nor declare
a cuff-wrist seam pair in that branch — a real conditional piece list, not a cosmetic option.

**The collar reuses moldai's own generic `draftShirtCollar` (stand+fall) from
`lib/draft/subpieces.ts`, not FreeSewing's own `collar.mjs`/`collarstand.mjs` geometry.** Both
model the exact same "a fitted band plus a fold-over fall" shape that drafter was already built
for (it backs the moldai engine's own `style.collar === "shirt"` option), sized off the REAL
measured neckline this design actually drafted (front-right + front-left + the yoke's own
back-neckline curve, never a proportion of the bust) — the same "a cuff/waistband is just a
band, reuse the generic drafter" precedent `jett.ts`'s own cuff/waistband already established.
This sidesteps a real risk the coat's own collar ran into: Jett's `collarRibbing`-to-neckline
pairing had to be abandoned entirely (a 4–5x implausible measured gap). Reusing
`draftShirtCollar` instead means the neckline-attach pairing (`easeCm: BUTTON_STAND_WIDTH_CM`,
the same constant `garment.ts`'s own moldai-side shirt-collar caller uses) and the
stand-to-fall pairing (`easeCm: 0`, since the fall is sized off the stand's own measured seam)
both come pre-verified by that drafter's own existing tests, rather than needing a fresh
FreeSewing-geometry investigation the way Jett's collar did.

**Two body-side seam pairs are declared per side (right AND left), not one canonical side the
way every prior archetype's single mirrored front/back panel allowed.** Since `body-front-right`
and `body-front-left` are genuinely two separate `DraftedPiece`s (not one panel's own mirror
image), `side`/`shoulder`/`armhole-cap` are each declared twice (`shirt-side-right`/
`shirt-side-left`, etc.) rather than trusting the two fronts are equal by shared construction
without measuring both — a deliberately more thorough check than tshirt.ts's/jett.ts's own single
declared side, since here both sides are independently locatable and independently worth
verifying. All of them measured exact (0 diff) on a live draft: unlike Jett's woven-jacket
armhole, which carries a real ~11cm sleeve-cap ease, Simon's own set-in sleeve fits the
combined front+back+yoke armhole exactly, with no built-in cap ease — plausible for a shirt
sleeve, and confirmed by measuring rather than assumed.

Sleeve plackets (a separate overlap/underlap strip binding the sleeve's own vertical opening
above the cuff) are a genuinely new construction concept this app has never modelled — moldai's
own `draftPlacket` is a continuous-lap strip with no separate over/under pieces — and are
deferred with an "em breve" note on the sleeve's own detail row, the same discipline every
prior deferral (Hugo's pocket, Jett's lining) already establishes. (Hugo's own neck-binding
trim strip was the third item in that list at the time this shirt entry was written — #341,
below, drafted it.)

## Fase 5: the engine becomes a real, user-facing choice, not just an internal registration (#269)

With all seven `GarmentType`s wired, `freesewing` was still completely unreachable from the real
app: `POST /api/patterns/[id]/generate` unconditionally froze every pattern's first draft on
`DEFAULT_ENGINE_ID`. Fixing that touches more than the form — the AI call itself picks its tool
schema/prompt section off `engineFor(state.pattern.engine)` (`lib/ai/index.ts`), and a fresh
pattern has no frozen engine yet to read, so the choice has to be known _before_ `proposeGarment`
runs, not only before the size-chart snapshot. Otherwise a first-time request for a
freesewing-only type (e.g. "coat") would still get the moldai tool schema, whose type enum
doesn't even include it.

Shipped: `NewPatternForm` gained an engine `Select` (reading both `MOLDAI_CAPABILITY` and
`FREESEWING_CAPABILITY` from the leaf `capability.ts`, never the heavy `registry.ts`), sent as
`engine` on the pattern's first `generate` call. The route narrows it via `isEngineId` (rejecting
a present-but-unrecognized value with `invalid_engine` before any lock/debit, the same
discipline `formSpec`/`sizeChartId` already follow), then — on `isFirstDraft` — sets
`state.pattern.engine` right there, before the AI call, so `proposeGarment` already sees it. The
later size-chart snapshot (`seedPatternSizeSnapshot`) reads the same already-set value back
(`engineFor(state.pattern.engine)`) rather than a second, independently-defaulted one.

**A real, caught-before-shipping consequence**: this means `Pattern.engine` can now freeze a
turn or more _before_ `sizeTable`/`sizeChartName` do — e.g. on an `ask` (clarify) turn, since
`withPatternAndWallet`'s own `dirty` default persists `state` on every branch except the
insufficient-credits early return. A migration-safety review confirmed this is harmless in
practice (only `createFromForm` ever sends `engine`, and only on this pattern's first `generate`
call, so the gate fires at most once per pattern regardless of which turn drafts first) and is
now stated plainly in `Pattern.engine`'s own doc comment (`lib/types.ts`) rather than left to
contradict the code. A regression test pins it: the engine freezes even on an `ask` turn, and a
later turn on the same still-undrafted pattern — with no `engine` resent — keeps seeing it.

**A UI judgment call, reviewed and settled**: switching the engine can leave the currently
chosen garment type unsupported by the new one. The first draft auto-reset `type` back to
"blouse" silently; a conventions review flagged this as fighting the repo's own "disabled +
badged, never silently changed" precedent (`type` is a permanently-visible top-level `Select`,
unlike the style fields `changeType` already silently drops, which simply disappear from the DOM
when inapplicable). Changed to the more consistent shape: the type `Select` keeps whatever was
chosen (still disabled+titled per option), and submit is blocked with the same on-screen reason
until the type and engine agree again.

---

## Learned geometry as a proposer behind the seam graph: declined for now, the evidence is entirely negative (#246)

**Decided, nothing built.** This is a discussion issue, not scoped work — the point is to
have a written answer the next time "should the model draft geometry instead of the seam
graph checking it" comes up, so it doesn't get re-argued from priors each time.

**The three headline numbers were checked directly against source, not taken from the issue
text.** AutoSew (Rios-Navarro et al., WACV 2026 — a GNN-plus-optimal-transport method for
predicting stitch correspondence from 2D pattern contours, developed with Adobe) reports "96%
F1-score" and "successfully assembles 73.3% of test garments without error" on its own project
page and paper abstract (`mslab.es/projects/autosew/`); the paper's own PDF, which would carry
the more precise 96.2% the issue cites, returned HTTP 403 in this pass, so that one extra digit
is not independently re-derived here, but the two-decimal figure is consistent with the rounded
one two independent pages both state. Berthouzoz et al. (SIGGRAPH/TOG 2013, "Parsing Sewing
Patterns into 3D Garments") reports 87% F1 on automatic stitching and 68% fully-correctly-sewn
garments (GSP) across its 50-garment dataset — confirmed via the paper's own history page and
independent summaries. NeuralTailor (Korosteleva & Lee, TOG 2022) reports 83.6% panel-count
accuracy on garment types unseen during training — not found in NeuralTailor's own abstract
(which states only "generalizes... to unseen types" without the number), but confirmed via
Panelformer (WACV 2024)'s own comparison table, which cites 83.6% as NeuralTailor's baseline
before reporting its own fine-tuned improvement on top of it. All three numbers check out.

**The structural claim — an edge/stitch-correspondence metric in the 90s with a
whole-garment success rate 20+ points lower — held on every source checked, and is not an
artifact of any one paper's dataset.** AutoSew: 96% edge F1 vs. 73.3% zero-error assembly (a
22.7-point gap). Berthouzoz: 87% F1 vs. 68% GSP (a 19-point gap). Two independent teams, twelve
years apart, on different geometry representations (2D pattern contours vs. panels extracted
from PDF patterns), land on the same shape of result: near-perfect per-edge accuracy does not
compound into anywhere near per-edge-accuracy^whole-garment success, because one wrong edge in
a 10-30-edge garment is enough to break assembly, and the paper-level metric hides exactly that.
Nothing in either paper's own text, nor in NeuralTailor's, reports a sewability, grading,
notch, grainline, or DXF-export metric — searched specifically for this and found none; the
literature these three represent evaluates topology/correspondence accuracy, never any of the
downstream guarantees this repo's own seam graph (`lib/draft/seams.ts`) already provides
deterministically. A 96% (or 96.2%) F1 score is not a claim that 96% of exported files are
sewable, gradable, or notch-correct — it's a claim about a different, narrower quantity, and no
published benchmark in this space would currently detect the loss of any of the four guarantees
named above even if a learned proposer silently dropped them.

**The positive case — a checker-plus-proposer pipeline measurably beating an unchecked
proposer — is not re-litigated here; the issue records it as already refuted 0-3 in a prior
verification pass**, and nothing surfaced in this research pass reopens it: none of the three
papers checked pairs its generative/predictive component with a deterministic geometric
checker of the seam-graph's kind, so there is still no published comparison of "proposer alone"
vs. "proposer plus hard reject" to weigh against the seam graph's own zero-defect guarantee on
every pattern this app has ever exported.

**Decision: decline for now, on the same "no reason to build" grounds as GarmentCode above,
for the opposite reason FreeSewing was accepted.** FreeSewing crossed the engine seam because
its geometry was measurably competitive (0.42–1.71mm on the armhole/sleeve pair) and its
failure mode was still deterministic — a wrong Bézier control point, not a missing stitch.
Learned geometry's failure mode is structurally different: a ~20-27% chance per garment that
the model gets a stitch topologically wrong, with no benchmark anywhere in this literature that
would catch it before it reached a customer's fabric. **If this is ever revisited, the
acceptance bar from the issue stands as written: the model proposes, the deterministic seam
graph (`lib/draft/seams.ts`) rejects — never the reverse.** That is not a hedge to be softened
later; it is the one shape in which a 96% F1 topology predictor could plug into this pipeline
at all, since the seam graph is what would have to catch the other ~4% (or the other ~27%, at
the whole-garment level) before it ever reached a downloadable file.

---

## Design novelty as a market-valued axis: still zero verified claims either way, and the vendor evidence found is marketing, not fact (#247)

**Not decided — the honest outcome the issue's own acceptance criteria allows for.** This
research pass re-ran the two prior deep-research passes' searches (vendor capability, buyer
behavior, practitioner trust) and did not surface anything that resolves the underlying
question — whether design novelty is a purchasing axis at all. That absence is itself the
finding, and it's recorded rather than papered over with a confident-sounding guess.

**Vendor capability, split by source quality — the legacy CAD tier is asserted, not just
inferred.** Lectra/Gerber AccuMark/Optitex are, on every source found (an independent CAD
comparison blog and several 2026 buyer's-guide posts), production-management layers over
patterns that already exist — grading, marker-making/nesting, digitization — not tools that
generate a garment's geometry from a description or sketch; one source states this plainly:
"Gerber AccuMark... does not generate patterns from brand archives; it manages patterns once
they exist." None of these three vendors' own sites were found claiming a generative-from-
description capability. The 3D-simulation tier (CLO, Browzwear, Style3D) is where "generative"
marketing language actually appears — Style3D's own blog describes "iDesigner" as producing a
"prompt-to-3D" workflow and claims "AI adoption in apparel design has surged 40% year-over-year"
citing "McKinsey reports from 2025." **That citation could not be traced to an actual McKinsey
publication in this pass** — it appears only inside Style3D's own marketing blog, with no link
or report name, the exact shape of an unverifiable vendor-marketing statistic the issue asked
this research to distinguish from independent evidence. It is recorded here as flagged, not
trusted, and every other "X% adoption"/"Y% time saved" figure surfaced in this pass (aims360,
stytrix, fashioninsta.ai — all SEO-shaped buyer's-guide content, several visibly written to
promote their own product) is the same shape of claim and is given the same distrust. No
independent (non-vendor, non-SEO-content-farm) source confirming or denying any vendor's
generative-geometry claim was found.

**The two "weak signals" from the issue both re-confirmed directly against source.** ASTM
D6673 (withdrawn 2019, but still the reference point CLO/AAMA-compatible DXF export claims
target) states in its own scope, verbatim: "This standard is not intended to represent the
relationships between pattern pieces or the correspondence between 2D or 3D sewn product
pattern piece geometries" (confirmed via the standard's own catalog listing). CLO's own support
documentation confirms its DXF export drops stitching information by design: "the existing DXF
export in CLO3D only exports the 2D pattern without the stitching information... DXF is kept to
the international fashion CAD standard." **The subcommittee (ASTM D13.67) and its open work
item (WK98960) are confirmed to exist and to target fabric physics rather than generative
capability** — ASTM's own press release names D13.67 "3D Digital Fabrics" and quotes its chair
on validating "3D fabric physics"; WK98960 itself is titled a new test method for "3D drape
validation." The registration page for WK98960 returned HTTP 403 in this pass, so the specific
30 Sept 2025 open date named in the issue was not independently re-confirmed, but everything
else about the standard's subject matter (physics/interoperability, not generative geometry)
checks out against ASTM's own announcement. Taken together, all three signals still point the
same direction the issue named them for: the standards body closest to this problem is
standardizing physical/interoperability correctness, not novel-geometry generation — but three
consistent weak signals are still not the practitioner or purchasing evidence the acceptance
criteria actually asks for.

**Practitioner trust and correction effort: gathered, and its scarcity is the finding, exactly
as the acceptance criteria allows.** No systematic survey of pattern makers' trust in automated
output was found. What surfaced instead: a handful of unrelated academic papers on ML-assisted
pattern _correction_ (not generation) noting that "CAD systems do not have the capability to
make fine adjustments at the same quality level as manual pattern correction" (a generic,
undated claim from a paper about a different problem); scattered G2/forum complaints that
CLO/Browzwear's 2D pattern windows need more manual correction tooling; and no case study,
survey, or interview-based research quantifying correction effort for any of the named vendors'
generative or assistive features specifically. This is an honest gap, not a null result dressed
up as one.

**A correction to the issue's own framing, found while checking #248 in parallel and worth
recording here too:** the claim that no research exists on inferring grading rules is not quite
right — a 2022 Emerald/Seoul National University paper, "Automatic generation of parametric
patterns from grading patterns using artificial intelligence," describes exactly that (a neural
network learning the relationship between body size and pattern geometry from existing graded
patterns). It doesn't move the novelty question either way — it's assistive automation on
top of an existing pattern, not generative design of a new one — but the earlier "zero verified
claims" framing was itself an artifact of two research passes not finding a paper that exists,
which is worth flagging as a pattern for future spikes in this vein.

**Recommendation: do not widen the generative design space on a novelty bet, but not because
the bet has been refuted — because nothing found in two research passes plus this one supports
either side of it.** The only evidence with any real weight is negative-by-omission: the
vendors closest to production CAD (Lectra/Gerber/Optitex) don't market generative geometry at
all, and the standards body actively investing in new work (ASTM D13.67) is investing in fabric
physics and interoperability, not generative capability. That is consistent with — but far
short of proof of — buyers weighting fit/grading/interoperability over novel garment classes.
Verification and interoperability work (DXF/AAMA fidelity, the seam graph, grading correctness)
stays the safer bet on the evidence actually in hand; widening `GarmentType` coverage for its
own sake is not supported by anything found, but neither is stopping it. Revisit if a real
market-research source (an industry survey, a vendor's audited case study, a practitioner
interview study) surfaces — the two prior passes and this one all failed to find one, which at
this point is itself worth taking as a signal that this specific question may not be answerable
from public sources at all.

---

## Replacing `GarmentSpec`'s flat style enums with a compositional/hierarchical layer is declined; two narrow, additive fixes are picked instead (#245)

**Decided — proposal only, nothing built.** #245 asked whether the flat closed enums on
`GarmentStyle` (`lib/types.ts`) should be replaced by a wider, hierarchical, component-oriented
spec layer, on the model of GarmentCode/ChatGarment (arXiv:2412.17811). Read literally, "replace"
does not survive contact with what these enums actually gate — see below — so what follows is a
mapping of today's surface, a check of which concretely-named garment features such a layer would
newly reach, and a narrower pair of adoptions that came out of reading `garment.ts`/`capability.ts`
directly while investigating the question, not out of the literature.

### Today's surface, mapped exhaustively

Every `GarmentStyle` field (`lib/types.ts`) lives flat on one shared object, regardless of which
`GarmentType` reads it — cross-type applicability is enforced entirely by convention/comments and
by `capability.ts`'s `styleFieldsByType` map, not by the type system:

| Field                                           | Values today                                                                       | Read by                                                    |
| ----------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `neckline`                                      | `straight \| V \| round` (+ `necklineDepthCm` 0–15cm)                              | blouse/dress/tshirt                                        |
| `sleeve`                                        | `none \| short \| long`                                                            | blouse/dress/tshirt                                        |
| `cuff`                                          | `none \| straight`                                                                 | blouse/dress/tshirt, only meaningful with `sleeve: "long"` |
| `collar`                                        | `none \| convertible \| band \| shirt`                                             | blouse/dress/tshirt                                        |
| `frontClosure`                                  | `none \| buttonStand`                                                              | blouse only                                                |
| `skirt`                                         | `straight \| a-line \| gore \| half-circle \| circle` (+ `skirtLengthCm` 25–120cm) | skirt, dress                                               |
| `waistband`                                     | `none \| straight`                                                                 | skirt, trousers                                            |
| `fit`                                           | `close \| fitted \| semiFitted \| loose`                                           | blouse/dress (woven)                                       |
| `stretch`                                       | `none \| low \| medium \| high`                                                    | tshirt (knit)                                              |
| `trouserLengthCm`                               | 60–115cm                                                                           | trousers                                                   |
| `armholeDeepenCm` / `seamAllowanceCm` / `darts` | scalars/boolean                                                                    | body archetypes                                            |

Eleven catalogs total (`vocabulary.ts`'s own count, quoted in `generation-flow.md`'s Design2GarmentCode
entry). Each is independently clamped by `validateSpec`; combinability across fields is
**already** effectively free where the fields are orthogonal (any `neckline` × any `collar`, since
`draftAll` sizes the collar off the measured neckline arc regardless of shape; any `skirt` ×
`waistband`) — flat enums on one shared object do not, by themselves, prevent combinatorial reach
when the underlying drafters treat the fields independently, which is most of them.

### What a compositional layer would actually need to unlock, checked against our own drafters

The issue's own acceptance criteria demand _specific, reachable_ silhouettes, not an abstract
capability claim, so each candidate below was checked against what `body.ts`/`sleeve.ts`/
`skirt.ts`/`trousers.ts`/`subpieces.ts` can actually draft — not against what a wider enum _value_
could name:

- **Raglan sleeve** (diagonal underarm-to-neckline seam, no shoulder seam) — not reachable by
  widening `sleeve`'s enum. `body.ts`'s panels have a fixed shoulder-seam topology; a raglan needs
  a different panel shape entirely. Notably, this exact construction **already exists in this
  repo** — `lib/draft/engine/freesewing/designs/hoodie.ts` (Hugo) drafts a real raglan — but only
  for `hoodie`, on the `"freesewing"` engine, never as a `blouse`/`tshirt` style option.
- **Princess seams** (vertical bust-to-hem seams replacing waist darts) — needs a different panel
  count/split in `body.ts`; no enum value on today's single front/back panel shape reaches it.
- **Gathered/dirndl skirt, puffed/bishop sleeve** — both need a _fullness ratio_ (fabric width at
  the seam exceeding the body measurement it's gathered onto) and a gathering/shirring
  construction; `skirt.ts`'s five silhouettes and `sleeve.ts`'s cap are all flat-paneled with no
  fullness parameter anywhere in the geometry.
- **Yoke construction** (a seam changing grain direction across shoulder or hip) — no drafter
  models a yoke split at all today (the freesewing `shirt`/Simon wrapper has one, engine-side, not
  exposed to `GarmentSpec`).
- **Asymmetric necklines/hemlines** (one-shoulder, handkerchief hem) — every moldai drafter assumes
  bilateral symmetry (`qty: 2` mirrored, or `frontClosure`'s centre split); nothing permits an
  independent left/right shape.
- **Peter Pan / notched / shawl collar, knife/box/inverted pleats** — named "em breve" gaps
  already (`subpieces.ts`'s own comments; `core.ts`'s `InternalCm` union even reserves a `pleat`
  kind no drafter populates yet **— superseded by #244: box/inverted-box pleats shipped, via
  `skirt.ts`'s `pleatFoldPlacement`; only knife pleats and the three unusual collars remain
  unbuilt**) — each needs new construction geometry, not a fourth/fifth enum value on `collar`.

**None of these is reachable by restructuring the spec alone.** Every one needs new drafter
geometry regardless of how the request is shaped — which is the same conclusion this repo already
reached from the other direction: ChatGarment's own abstract states it "refine[d]... GarmentCode"
(wider **engine**) and "simplif[ied] its structure for... VLM fine-tuning" (the DSL followed the
engine, not the other way round), and the issue's own text records that the stronger claim — a
compositional DSL makes novelty _combinatorial_ rather than merely additive — was already put to
adversarial verification here and refuted 0-3. Checking it a second time against this repo's own
code confirms the same result: our reachable design space is bounded by `garment.ts`'s drafters,
not by `GarmentStyle`'s shape, and this repo already has a working, cheaper mechanism for reaching
a genuinely new construction — register it as (or on) a new engine with its own
`EngineCapability`-declared, checkEngineSupport-gapped surface, exactly as `"freesewing"` did for
raglan sleeves, yokes and full-lined coats across seven archetypes (#266→#269, above). That
mechanism is strictly more honest than one universal hierarchical spec claiming a construction no
registered engine actually implements — it already reports a gap instead of silently drafting
something else, which is precisely the property #250 and #267's `checkEngineSupport` were built
for.

### Two real, narrow gaps found by reading the code, worth adopting on their own

Investigating #245 surfaced one genuine, previously-unreported defect and one genuine,
bounded design-space limitation — both concrete, both fixable without a spec rewrite:

1. **A silent no-op `checkEngineSupport` cannot catch, because it can only gate a field by
   `GarmentType`, never by another field's value.** `capability.ts`'s
   `MOLDAI_CAPABILITY.styleFieldsByType.blouse` lists `"cuff"` unconditionally; `draftAll`
   (`garment.ts`) only drafts a cuff when `style.sleeve === "long" && style.cuff === "straight"`
   (see the cuff+placket block). A request for `{ type: "blouse", style: { sleeve: "short", cuff: "straight" } }`
   produces **zero** `EngineGap`s today — `cuff` is a supported field for blouse, and `"straight"`
   is a valid `CuffType` — yet the cuff is silently never drawn, charged at full price, with
   nothing on-screen to say so. This is the exact class of silent gap #250's `describeSpecAdjustments`
   closed for garbage-value substitution, but it survives here because it's a _cross-field_
   invalidity, which a flat map keyed only by type structurally cannot express. Nesting `cuff`
   under `sleeve` (present only when `sleeve.length === "long"`) — a small, genuinely hierarchical
   change, not a wholesale one — would make the invalid combination unrepresentable at the schema
   level instead of silently accepted. **Worth its own follow-up issue.**
2. **`STYLE_LIMITS.necklineDepthCm` is one flat 0–15cm range for all three neckline shapes.** A
   `V` neckline plausibly has room for a deeper plunge before its own construction breaks down than
   a `round` or `straight` (bateau) neckline does — today one shared range must be conservative
   enough for the shallowest shape. Making the limit a per-`neckline`-family range (the same shape
   `styleEnumsByType` already uses per-type in `capability.ts`) is a real, bounded design-space
   widening reachable by extending today's flat model, not replacing it — though the actual safe
   `V`-specific maximum would need verifying against `body.ts`'s own construction before shipping a
   number, which this proposal does not attempt. **Worth its own follow-up issue.**

   **#322 update:** `necklineDepthCm` now drives the drop identically on `round` and `straight`,
   not only `V` (previously it was silently discarded on the other two, so this flat range only
   ever reached one live shape). The same 0–15cm ceiling now reaches three genuinely different
   constructions instead of one, which makes a per-shape range **more** worth doing, not less —
   this follow-up is still open.

### Decision: decline the compositional replacement; file the two narrow fixes separately

**Declined.** No concretely-named garment feature this issue or its own cited sources call for is
reachable by restructuring `GarmentSpec` into a hierarchical layer without also writing new
drafter geometry — and this repo already has a cheaper, more honest mechanism for exactly that
case (register a new engine). Replacing the flat enums wholesale would cost real, expensive
changes (`lib/schemas/garment.ts`'s persisted-blob schema, every `validateSpec`/`checkEngineSupport`
call site, `lib/ai/prompt.ts`/`schema.ts`'s rendering) for a return this investigation could not
find, on top of the return already being adversarially refuted once. This is not a default-to-decline:
the two narrow items above **are** adopted, precisely because they were found to be real,
concrete, and cheap relative to the wholesale swap — matching the shape of every prior decision in
this file (decline the big swap, adopt the cheap, measured piece: #266's declined wholesale
FreeSewing swap vs. #269's shipped per-archetype registration).

**Documentation-location discrepancy, noted per this issue's own acceptance criteria:** #245's
issue text says to record the decision in `docs/decisions.md`. That file does not exist — this
repo replaced a single `docs/decisions.md` with one per-topic file under `docs/decisions/` (see
this directory's own `README.md`). This entry is filed in `drafting.md` rather than
`generation-flow.md` because #245 is about `GarmentSpec`/`GarmentStyle`'s own shape
(`lib/draft/garment.ts`, `lib/types.ts`) and the drafters that read it, not about the AI
request/response flow `generation-flow.md` covers.

---

## A waistband is sized from the waist its panel presents after darts and pleats, not from its raw drafted edge (#319, #320)

**Decided and built.** Two waistbands — trousers' and a pleated standalone skirt's — were both
being cut to a panel's **raw** drafted waist edge, before that panel's own darts/pleats take any
of it back up. `lib/draft/trousers.ts`'s waist dart removes `dartHalfWidth * 2` per panel from
the true sewn waist, but `seamEdges.waist` walks the panel's un-suppressed top edge (exactly
`hipQuarterCm` long) — `lib/draft/garment.ts`'s `trouser-waistband-waist` sizing summed that raw
edge across both panels' own `qty`, so a size-M band came out at `m.hip + TROUSER_WEARING_EASE_CM`
(106 cm) instead of `m.waist + WAISTBAND_OVERLAP_CM` (77 cm) — 29 cm of surplus. `lib/draft/skirt.ts`'s
box/inverted-box pleat (#244) widens the panel's waist edge by `PLEAT_INTAKE_PER_SIDE_CM` per
side to hold the folded-back fabric, but `seamEdges.waist` spans that **already-widened** edge —
`waistband-waist` summed it the same way, double-counting the fabric the pleat folds away: ~32 cm
of surplus on a size-M straight skirt.

**#244's own acceptance criterion is what caused this**, and it needs to be named as wrong rather
than quietly reversed: it required "fabric consumed by the pleat is reflected in the panel's own
width, so the seam graph still closes." Widening the cut panel is correct — that fabric is real
and has to exist somewhere on the cutting table. Treating that same widened length as the
**seam length the waistband is cut to** is not: a seam's length is what its edge **presents** to
whatever it's sewn to once any suppression/fullness the panel's own darts or pleats take up is
folded away, never its raw flat length. (GarmentCode names this distinction directly —
`Interface.projecting_lengths()`/`projecting_fractions()` — and both #319 and #320 cite it
independently.) The seam graph never caught either defect because `walkSeamPairs`
(`lib/draft/seams.ts`) measures **both sides flat**: the waistband was drafted from the very same
inflated number the graph then compared it against, so `diffCm ≈ 0` and every existing "does this
seam close" test passed while the garment did not fit at the machine.

**The rule this establishes:** a panel's presented edge length is its raw arc length, minus
whatever its own darts take up **derived** from the dart polygons the drafter already emitted
(`lib/draft/core.ts`'s new `dartIntakeAtYCm`, reading `dartsOf(internalsCm)` — the same geometry
`lib/draft/easeReport.ts` already scanned, now shared instead of duplicated), minus whatever
fullness a drafter **declares** it consumed when the emitted geometry can't express it as a
polygon. A pleat is the second case: `skirt.ts`'s `pleatFoldPlacement` emits two **mark** lines
(a press fold, a placement/stitch line) per side, not a region whose width equals the intake, so
there is no polygon to scan. `skirt.ts` — the one place that already owns
`PLEAT_INTAKE_PER_SIDE_CM` and the `isDressWaist`/silhouette gating that decides whether a panel
pleats at all — sets a new `DraftedPiece.pleatTakeUpCm` on the exact branch that widens the edge;
`garment.ts` reads it and never reconstructs when a pleat applies. **Derive when the emitted
geometry encodes the fact; declare only when it doesn't** — redefining the `pleat` `InternalCm`
kind into a take-up region instead was considered and rejected: it would falsify the #244 decision
that a pleat's marks are lines, not a region, and would drag `lib/types.ts`, `place()`,
`PatternCanvas`, `lib/schemas/piece.ts`, and all five export serializers into a bug fix that
doesn't need any of them.

**Both waistband sites (`garment.ts`'s `trouser-waistband-waist` and `waistband-waist`) now
size the band from this presented length, and declare `SeamPairDecl.gatherRatio = presented / raw`
on the pair instead of leaving it unset.** `gatherRatio` (#255) was built for exactly this and had
zero production declaration sites before this change — `diffCm` is computed as
`|bLen − aLen·gatherRatio − easeCm|`, so declaring a ratio below 1 closes the pair by construction
while `aLenCm` stays honest as the length that really gets cut. A ratio **above 1** is added
fullness (a gather/ruffle, `#255`'s original framing); **below 1** is take-up (a dart or pleat
folding cut fabric back down) — the same field, read in both directions; `gatherRatio` is not
renamed, since it is threaded through three exported types and is the direct analogue of
GarmentCode's own `ruffle` parameter, the source both issues cite.

**Why the fix is a declared ratio on the pair, not a netting pass inside `measureSide`.** Netting
universally inside `lib/draft/seams.ts` would also net the dress's own `waist-join-front`/
`waist-join-back` pairs — `lib/draft/body.ts`'s dress-hem dart opens directly onto the bodice hem
edge those pairs measure, while the skirt panel side of the same pair has no dart to net. Netting
both sides uniformly would make that pair's two sides suddenly diverge by roughly
`4 × dartHalfWidth`, across every fitted dress in `DECORATION_CASES` × every measurement corner ×
every graded size — a real, adjacent bug (see below) surfacing as an unannounced side effect of
this one, exactly the "re-baselined by accident" outcome #319's own acceptance criteria rule out.
A pair-level ratio, declared only where a drafter's own `draft()` call actually knows a take-up
applies, has none of that blast radius, and keeps `lib/draft/seams.ts` a pure measurer over
declarations rather than growing it drafting-adjacent knowledge of which archetypes have darts.

**A third instance of the identical defect exists and is deliberately not fixed here: the dress
waist-join.** `body.ts`'s dress-hem dart removes real fabric from the bodice's own hem edge before
that edge is sewn to the skirt panel's waist, but `garment.ts`'s `waist-join-front`/
`waist-join-back` pairs — and the bodice hem itself — are still sized/measured off the raw,
un-suppressed edge, so a fitted dress's bodice presents noticeably less than the skirt it's sewn
to and the graph says nothing. This needs its own drafter-level decision (widen the bodice hem to
match, or shrink the skirt panel to match, rather than merely reporting a divergence) and is out
of scope for this change — tracked as a follow-up issue of the same `priority: high` as the two
this entry closes. **Fixed in #335 below:** the bodice hem is widened to match, the same direction
this entry's own worked example (widening the cut panel, netting only the seam length) already
takes for a pleat.

**A body whose waist is not meaningfully narrower than its hip cannot be drafted from
`trousers.ts`'s hip-derived panel at all.** `dartHalfWidth = Math.max(0.6, waistSuppression / 2)`
refuses a literal zero-width dart, so at `hip − waist < 1.8` (before this fix, an invisible detail;
after it, the first place the number matters) the panel's presented waist is **wider** than the
body's own waist measurement — the waistband still closes against what the panel actually
presents, but that presented number can no longer equal `m.waist` exactly. This is a stated
geometric limitation of the current single-dart trousers block, not a defect this change
introduces or is expected to paper over with a wider tolerance.

**Also unfixed, and worth naming rather than leaving implicit:** `lib/proof3d/mesh.ts` still scans
a piece's raw flat outline width for its 3D preview, so Prova 3D continues to show a trouser waist
at hip width and a pleated skirt waist at its pre-fold width even after this change — a narrower,
already-existing gap (no 3D shell exists yet for the waistband piece itself either), not a
regression this entry introduces.

---

## A dress bodice's hem is CUT wider than the waist by exactly what its own darts fold away (#335)

**Decided and built.** The third instance of the #319/#320 class, named and deliberately deferred
by that entry above. `lib/draft/body.ts`'s dress-hem dart opens directly onto the bodice's own hem
edge — its wide end sits on the seam `garment.ts`'s `waist-join-front`/`waist-join-back` pairs
measure — but `hemHalf` (`dressWaistHalfCm(waist)`, no allowance added back) was cut to exactly
the width the skirt panel's own un-suppressed waist edge presents, with nothing left over for the
two darts to fold away. At `SIZE_TABLE.M` (waist 74, hip 100) each dart floors at
`dartHalfWidth = max(0.9, (hip−waist)/64) = 0.9`cm; two darts, two legs each, remove `4 × 0.9 = 3.6`cm
per panel — 7.2cm across the closed waist — while `walkSeamPairs` measured both sides flat and
reported `diffCm ≈ 0`. Independent corroboration already sat in the repo: `lib/draft/easeReport.ts`
has netted dart intake at every girth since #319, so a fitted dress's own ease report already stated
the finished waist ~7.2cm narrower than the body's `waist` measurement — a visibly wrong number on
the ficha técnica, not only an invisible seam-graph gap.

**Why (a) — widen the bodice hem — and not (b) — shrink the skirt panel.** `dressWaistHalfCm(waistCm)
= waistCm/4` (`lib/draft/skirt.ts`) stays the one value #177/#185 established as what every
silhouette's own already-correct waist construction agrees on, and it stays what both sides of the
join are measured by — what changes is that it is now the **presented** width the bodice hem must
equal after its own darts close, not the width it is cut to. Shrinking the skirt instead would leave
the bodice hem's raw cut edge untouched (still wrong on its own terms — see the `easeReport` evidence
above) and would make the dress's finished waist land narrower than the body's actual `waist`
measurement, the wrong direction for a garment description to drift. Widening the bodice hem keeps
`dressWaistHalfCm`'s own invariant intact ("front + back sum to exactly `waistCm`, for every
silhouette") on the **presented** width, exactly parallel to how a pleated skirt's cut waist widens
while its declared seam length stays the presented one.

**The rule this establishes, applied rather than re-derived:** the dress-hem dart's wide end sits at
`y = waistY === len` by construction (`isDressHem`'s own doc in `body.ts`) — precisely the horizontal
edge `presentedEdgeLenCm` (`lib/draft/core.ts`, #319/#320) already handles, reading dart intake
straight off the dart polygons `dartInternals` already emits (`dartsOf`). No new field is declared on
`DraftedPiece`: unlike a pleat, whose `InternalCm` entries are mark lines with no region for a
scanline to read (hence `pleatTakeUpCm`), a dart's own `ptsCm` **is** such a region, so nothing here
needs a drafter to declare what the geometry already encodes. `body.ts` computes the same
`dartHalfWidth` its own dart-drafting branch already computes — hoisted earlier in the function,
never re-derived by a second formula — and adds `dartCount × 2 × dartHalfWidth` back onto `hemHalf`
before the outline is built, so the panel's cut edge is wider by exactly what its own darts remove.
`garment.ts`'s two `waist-join-*` pairs then declare `gatherRatio = presentedEdgeLenCm(...) / raw`,
the third and fourth production declaration sites for the field #319/#320 introduced — the pair
closes because the take-up is declared, not because both sides happen to measure the same number.

**Each panel widens by its own darts' own total, including a real bust-cup delta — named
consequence: the `side` pair can now genuinely diverge, and that is correct, not a regression to
paper over.** `body.ts`'s dart width already carries `extraDartHalfWidthCm = bustCupDeltaCm / 4` on
the front only (no anatomical bust apex on the back), so when `bustCupDeltaCm > 0` the front's own
dart intake — and therefore its widened cut hem — exceeds the back's by `bustCupDeltaCm / 2`. The
front and back panels are cut to different widths at the hem in that case, which is the correct
consequence of a full-bust adjustment (the front genuinely needs more fabric), not a bug this change
introduces. The `shoulder`/`side` pairs, sized off `waistHalf`/`halfChest` rather than `hemHalf`, are
untouched in the general case; a real cup delta reaching all the way to the hem would widen the
front's own `side` pair reading by the same `bustCupDeltaCm / 2`, well under `SEAM_TOLERANCE_CM`
(1cm) at every delta either seeded chart produces, and exactly zero for both (`highBust = bust` in
`SIZE_TABLE`/`SIZE_TABLE_MALE`, by the same deliberate-no-op-by-default precedent `riseCm`/`fit`
already follow elsewhere in this file).

**Also unfixed, and worth naming rather than leaving implicit — the same gap #319/#320 already
named for the other two waistbands, now shared by a third:** `lib/proof3d/mesh.ts` still scans a
piece's raw flat outline width for its 3D preview, so Prova 3D continues to show a dress bodice's
waist at its wider cut width rather than its presented one. A pattern generated before this fix
keeps its old (too-narrow) bodice hem until the next generation — there is no migration, since
`Piece` stores drafted geometry and `buildExportModel` always redrafts from `spec`.

## A "V" neckline is a straight line, not a scoop at a deeper drop; `necklineDepthCm` reaches every shape (#321, #322)

**Decided and built.** `body.ts` drafted all three `neckline` shapes as the identical Catmull-Rom
scoop, with only the _drop_ (`neckDrop`) varying — the interior control vertex was always
`[cx ∓ neckHalf*0.6, neckDrop*0.55]`, a pure fraction of the same two numbers regardless of shape.
So `V` rendered as a deeper `round`, not a V, and `style.necklineDepthCm` was read only in the `V`
branch — `round`/`straight` silently discarded a value `validateSpec` had already accepted as
in-range, a paid no-op with no on-screen trace (`describeSpecAdjustments`/`checkEngineSupport` both
see a supported field with a legal value; neither is wired to notice a drafter ignoring it).

**Why a collinear vertex, not removing the span.** `catmullRomSegments` (`core.ts`) _interpolates_
every vertex inside a `curvedSpans` range — a Catmull-Rom vertex is never an off-curve Bézier
handle. Placing the interior vertex exactly on the straight `cf→hps` chord (at the same
`t = 0.6` fraction the scoop already used) makes every derived Bézier control point an affine
combination of three collinear points, so the drawn curve comes out exactly straight — with zero
change to vertex count, span layout, `OutlineAnchors`, `seamEdges`, notches or `foldEdge`. The
alternative (dropping the neckline span so that edge renders as a straight `L`) would have worked
too, but would have changed `curvedSpans.length`, which several tests read as a proxy for "this
piece has a curved neckline" (`body.test.ts`'s own `"marks the neckline and armhole as
curvedSpans"`) — the collinear-vertex approach needed touching none of that. Only the FRONT gets
this treatment; the back is always a shallow round scoop regardless of `style.neckline` (#121,
`backNeckDrop = 2.0` is a flat constant untouched by shape or depth), so it keeps curving.

**Why `necklineDepthCm` now drives the drop on `round`/`straight` too, instead of being reported as
an engine gap.** The other branch the issue allowed — report the combination instead of honoring
it — doesn't exist as a mechanism today: `checkEngineSupport` (`capability.ts`) can only gate a
field by `GarmentType`, never by another field's own value (the identical structural gap
`#245`/`#333` already name for `cuff`+`sleeve`), and `spaceSampling.test.ts` asserts zero
`EngineGap`s across its whole sampled spec space — teaching it a new coupling would mean building
the cross-field-applicability mechanism #333 defers, not fixing a two-field interaction. Honoring
the field is also the reading the cited prior art (GarmentCode's `collars.py`) uses: shape and
depth are orthogonal parameters, not a shape-specific escape hatch. `necklineDepthCm` means the
same cm-below-the-neckline's-own-base in all three shapes, so the same explicit depth gives the
same drop on `V`/`round`/`straight` — only the curve in between differs. The per-shape constants
(`neckHalf + 6` for V, `neckHalf + 1/2` for round, `neckHalf * 0.7` for straight) survive as
defaults for the no-depth case only, keeping that path byte-identical to before this fix (pinned by
`garment.test.ts`'s own "byte-identical" regression test and the `tshirtBenchmark.test.ts` gates,
neither of which sends a depth).

**Consequence worth naming, not a bug:** a straight V's apex is a sharper, un-smoothed point than
the scoop it replaces (meaningfully so at `STYLE_LIMITS.necklineDepthCm.max`) — exactly the
condition `lib/export/offset.ts`'s `removeSelfCrossingLoops` already exists to repair on a cut
outline, and `model.test.ts`'s self-intersection/area-growth gate over `DECORATION_CASES` (which
already includes `"blouse deep V long"` at max depth) still passes clean.

## Trouser length grades against `waistToFloor`, sharing `skirtLengthCm`'s own mechanism, not a second copy of it (#326)

`#128`'s own trousers archetype (above) had no per-size leg-length measurement to grade against,
so `style.trouserLengthCm` printed the identical waist-to-hem length at every graded size — the
same defect `#249` found and fixed for `skirtLengthCm` against `skirtLength`, just not yet closed
here (`#249`'s own acceptance criteria asked for one or the other; the trousers half shipped as
"restated on screen," not "fixed"). `#269`, filed after both of the above, promoted `waistToFloor`
to `CORE_MEASUREMENT_KEYS` for an unrelated reason (FreeSewing's Titan design requires it) — which
happens to be exactly the missing per-size figure: a taller body has a proportionally longer leg
the same way it has a proportionally longer skirt hem or sleeve.

**The fix is a rename, not a new function.** `gradedSkirtLengthCm` (`lib/draft/core.ts`) becomes
`gradedLengthCm`, with its two measurement parameters renamed from `*SkirtLengthCm` to
`row/baseReferenceCm` — the arithmetic is unchanged (a fraction of the reference row's own
reference measurement, re-expanded against the target row's own value of that same measurement).
`lib/draft/trousers.ts`'s `draftTrousers` gains the identical `baseRow` parameter `draftSkirt`
already has, resolving `totalLengthCm` through `gradedLengthCm(trouserLengthCm ??
TROUSER_DEFAULT_LENGTH_CM[gender], m.waistToFloor, baseRow.waistToFloor)` — the **defaulted** value
is fed through the same call as an explicit one, so the flat per-gender constant now grades too,
not only a request that names an exact cm figure. `garment.ts`'s trousers branch reads
`garmentLengthCm` off the drafted panel's own `resolvedLengthCm` instead of re-deriving the ??
expression a second time, closing the one duplication `#234`'s original comment on that line
admitted. The freesewing engine's own Titan wrapper (`designs/trousers.ts`) already computed a
`lengthBonus` fraction off `base.waistToFloor` for an unrelated reason (steering Titan's own
default toward our `trouserLengthCm`) — it now resolves `targetLengthCm` through the same
`gradedLengthCm` call first, so both engines grade identically instead of only one of them
happening to vary by size already.

**`TROUSER_LENGTH_TOKENS.full` (110) sat below the seeded female chart's own `waistToFloor` at
every size (101.1–108.4)** — "calça comprida" drafted a trouser longer than the wearer is tall.
Re-anchored to a fraction of the female system chart's own base-size (M) `waistToFloor` (104.8cm)
rather than a free-standing guess, because a token is projected to cm inside `validateSpec` before
`spec.gender` is overridden by the chosen size chart's own gender (the route does that override
after validation) — a male-calibrated token could return a value below the floor on a female chart
the same way the flat 110 already did. `full` becomes 102 (97% of 104.8); `cropped`/`ankle` are
unchanged (75/95) but now carry the same derivation comment. **Accepted cost:** at a male M
(`waistToFloor` 116.0), 102cm is 88% — a shorter "full length" than the male body actually reaches.
This is not a new problem: `TROUSER_DEFAULT_LENGTH_CM.male` (104) is already 89.7% of the same
figure. A gender-aware token table was considered and rejected for the same reason a gender-aware
default was never built: the projection happens before the route knows which chart (and therefore
which gender) the pattern will actually use.

**Surfacing the one remaining degradation.** A chart's `waistToFloor` can fail to vary by size for
reasons `#326` did not create and cannot fix by itself: it was persisted before `#269`'s CORE
promotion (`scripts/backfill-freesewing-measurements.ts` only ever wrote `baseMeasurements`, never
`progressionRule`), it was imported from a spreadsheet with an unmapped column
(`lib/sizeCharts/import.ts` writes an explicit flat `progressionRule[key] = 0` rather than leaving
the key absent), or a `PATCH` body replaced the progression rule wholesale and dropped this key
(`validateSizeChartPatch` merges `baseMeasurements` but replaces `progressionRule` outright). All
three collapse to the same observable fact — `waistToFloor` reads the same number at every size in
the pattern's own frozen `sizeTable` — so `lib/sizeCharts/compute.ts`'s new
`measurementGradesAcrossSizes(sizeTable, key)` checks that fact directly rather than trying to
name which of the three applies. The generate route reports it as a `tone: "notice"` chat message
(`chat.trouserLengthNotGraded`) exactly when it's true and the turn actually touched trousers
length (first draft, or `trouserLengthCm` changed this turn — the same `#279` turn-scoping
`chat.engineStyleUnsupported` already uses, so an unrelated later turn doesn't reprint it forever).
The tech-sheet's own `rows.trouserLengthGrading` row states the grading rule declaratively
(`trouserLengthGradedNote`, replacing the old `trouserLengthFixedNote`) rather than conditionally —
it reads correctly whether or not the active chart's own measurement happens to grade, since the
rule itself ("graded by the chart's own waist-to-floor") is what's true either way.

## A waistband marks its own sewn edge at each panel-seam split its caller already computed (#331)

`draftWaistband` (`lib/draft/subpieces.ts`) drafted a plain rectangle with no marks at all — a cós
had to be distributed by tape measure at the machine, the most basic sewability aid a band can
carry. The issue's own framing pointed at `lib/draft/seams.ts`'s `SeamEdgeMeasurement.endFracOfSide`
(the per-edge cumulative fraction `walkSeamPairs` already computes for every seam pair, unconsumed
in production beyond `sideSplitDevCm`'s own audit use) as the source of the split positions. That
framing doesn't survive contact with the code: `endFracOfSide` is computed by `walkSeamPairs`, which
the facade calls strictly **after** `draft()` returns (`lib/draft/engine/facade.ts`), while
`draftWaistband` is called from inside `draftAll`, before any `SeamMeasurement` exists. Threading
`endFracOfSide` back into the drafter would mean either drafting twice (once to measure, once to
place marks) or growing a new draft → measure → re-draft cycle — exactly the kind of new cross-module
coupling the issue's own AC 3 forbids. **`endFracOfSide` keeps zero production consumers beyond
`sideSplitDevCm` after this issue** — that gap is not closed here, deliberately.

**The fix instead computes the split at the call site**, from the same `presentedEdgeLenCm` figures
`garment.ts` already has in hand two lines above each `draftWaistband` call (#319/#320) —
information that exists at the right time, in the right place, with no new coupling. `draftWaistband`
gained an optional `panelSplitsCm: number[]` (cumulative cm positions from the band's own `x = 0`
end); each entry is dropped, never clamped, when non-finite or outside `(0, waistLenCm)` — the same
drop-don't-throw trust-boundary discipline every other untrusted-input boundary in this repo follows,
since `notchAtArcLengthCm`'s own clamp would otherwise silently stack a bad value on top of `x = 0`
or `x = waistLenCm` with no signal anything was wrong. Marks are placed with the existing
`notchAtArcLengthCm` primitive, all `single` — a band has no front/back side of its own to
distinguish, unlike the pitch notches or dress-hem corners that convention serves.

**An omitted `panelSplitsCm` and an explicitly-passed empty one are two different answers, not the
same "zero."** `panelSplitsCm` is `number[] | undefined`, not `number[] = []` — the first review pass
on this issue caught the collapsed version: a single-panel (half-circle) skirt computes a genuinely
empty split (`qty - 1 === 0`, nothing to mark) and reported it through the identical `comingSoonBadge`
row the freesewing wrappers use for "never computed a split at all." `CLAUDE.md`'s own rule is "'em
breve' for planned work" — a half-circle skirt's zero interior seams is not planned work, it is the
correct, permanent answer for that silhouette, and labelling it "em breve" tells a user marks are
still coming when they never will be, for that shape. `undefined` (the parameter omitted, the three
freesewing wrappers reusing `straightBand`) keeps the "em breve" row; an explicit `[]` (`garment.ts`'s
skirt/trousers call sites always pass a real array, even when it comes out empty) reports a real
`"0"`, the same way `rows.buttonholes` already prints a real count including zero rather than ever
substituting a coming-soon badge for a legitimately empty result.

**`WAISTBAND_OVERLAP_CM` occupies the band's right end, `x ∈ [waistLenCm, sewLenCm]`** — this was
already true of the geometry (`draftWaistband` only ever widened the rectangle by the overlap, never
moved a vertex to mark where it starts), just never written down. Documenting it is what lets a
caller measure split positions from `x = 0` with no adjustment for the overlap at all.

**The skirt call site's split is an even division** — `skirtPiece` is one drafted panel repeated
`qty` times, every copy identical, so the `qty - 1` interior boundaries fall at an exact even split
of the netted (presented) waist regardless of silhouette. This holds for every branch (straight/
a-line's `qty: 2`, gore/circle's `qty: panels`, half-circle's `qty: 1`, which produces zero marks).

**The trousers call site needs a real opening convention, not just a formula.** The marks are
`[front, front+back, front+back*2]` — deliberately **not** `waistRefs`' own declaration order
(front, front, back, back) a few lines below, which is the seam-graph/`endFracOfSide`-affecting order
#331's own AC forbids touching. **The trousers open at CF/the fly**, so the physical order around the
body from the band's `x = 0` end is front, back, back, front — the standard construction, not an
arbitrary pick to match the skirt (which has no opening convention to match, since a skirt's marks
are symmetric either way). **At every measured size, front and back happen to PRESENT the identical
waist quarter** (each side's own dart nets it back to the same figure the panels were split from), so
today this physical order is numerically indistinguishable from plain declaration order — the
convention is still the right thing to encode explicitly, both because it's the actual construction
and because nothing guarantees that equality holds for every future measurement table or style
field. An unrecognized `qty` (neither archetype drafts one; both are fixed `qty: 2`) falls back to
plain declaration order rather than guessing a physical layout that doesn't correspond to any real
body
position for a shape this codebase doesn't draft.

**#214's own decision (the CF/CB waist corner on the panel side stays unnotched) is not reopened,
and does not need to be.** One of that decision's supporting arguments — "the waistband emits no
notches of its own to mate against this one anyway" — is now false: the waistband **does** mark this
exact position, from its own side. The rest of the reasoning is untouched: the corner is a genuinely
too-narrow wedge for a 0.6cm notch, the two crotch-extension ratios that disagree still disagree, and
a corner where two seams meet is already the match point industrial practice doesn't notch. The
panel side simply moves from "unnotched, and nothing marks this position anyway" to "unnotched, and
the OTHER side of the pair now does" — the code comment in `lib/draft/trousers.ts` was updated to
say so rather than left describing a waistband that no longer matches reality.

## The hoodie's hood is sewn to the body, and its neck binding is finally drafted (#341)

**The gap was real, and self-documented at the time it was found.** #323's own audit of the
freesewing phase table found and recorded, in-line, that `hoodie-hood-center` closed the hood's own
3-panel construction but nothing joined the finished hood to the body — the wrapper's own comment
named the missing piece ("via a neck-binding trim strip this wrapper does not draft") and
`lib/draft/subpieces.ts`'s `straightBand` had been exported since #269 anticipating exactly that
strip. `buildAssemblyOrder` walks the declared seam graph only, with no reverse pass asking "is this
edge sewn to anything," so a moletom's own sewing order silently never mentioned attaching the hood —
for a feature (#138) whose entire premise is charging a real credit for a complete, derived
construction sequence.

**The topology was measured against Hugo's own upstream store before writing a single declaration —
the same discipline that made Jett's own collar-to-neckline pair get written and then removed
(above) rather than shipped implausible.** A hand reconstruction of "the body's own neck opening"
using only the body panel's own drafted neckline edge (front + back, doubled for the fold) undercounts
the real ring by roughly 11% — because Hugo's `front.mjs`/`back.mjs` each store
`neckOpeningLenFront`/`neckOpeningLenBack` as the curve's FULL length, but the body panel's own
drafted edge only carries **80%** of the front curve and **70%** of the back curve
(`neckOpening.shiftFractionAlong(0.8)`/`(0.7)`, verified by reading the source, not assumed). The
missing 20%/30% is exactly the portion of the neck opening that continues across the sleeve's own
raglan top — `sleeve.ts`'s own `raglanTop` edge (`[0, raglanTipFront]`, between `raglanTipBack` and
`raglanTipFront`), previously undeclared for the identical reason `body-front`/`body-back` had no
`neckline` edge. Summed correctly (front neckline ×2 + back neckline ×2 + both sleeves' own
raglan-top ×2 — front/back doubled because they're cut on fold, sleeve counted once per arm), the
ring closes to exactly `2 · neckOpeningLenFront + 2 · neckOpeningLenBack` read directly off Hugo's
own store, confirmed at four bodies (`SIZE_TABLE.PP/M/GG`, `SIZE_TABLE_MALE.M`) before any pair was
written.

**The hood's own matching ring needed the identical care.** `hoodSide`'s own neck edge (`neckEdge`
back to `frontEdge`, wrapping through index 0 — the arc the pre-#341 wrapper had already located
and named in a comment but never declared) doubled, plus `hoodCenter`'s own SHORT end
(`hoodCenterWidthCm = head / 10`, the small connecting edge that closes the hood's own neck-opening
loop at center-back) — omitting that short end (measuring only the two `hoodSide` edges) undercounts
the hood's own ring by roughly 11% too, the same magnitude as the body-side mistake above and for the
same underlying reason: a ring has more than the two "obvious" long edges.

**With both rings measured correctly, they close with a small, stable, real residual — not noise.**
At `SIZE_TABLE.PP/M/GG` and `SIZE_TABLE_MALE.M`: `hoodNeckRingCm / neckRingCm` = 1.0369 / 1.0337 /
1.0355 / 1.0355 — the hood's own ring runs **~3.3–3.7% longer than the body's own opening, at every
size checked**, the same "cross-body stability stands in for a correctness check" signature Jett's
own `armholeCapEaseCm`/`shoulderEaseCm` established (`easeCm` is tautologically what makes `diffCm`
zero once subtracted; the number that actually proves the pair is right is that it stays in a narrow
band across bodies rather than swinging with body size). `hoodie-hood-neckline`'s own `easeCm` is
this measured residual (`hoodNeckRingCm - neckRingCm`, computed from the drafted geometry, never a
literal), not an assumed zero and not a guessed constant.

**`hoodie-hood-center` now represents BOTH of the hood's two physical seams, not one.** The 3-panel
hood has each `hoodSide` half meeting `hoodCenter` on its own side — `hoodCenter`'s two equal-length
long edges (`straightBand`'s own `near`/`far`, the rectangle's bottom and top). Both are real seams;
both stay equal by construction (the same synthetic rectangle on both sides), so `diffCm` stays
exactly 0 with `a`/`b` each now carrying two edges instead of one — no test had to loosen anything to
accommodate this.

**The neck-binding strip is sized to the measured ring, not to Hugo's own upstream formula.** Hugo's
own live-drafted `hugo.neckBinding` part (confirmed by drafting it with `expand: 1`) measures
`2·neckOpeningLenFront + 2·neckOpeningLenBack + hoodCenterWidth` — 45.87cm at `cisFemaleAdult38`,
50.32cm at `cisMaleAdult42` in the upstream model set. The `+ hoodCenterWidth` term is upstream's own
cutting-width generosity (Hugo drafts a wider strip than the seam needs, presumably to allow trimming
after construction), not seam geometry — carrying it into this repo's own pair would report a
permanent, fabricated "ease" that has nothing to do with fit. `draftNeckBinding` (`lib/draft/
subpieces.ts`) instead sizes the strip to the ring alone and declares `easeCm: 0` on
`hoodie-neck-binding`; the seam allowance is applied at the cut line like every other piece, not
folded into a length. Its own height (`NECK_BINDING_HEIGHT_CM = 4`) is an authored constant, the same
"measure the seam length, author the band's own width" split `draftCuff`/`draftWaistband` already
use — not Hugo's own `length / 44.2` formula, which yields roughly 1cm and is a cutting-width ratio
for an already-expanded strip, not a usable finished band height.

**The same six edges are named by TWO declared pairs, deliberately — the first case this codebase
has that genuinely needs it.** The body's neck opening is sewn twice in the real garment: once to
attach the hood underneath, once to apply the finishing binding on top. `hoodie-hood-neckline` and
`hoodie-neck-binding` share an identical `a` side for exactly this reason. Nothing in the seam-graph
machinery assumes an edge is claimed by at most one pair (`walkSeamPairs` has no uniqueness
constraint; the #330 orphan-piece gate is per-piece, not per-edge; `hemEdgeIsConsumed` only ever
inspects a piece's own `seamEdges.hem` key, and the binding's is `neck`) — so this shipped as a
documented convention (`docs/architecture/seams-and-assembly.md`), not a code change to the graph
itself.

**`PHASE_BY_KEY` gained two entries.** `hoodie-hood-neckline` is `attach` (the hood, a sub-piece,
sewn onto an already-shaped edge — same footing as `collar-neckline` — declared before
`hoodie-cuff-wrist` in `hoodie.ts`'s own array so the stable sort keeps it first among the hoodie's
`attach` pairs). `hoodie-neck-binding` is `band` (a finishing strip over an already-closed seam,
same footing as `hoodie-waistband-hem`, just at the neck). The moletom's own assembly order grew
from seven steps to nine: raglan-front, raglan-back, hood-center, sleeve-underarm, side,
**hood-neckline**, cuff-wrist, waistband-hem, **neck-binding**.

**A moletom persisted before #341 degrades gracefully, in exactly the one place expected.**
`buildAssemblyOrder` always redrafts through the pattern's own frozen engine, so the two new steps
appear the moment the order is next derived — no migration, no re-generation required. `pieceDisplayName`
falls back to the bare piece id when a step names a piece the pattern's own persisted `pieces` list
predates (`"neckBinding"` for a pattern drafted before this issue), the same fallback every other
piece id on this path already relies on: never a crash, never a fabricated name, just a plainer
label until the pattern is next regenerated.

## The sleeve's own placket opening is drafted as a cut line, never as boundary geometry (#344)

**The AC as originally filed asked for "real boundary geometry" — a slit cut into the sleeve's own
outline. Drafted on paper first, before any code: this construction is geometrically unsound.** A
slit has zero width. A zero-width notch cut into an already-closed `outlineCm` produces two
coincident, antiparallel edges meeting at the slit's own tip — exactly the case
`lib/export/offset.ts`'s own corner-join helper (`lineLine`) already detects and refuses
(`Math.abs(denom) < 1e-9`, "parallel (or collinear) — no corner to join", returning `null`), and
whose caller then silently substitutes a plausible-looking but wrong corner (`?? cur[0]`) rather than
surfacing the failure. Confirmed against `lib/draft/spaceSampling.test.ts`'s own `cutSelfIntersection`
gate (which measures `offsetOutlineCm`'s real output, not a hand-argued claim) before writing the
real drafter: a boundary-modelled opening reads as the seam allowance self-intersecting at the
slit's own tip on every sampled body. The full seam-graph mechanics of the fix that was shipped
instead — a new `DraftedPiece.cutEdges`/`SeamEdgeRef.internalIdx` channel that mates an edge on a
CUT LINE (`internalsCm`) rather than the outer boundary — are recorded in
[`seams-and-assembly.md`](seams-and-assembly.md)'s own #344 entry; this entry covers the drafting
side only.

**`styleLine` (`InternalCm`, reserved since #127, "no drafter emits one yet") is the right existing
channel for this, not a new one.** It is real geometry that lives INSIDE a panel rather than on its
perimeter — precisely what a placket opening is. `lib/draft/sleeve.ts` emits it as a 2-point vertical
line running up from the hem; `lib/draft/core.ts`'s `place()` already translated a `styleLine` into
canvas geometry (the same open-path rendering `dart`/`pleat` use), so the ONE gap this issue actually
had to close on the export side was `lib/export/model.ts`, which had no `styleLines` field at all —
`pleats` (#244) is the precedent for "a reserved `InternalCm` kind's first real emitter needs one new
export-model field, mirroring an existing one's shape."

**Placement: the back half of the hem, a documented fraction in from the underarm seam, never
exactly on it.** `PLACKET_BACK_INSET_FRACTION = 0.25` (no verified industry-standard fraction exists,
the same footing `BUTTON_STAND_WIDTH_CM`/`COLLAR_HEIGHT_CM` already document) walks in from the
sleeve's own back/left hem vertex. Verified geometrically before shipping, not assumed: the sleeve's
own underarm-to-hem edges taper — the back edge moves TOWARD the vertical centre as height decreases
from hem to underarm (long-sleeve `hemHalf` is narrower than the cap's own half-bicep width), so a
vertical cut line anchored on the back half of the hem stays strictly interior for its whole
`SLEEVE_PLACKET_OPENING_CM` run, on every sampled body — confirmed by the sampled-space gate's own
`decorationOutside` bucket staying at zero with the opening's own two endpoints added to
`decorationPointsCm`'s walk (`lib/draft/geometryPredicates.ts`), which already treats a `styleLine`'s
points as decoration to contain. A direct unit-test guard (`PLACKET_OPENING_MIN_CLEARANCE_CM`) stops
a pathologically short `lengthCm` from ever placing the opening's own top past the underarm — dead
code through `draftAll` today (a long sleeve is never that short), kept because `draftSleeve` is
called directly in tests with hand-picked, unrealistic arguments.

**The opening's own length is AUTHORED (`SLEEVE_PLACKET_OPENING_CM = 10`), doubling the length the
pre-#344 fixed-dimension strip implied.** A continuous-lap placket strip binds BOTH lips of the slit,
so its own drafted length equals the opening's real length, one-to-one — not half of it. The
pre-#344 `PLACKET_LENGTH_CM = 10` was the STRIP's own length with no opening to derive it from at
all (drafted as a bare literal), which — read backward — implied an opening only 10cm long shared
across both lips; a real sleeve-placket opening runs 10–15cm. Fixing this meant inverting which side
of the collar/cuff/waistband "measure the seam, author the band" split the placket sits on: every
other sub-piece measures a body-derived seam and authors its own band width; the placket has no body
measurement to derive an opening length FROM, so the opening itself is the authored constant now, and
`draftPlacket`'s own strip length is what gets measured and derived from it (`garment.ts` reads the
cut edge's real length before calling `draftPlacket`, the same "drafter exposes what it needs
measured, caller measures the emitted geometry" rule #78 already established elsewhere).

## `gore` is a label over the circle construction today, and that is temporary, not the design (#328)

**The training corpus promised a construction the engine cannot draft.**
`lib/ai/training/phrasings.ts`'s `skirt.gore` bank taught the model that a godê is "godê, com aquelas
peças triangulares que dão rodado" — inserted triangular godets. No drafter in this repo produces
one. `radialPanels` (`lib/draft/skirt.ts`) returns `half-circle ? 1 : 2`, and the radial branch hands
`radialSkirt` the same `fullSweep = 2 * Math.PI` for `gore` as for `circle`, so the two silhouettes
draft **byte-identical geometry**. That is the same class of mismatch #250 exists to prevent, but
upstream of `validateSpec`, where no adjustment notice can catch it: a phrase in the corpus teaches
the model to promise the triangles in `assistantMessage`, and the molde that comes back has none.

**The two pt-BR fragments stay; the English "godet" mapping goes.** In pt-BR _godê_ names the roda the
code actually drafts, so "saia godê"/"com godês" were never the wrong half — only the triangle clause
was, and its replacement describes the same cone-shaped flare without reusing `circle`'s own wording
(the eval fixtures still expect "Saia godê." → `gore` and "Saia em círculo completo" → `circle`, so
the two banks must stay lexically distinct even while the geometry is not). `lib/ai/prompt.ts`'s
"# Vocabulary mapping" was the more consequential half: it mapped the **English** `"godet"` to `gore`,
and in English a godet IS the inserted wedge. It now maps `"godê"`/`"gored skirt"` and names the wedge
insert as an unsupported request, the same way the clause already names a contoured waistband or a
flare leg — with the matching `skirt-godet-insert` entry in `DECLINE_CASES`/`DECLINE_PROMPTS`, which
are deliberately "named after the exact prose in `lib/ai/prompt.ts`" so the two never drift apart.

**Closed by #351** (see the entry below): the temporary collapse this entry declared is gone, and so
are the `rows.skirtGorePanels` row and its pt-BR key. What follows is kept as the record of why.

**Decision (owner, on this issue): `gore` does NOT stay a permanent synonym for `circle`.** It is
meant to become a real N-panel construction — wedge panels sewn to each other, `radialPanels`
returning something other than `2`, and the seam graph gaining the interior panel seams that follow
from it. Filed as its own issue. Until that ships, the collapse is **planned work, so it is declared
rather than silent** (CLAUDE.md: "Surface feature limitations on-screen, never silently"): the gore
branch of `draftSkirt` emits a `rows.skirtGorePanels` row valued `comingSoonBadge`, the same
"em breve" shape `rows.collarOtherTypes`/`rows.trouserOtherLegs` already use for a real, named gap.
A user who picks "Godê" still gets a correct, sewable molde — it is a full-sweep flared skirt — and
now also gets told which part of the construction is not built yet.

**Test coverage that read as more than it was:** `lib/draft/skirt.test.ts`'s
"godet has a wider hem than straight" asserted on `skirt: "gore"`, i.e. the circle path, under a title
claiming godet coverage that does not exist. Retitled; the assertion was always correct.

Source: GarmentCode treats panel count and godet inserts as separate constructions (`SkirtManyPanels`
vs `SkirtCircle` vs `GodetSkirt`) — the mismatch surfaced when comparing that catalogue against ours.

## `gore` is N wedge panels the user chooses, not circle's two halves (#351)

**The construction.** A gored skirt is cut as N wedge panels sewn to each other. The geometry the
issue asked for stays polar: `radialSkirt` is unchanged, `gore` enters it with the same
`fullSweep = 2π` as `circle`, and only `panels` differs (`style.gorePanels`, default 6). So
`r * sweep * panels === waist` still holds by construction, the total hem equals the circle's, and
every consumer that reads waist + sweep instead of `qty` (the 3D proof's radial path, the ease
report's `unsupportedSilhouette` carve-out) was re-checked and needed no change. A fitted-hip gored
skirt (flat through the hip, flaring below) was the alternative considered; it is a different, non-polar
block and would have reopened the ease report and 3D proof, so it stays a possible later silhouette,
not what `gore` means.

**Decision (owner, on this issue's thread): the user picks N.** Offered choices were a fixed 6, a
fixed 8, the fitted-hip block, or a user-chosen count; Leonardo picked the user-chosen count. It is an
optional `GarmentStyle.gorePanels`, 4–12, even only. Additive and optional, so no migration: a spec
saved without it drafts the default 6 the next time the pattern is redrafted (stored pieces are
redrawn only then, as with any drafter change).

**Why even.** `dressWaistHalfCm` fixes each bodice half's hem at waist/2. With circle's `qty: 2` each
half sewed to one whole panel; with N wedges each half sews to N/2 of them, which only divides evenly
for an even N — an odd count would leave one wedge straddling the side seam. `validateSpec` snaps with
`evenGorePanels` (nearest even, then clamp), and `draftSkirt` snaps again so a direct caller can't
bypass it.

**Why a new adjustment kind.** An odd in-range count (7) is moved to 8, but it was never out of range
("clamped" would say so falsely) and the default was not used ("substituted" would say so falsely).
`describeSpecAdjustments` reports it as `"rounded"`, with its own chat string.

**Why a count kind, not a cm field.** `STYLE_LIMIT_FIELDS` doubles as `specParams`' "render with a cm
unit" list; adding `gorePanels` there would print "8 cm" on the Parâmetros panel. `STYLE_COUNT_FIELDS`
shares the range check in `checkEngineSupport` and gets its own `"count"` param kind.

**Why the seam pair was relabelled, not re-keyed.** The `skirt-side` self-pair on a `qty: N` piece
already declares "right edge of one copy to left edge of the next", which is exactly a gore seam, and
`spaceSampling.test.ts`'s closure gate passed on it unchanged. Its key drives the assembly phase, so
it stays; only the label (`skirtGoreSeam`) changes for a gore.

**Why the training combinator doesn't sample it.** `combinations.ts` samples each style field
independently, so it would pair "8 gomos" with a straight skirt as often as with a gore one and teach
the model a coupling the drafter ignores. Its sample list is deliberately empty.
