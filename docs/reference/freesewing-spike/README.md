# Freesewing evaluation spike (#266)

Empirical evidence for #266 — "evaluate freesewing as the drafting engine instead of
hand-written drafters". Run 2026-09-04 against `@freesewing/*@4.10.1`, the published npm
release, in a throwaway project outside this repo. **No freesewing package was added to this
repo's dependency tree.**

Every figure below was measured, not recalled. The one thing this spike could NOT establish is
stated up front, because it changes how the rest reads.

## The headline: the benchmark cannot adjudicate this question

`docs/reference/tshirt-benchmark/` was the intended judge (#266's fourth acceptance criterion:
"drafts the benchmark t-shirt with a Freesewing block and scores it on the same metrics"). It
cannot serve as one, for four independent reasons found while running the spike:

1. **The reference's body measurements are unknown.** `measurements.json` gives per-piece
   geometry only. Nothing pins its "M" to `SIZE_TABLE_MALE.M`.
2. **Its size run does not grade at our rate.** Its finished chest (back + front panel width)
   steps **4.80 cm per size**; `SIZE_TABLE_MALE` steps **4.00 cm**. Neither engine, fed our
   table, can reproduce its grade slope.
3. **Its width figure is contradicted by its own companion file.** `measurements.json` gives
   back `widthCm` 79.99 at M; `segment-measurements.md` reads the same panel's top and bottom
   edge span as **49.09**, and already flags the discrepancy ("Width 79.994 is bbox width, not
   the 49.09 hem-line span"). At face value 79.99 implies a **155.9 cm finished chest**.
4. **Our own drafter was calibrated backwards from figure (3).** `lib/draft/ease.ts`'s
   `TSHIRT_BASE_EASE_CM = 55.9` carries the arithmetic in its own comment:
   `ease = (77.96/2 - 100/4) * 4 = 55.9`, solved so our panel width matches the benchmark's.

(4) is why the existing `comparison-report.md` is not a fair scoreboard: one competitor was
fitted to the target and the other was not. Every "ours is closer" cell below is circular.

## The real finding: our `tshirt` archetype has ~56% wearing ease

Independent of freesewing, the spike surfaced a shipped fit defect.

| size | body chest | our finished chest | our ease         | freesewing finished | freesewing ease  |
| ---- | ---------- | ------------------ | ---------------- | ------------------- | ---------------- |
| P    | 96         | 151.90             | 55.90 cm (58.2%) | 113.28              | 17.28 cm (18.0%) |
| M    | 100        | 155.90             | 55.90 cm (55.9%) | 118.00              | 18.00 cm (18.0%) |
| G    | 104        | 159.90             | 55.90 cm (53.8%) | 122.72              | 18.72 cm (18.0%) |
| GG   | 108        | 163.90             | 55.90 cm (51.8%) | 127.44              | 19.44 cm (18.0%) |

Our `body-back` at M is a whole mirrored panel **78.0 cm wide** (`foldEdge` is the chord at
x=39, the piece's own midline; the drafter's own `rows.chestWidth` detail row reads "78,0 cm").
Two panels → a 156 cm finished chest on a 100 cm body. Freesewing's Teagan at published
defaults holds **18.0% flat** across the run, the conventional band for a relaxed tee.

**Two independent checks say the benchmark's "M" really is a ~100 cm-chest garment**, so the
55.9 cm is a misread dimension rather than a genuinely oversized reference:

- Our **collar band** matches the benchmark to **0.08 cm at M** (105.76 vs 105.84). The collar
  is sized from the _measured neckline arc_, and `neckHalf` (`lib/draft/body.ts:114`) derives
  from `neckGirth`/bust — never from `halfChest`. So the neckline is right for a 100 cm chest
  while the body width is not.
- `ease.ts`'s own FLAG comment already records that 55.9 is "far outside the ~15-20 cm 'loose
  tee' range found in hand-sewing pattern-drafting references". Freesewing's 18.0% is inside
  that range.

`ease.ts` offers two readings of the anomaly — (1) a deliberately oversized reference, or (2)
`SIZE_TABLE_MALE.M`'s bust doesn't match the reference's M. The collar-band evidence rejects
both in favour of a third: **the 79.99 cm width figure itself is wrong**, and its own companion
file says so.

### #242's -17.52 cm is not a graded armhole error

The back `curvePerimeterCm` delta is **-17.50 / -17.52 / -17.54 / -17.56** across P/M/G/GG — a
constant to within 0.06 cm. A graded armhole error would scale with size; a constant is the
signature of a fixed-length curve mismatch. Our back panel's curve total (66.84 at M) is
11.80 cm short of our own front's (78.64), while the benchmark's back and front are near-equal
(84.35 vs 83.13). The gap is a back **neckline** drawn too shallow, not the armhole #266
attributes it to.

## Grade slope — measured, and why it proves nothing

Reported because it looks decisive and is not, so the next reader does not re-derive it.

| piece  | metric      | benchmark | freesewing    | ours          |
| ------ | ----------- | --------- | ------------- | ------------- |
| back   | widthCm     | 2.40      | 2.36 (-1.7%)  | 2.00 (-16.7%) |
| front  | widthCm     | 2.40      | 2.36 (-1.7%)  | 2.00 (-16.7%) |
| back   | perimeterCm | 8.96      | 6.20 (-30.8%) | 4.38 (-51.1%) |
| back   | heightCm    | 2.40      | 0.95 (-60.3%) | 0.50 (-79.2%) |
| sleeve | perimeterCm | 3.86      | 2.62 (-32.0%) | 3.50 (-9.2%)  |

cm per size step, least-squares over the four sizes. Freesewing appears to nail panel-width
grading. It does not: fed our 4.00 cm body step at 18% ease it yields 4.00 × 1.18 = **4.72**
finished, which happens to sit near the benchmark's **4.80**. Fed the benchmark's own 4.80 cm
body step it would yield 5.66 — an overshoot. The apparent match is arithmetic coincidence.

## Mated seam length — freesewing solves it, imperatively

#266 asks whether freesewing has "any declarative mated-seam-length check". **It has no
declarative one.** `@freesewing/core` has no seam-pair, `seamEdges` or whole-garment topology
concept; `Path.length()` is the only primitive, and a grep for
`seamLength|mated|seamPair|seamGraph|checkSeam` across `core/src/` returns nothing.

But it does solve the problem our seam graph reports. `@freesewing/library`'s `sleeve` part
iterates the sleevecap up to 50 times, adjusting an internal `__sleevecapFactor` until
`|sleevecapLength − (armhole + ease)| ≤ 2 mm`. Measured on the four benchmark sizes:

| size | armhole (front+back) | target | drafted cap | divergence  |
| ---- | -------------------- | ------ | ----------- | ----------- |
| P    | 477.24 mm            | 477.24 | 478.58      | **1.33 mm** |
| M    | 484.94 mm            | 484.94 | 486.66      | **1.71 mm** |
| G    | 492.91 mm            | 492.91 | 491.68      | **1.24 mm** |
| GG   | 501.03 mm            | 501.03 | 500.60      | **0.42 mm** |

So the armhole/cap pair — per CLAUDE.md the **only divergence our seam graph can actually reach
today** — is eliminated at draft time, against our `SEAM_TOLERANCE_CM` of 10 mm plus a manual
"Corrigir manga". Freesewing also has a user-facing warning channel (`store.flag.*`, used by
**51** of the installed packages; `@freesewing/i18n` exports the `flags` strings), and `brian`
raises `largeShoulderWidth` when it cannot build a good armhole.

#266's claim that "no published pattern-generation system reports a manufacturability metric of
any kind" therefore needs narrowing: freesewing targets mated seam length by construction and
surfaces the resulting ease and failures to the user. What stays genuinely ours is the
**declarative, whole-garment, per-pair reported** graph — and the assembly order walked from it.

## Adapter cost — cheap, because `DraftedPiece` needs no type change

The worry was a model mismatch: freesewing paths are explicit cubic Béziers with arbitrary
control points; `DraftedPiece.outlineCm` is a `Pt[]` vertex list with `curvedSpans` whose curves
are Catmull-Rom-derived. Measured, by flattening Teagan's seam paths at N samples per curve op
and comparing our `curveArcLengthCm` against freesewing's own `Path.length()`:

| samples/curve | front vertices | our arc length | freesewing true | error         |
| ------------- | -------------- | -------------- | --------------- | ------------- |
| 1             | 8              | 183.820        | 185.645         | -1.824 cm     |
| 2             | 12             | 185.276        | 185.645         | -0.368 cm     |
| 4             | 20             | 185.583        | 185.645         | **-0.062 cm** |
| 8             | 36             | 185.635        | 185.645         | **-0.009 cm** |
| 16            | 68             | 185.643        | 185.645         | -0.001 cm     |

**8 samples per curve reproduces the true Bézier arc length to 0.009 cm** at 36 vertices (vs 14
today). Even 2 samples is inside `SEAM_TOLERANCE_CM`. So the adapter is one pure module, not a
change to the geometry model — which matters, because `outlineCm`/`curvedSpans`/`seamEdges` are
read by **13 non-test files, 5,215 LOC**
(`lib/draft/{assembly,body,core,easeReport,garment,seams,skirt,sleeve,subpieces,trousers}.ts`,
`lib/export/{model,offset}.ts`, `lib/proof3d/mesh.ts`). Persistence is unaffected:
`Piece.outline` is already an SVG `d` string. The visible cost is `Piece.vertices` growing from
14 to ~36 snap targets per panel.

### Plugin fit: no fork needed, but no free lunch

`@freesewing/core` exposes **14 hooks** (`hooks.mjs`), including `postSetDraft` and `postDraft`
— enough for a seam-graph plugin that runs after every part is drafted, with the store and all
paths in hand. No fork required.

What it cannot do is _discover_ the pairs. Declaring a mated range needs edge identity, and that
is inconsistent across the collection:

- `paths.seam` exists on every part (215 occurrences) but is one flattened op list.
- Named sub-paths are ad hoc: `saBase` 97, `hemBase` 52, `fold` 39, `armhole` **16**,
  `sideSeam` 15. Only **17 of 74** designs name an armhole path at all.
- Notch snippet names fork 12+ ways (`armholePitchNotch` 22, `backNotch` 8, `frontNotch` 7,
  `notch` 5, `shoulderNotch` 4, `sleevecapNotch` 2, `armholeNotch` 2, …).

For the garments we actually ship the cost is bounded — Teagan already exposes `paths.sleevecap`
plus `frontArmholeLength`/`backArmholeLength` in the store, so the armhole/cap pair needs no
geometry work at all. But it is **one hand-written map per garment**, not a generic derivation,
and `ConflictEntry.markers` still needs point coordinates.

## The expensive part: measurement vocabulary

Teagan requires **13** measurements and takes 1 optional. Our `Measurements` supplies 6.

| freesewing                       | ours                                      | status                                                            |
| -------------------------------- | ----------------------------------------- | ----------------------------------------------------------------- |
| `chest` / `waist` / `hips`       | `bust` / `waist` / `hip`                  | ✅                                                                |
| `waistToHips` / `hpsToWaistBack` | `hipHeight` / `backLength`                | ✅                                                                |
| `shoulderToShoulder`             | `shoulder` × 2                            | ✅ (ours is the half-width)                                       |
| `neck` / `biceps` / `hpsToBust`  | `neckGirth` / `bicep` / `bustPointHeight` | ⚠️ ours are **optional** extended keys                            |
| `highBust` (optional)            | `highBust`                                | ⚠️ optional both sides                                            |
| `shoulderSlope`                  | `shoulderSlope`                           | ❌ **semantic conflict** — theirs is degrees (13), ours a cm drop |
| `waistToArmpit`                  | —                                         | ❌ absent; drives their v3 armhole depth                          |
| `wrist`                          | —                                         | ❌ absent                                                         |

So adopting Teagan means `Measurements` gains ~7 required keys — a **wire-shape change** to
`SizeChartData`, which CLAUDE.md names as the expensive kind: a migration, new size-chart table
columns, spreadsheet-import and `validateSizeChartPatch` changes, and new required inputs in the
UI. Every one of our 74-design-wide ambitions multiplies that: Teagan alone exposes **50
options** against our one small validated `GarmentSpec`.

## pt-BR: absent, with no slot to put it in

- Every one of the 74 design packages ships **`i18n/en.json` only**. No design has any other
  locale.
- `@freesewing/i18n@4.10.1` is **not keyed by locale at all** — `measurements`, `designs`,
  `optiongroups` and `flags` are flat English string banks (39 measurement names,
  `measurements.chest === "Chest circumference"`). There is no `pt`/`pt-BR` key to fill.
- The only multi-locale package installed is `plugin-annotations` (de, en, es, fr, nl, uk) —
  still no pt-BR.

Against our language boundary (UI display text is pt-BR) that is 39 measurement names plus ~50
option labels _per design_ to translate and maintain ourselves.

## Licence

- **Upstream `LICENSE` at `codeberg.org/freesewing/freesewing` is MIT**, single file, "Copyright
  (c) 2022 Joost De Cock". `LICENSE.md`, `COPYING`, `designs/teagan/LICENSE` and
  `packages/core/LICENSE` all 404 — there is **no per-design or per-plugin licence** that
  differs.
- All **91** installed packages declare `"license": "MIT"`.
- ⚠️ **None of the 91 npm tarballs ships a LICENSE file** — only the `package.json` field. A
  minor attribution nit if any of it is ever vendored.

## Design collection: 74 designs

Tagged: tops 33, bottoms 21, accessories 13, trousers 10, blocks 8, underwear 8, coats 6,
historical 5, skirts 4, swimwear 4, toys 4, bags 2, hats 2, pyjamas 2, onePiece 2, infants 1,
costumes 1, dresses 1, overalls 1.

Against our five archetypes (`blouse`, `dress`, `skirt`, `tshirt`, `trousers`), classes we do
not cover at all:

| class                            | designs                                                                    |
| -------------------------------- | -------------------------------------------------------------------------- |
| coats / jackets                  | jett, carlita, carlton, devon, jaeger, lunetius                            |
| hoodies / sweatshirts / sweaters | hannah, huey, hugo, sven, yuri                                             |
| button-down shirts               | simon, simone                                                              |
| underwear / corsetry             | bruce, uma, umbra, jane, aaron, cathrin, sabrina, shale                    |
| swimwear                         | shin, onyx, bee, shelly                                                    |
| accessories                      | albert, benjamin, florence, trayvon, hortensia, florent, holmes, lucy, bob |
| toys                             | hi, octoplushy, polly, skully                                              |
| historical                       | lucy, walburga, lunetius, tiberius, jane                                   |
| one-piece / overalls / rompers   | opal, onyx, otis                                                           |
| leggings                         | lily, lumina, lumira                                                       |
| waistcoat · costume              | wahid · gozer                                                              |

Two caveats on the overlap:

- **Dresses are thinner than ours**, not richer: one tagged `dresses` (sasha) plus sophie's slip
  dress, against our parameterised dress with four skirt silhouettes.
- **There is no sub-piece composition layer.** Our `style.collar`/`cuff`/`waistband`
  (`lib/draft/subpieces.ts`) compose onto any archetype; freesewing bakes collars per design
  (`frontCollar` appears in 10 files). **Teagan drafts no collar band at all** — it emits a
  `neckOpeningLength` flag telling the user how long to cut the knit binding. That is the one
  piece where our drafter is unambiguously good (table above: -0.08 cm at M).

## Codeberg migration: low risk, thin bus factor

- **npm continuity is proven, not assumed.** `@freesewing/core` published `4.0.0` on
  **2025-04-01**; GitHub was archived **2025-04-02**; **21 further releases** shipped through
  `4.10.1` on **2026-08-16**. 299 versions total since 2019-04-29. No publishing gap.
- **Codeberg is live.** Last commit to `develop` **2026-08-31**; 41 open issues with the tracker
  enabled; 182 forks. The 169 GitHub issues are frozen on the archived repo.
- ⚠️ **Bus factor.** Two npm maintainers (`joostdecock`, `eriese`). Of the last 50 commits,
  **29 (58%) are from one person**; 6 distinct committers total over ~3 months.
- ⚠️ `package.json`'s `repository` is `"codeberg:freesewing/freesewing"` — not a resolvable URL,
  so `npm repo` and provenance tooling break on it.
- ⚠️ **Two undeclared dependencies**, both of which break a clean install at import time:
  `core-plugins` imports `@freesewing/plugin-transform`, and `plugin-annotations` imports
  `@freesewing/config`, neither declared. `npm i @freesewing/core @freesewing/teagan` throws
  `ERR_MODULE_NOT_FOUND` until both are added by hand.

## Integration mechanics (measured, not in #266's criteria)

- **Bundles cleanly** with this repo's own esbuild 0.21.5 — the JSON import attributes
  (`with { type: 'json' }`) and `.mjs`-source-only publishing are handled. Minified: `core`
  172.2 kb; `core`+`teagan` 226.1 kb; `core` + 6 designs spanning our five archetypes 351.2 kb.
  Server-side only (drafting runs in the route handler), so no client-bundle impact.
- **Fast**: 6.6 ms per full Teagan pattern draft (80 drafts, warm), despite the 50-iteration
  sleevecap loop. Comfortably inside the generate route's transaction budget.

## Method

Reproduce by installing
`@freesewing/{core,teagan,brian,models,i18n,collection,plugin-annotations,plugin-transform,config}@4.10.1`
in a scratch project, then:

1. Build a freesewing measurement set per benchmark size: our `SIZE_TABLE_MALE` supplies
   `chest`/`waist`/`hips`/`waistToHips`/`hpsToWaistBack`/`shoulderToShoulder` (×10 for mm,
   `shoulder` doubled); the other 7 + `highBust` are linearly interpolated from
   `@freesewing/models`' `cisMaleAdult` at the same chest girth. **That interpolation is the
   finding, not a workaround** — it is exactly the data our charts do not carry.
2. `new Teagan({ measurements, options: { sleeveLength } })` with `sleeveLength` set so the
   sleeve matches the benchmark's own `shortSleeveLength`; everything else at published defaults.
   `pattern.draft()`.
3. Take each part's `paths.seam` (the net sewing line, matching our `outlineCm`; `paths.sa` is
   the allowance). Walk its ops into typed segments, sampling each `curve` at 256 points.
4. Mirror `teagan.front`/`teagan.back` about **x = 0** (their fold) into whole pieces, dropping
   the fold edge — what an adapter to `DraftedPiece` must do anyway. The sleeve is already whole.
5. Score with the same six definitions as `lib/draft/tshirtBenchmark.test.ts`'s `measurePiece`:
   summed segment length, shoelace area on the flattened polygon, the curve/straight split, and
   the bounding box.

**Two of the six metrics are not comparable across engines.** `rectilinearPerimeterCm` /
`curvePerimeterCm` depend on how each engine chooses to represent an edge, not on the garment:
freesewing draws Teagan's near-straight side seam as a `curve` op, so its back reads 177.91 cm
"curved" against the benchmark's 84.35. `widthCm`/`heightCm` are orientation-dependent and the
three sources disagree on orientation (`comparison-report.md` already notes it for the collar
band; freesewing's sleeve is drawn 90° from ours). Only `perimeterCm` and `areaCm2` are both
orientation- and representation-invariant.

The spike scripts were deliberately not committed — they pin a dependency this repo does not
have, and `docs/reference/` is covered by both prettier and eslint.
