# T-Shirt Fit Calibration Specification

## Problem Statement

MoldAI's `tshirt` drafting archetype (`lib/draft/body.ts` + `sleeve.ts` + `subpieces.ts` +
`garment.ts`, `knit: true`) has never been checked against a real, commercially-drafted
reference pattern for the same garment. `docs/reference/tshirt-benchmark/` now holds one — real
per-piece perimeter, area, bounding width/height, and curve-vs-straight length data for a
graded four-size (P/M/G/GG) men's crew-neck tee. A lightweight review against this reference
(see Research below) already surfaced several concrete, well-evidenced gaps between what this
app drafts today and how a real tee is actually built — this feature closes the ones that are
cheap to fix with a cited, defensible change, and documents the rest as scoped-out.

## Research (lightweight codebase scan — already done, not a Design-phase task)

Reading `lib/draft/body.ts`, `sleeve.ts`, `subpieces.ts`, `garment.ts`, `ease.ts`,
`measurements.ts` against `docs/reference/tshirt-benchmark/measurements.json` found:

1. **Garment length reuses the blouse (hip-length) formula.** `garment.ts:306-309` computes
   `lengthCm = backLength + hipHeight + 5` for `tshirt` identically to `blouse`/`dress`. Fed
   `SIZE_TABLE_MALE.M` (backLength 44, hipHeight 21.6), that's 70.6cm total, vs. a piece bbox
   height a tee this size should plausibly have (the benchmark's own `heightCm` is 58.007 for
   both front and back at size M) — a men's basic tee is not typically drafted to full hip
   length. No tshirt-specific length constant exists at all today.
2. **Knit ease only ever shrinks or zeroes the finished garment (`lib/draft/ease.ts:74-76`):**
   `wearingEaseCm` for a knit returns `0 - bust * STRETCH_EASE_PCT[stretch]/100` — i.e. `0` at
   the default `stretch: "none"`, negative (tighter) for any stretchier class, **never
   positive**. That models a close-fitting rib/jersey garment. A basic tee is knit AND
   deliberately loose/boxy (not clingy) — the benchmark's own front/back bounding widths
   (75.92cm / 79.99cm at size M) are far wider than `bust/4 * 2` at any plausible chest for a
   "M" tee would be under a zero-or-negative-ease model, which points at a real, structural
   gap: **this drafter has no way to give a knit garment positive ease at all**, not just a
   wrong default.
3. **Front and back panels are geometrically width-identical by construction** — both use the
   same `halfChest`/`hemHalf`/`shoulderHalf` (`body.ts`'s `bodice()`, called once per panel with
   only `frontish` differing, which only changes the neckline). The benchmark's back panel is
   ~4cm wider than its front at size M (79.994 vs 75.920) — a real, deliberate ease-distribution
   choice this engine has no field to express (front and back would need independently
   resolvable half-widths).
