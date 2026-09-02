# T-Shirt Fit Calibration Validation

**Date**: 2026-09-01
**Spec**: `.specs/features/tshirt-fit-calibration/spec.md`
**Diff range**: `426c0de..HEAD` (7 commits: e5ddebe, 62412e7, 970dd27, b1295f9, 0f57e9d, 9e61ed2, dc3d862)
**Verifier**: independent sub-agent (author ≠ verifier)

---

## Task Completion

| Task | Status  | Notes                                                                                                                                                           |
| ---- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | ✅ Done | `TSHIRT_HEM_DROP_CM` added, length branch confirmed, test split confirmed                                                                                       |
| T2   | ✅ Done | `TSHIRT_BASE_EASE_CM` added; downstream fallout (`body.test.ts`, `easeReport.test.ts`, `Proof3DTab.test.tsx`, `lib/proof3d/mesh.test.ts`) all correctly updated |
| T3   | ✅ Done | `collar: spec.style.collar ?? "band"` confirmed; override test present                                                                                          |
| T4   | ✅ Done | `BAND_COLLAR_HEIGHT_CM = 5` confirmed; new guarding test present                                                                                                |
| T5   | ✅ Done | `lib/draft/tshirtBenchmark.test.ts` present, report regenerated and checked in                                                                                  |
| T6   | ✅ Done | Full-suite/build/lint gates independently re-run and confirmed below                                                                                            |

All 6 task headers in `tasks.md` are marked "✅ Complete"; independently re-run rather than assumed.

---

## Spec-Anchored Acceptance Criteria

| Criterion (WHEN X THEN Y)                                                                                                              | Spec-defined outcome                                                                         | `file:line` + assertion                                                                                                                                                                                                                                                                                                          | Result                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| TSHIRT-01: `tshirt` computes length from a dedicated constant, not `backLength+hipHeight+5`                                            | `garmentLengthCm = backLength + TSHIRT_HEM_DROP_CM` (18.5)                                   | `lib/draft/garment.ts:125` (`const TSHIRT_HEM_DROP_CM = 18.5`), `lib/draft/garment.ts:320-325` (3-way branch) — `lib/draft/garment.test.ts:615-626` `expect(garmentLengthCm).toBeCloseTo(SIZE_TABLE.M.backLength + 18.5, 5)` **and** `.not.toBeCloseTo(backLength+hipHeight+5, 5)`                                               | ✅ PASS                                                                 |
| TSHIRT-02: default (no `style.stretch`) knit tee gets positive ease, cited, distinct from other knit archetypes                        | `wearingEaseCm({}, true, bust) === TSHIRT_BASE_EASE_CM` (55.9)                               | `lib/draft/ease.ts:81` (constant + derivation/estimate comment), `lib/draft/ease.ts:94-98` (function) — `lib/draft/ease.test.ts:41-43` `expect(wearingEaseCm({}, true, 92)).toBe(TSHIRT_BASE_EASE_CM)`                                                                                                                           | ✅ PASS                                                                 |
| TSHIRT-03: default (no `style.collar`) tshirt defaults collar to `"band"`                                                              | A default-style tshirt draft includes a `"collar"` piece                                     | `lib/draft/garment.ts:339` (`collar: spec.style.collar ?? "band"`) — `lib/draft/garment.test.ts:275-293` `expect(ids).toEqual(["body-back","body-front","collar","sleeve"])`                                                                                                                                                     | ✅ PASS                                                                 |
| TSHIRT-04: band collar drafts at `BAND_COLLAR_HEIGHT_CM = 5` (was 4)                                                                   | Collar piece's y-extent is exactly 5cm                                                       | `lib/draft/subpieces.ts:326` (`const BAND_COLLAR_HEIGHT_CM = 5`) — `lib/draft/garment.test.ts:1631-1642` `expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(5, 5)`                                                                                                                                                           | ✅ PASS                                                                 |
| TSHIRT-05 (stretch half): explicit `style.stretch` overrides the new default base                                                      | Explicit `stretch:"high"` still reduces relative to the new base, not the old zero base      | `lib/draft/ease.ts:94-98` — `lib/draft/ease.test.ts:49-53` `expect(wearingEaseCm({stretch:"high"}, true, 100)).toBeCloseTo(TSHIRT_BASE_EASE_CM - 12, 5)`                                                                                                                                                                         | ✅ PASS                                                                 |
| TSHIRT-05 (collar half): explicit `style.collar` overrides the new `"band"` default                                                    | Explicit `collar:"none"` on a tshirt drafts NO collar piece                                  | `lib/draft/garment.ts:339` — `lib/draft/garment.test.ts:296-308` `expect(pieces.map(p=>p.id)).not.toContain("collar")`                                                                                                                                                                                                           | ✅ PASS                                                                 |
| TSHIRT-06: re-runnable comparison drafts P/M/G/GG and reports 6 metrics per piece/size against `measurements.json`                     | 4 sizes × 4 pieces (16 rows), each with all 6 metrics, matching `measurements.json`'s shape  | `lib/draft/tshirtBenchmark.test.ts:90-107` (`measurePiece`), `:205-218` `expect(rows).toHaveLength(16)` and every metric asserted `typeof === "number"` + `Number.isFinite`                                                                                                                                                      | ✅ PASS                                                                 |
| TSHIRT-07: comparison emitted as a checked-in artifact, not console-only                                                               | `docs/reference/tshirt-benchmark/comparison-report.md` exists, lists all 16 rows × 6 metrics | `lib/draft/tshirtBenchmark.test.ts:202` (`writeFileSync`), `:220-235` `expect(tableLines.length).toBe(rows.length * METRIC_KEYS.length)` (96) — file read and independently confirmed to contain exactly 96 data rows (lines 15-110)                                                                                             | ✅ PASS                                                                 |
| TSHIRT-08: no formula/constant/default change for `blouse`/`dress`/`skirt`/`trousers`; every existing test for those passes unmodified | Zero non-tshirt archetype file/test modified; full suite green                               | `git diff --stat 426c0de..HEAD` — only `garment.ts`, `ease.ts`, `subpieces.ts` (production) touched, every branch/constant read is `spec.type === "tshirt"`-gated or `knit`-gated (knit is true only for tshirt, confirmed at `garment.ts` `const knit = spec.type === "tshirt"`); `npm test` → 3057 passed, 3 skipped, 0 failed | ✅ PASS (see note below on the shared `BAND_COLLAR_HEIGHT_CM` constant) |
| TSHIRT-09: an uncitable-source value is labeled an estimate, never asserted as fact                                                    | In-code comment names the value an estimate                                                  | `lib/draft/ease.ts:72-80` — `// FLAG (estimate, not a verified industry figure -- see design.md's Risks table): this is far outside the ~15-20cm "loose tee" range...`                                                                                                                                                           | ✅ PASS                                                                 |

