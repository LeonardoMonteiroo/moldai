# Bust-Apex Dart Shaping Specification

## Problem Statement

`lib/draft/body.ts`'s fitted front dart is a straight vertical wedge, offset from center front by a fixed proportion of the waist half-width. It never points at the wearer's actual bust apex and never widens for a real cup difference — two charts with the same bust circumference but different `highBust` (frame) values draft an identical dart. This is the single largest documented fit gap in the current drafting engine for a fitted bodice: fabric bags or pulls across the bust for anyone off the flat proportional assumption. This feature makes the front dart's angle and width respond to the wearer's real bust-apex geometry when that data is available, while leaving every pattern with no such data byte-identical to today.

## Goals

- [ ] A fitted front panel with a real, non-zero bust/high-bust delta drafts a dart whose axis points at a derived bust-apex position instead of running strictly vertical.
- [ ] That same dart's intake width grows monotonically with the bust/high-bust delta, on top of the waist suppression it already carries.
- [ ] Every chart with no real cup-delta data (including both system charts, which seed `highBust = bust`) drafts an unchanged, byte-identical dart.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature                                                                                                 | Reason                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Back-panel apex targeting                                                                               | No anatomical apex exists on the back; back dart construction stays exactly as today regardless of any new field's value.                                                                                                                                                   |
| Converting the dart to a side-seam/French dart (dart emanating from the armhole or side seam)           | Bigger structural change — new `seamEdges`, new notches, seam-graph (#134) updates. Explicitly deferred by the user to a possible future feature; this one only re-angles the existing internal/waist-ending dart shapes.                                                   |
| Shoulder-slope seeding or UX changes                                                                    | Investigated in this session and found to be a separate, already-deliberate decision (no better proportional default exists for a frame characteristic) — dropped from scope entirely, not part of this feature.                                                            |
| Independently tunable waist/hip ease (`ease.ts`'s `FIT_EASE_CM.waist`/`.hip` actually driving geometry) | Separate feature, to be specified after this one ships.                                                                                                                                                                                                                     |
| Sleeve-cap silhouette variety (kimono/dropped-shoulder/raglan)                                          | Separate feature, to be specified after this one ships.                                                                                                                                                                                                                     |
| A new `GarmentStyle`/AI-prompt-visible toggle for this behavior                                         | The rule is fully derived from measurements (mirrors how `highBust`-driven armhole depth already works silently) — no new decision surface for the AI or the user.                                                                                                          |
| Migrating already-persisted patterns                                                                    | Drafting is deterministic and redrafted on demand from a pattern's own frozen `sizeTable`; an old snapshot simply has no `highBust`/`bustSpan`/`bustPointHeight` and falls to the unchanged branch, the same `#132` precedent every other extended field already relies on. |

---

## Assumptions & Open Questions

| Assumption / decision                       | Chosen default                                                                                                                                                                                                                                                                                                                                     | Rationale                                                                                                                                                                                                                                                                                                                                                                | Confirmed? |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Trigger condition for the new dart behavior | `bustCupDeltaCm = bust - (highBust ?? bust)`; the new dart shape applies only `WHEN bustCupDeltaCm > 0`                                                                                                                                                                                                                                            | A gate on mere _presence_ of `highBust` would incorrectly change every default account's pattern, because both system charts already seed `highBust = bust` (delta 0, an honest "no assumption") as a deliberate no-op (`lib/sizeCharts/seed.ts`). Gating on the delta itself is the only reading consistent with "no visible change for a chart with no real cup info." | y          |
| New measurement fields                      | Add `bustPointHeight` and `bustSpan` as new `EXTENDED_MEASUREMENT_KEYS`, each optional, each with a fallback formula computed from existing core measurements                                                                                                                                                                                      | Follows the exact `#132` precedent (`neckGirth`, `highBust`, `shoulderSlope`, `backWidth`, `bicep`, `rise`) — an extended field the user can override once they know their real value, byte-identical fallback for every chart that doesn't.                                                                                                                             | y          |
| Dart topology                               | Re-angle/re-size the existing dart shape (internal fisheye for blouse/t-shirt, single-ended for the dress waist-join, single dart for the front-closure half-panel) rather than converting it to a side-seam-entry French dart                                                                                                                     | Chosen explicitly over the more structurally realistic alternative — smaller blast radius (no `seamEdges`/notch/seam-graph changes), lower risk, still resolves the real fit complaint.                                                                                                                                                                                  | y          |
| Sourcing for the new formulas               | The dart-width-from-delta formula and the `bustPointHeight`/`bustSpan` fallback formulas must be grounded in a real, cited pattern-drafting source (Design phase performs the lookup), matching the sourcing rigor every existing `body.ts`/`sleeve.ts` formula already carries (Aldrich, ikatbag.com, muellerundsohn.com, dresspatternmaking.com) | Consistency with the file's own established rule against fabricated formulas; keeps a future reviewer able to check the numbers the same way today's comments allow.                                                                                                                                                                                                     | y          |
| Negative/zero delta handling                | `bustCupDeltaCm` is clamped to a minimum of 0 before use (a `highBust` entered larger than `bust` never produces a negative-width or inverted dart)                                                                                                                                                                                                | Mirrors `classifyGirthFit`'s existing "no class below the tightest, negative ease is a real but bottomed-out value" pattern — never let an out-of-order pair of fields invert geometry.                                                                                                                                                                                  | y          |
| Existing-pattern migration                  | None needed                                                                                                                                                                                                                                                                                                                                        | Drafting redraws from the pattern's own frozen `sizeTable`; a snapshot predating this feature simply lacks the new fields and takes the unchanged branch — the established `#132` precedent.                                                                                                                                                                             | y          |

**Open questions:** none — all resolved or logged above.

---

## User Stories

### P1: Real bust-apex shaping for a chart with real cup data ⭐ MVP

**User Story**: As a user whose size chart carries a real `highBust` distinct from `bust` (a genuine cup/frame difference), I want the AI-drafted fitted bodice's dart to point at my real bust apex and widen accordingly, so the finished garment doesn't bag or pull across the bust the way today's flat vertical dart does.

**Why P1**: This is the concrete fit defect the whole feature exists to close — without it, nothing observable changes.

**Acceptance Criteria**:

1. WHEN a fitted (`style.darts` true, non-knit) front panel drafts from a resolved `Measurements` row where `bust - (highBust ?? bust) > 0` THEN the system SHALL orient that panel's dart axis toward a bust-apex point derived from `bustSpan/2` (horizontal offset from center front) and `bustPointHeight` (vertical offset from the waist), instead of the current fixed-vertical axis.
2. WHEN `bust - (highBust ?? bust) > 0` THEN the system SHALL increase the dart's intake width strictly monotonically as that delta increases, added on top of the existing waist-derived suppression width.
3. The system SHALL apply criteria 1 and 2 identically across every branch that drafts a front dart today: the blouse/t-shirt internal (fisheye) dart, the dress waist-join single-ended dart, and the front-closure (button-stand) half-panel's single dart.
4. The system SHALL leave the back panel's dart construction unaffected by `highBust`, `bustSpan`, or `bustPointHeight` in every case — no anatomical apex targeting applies to the back.
5. IF the computed apex position would place the dart's leg or apex outside the panel's own valid interior region (an extreme `bustSpan`/`bustPointHeight` combined with a small `backLength`/`waist`) THEN the system SHALL clamp the apex so the resulting dart polygon stays strictly inside the piece's own outline.
6. The system SHALL continue to derive the dart's fold line and drill-hole apex marks generically from the (now re-angled) dart polygon via the existing `dartInternals` function, with no per-shape special-casing.
7. The system SHALL NOT introduce any new `seamEdges`, additional notches, or seam-graph (`#134`)/assembly-order (`#138`) entries as a result of this feature — the dart stays fully internal (or single-ended at the dress waist-join), exactly as it is structured today.

**Independent Test**: Duplicate a system size chart, set `highBust` at least 4cm below `bust` on the base size (optionally set `bustPointHeight`/`bustSpan`), activate it, and generate a fitted blouse and a dress. Confirm both fronts' darts have a non-vertical axis, non-zero width delta relative to a `highBust === bust` control chart, both remain inside `garment.test.ts`'s containment checks, and the seam graph / assembly order for that garment are unchanged from a run with no dart-affecting fields set.

---

### P2: No behavior change for a chart with no real cup data

**User Story**: As a user on a system chart or any chart that hasn't recorded a real `highBust`, I want my patterns to keep drafting exactly as they do today, so this feature never silently changes an existing pattern's fit.

**Why P2**: Regression safety is what makes P1 shippable without re-litigating every existing pattern's geometry — bundled as P1's own criterion 8 below rather than a separate flag, since it's the same code path's else-branch.

**Acceptance Criteria**:

1. IF `bust - (highBust ?? bust) <= 0` (field absent, or `highBust` equal to or greater than `bust` — the case for both system charts, which seed `highBust = bust`) THEN the system SHALL draft the front dart(s) with position, width, and apex points identical to today's output.
2. The system SHALL clamp `bustCupDeltaCm` to a minimum of 0 before it can influence any geometry, so a `highBust` entered larger than `bust` never produces an inverted or negative-width dart.

**Independent Test**: Run `garment.test.ts`'s existing fixtures (none of which set `highBust` below `bust`) unmodified after the change and confirm every existing snapshot/assertion still passes bit-for-bit.

---

### P3: The new measurements are visible and editable like every other extended field

**User Story**: As a user who knows their real bust-apex measurements, I want to see and edit `bustPointHeight`/`bustSpan` in the size-chart table with a measurement guide, and have the AI able to set them via chat, the same as every other extended field.

**Why P3**: Without a way to actually input real data, P1 can only ever exercise its fallback formulas — but the size-chart table (`SizeChartTable`) and the AI's `measurementOverrides` schema already render/accept any key found in `MEASUREMENT_KEYS`/`MEASUREMENT_RANGES` generically, so this story is mostly catalog text plus the two constants, not new UI code.

**Acceptance Criteria**:

1. WHEN `bustPointHeight` and `bustSpan` are added to `EXTENDED_MEASUREMENT_KEYS` and `MEASUREMENT_RANGES` THEN `SizeChartTable` SHALL render both as editable columns/rows with no component change, purely from the existing generic `MEASUREMENT_KEYS` iteration.
2. The system SHALL add `SizeCharts.measurement.bustPointHeight`/`.bustSpan` (short labels) and `SizeCharts.measurementGuide.bustPointHeight`/`.bustSpan` (how-to-measure instructions) to `messages/pt-BR.json`, written per the vendored `humanizer` skill's tone rules.
3. WHEN the AI sets `bustPointHeight`/`bustSpan` via a chat `measurementOverrides` payload THEN the system SHALL clamp them to `MEASUREMENT_RANGES` through the existing `resolveMeasurements` path, requiring no change to `lib/ai/schema.ts` beyond the constant addition it already derives its shape from.

**Independent Test**: Add the two keys to the underlying constants only; without touching `SizeChartTable.tsx` or `schema.ts`, confirm (a) the size-chart screen renders two new rows once the catalog keys exist, and (b) a hand-built `measurementOverrides` payload carrying `bustSpan` clamps correctly through `resolveMeasurements`.

---

## Edge Cases

- IF `highBust` is present and exactly equal to `bust` (both system charts today) THEN the system SHALL behave exactly as P2 describes — zero delta is not a special "activate at zero width" case.
- IF only one of `bustPointHeight`/`bustSpan` is set on a chart (the other absent) THEN the system SHALL use the real value for the one that's set and the documented fallback formula for the other — they resolve independently, per the existing extended-field convention.
- IF a chart's `bustCupDeltaCm > 0` but the panel is not `fitted` (e.g. a t-shirt/knit front, `style.darts` false or `opts.knit` true) THEN no dart exists to re-angle at all — the feature has no effect, since there's nothing to shape.
- WHEN `bustSpan`/`bustPointHeight` sit at their `MEASUREMENT_RANGES` boundary values combined with a small-size chart's `waist`/`backLength` THEN the apex-clamping in P1 criterion 5 SHALL still produce a valid, contained dart rather than a degenerate or self-intersecting one.

---

## Requirement Traceability

| Requirement ID | Story | Phase  | Status       |
| -------------- | ----- | ------ | ------------ |
| BDART-01       | P1    | Tasks  | Implementing |
| BDART-02       | P1    | Tasks  | Implementing |
| BDART-03       | P1    | Tasks  | Implementing |
| BDART-04       | P1    | Tasks  | Implementing |
| BDART-05       | P1    | Tasks  | Implementing |
| BDART-06       | P1    | Tasks  | Implementing |
| BDART-07       | P1    | Design | Pending      |
| BDART-08       | P2    | Tasks  | Implementing |
| BDART-09       | P2    | Design | Pending      |
| BDART-10       | P3    | Tasks  | Implementing |
| BDART-11       | P3    | Tasks  | Implementing |
| BDART-12       | P3    | Design | Pending      |

**ID format:** `BDART-NN`

**Status values:** Pending → In Design → In Tasks → Implementing → Verified

**Coverage:** 12 total, 0 mapped to tasks, 12 unmapped ⚠️ (expected at end of Specify — Tasks phase maps these)

---

## Success Criteria

- [ ] A size chart with a real `highBust` < `bust` drafts a visibly re-angled, wider front dart than an identical chart with `highBust === bust`, verified in a new `garment.test.ts` case.
- [ ] Every existing `garment.test.ts`/`body.test.ts` fixture (none of which sets a real cup delta) passes unmodified — zero regression in default drafting output.
- [ ] `garment.test.ts`'s dart/decoration containment matrix passes for the new cases, including boundary `bustSpan`/`bustPointHeight` values.
- [ ] The seam graph and assembly order are provably unchanged by this feature (same test coverage as today, no new entries).