4. **`tshirt`'s default style never sets `collar`** (`garment.ts`'s tshirt-specific style block,
   lines ~314-322, defaults `neckline`/`darts`/`sleeve` but not `collar`) — `collar` stays
   `undefined` → resolves to `"none"` (`garment.ts:186-188`). A default AI-drafted tee today has
   a bare round neckline with no rib collar band at all, while every real basic tee (and the
   benchmark's own collar-band piece, present in every graded size) has one.
5. **Band collar height is a flat 4cm** (`subpieces.ts`'s `BAND_COLLAR_HEIGHT_CM`). The
   benchmark's collar band is a flat 5cm-wide (`widthCm`, constant across all four sizes —
   collar band width doesn't grade with size, consistent with how rib collars are actually cut)
   straight strip (`rectilinearPerimeterCm === perimeterCm`, `curvePerimeterCm === 0` for every
   size) — structurally the same shape `draftBandCollar` already produces, just 1cm short.
6. **The sleeve cap curve length is well corroborated.** `docs/reference/tshirt-benchmark/
segment-measurements.md`'s independently-read cap-curve figure (55.93cm) lines up almost
   exactly with `measurements.json`'s `curvePerimeterCm` for the sleeve at size M (55.932cm) —
   two independent reads of the same source agreeing to 0.002cm. This is the single most
   trustworthy cross-checked number in the whole reference and the right anchor for tuning
   `CAP_EASE_CM`/bicep proportion in `sleeve.ts`, once a body-measurement basis exists to draft
   against (see Assumptions).

## Goals

- [ ] Give the `tshirt` archetype a dedicated, cited length formula, replacing the reused
      blouse hip-length one.
- [ ] Give a knit garment a way to carry **positive** wearing ease (not just zero/negative),
      cited from a real convention for a relaxed/regular-fit tee, and make `tshirt`'s default
      style request it.
- [ ] Default `tshirt`'s style to a rib `collar: "band"` instead of `"none"`, since a collarless
      crew neck is not how any real basic tee is constructed.
- [ ] Correct `BAND_COLLAR_HEIGHT_CM` from 4cm to 5cm against the benchmark's directly-
      comparable, grade-invariant collar-band width.
- [ ] Build a checked-in, re-runnable comparison that drafts the `tshirt` archetype across
      P/M/G/GG against a documented, derived body-measurement basis and reports each piece's
      (front/back/sleeve/collar) perimeter, area, bounding width/height, and curve-vs-straight
      split against `docs/reference/tshirt-benchmark/measurements.json` — **no pass/fail
      numeric gate** (explicit user decision, see Assumptions): the deliverable is the tuned
      drafter plus this report, not a threshold.

## Out of Scope

| Item                                                              | Reason                                                                                                                                                                        |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independently-resolvable front vs. back panel width               | Real gap (#3 above), but needs a new `Measurements`/`GarmentStyle` field, prompt/schema wiring, and clamping — a second feature, not a calibration pass on existing formulas. |
| Reinforcement tape at the shoulder seam                           | A construction/interfacing detail with no geometry of its own to draft — no `InternalCm`/`Piece` field models a tape application today.                                       |
| Modeling the specific 2cm/2-needle coverstitch hem construction   | This app's hem is currently an outline edge with a `seamAllowanceCm`, not a stitch-width/needle-count detail; out of scope for a drafting-formula calibration.                |
| Vertex/Bézier-exact geometry matching                             | Only aggregate numeric measurements are available in the benchmark — not raw outline coordinates (see reference README).                                                      |
| A numeric pass/fail acceptance bar on the comparison report       | Explicit user decision (see Assumptions) — report deltas, don't gate on them.                                                                                                 |
| Retuning any non-`tshirt` archetype (blouse/dress/skirt/trousers) | This benchmark is a tee; changes here must not perturb the cited formulas those archetypes already rely on (see AC TSHIRT-08).                                                |

---

## Assumptions & Open Questions

| Assumption / decision                                                         | Chosen default                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Confirmed?                              |
| ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Body-measurement basis for comparison                                         | **Back-derive an approximate body-measurement chart from the benchmark's own piece geometry**, rather than using the existing `SIZE_TABLE_MALE` system chart as-is.                                                                                                                                                                                                                                                                                                                    | User's explicit choice. Nothing in the benchmark states the original drafter's assumed input body measurements — only the drafted output geometry. Plugging `SIZE_TABLE_MALE.M` in directly showed gaps of 25-30cm on panel widths alone (Research #2), which is not a plausible pure-formula error — it's dominated by an input mismatch this drafter's zero/negative-only knit ease model can't close. Back-deriving keeps the comparison honest about which numbers are real (the benchmark's own) vs. assumed (the ease/proportion convention used to invert them). | y                                       |
| Pass/fail bar                                                                 | **No fixed numeric gate** — get as close as practical to the benchmark with cited, defensible formula changes; report every remaining delta rather than pass/failing against a threshold.                                                                                                                                                                                                                                                                                              | User's explicit choice, given the same input-basis uncertainty above: a numeric gate would be judging the derivation method's own assumed ease/proportion constants as much as the drafter's formulas.                                                                                                                                                                                                                                                                                                                                                                  | y                                       |
| Derivation method for the back-derived body chart                             | Documented as pure, cited, testable functions (not ad-hoc arithmetic) in the comparison tool itself (see TSHIRT-05) — e.g. assumed chest ease convention for a relaxed-fit men's tee, cited from a real source the same way `sleeve.ts`'s `ikatbag.com`/Aldrich citations already are. Any figure with no citable source is flagged as a labelled estimate, not asserted as fact — the same discipline `.specs/STATE.md`'s AD-001 already established for `EXTENDED_MEASUREMENT_KEYS`. | Keeps this feature honest to the existing "cite a real source or flag as an estimate" bar already enforced on every other drafting constant in this codebase (see body.ts/sleeve.ts citation comments; AD-001).                                                                                                                                                                                                                                                                                                                                                         | y (agent default; not separately asked) |
| Positive knit ease — new field or new default?                                | Add a `stretch` value or a dedicated tee-ease constant that the `tshirt` default style requests explicitly (via `style.stretch`/a new constant), rather than changing `wearingEaseCm`'s formula for every knit garment.                                                                                                                                                                                                                                                                | `wearingEaseCm` is shared by every knit archetype; a fitted knit dress or a close-fitting knit blouse legitimately wants zero/negative ease under the current model, and that must not regress. Only `tshirt`'s own default style selection changes.                                                                                                                                                                                                                                                                                                                    | y (agent default; not separately asked) |
| `BAND_COLLAR_HEIGHT_CM` 4→5cm                                                 | Apply directly                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | This is the one figure in the whole reference comparable independent of any body-measurement assumption — it's a flat authored constant on both sides (ours and the benchmark's), not derived from bust/waist/etc.                                                                                                                                                                                                                                                                                                                                                      | y (agent default; not separately asked) |
| Which of the six Research findings get a formula change vs. stay Out of Scope | Findings #1, #2 (tshirt-only), #4, #5 get formula changes (Goals above); #3 (front/back width parity) is Out of Scope (needs a new field, second feature); #6 (sleeve cap) is corroboration for tuning within #2's ease work, not a separate change.                                                                                                                                                                                                                                   | Keeps this feature to "tune existing formulas with a cited reason," per the framing already agreed with the user before Specify — not "build every capability the benchmark's construction implies."                                                                                                                                                                                                                                                                                                                                                                    | y (agent default; not separately asked) |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Tuned t-shirt drafter, calibrated against a real reference ⭐ MVP

**User Story**: As a MoldAI engineer, I want the `tshirt` archetype's length, ease, and collar
defaults calibrated against a real commercial pattern so that a user who asks the AI for a
basic tee gets a garment shape consistent with how tees are actually cut, not a hip-length
blouse silhouette with no collar.

**Why P1**: This is the whole feature — the four formula changes plus the comparison tooling
that grounds them are one vertical slice; there is no smaller independently-shippable piece
that isn't just one of these four changes in isolation (and each is too small to be its own
demoable story).

**Acceptance Criteria**:

1. WHEN `draftGarment` is called with `spec.type === "tshirt"` THEN the system SHALL compute
   `garmentLengthCm` from a dedicated t-shirt length constant (`TSHIRT_HEM_DROP_CM` or
   equivalent, cited in-code) added to `backLength`, NOT `backLength + hipHeight + 5`.
   <!-- event-driven -->
2. WHEN `draftGarment` is called with `spec.type === "tshirt"` and the caller's style does not
   set `stretch` THEN the system SHALL apply a positive default ease convention for a
   relaxed/regular-fit knit tee (cited in-code), distinct from the existing
   zero/negative-only `wearingEaseCm` knit model used by every other knit archetype.
   <!-- event-driven -->
3. WHEN `draftGarment` is called with `spec.type === "tshirt"` and the caller's style does not
   set `collar` THEN the system SHALL default it to `"band"`. <!-- event-driven -->
4. The system SHALL draft `subpieces.ts`'s band collar at `BAND_COLLAR_HEIGHT_CM = 5` (was 4).
   <!-- ubiquitous -->
5. IF a caller's style explicitly sets `stretch` or `collar` for a `tshirt` spec THEN the
   system SHALL use the caller's value, not the new default. <!-- unwanted-behavior /
   explicit-override precedence -->
6. The system SHALL provide a re-runnable comparison (a vitest test or script under
   `lib/draft/`) that drafts a `tshirt` at P/M/G/GG sizes from a documented, cited
   body-measurement basis and reports, per piece (front/back/sleeve/collar-band) and per size,
   the delta between the drafted `perimeterCm`/`areaCm2`/bounding `widthCm`/`heightCm`/
   `rectilinearPerimeterCm`/`curvePerimeterCm` figures and
   `docs/reference/tshirt-benchmark/measurements.json`'s corresponding entries.
   <!-- ubiquitous -->
7. WHILE the comparison in AC6 runs THEN the system SHALL emit its report as a checked-in
   artifact (e.g. `docs/reference/tshirt-benchmark/comparison-report.md`), not console-only
   output, so the deltas are reviewable without re-running anything. <!-- state-driven -->
8. The system SHALL NOT change any formula, constant, or default for `blouse`, `dress`,
   `skirt`, or `trousers` — every existing test for those archetypes SHALL continue to pass
   unmodified. <!-- ubiquitous -->
9. IF the derivation method in AC6 needs a value with no citable real-world source THEN the
   system SHALL label it in-code as an estimate (a comment naming it as such), never assert it
   as a verified fact. <!-- unwanted-behavior -->

**Independent Test**: Draft a `tshirt`/male/M-equivalent garment via `draftGarment` before and
after this feature's changes; confirm `garmentLengthCm`, the front/back panel's drafted width,
and the collar piece's presence/height all change as ACs 1-4 specify, and that
`docs/reference/tshirt-benchmark/comparison-report.md` exists and lists all 4 sizes × 4 pieces
× 6 metrics with a delta figure for each.

---

## Edge Cases

- IF a `tshirt` spec sets `style.sleeve = "long"` THEN the system SHALL still apply the new
  length/ease/collar defaults — none of them are sleeve-length-conditional.
- IF a chart supplies `bicep`/`neckGirth`/etc. (the existing `EXTENDED_MEASUREMENT_KEYS`) THEN
  the new tshirt-specific defaults SHALL compose with them exactly as they already do for every
  other archetype (no special-casing).
- WHEN the comparison report (AC6/AC7) is regenerated after a further formula change THEN the
  system SHALL overwrite the existing report file rather than appending, so it never shows two
  contradictory delta sets for the same constants.

---

## Requirement Traceability

| Requirement ID | Story                     | Phase  | Status       |
| -------------- | ------------------------- | ------ | ------------ |
| TSHIRT-01      | P1: Tuned t-shirt drafter | Tasks  | Implementing |
| TSHIRT-02      | P1: Tuned t-shirt drafter | Tasks  | Implementing |
| TSHIRT-03      | P1: Tuned t-shirt drafter | Tasks  | Implementing |
| TSHIRT-04      | P1: Tuned t-shirt drafter | Tasks  | Implementing |
| TSHIRT-05      | P1: Tuned t-shirt drafter | Tasks  | Implementing |
| TSHIRT-06      | P1: Tuned t-shirt drafter | Design | Pending      |
| TSHIRT-07      | P1: Tuned t-shirt drafter | Design | Pending      |
| TSHIRT-08      | P1: Tuned t-shirt drafter | Design | Pending      |
| TSHIRT-09      | P1: Tuned t-shirt drafter | Design | Pending      |

**ID format:** `TSHIRT-NN`, matching AC numbers 1-9 above 1:1.

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 9 total, 0 mapped to tasks, 9 unmapped ⚠️ (Design/Tasks phase not yet run)

---

## Success Criteria

- [ ] `garmentLengthCm` for a `tshirt` no longer equals the blouse hip-length formula's output.
- [ ] A default (no explicit `stretch`) `tshirt` draft carries measurably more finished-garment
      ease than today's zero-ease default.
- [ ] A default (no explicit `collar`) `tshirt` draft includes a rib collar-band piece.
- [ ] `BAND_COLLAR_HEIGHT_CM` reads 5, and every existing test asserting the old 4cm value is
      updated to match (a deliberate, cited constant change, not a silent regression).
- [ ] `docs/reference/tshirt-benchmark/comparison-report.md` exists, covers all 4 sizes × 4
      pieces × 6 metrics, and is regenerable by a documented command.
- [ ] Every pre-existing `blouse`/`dress`/`skirt`/`trousers` test still passes unmodified.
