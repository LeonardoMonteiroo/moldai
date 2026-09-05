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
- **#124: notches are typed (`single`/`double`/`triple`), drafter-derived, and never persisted or user-movable** — `DraftedPiece.notches` (`core.ts`'s `NotchCm`: `type` + `outerCm` on the net outline + `innerCm` nudged inward), following the same derive-don't-store precedent as `measureSeams`/`fitPieceLabel`/`foldEdge`. The three types are told apart purely by how far the tick reaches — `NOTCH_DEPTH_CM` (0.3/0.6/0.9 cm) — which is simultaneously the AC's own "printable size" (3 mm/6 mm), not a second number to keep in sync. `core.ts` exports the geometry primitives every drafter calls: `notchAt(point, tangent, insideRef, type)` orients the tick's inward normal by biasing toward `insideRef` — a point the caller knows lies inside the piece — so it points into the fabric regardless of which winding direction that outline happens to walk (drafters mix clockwise/counter-clockwise, the same problem `lib/export/offset.ts` self-calibrates for on a whole outline); `notchAtVertex` derives the tangent from a vertex's own neighbours (exact at a straight-edge midpoint like a `foldEdge` endpoint, a good approximation at a smooth symmetric peak like the sleeve cap apex); `pointAndTangentAtCm`/`notchAtArcLengthCm` walk `distCm` from one vertex toward another along the same Catmull-Rom/Bézier geometry `curveArcLengthCm` measures, clamped to the segment's own length. `place()` (`core.ts`) translates `outerCm`/`innerCm` into a `Piece.notches` entry (`PieceNotch`, px, the same two-point-line shape as `grainline`).
- **Mated notches share one computed distance, not two independent guesses.** `body.ts`'s `bodice()` computes `pitchNotchCm`/`basePitchNotchCm` (`min(8, armholeEdgeLenCm * 0.7)`, off the actual and the un-deepened armhole respectively) and returns both from `draftBody`; `garment.ts`'s `draftAll` picks whichever matches the armhole the sleeve's cap was ACTUALLY drafted against (refit or not — the same actual/base choice it already makes for `sleeveArmhole`) and hands that single number into `draftSleeve`'s new `pitchNotchCm` parameter. Both pieces then place their pitch notch by walking that identical value from their own underarm vertex, so a front's single notch and the sleeve's own single-side notch land at truly matching positions "generated as pairs from the same computation" by construction, not by coincidence — verified in `garment.test.ts` across the full `DECORATION_CASES` matrix (chord-distance-from-underarm matches within 0.2 cm) plus the seam-conflict case (deliberately diverges when unrefit, exactly mirroring the seam's own divergence). Single marks the front, double the back — standard pattern-making convention — and the sleeve's single/double pair sits on opposite cap sides (bilaterally symmetric, so either physical arm can be cut from the same flat piece by flipping fabric); the cap's third notch (the apex, marking where the shoulder seam meets the cap) is deliberately excluded from that cross-check, since it has no single body-side counterpart to pair with (the shoulder point is a plain corner vertex on both the front AND back panels, not itself notched).
- **Every other notch is placed by direct convention, not by cross-piece coordination.** A hem-fold notch (single) sits at every piece's own `foldEdge` hem-end vertex (body panels and every skirt silhouette). A dress bodice's hem/waist-join edge additionally gets: double notches at its two outer corners (`hemL`/`hemR`) mirrored by the skirt panel's own waist-edge corners when `draftSkirt`'s new `isDressWaist` parameter is true (`garment.ts` passes `spec.type === "dress"`) — both sewn edges are the identical length by construction (`dressWaistHalfCm`, #79/#177 — straight/a-line always was; a circle/gore/half-circle skirt only became true once #177 moved the bodice hem off the hip and, for half-circle specifically, split the panel's one waist arc between the two bodice halves — see Seam-conflict detection above), so the corners are a real join, not an approximation; and single notches at each dart's leg-seam intersections, only for the dress-hem (single-ended) dart, since the fisheye (double-ended) dart on a non-dress piece is fully internal and touches no edge to notch.
- **#127: `Piece`/`DraftedPiece` carry a typed `internals` channel — darts (now zero or more per piece, not "at most one"; that premise was already false before this issue, since #122 had made `darts` an array), each dart's own fold line, and its drill hole(s).** `lib/draft/core.ts`'s `InternalCm` union (`dart`/`foldLine`/`drillHole` ship geometry; `pleat`/`styleLine`/`placementMark` are reserved — no drafter emits any of the three yet) is the cm-space shape a drafter attaches to `DraftedPiece.internalsCm`; `place()` translates it into `Piece.internals` (`PieceInternal`, px, path strings for path-shaped kinds like `notches`/`grainline` already do). `core.ts`'s `dartInternals(ptsCm, fold, apexesCm)` is the one place a dart's own three marks are derived together: the fold line is the dart's own press line (apex-to-apex for a double-ended/fisheye dart, apex-to-seam-midpoint for a single-ended one) — a different concept from the piece's own cut-on-fold axis (`foldEdge`/`fold`, unchanged by this issue) — and each free apex (not a seam end) gets a drill hole `DRILL_HOLE_SETBACK_CM` (1.25 cm, within the 1.0–1.5 cm convention) short of the point, clamped to 90% of the fold segment's own length. `body.ts`'s `bodice()` is the one drafter that builds darts; it now returns `internalsCm` instead of the old `dartsCm`. **Migration:** the legacy `Piece.darts?: { d: string }[]` field (#122's array, not a single dart) is superseded but kept readable — no new draft ever writes it, and `lib/types.ts`'s `resolvePieceInternals(piece)` maps an old blob's `darts` into the same `PieceInternal[]` shape at render time, the `savedAgo` precedent (no reset migration). `PatternCanvas` renders every internal kind distinctly (dart: solid path; foldLine: dashed line; drillHole: small open circle) via that same resolver. Export's `ExportPiece` keeps its own existing `darts` field (always freshly rebuilt by `buildExportModel`, never persisted, so it has no legacy shape to reconcile) and adds two siblings, `internalFoldLines`/`drillHoles`, built from the same `internalsCm`. `toDxf` writes a dart's fold line as a `LINE` and a drill hole as both a `POINT` and a `CIRCLE`, all on the existing `INTERNO` layer; `toDxfAama` writes the fold line as a `LINE` on layer 8 (joining the dart it belongs to) and the drill hole as a `CIRCLE` on layer 13 — D6673's own reserved drill-hole layer, closing that half of issue #2 (see `toDxfAama` below). `toSvg`/`toPdf` draw the fold line as a fine dotted line in the dart's own color and the drill hole as a small open ink circle; `toPlt` shares the dart's own pen for the fold line and adds a dedicated `PLT_PENS.drillHole` pen, emitting the hole via HPGL/2's native `CI` (circle) command.
- **#129/#130/#131 (Wave 2/W4): three small sub-piece drafters — collar, cuff+placket, waistband — live in `lib/draft/subpieces.ts`, each sized from a MEASURED edge on an already-drafted piece, never a proportion of the bust/waist.** `GarmentStyle` gained three closed enums (`lib/types.ts`): `collar?: "none" | "convertible"`, `cuff?: "none" | "straight"`, `waistband?: "none" | "straight"` — `validateSpec` clamps each the same way `neckline`/`sleeve`/`skirt` already do, and `lib/ai/schema.ts`/`prompt.ts` render the same exported `COLLARS`/`CUFFS`/`WAISTBANDS` constants (`lib/draft/garment.ts`) rather than a hardcoded duplicate. Because there is no third value for an unsupported shape (mandarin collar, shaped cuff, contoured waistband) to fall into, the AI's only path for one is `decline`/`ask` — never a silent substitution — and `prompt.ts`'s own catalog lines spell that out; on-screen, the drafted piece's own detail row says the rest are "em breve" (there is no dedicated style-picker UI these fields could otherwise disable+badge in, since `GarmentStyle` is chat-driven, not form-driven).
  - **Collar** (`draftCollar`): `body.ts`'s `bodice()` exposes two more `seamEdges` per panel, `necklineLeft`/`necklineRight` (the same `[cf, hpsL]`/`[hpsR, wrap-to-cf]` index pair its own neckline `curvedSpans` already use). `draftAll` sums all four (front+back, both halves) via `curveArcLengthCm` into the real drafted neckline circumference and drafts the collar's own straight neckline-seam edge to exactly that length — applies to any body-having garment (blouse/dress/tshirt) with `style.collar === "convertible"`, qty 1 (cut on fold at center back).
  - **Cuff + placket** (`draftCuff`/`draftPlacket`): `sleeve.ts` exposes `seamEdges.hem` (the straight edge between its two hem vertices); `draftAll` measures it and adds `WRIST_EASE_CM` (a flat knit/woven table, `sleeve.ts` — the issue's own "not a proportion" instruction, since the hem is bicep-derived and far wider than an actual wrist) to size the cuff's own seam. Only reachable with `style.sleeve === "long"` — a short/sleeveless spec simply never drafts the cuff branch, the same "type-mismatched style field is unused" precedent skirt-only fields already follow on a bodice. The placket is fixed-dimension (not measured — only the cuff's own AC requires that), qty 2 each (one per sleeve).
  - **Waistband** (`draftWaistband`): reuses `skirt.ts`'s existing `seamEdges.waist`, summed across the panel's own `qty` (the closed waist loop is `qty` copies of one drafted panel's waist arc, not one panel's share of it) plus a fixed `WAISTBAND_OVERLAP_CM` closure allowance. Applies to the standalone skirt archetype (`spec.type === "skirt"`) and, since #128, to trousers too (summed across both the front AND back panel's own measured waist edges — see the trousers bullet below) — a dress's skirt panel joins the bodice directly at the natural waist instead (the pre-existing `waist-join-front`/`-back` pairs, and #177's own tracked gap there); waistband and waist-join never both apply to the same garment. **Defaults ON** (`style.waistband ?? "straight"`), unlike collar/cuff's default-off: a skirt or trousers with no waistband is the exact defect #131 exists to fix, so both draft one unless a request explicitly sets `"none"`. The button/zip closure position is a placement mark the issue's own decision deferred ("needs the internal-geometry channel... emit the band without the mark and say so") — #127 later added exactly that channel (`InternalCm`'s reserved `placementMark` kind), but that decision was settled and is deliberately not reopened here; the waistband's own detail row still says the mark is missing.
  - **Seam graph:** each new piece declares its own `seamEdges` and is paired into `lib/draft/garment.ts`'s `seamPairs` the same way every other mated pair is (`collar-neckline`, `cuff-hem`, `waistband-waist`) — a collar/cuff/waistband that stopped matching its own seam would be exactly as detectable as an armhole/cap mismatch. All three are `fixable: false` (there is no automatic resolution for any of them, the same "equal by construction" regression-guard shape as `shoulder`/`side`/`sleeve-underarm`) and measure at (or within floating-point noise of) zero `diffCm` by construction, verified within the AC's own 0.3 cm bound in `garment.test.ts`'s "seam graph (#134)" suite — tighter than `seamCheck`'s general 1 cm `SEAM_TOLERANCE_CM`.
  - **Export:** no export-format code changed — every format already draws whatever `ExportModel`/`Piece` it's handed, so the four new pieces flow into every DXF/PDF/SVG/PLT format and `CutPlanTab`'s nesting automatically, the same way #8/#135/#136 already made that true for any new piece. `model.test.ts`'s "cut-line area growth is within 5% of perimeter x allowance" invariant (#123) needed a small fixed floor added to its tolerance (`6 * allowance²`) once these small, mostly-rectangular band pieces existed: a mitred uniform offset legitimately grows a shape's area by `perimeter × allowance` **plus** a real per-corner correction (exactly `allowance²` per 90° corner for a plain rectangle) that a flat 5% relative bound has no room for once a piece's perimeter is short enough for that correction to matter — a large, curve-heavy body panel never noticed it; a ~5 cm-tall band does. This is the offset math behaving correctly, not a defect the fix is papering over.
- **#128 (Wave 2/W5): a fifth archetype, `trousers` — a straight-leg block only (the issue's own scope decision; tapered/wide/flared/cargo are follow-ups), front + back panels plus a waistband, all in `lib/draft/trousers.ts`.** Unlike a bodice/skirt panel, a trouser leg's front and back are each a genuinely asymmetric single-leg shape (the inseam and outseam are different edges, not mirror halves of one centre line) — so neither declares a `foldEdge`; both are cut `qty: 2` (one leg mirrors the other by flipping the fabric, not by folding it). Front and back deliberately share the same rise depth, total length and hip quarter-width (an equal front/back split, the same simplification `skirt.ts`'s own `hip/4` panel already makes) — only the crotch curve's own extension differs (the back's own seat curve reaches further out than the front's), which is what keeps the inseam and outseam an _identical_ length front vs back by construction (both are plumb verticals sharing the same dy, independent of the crotch extension that tells them apart). Each panel gets one waist dart, the same single-ended (apex-to-seam-midpoint) shape `body.ts`'s own dress-hem dart already uses. **Total length has no per-size measurement to fall back to** — #132 added only `rise` (crotch depth), not a leg-length field — so `style.trouserLengthCm` (AI/user-settable, `STYLE_LIMITS`-clamped like `skirtLengthCm`) defaults to a flat per-gender constant (`TROUSER_DEFAULT_LENGTH_CM`, same at every graded size until a future measurement-vocabulary issue adds a real one), the same "not graded across sizes" shape `shoulderSlope`'s own flat per-gender constant already uses for a different field. **`rise` is read when the chart has it, falling back to `hip/4 + 4`** (a documented crotch-depth proportion) when it doesn't — both seeded system charts already carry a real, per-size-graded `rise` (see the measurement-vocabulary section above), so the fallback is a robustness path, not the common case.
  - **Seam graph:** five pairs, all `fixable: false`. `trouser-front-rise`/`trouser-back-rise` are **self-pairs** — each panel's own centre-front/back edge (the fly seam, the back rise seam) sewn to the mirrored copy of itself, the same self-pair shape `sleeve.ts`'s own two underarm edges already use for its own left/right mirror seam — trivially exact (comparing a curve to itself). `trouser-inseam`/`trouser-outseam` pair front vs back, exact by construction (see above). `trouser-waistband-waist` reuses `draftWaistband` **verbatim, not forked** (`lib/draft/subpieces.ts`, #131's own "reused by the trousers block" acceptance criterion) — summed across both panels' own measured waist edges (each times its own `qty`), the same "closed circumference, not one panel's share of it" rule the skirt's own waistband pairing already follows; verified within 0.3 cm in `garment.test.ts`'s "seam graph (#134)" suite, the same bound #129/#130/#131's own pairs are held to.
  - **Prova 3D (`/pattern/[id]`'s 3D fitting preview) does not cover trousers.** `lib/proof3d/mesh.ts`'s `buildProofMesh` only recognizes the body/sleeve/skirt piece ids — a trousers pattern's pieces (`trouser-front`/`trouser-back`) match none of them, so without this fix it would silently return a bare mannequin with zero garment shells instead of failing or saying so. `Proof3DTab` now treats `spec.type === "trousers"` as an explicit, named gap (`notSupportedForTrousers`, its own catalog string, distinct from the ordinary "generate a pattern first" empty state) rather than rendering an unlabeled/empty preview indistinguishable from a bug — the same "surface the limitation where the user meets it" rule this tab's own beta badge already follows. Extending the mesh builder to trousers is out of scope here.
  - **`components/dashboard/PatternGrid.tsx` had its own hardcoded `GARMENT_TYPES` array**, independent of `lib/draft/garment.ts`'s `TYPES` — the exact "duplicated fact" mistake this file's own convention section warns about (`Wallet.planLabel`, `FREE_PLAN_CREDITS`, `FORMAT_KEYS`, `PLAN_IDS`). Left alone, the dashboard's garment-type filter would have simply never offered "Calça" for a real, drafted archetype. Now imports `TYPES` directly.
- **#137: the drafted-ease report — `lib/draft/easeReport.ts`'s `buildEaseReport(pattern, t)` — is the second geometric fit answer in the app, alongside `seamCheck`'s armhole/cap comparison.** It states how much ease the FINISHED garment actually has at bust/waist/hip, deliberately distinct from `wearingEaseCm` (the ease the drafter was merely _asked_ for): a style adjustment, a dart, or a silhouette can make the two diverge. Pure, DB-free, redrafts via the same `draftPiecesCm`/`measureSeamGraph` (#134) `buildExportModel` already uses — no new blob key, so it works unchanged on a pattern drafted before this issue. Per girth: a scanline (`polygonSpanAt`, the `lib/canvas/pieceLabel.ts`'s `horizontalSpanAt` precedent — curved spans read as their chord) reads the piece's real width at a height derived from public data only (a `seamEdges` vertex, or a raw `Measurements` field like `backLength`/`hipHeight` — never an internal per-drafter formula), then subtracts whatever any `internalsCm` dart removes at that same height (its own leg polygon, scanned identically, gives exactly the fabric its fold takes up — full width at the seam end, tapering to zero at the apex). That single mechanism handles every drafter's dart shape generically (`body.ts`'s fisheye AND dress-hem darts, `trousers.ts`'s waist dart) without this module knowing any of their suppression formulas. **Bust:** front+back at the armhole's own underarm height, only for a bodice (blouse/dress/tshirt) — a skirt or trousers has none. **Waist:** front+back at `backLength` for a bodice (coincides with the hem for a dress, #79); the trousers panels' own top edge WITH dart subtraction (the true, sewn waist); a standalone skirt's real `seamEdges.waist` arc length (silhouette-agnostic, no dart to subtract, the same edge the waistband sizing already measures). **Hip:** a skirt panel (standalone or a dress's) at `hipHeight` below its own waist — but ONLY for the straight/a-line silhouette; a circle/gore/half-circle panel is drafted from polar coordinates, where a horizontal scanline reads a meaningless width, so hip is reported `unavailable` (`unsupportedSilhouette`) rather than a wrong number. A skirt-less bodice reads hip at `backLength + hipHeight`, still inside the same panel. Trousers read the panel's own top edge again, this time WITHOUT dart subtraction (`includeDarts: false`) — a waist dart shapes the waist, it doesn't remove hip fabric, and the block happens to draft both at the identical height, so subtracting there would collapse hip into waist. A girth with no matching panel is `unavailable` (`noPanel`) — trousers' missing bust is the issue's own named example, generalised to any bust-less garment. **Cap ease** ("cap arc minus full armhole arc") is read straight off the existing seam graph's own `"armhole-cap"` entry (`aLenCm`/`bLenCm`), not a bespoke number. **Fit class** comes from `lib/draft/ease.ts`'s new `classifyGirthFit(girth, easeCm)` — band boundaries are the MIDPOINTS between consecutive `FIT_CLASSES`' own `FIT_EASE_CM` figures (never a second, competing scale), so a measured ease and `wearingEaseCm`'s requested one are judged on the one table `lib/ai/prompt.ts` already renders `FIT_CLASSES` from. Negative ease (a knit) classifies as `close`, not an error. `TechSheetTab` renders the report as its own card (bust/waist/hip rows: finished cm, body cm, diff cm/%, fit class — reusing the existing `PatternData.fit.*` catalog lookup — plus cap-ease chips), replacing the old single bust-only `chipEase` chip that showed _requested_ ease under the same word "folga" a measured number now owns unambiguously; an `unavailable` girth renders as a stated reason, never a silent gap. `lib/ai/prompt.ts`'s `buildSystem` also embeds the report as JSON (a no-op identity `Translate`, since the whole prompt is deliberately English/i18n-free) so an `explain` answer about fit can cite the real numbers instead of guessing from the spec alone.

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

**Not part of this decision, and tracked separately: the spike found a shipped fit
defect in our own `tshirt` archetype.** Our size-M `body-back` is a whole mirrored panel
78.0 cm wide, so two of them make a 156 cm finished chest on a 100 cm body — 56% wearing
ease, where Freesewing's Teagan at published defaults holds 18.0% flat across the same
four sizes. The cause is `TSHIRT_BASE_EASE_CM = 55.9` (`lib/draft/ease.ts`), solved
_backwards_ from the benchmark's size-M panel width with the arithmetic in its own
comment. That figure cannot bear the weight: `docs/reference/tshirt-benchmark/`'s own
`segment-measurements.md` reads the same panel span as 49.09 cm rather than 79.99 and
already flags the discrepancy, and our collar band — sized from the _measured_ neckline
arc, independent of `halfChest` — lands within 0.08 cm of the benchmark at M, which says
the reference's "M" really is a ~100 cm-chest garment. Relatedly, #242's −17.52 cm back
armhole gap is constant to 0.06 cm across all four sizes, which is the signature of a
fixed-length curve rather than a graded armhole error, and points at the back
**neckline**. **A corollary for anyone reading `comparison-report.md`: our drafter was
fitted to that benchmark and Freesewing was not, so its "ours is closer" deltas are
circular, and its two representation-dependent metrics (the curve/straight perimeter
split, and the orientation-dependent bounding box) are not comparable across engines at
all.**

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

**A style-field capability gap is reachable for `"moldai"` itself, not only a
hypothetical second engine.** `validateSpec` does not gate style fields by
`spec.type` — it happily resolves `style.collar` on a `type: "trousers"` spec, which
`MOLDAI_CAPABILITY.styleFieldsByType.trousers` does not list. `checkEngineSupport`
reports this as a `styleField` gap today, drafts anyway with the field dropped
(matching what silently happened before this issue), and now says so in a
`tone: "notice"` chat bubble. `styleFieldsByType` was built as ground truth by reading
every drafter directly, which surfaced a separate, adjacent, deliberately-unfixed
finding: `lib/draft/formFields.ts`'s own `STYLE_FIELDS_BY_TYPE` offers a "fit" control
for `tshirt`/`skirt`/`trousers` that no drafter reads for those types (`tshirt` reads
`stretch` instead; `skirt`/`trousers` don't read `fit` or `stretch` at all — their own
wearing ease is a fixed constant). `capability.test.ts` documents the three cases in a
comment rather than "fixing" `NewPatternForm`'s rendered fields as a side effect of an
unrelated issue.

---

## Registering GarmentCode as a second engine is declined for now, on every axis measured (#269)

**Decided, evidence only — nothing built or registered.** Full numbers in
`docs/reference/garmentcode-spike/README.md`, run against `pygarment==2.0.2` in a throwaway
Docker container. Scope note, precise on purpose: this declines registering **GarmentCode**
as a second engine **now**. It says nothing about FreeSewing, which is a separate, still-open
question (#266) that the swappable-engine decision above did not resolve either — that entry
declined a wholesale swap of our drafters, on cost, not the FreeSewing candidate itself.

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
  discipline `skirt.ts`/`trousers.ts` already follow, not a competing formula.
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
here; `coat`/`shirt` remain, each with construction complexity well beyond every archetype
registered so far (`shirt`/Simone: 18 parts, collar+stand+cuff+sleeve-plackets;
`coat`/Jaeger or Carlton: 23–26 parts, lining, welt pockets, a 2-part sleeve, collar+stand+
under-collar) — genuinely new sub-piece-adapter engineering, not a repeat of the
tshirt/blouse/skirt/trousers/hoodie pattern. Fase 5 (UI engine selection in `NewPatternForm`)
and a final cross-archetype benchmark/docs pass remain open too.
