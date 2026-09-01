# Size-M segment measurements

**Confidence: lower than `measurements.json`.** These numbers were read off a rendered
drawing with no extractable text layer (every label is a vector-drawn glyph, not real text),
and no higher-resolution rendering was available in this environment. Treat every value below
as "probably right, worth a second look before it drives a formula," **not** as settled as the
`measurements.json` figures (those came from an exact machine-readable export). The one value
flagged below is very likely a misread and should be confirmed before use.

Source caption (paraphrased): average ~1cm variation between grade sizes; measurements
correspond to the pattern's printed output.

All values cm, size M only.

## Back panel (×1)

- Right edge (full piece height, hem to shoulder): **58.01**
- Top edge and bottom edge, horizontal span: **49.09** each (drawn as two separate dimension
  lines, top and bottom of the piece — position in the drawing, not independently confirmed
  which is neck-adjacent vs. hem)
- Shoulder/upper curve segment, from the top corner going down: **29.11**
- Next segment down (armhole, upper): **13.67**
- Next segment down (armhole, mid — the deepest labeled sub-segment): **26.14**
- Mirrored lower armhole segment: **13.67**
- Mirrored lower segment near the bottom corner: **29.11**
- A short vertical run at the piece's left edge, top to bottom, in four stacked call-outs:
  **4.39**, **23.96**, **23.96**, then a bottom value **transcribed as "2.2.2" — almost
  certainly a misread of a single number (e.g. "2.22" or "22.2"); do not use as-is.**
  The bracketed total for the two 23.96 segments is labeled **47.92** (= 23.96 × 2, consistent).
  This strip appears to document where the **collar-band piece's own length** relates to the
  back panel's neckline, not a second back-panel dimension.

## Front panel (×1)

- Right edge (full piece height): **58.01** (same as back — front and back cut to equal
  height, as expected for a basic tee)
- Top edge and bottom edge, horizontal span: **49.09** each (same as back — front and back
  panels are the same width top-to-bottom on this pattern)
- Shoulder/upper curve segment: **25.73**
- Next segment down: **13.68**
- Next segment down (deepest, likely the bust/chest-level armhole point): **31.68**
- Mirrored lower segment: **13.68**
- Mirrored segment near the bottom corner: **25.73**

## Sleeve (×2)

- Cap curve, left side, corner-to-corner: **55.93**
- Vertical centerline (cap height + hem): **43.59**
- Top corner pair: **11.89** and **2.59**
- Bottom corner pair (mirrored): **11.89** and **2.59**

## Cross-check against `measurements.json` (size M, exact)

| Piece  | `measurements.json` widthCm | heightCm | Matches this file's bounding read?                                                                                                                                                                                                                                                                                                                                                      |
| ------ | --------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| back   | 79.994                      | 58.007   | Height ✓ (58.01 ≈ 58.007). Width 79.994 is bbox width, not the 49.09 hem-line span — the panel is wider at some other point (or 49.09 is a half-width / one side of a fold).                                                                                                                                                                                                            |
| front  | 75.920                      | 58.007   | Height ✓. Same width-vs-hem-span note as back panel.                                                                                                                                                                                                                                                                                                                                    |
| sleeve | 27.062                      | 47.330   | Neither 55.93 nor 43.59 matches directly — 55.93 is close to the sleeve's own `curvePerimeterCm` (55.932) almost exactly (**55.93 vs 55.932, a strong match**), likely the flattened cap-curve arc length; 43.59 is close to but not `heightCm` (47.330) — possibly measured to a different reference line (e.g. before hem allowance, or cap apex to hem exclusive of the last curve). |

**Takeaway:** `measurements.json`'s `curvePerimeterCm`/`rectilinearPerimeterCm` split is the most
exact and best-corroborated ground truth (the sleeve cap curve length lines up with this file's
independently-read value almost exactly). Anchor formula changes to `measurements.json`'s
per-size `perimeterCm`/`areaCm2`/`widthCm`/`heightCm`/`rectilinearPerimeterCm`/`curvePerimeterCm`
across all four graded sizes; use this file only to sanity-check which edge a discrepancy
likely lives on, and re-verify the flagged "2.2.2" value (and ideally the whole table) before
treating it as authoritative.
