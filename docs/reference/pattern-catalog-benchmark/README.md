# Pattern catalog benchmark

Anonymized numeric reference data extracted from a commercial sewing-pattern catalog the
repo owner has usage rights to (282 distinct garments/products). Same purpose as
[`docs/reference/tshirt-benchmark/`](../tshirt-benchmark/README.md) — real-world ground truth
for calibrating this app's drafting formulas (`lib/draft/*`) — scaled up from that single
hand-picked t-shirt to the whole catalog.

## What this is

For each source product, one JSON file in `entries/<sourceId>.json` holding:

- a short, generic English description and category (never the original product name/title)
- the garment's best-guess mapping onto this repo's five drafted archetypes
  (`"blouse" | "dress" | "skirt" | "tshirt" | "trousers"`, from `lib/draft/garment.ts`), or
  `null` when it doesn't genuinely match one (a jacket, a romper, swimwear, etc.)
- per piece: an English structural name (translated confidently, or kept as the original
  abbreviation with `originalLabelUnclear: true` when the translation would be a guess), `qty`,
  and a list of edge measurements in cm, each tagged with its **position in the drawing**
  (e.g. "top edge", "left edge, upper segment") rather than a guessed anatomical name
- `baseSizeLabel` and, where stated on the source sheet, a `gradeNote` describing the average
  cm variation between graded sizes

`index.json` groups all 282 entries by category (see below) with a one-line pointer into
`entries/`.

## What this is NOT

- **Not the original pattern files.** No CAD geometry (`.ads`/`.adsx`/`.amkx`), no plotter
  output (`.plt`), no photos, no full technical sheets, no vertex/Bézier curve data — only the
  cm numbers a human would read off a dimensioned line drawing, transcribed by hand (visually,
  page by page — these source PDFs carry no extractable text layer, the same situation
  `tshirt-benchmark/segment-measurements.md` documents).
- **Not attributed.** No brand name, no store name, no product reference code, no original
  product title appears anywhere in this directory — see Anonymization below.
- **Not exact machine-extracted data**, unlike `tshirt-benchmark/measurements.json`. Every
  number here was read visually off a rendered PDF page, one product at a time, by several
  extraction passes. Treat it the way `tshirt-benchmark/segment-measurements.md` treats its own
  numbers: probably right, worth a second look before it drives a formula change. A number the
  extraction pass genuinely couldn't read is `null` with an explanatory note in that entry's
  `"notes"` field — never a filled-in guess.

## Anonymization

Every entry was written under three hard rules, checked mechanically across the whole
directory (`grep` for the source brand name and every reference-code pattern, zero matches):

1. No brand name, store name, or verbatim original product title.
2. No reference/SKU code from the source catalog (only an arbitrary sequence number,
   `sourceId`, is kept — enough to avoid filename collisions, not to identify the source
   listing).
3. No image, photo, CAD file, or plotter file — numbers and short generic English text only.

## Categories (`index.json`)

| Group                         | Count | Maps to                                                                                                                                       |
| ----------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `knitwear-tops`               | 49    | `moldaiArchetype: "tshirt"`                                                                                                                   |
| `wovens-shirts`               | 36    | `moldaiArchetype: "blouse"`                                                                                                                   |
| `bottoms`                     | 74    | `moldaiArchetype: "trousers"` (plus some cargo/pleated/multi-panel bottoms too complex for today's straight-leg block, archetype left `null`) |
| `dresses`                     | 19    | `moldaiArchetype: "dress"`                                                                                                                    |
| `skirts`                      | 7     | `moldaiArchetype: "skirt"`                                                                                                                    |
| `outerwear`                   | 39    | jackets, coats, hoodies, sweatshirts, blazers, cardigans, uniforms — no current archetype                                                     |
| `bodysuits-rompers-jumpsuits` | 17    | bodysuits, rompers, jumpsuits, overalls, coveralls, onesies — no current archetype                                                            |
| `babywear`                    | 2     | other baby garments not covered above                                                                                                         |
| `sleepwear`                   | 6     | pajamas, nightgowns, sleep camisoles — no current archetype                                                                                   |
| `swimwear`                    | 8     | bikinis, swimsuits, swim briefs/trunks — no current archetype                                                                                 |
| `tops-other`                  | 11    | tanks, corselets/bustiers, bandeau tops not matching the blouse/tshirt block — no current archetype                                           |
| `pet-items`                   | 4     | pet coats — not apparel for a human body                                                                                                      |
| `non-apparel`                 | 10    | a bag, a pouch, a cushion cover, a towel, aprons — not garments at all                                                                        |

The first five groups (185 entries) are the ones directly usable the way
`tshirt-benchmark` is used today — real per-piece cm data for a garment this app already
drafts. The rest is kept because it was in scope of the extraction, but calibrating against it
would mean drafting a new archetype first.

## Confidence

Lower than `tshirt-benchmark/measurements.json`, comparable to
`tshirt-benchmark/segment-measurements.md` — both come from the same situation (a vector-drawn
dimensioned PDF with no text layer, read visually). Every entry that has an illegible or
ambiguous value records it as `null` with a note rather than a filled-in guess; every entry
with a piece label the extraction pass wasn't confident translating keeps the original
abbreviation with `originalLabelUnclear: true`. A handful of source sheets had no legible cm
dimensions at all and were skipped entirely rather than producing an empty or fabricated entry
(e.g. sourceIds 140, 347, 348, 349 — check each skipped id's extraction pass for the specific
reason, not restated here since it varies per sheet).