**Status**: ✅ All 9 ACs covered, all matched to their spec-defined precise outcome. No spec-precision gaps.

**Note on TSHIRT-08**: `BAND_COLLAR_HEIGHT_CM` (`subpieces.ts`) is a shared constant used by any archetype whose style explicitly requests `collar:"band"` (not tshirt-exclusive code). Spec's own AC4 is phrased as a ubiquitous requirement (not gated to `WHEN tshirt`), and design.md explicitly chose this as the one directly-comparable figure to correct globally rather than fork per archetype. No pre-existing `blouse`/`dress`/`skirt`/`trousers` test referenced the old 4cm value (confirmed by the design's own risk note and by this run's test results), so AC8's literal test — "every existing test... continues to pass unmodified" — holds. Flagged for visibility, not as a gap: a future blouse/shirt request with an explicit `collar:"band"` will now draft a 5cm (not 4cm) band, which is a real, deliberate, spec-sanctioned side effect outside the tshirt archetype.

---

## Discrimination Sensor

Scratch worktree: `git worktree add C:/Users/leona/Projects/moldai-scratch-verify HEAD` (checked out at `dc3d862`, feature HEAD). `node_modules` linked via a Windows directory junction (not copied, not touched in the real tree) to allow vitest to run.

| Mutation | File:line                    | Description                                                 | Killed?                                                                                                                                          |
| -------- | ---------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1        | `lib/draft/garment.ts:125`   | `TSHIRT_HEM_DROP_CM = 18.5` → `25.5`                        | ✅ Killed — `garment.test.ts` "reports the tshirt body length..." failed (expected 66.5 got 59.5-equivalent mismatch)                            |
| 2        | `lib/draft/garment.ts:339`   | Removed `collar: spec.style.collar ?? "band"` line entirely | ✅ Killed — 2 tests failed: "tshirt generates front/back/sleeve/collar..." and `draftPiecesCm` "returns pieces in cm (front/back/sleeve/collar)" |
| 3        | `lib/draft/subpieces.ts:326` | `BAND_COLLAR_HEIGHT_CM = 5` → `4`                           | ✅ Killed — "the band collar's stand height is exactly 5cm" failed (expected 4 to be close to 5)                                                 |

**Sensor depth**: lightweight (3 mutations, default tier)
**Result**: 3/3 killed — ✅ PASS

**Isolation verified**: `git status --porcelain` on the real tree was empty before sensor work, and empty again after `git worktree remove --force` — confirmed identical, no `git stash` used at any point, only `git worktree add`/mutate/revert/`remove --force`.

---

## Code Quality

