# T-shirt benchmark data

Ground truth used to calibrate this app's `tshirt` drafting archetype (`lib/draft/body.ts` +
`sleeve.ts` + `subpieces.ts`, `knit: true`) against how a basic men's crew-neck tee is really
constructed: round neck, no darts, short set-in sleeve, ribbed collar band.

**What this is:** real-world numeric measurements for a graded four-size (P/M/G/GG) crew-neck
tee — per-piece perimeter, area, bounding width/height, and curve-vs-straight length split for
the back panel, front panel, sleeve, and collar band, at every graded size.

**What this is NOT:** exact vertex/Bézier geometry. Only aggregate numeric measurements are
available here — not raw outline coordinates — so "matches the benchmark" has to be judged
against these numbers within a stated tolerance (or, per this feature's scope, reported as a
delta with no fixed pass/fail bar), never pixel/vertex equality.

## Files

- `measurements.json` — per piece (`back` ×1, `front` ×1, `sleeve` ×2, `collarBand` ×1) and per
  graded size (`P`/`M`/`G`/`GG`, base size `M`, average grade step ≈1cm across the garment):
  `perimeterCm`, `areaCm2`, `rectilinearPerimeterCm` / `curvePerimeterCm` (straight vs. curved
  portion of the perimeter), `widthCm` / `heightCm` (bounding box).
- `segment-measurements.md` — individual segment lengths (shoulder, armhole sub-segments, side
  seam, hem, sleeve cap/underarm) walked around each piece's outline, size M only, lower
  confidence than `measurements.json` (see the file's own note) — useful for guessing which
  _edge_ a discrepancy lives on, since the aggregate data only gives per-piece totals.
- `construction-notes.md` — garment description, fabric specs (body knit vs. rib collar
  fabric), hem/collar construction notes, and the grade ratio.

## Confidence

`measurements.json`'s figures come from an exact machine-readable export and are the primary,
high-confidence ground truth. `segment-measurements.md`'s figures were read off a rendered
drawing with no extractable text layer and are lower confidence — one value there is flagged as
a likely misread and should be treated as unverified until double-checked.

**Contested figure — do not calibrate a formula against `back`/`front` `widthCm` at size M.**
`measurements.json`'s exported `widthCm` (79.994 back / 75.920 front) is a **bounding-box**
width, not a garment-construction dimension — `segment-measurements.md`'s independent read of
the same panel's top/bottom edge span gives 49.09 cm, and its own note already flags the
mismatch. #282 confirmed the reference "M" is really a ~100 cm-chest garment (this app's collar
band, sized from the measured neckline arc rather than from bust, lands within 0.08 cm of the
benchmark at M), not the ~156 cm the bbox `widthCm` implies — see `docs/decisions/drafting.md`'s
#282 note and `docs/reference/freesewing-spike/README.md`. `TSHIRT_BASE_EASE_CM` was originally
solved from this exact figure and had to be replaced for it. The raw export is left unedited
here (it is the exact machine-readable source), but treat `widthCm` at any size as unusable for
deriving an ease/chest formula — `perimeterCm`/`areaCm2` remain the comparable, non-orientation-
dependent metrics for that purpose.