| Principle                                                                          | Status                                                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Minimum code                                                                       | ✅ — Approach A (inline, minimal-surface) as designed; no new module, no new `GarmentStyle` field                                                                                                                                                                 |
| Surgical changes                                                                   | ✅ — only `garment.ts`, `ease.ts`, `subpieces.ts` changed in production code                                                                                                                                                                                      |
| No scope creep                                                                     | ✅ — no non-tshirt archetype formula touched; downstream test fixes (`Proof3DTab.test.tsx`, `mesh.test.ts`, `body.test.ts`, `easeReport.test.ts`) are direct, necessary fallout of the `ease.ts` change on tshirt-specific test cases, not unrelated improvements |
| Matches patterns                                                                   | ✅ — new constants follow the existing `CAP_EASE_CM`/`WRIST_EASE_CM` citation-comment convention; `??`-default idiom reused verbatim                                                                                                                              |
| Spec-anchored outcome check (asserted values match spec)                           | ✅ — see AC table above; every assertion targets the exact spec-defined numeric outcome                                                                                                                                                                           |
| Per-layer Coverage Expectation met (domain 1:1 ACs; routes N/A — no route touched) | ✅                                                                                                                                                                                                                                                                |
| Every test maps to a spec requirement — no unclaimed tests                         | ✅ — all new/changed tests trace to TSHIRT-01..09                                                                                                                                                                                                                 |
| Documented guidelines followed                                                     | `CLAUDE.md`'s "Don't add abstractions beyond what's needed" (cited explicitly in design.md's Approach A rationale)                                                                                                                                                |

---

## Edge Cases

- [x] `style.sleeve = "long"` still gets the new length/ease/collar defaults — none of the three new defaults are conditioned on sleeve length in the code (`garment.ts:332-341`'s style block sets `collar`/length unconditionally on `spec.type === "tshirt"`, independent of `sleeve`).
- [x] Chart-supplied `bicep`/`neckGirth`/etc. compose with the new defaults with no special-casing — confirmed by reading the style-defaults block: none of `TSHIRT_HEM_DROP_CM`/`TSHIRT_BASE_EASE_CM`/`collar` default reads or branches on `EXTENDED_MEASUREMENT_KEYS`.
- [x] Report overwrite-not-append on regeneration — `tshirtBenchmark.test.ts:202` uses `writeFileSync` (not `appendFileSync`), confirmed by re-running `npm test` twice locally with an identical resulting `comparison-report.md`.

---

## Gate Check

- **Gate command**: `npm run build && npm run lint`, plus `npm test` (both vitest projects), independently re-run by the Verifier (not read from the author's notes)
- **Build**: clean (`next build` compiled, typechecked, generated all 33 routes)
- **Lint**: 6 pre-existing errors + 10 warnings, all in vendored `.claude/skills/mermaid-studio`/`.claude/skills/playwright-skill` scripts — confirmed via `git diff --stat 426c0de..HEAD` that neither directory appears in this feature's diff (zero output, exit 0)
- **Test result**: 3057 passed, 3 skipped, 0 failed (205 files) — both `node` and `dom` projects
- **Test count before feature** (measured directly, scratch worktree at `426c0de`): 3050 passed, 3 skipped (3053 total), 204 files
- **Test count after feature**: 3057 passed, 3 skipped (3060 total), 205 files
- **Delta**: +7 tests, +1 file (`lib/draft/tshirtBenchmark.test.ts`) — consistent with T1 (+1 net), T3 (+1 override), T4 (+1 guard), T5 (+4 new file tests), T2 (net 0 — rewrote existing assertions rather than adding), T6 (0 — verification only)
- **Skipped tests**: 3, pre-existing, unchanged by this feature (not investigated further — outside diff scope)
- **Failures**: none

---

## Fix Plans

None. No gaps found.

---

## Requirement Traceability Update

| Requirement | Previous Status | New Status  |
| ----------- | --------------- | ----------- |
| TSHIRT-01   | Implementing    | ✅ Verified |
| TSHIRT-02   | Implementing    | ✅ Verified |
| TSHIRT-03   | Implementing    | ✅ Verified |
| TSHIRT-04   | Implementing    | ✅ Verified |
| TSHIRT-05   | Implementing    | ✅ Verified |
| TSHIRT-06   | Implementing    | ✅ Verified |
| TSHIRT-07   | Implementing    | ✅ Verified |
| TSHIRT-08   | Implementing    | ✅ Verified |
| TSHIRT-09   | Implementing    | ✅ Verified |

---

## Summary

**Overall**: ✅ Ready

**Spec-anchored check**: 9/9 ACs matched spec outcome, 0 spec-precision gaps
**Sensor**: 3/3 mutations killed
**Gate**: build clean, lint clean (feature scope), 3057/0/3 test result, +7 test delta (no deletions, no weakened assertions)

**What works**: All four formula/constant changes (length, ease, collar default, band height) are in place, cited in-code, and each is guarded by a test that targets the exact spec-defined numeric outcome. The comparison tool drafts all 4 sizes × 4 pieces, writes a checked-in, overwrite-on-regen report with all 96 rows, and round-trips its own "ours" figures against an independent `measurePiece` call. The one uncitable estimate (`TSHIRT_BASE_EASE_CM`) is honestly flagged in-code with both competing explanations for its size. No blouse/dress/skirt/trousers formula, default, or test was touched; the full regression suite is green with a strictly additive test delta.

**Issues found**: None blocking. One judgment note (not a gap): `BAND_COLLAR_HEIGHT_CM` is a shared constant, so an explicit `collar:"band"` request on a non-tshirt archetype now also drafts at 5cm instead of 4cm — sanctioned by AC4's ubiquitous phrasing and design.md's explicit rationale, not a silent regression, but worth knowing if a future non-tshirt band-collar request is reviewed against an old assumption.

**Next steps**: None required. Feature is done.
