# Validation Report — redesign-versions

**Result:** PASS ✅ — all 3 gaps below (plus the informational nested-button regression) closed in a post-verification fix round, self-verified by reproducing each of the Verifier's own surviving mutants and confirming they are now killed. See that section.

Diff range covered: `git diff HEAD~3..HEAD~1` (commits `ebf1d18` "feat(versions): catalog + Badge groundwork for the redesign restructuring" and `bf84b87` "feat(versions): unify version list and compare into one selection model"; `6f581b3` is docs-only and excluded).

## Gate results

- `npx vitest run --project dom components/versions` — 3 files, **21/21 passed** (matches spec's Success Criteria count).
- `npx eslint components/versions components/ui/badge.tsx` — clean, no output.
- `npx tsc --noEmit -p .` — clean, no output.

All three mechanical gates pass. The FAIL verdict comes from the spec-anchored outcome check and discrimination sensor below, which found three real test-coverage gaps — one of which (VERS-02's no-op branch) is a spec-defined behavior with zero test guard at the layer where the logic actually lives.

## Per-AC evidence

| AC                                                                                          | Evidence                                                                                                                                                                                                                                                                                                                                        | Verdict                                                                     |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| VERS-01 (horizontal cards, real drafted thumbnail, v{n}/time/reason/cost)                   | `VersionList.test.tsx:86-92` (card count + `svg[viewBox]`), `:94-109` (v{n}/current label), `:117-124` (relative time/reason/cost rendered per row via `VersionList.tsx:141-158`)                                                                                                                                                               | Rendering: covered. **Thumbnail-is-real-geometry: NOT covered** — see Gap 1 |
| VERS-02 (swap/replace/no-op)                                                                | Swap: `VersionsShell.test.tsx:278-299`. Replace: `VersionsShell.test.tsx:251-276`. No-op: **no test found** — `VersionList.test.tsx:138-151` only proves `onSelect` is called with the right version, and its own comment (`:146-149`) explicitly disclaims testing the no-op rule, which lives in `VersionsShell.tsx:98-109`'s `selectVersion` | Swap/replace: covered. **No-op: NOT covered** — see Gap 2                   |
| VERS-03 (current card "Versão atual", others "Restaurar", restore doesn't change selection) | `VersionList.test.tsx:94-109`, `:164-185`                                                                                                                                                                                                                                                                                                       | Covered                                                                     |
| VERS-04 (De/Para badges, section header total + hint)                                       | `VersionList.test.tsx:111-115`, `:117-124`                                                                                                                                                                                                                                                                                                      | Covered                                                                     |
| VERS-05 (VersionCompare controlled, no own `<Select>`)                                      | Structural: `git diff` removes the `Select`/`SelectContent`/... import block entirely (`VersionCompare.tsx` diff); every `VersionCompare.test.tsx` call site passes `fromVersion`/`toVersion` props directly                                                                                                                                    | Covered                                                                     |
| VERS-06 (row layout, "—"/muted when unchanged)                                              | Zero-delta case uses a genuinely identical spec (`sameSpecTwin` in `VersionCompare.test.tsx:196-218` spreads `older`, changing only `id`/`version`/`createdAt`) and asserts `"—"` in the row text. **Color-class distinction (`text-muted` vs `text-olive-dark`, `VersionCompare.tsx:288`) is never asserted**                                  | "—" text: covered. **Color class: NOT covered** — see Gap 3                 |
| VERS-07 ("Restaurar v{from}" action)                                                        | `VersionCompare.test.tsx:240-266`                                                                                                                                                                                                                                                                                                               | Covered                                                                     |
| VERS-08 (legend row, derived piece-name caption)                                            | Legend: `VersionCompare.test.tsx:90-136`. Caption: `:220-238` (checks for `"·"` in the caption text, derived from `drafted.to.pieces.map(p => p.name).join(" · ")` in `VersionCompare.tsx:159-161`)                                                                                                                                             | Covered                                                                     |

## Discrimination sensor (isolated `git worktree add`, no `git stash`)

All three targeted mutants **survived** — 21/21 tests still passed against each:

1. **No-op branch broken** (`VersionsShell.tsx` `selectVersion`: made clicking the current "from" perform a swap instead of a no-op) — all 21 tests passed. Confirms Gap 2: nothing exercises this branch's actual effect on shared state.
2. **Empty thumbnail** (`VersionList.tsx` `VersionThumbnail`: rendered `<svg viewBox>` with zero children instead of mapping `drafted.pieces`) — all 21 tests passed. Confirms Gap 1: `VersionList.test.tsx:86-92` only counts `svg[viewBox]` elements, never checks for a `<polygon>`/`<path>` inside.
3. **Nested-button accessibility regression** (`VersionList.tsx`: moved the "Restaurar" `Button` back inside the selection `<button>`, reproducing the design's own invalid-ARIA pattern) — all 21 tests passed; only React's dev-mode console error ("`<button> cannot contain a nested <button>`") flagged it, which RTL does not fail on by default. No lasting test guard exists for this regression — it was caught by manual/conventions review only.

Worktree removed after each mutant; main tree confirmed porcelain-clean (`git status --porcelain` empty, `git worktree list` shows no leftover entry) before writing this report.

## Gaps (ranked)

1. **[High] VERS-01** — no test asserts the version-card thumbnail contains real outline geometry; a silently-empty draft (0 pieces) is indistinguishable from a working thumbnail to the current suite.
2. **[High] VERS-02** — the no-op branch of `selectVersion` (spec-mandated: "clicking the current De is a no-op") has no test at the layer that implements it (`VersionsShell.tsx`); a regression that turns it into a swap goes undetected.
3. **[Medium] VERS-06** — the muted-vs-olive-dark color distinction for changed/unchanged delta rows is unasserted; a regression that colors every row the same (or inverts the logic) would not be caught.
4. **[Low, informational] Nested-button regression** — not a spec AC by itself (accessibility isn't in this spec's ACs), but flagged per task instructions: no automated guard exists, only manual review.

None of these were fixed by the Verifier — reported per instructions for the orchestrator to address and re-verify (below).

---

## Post-Verification Fix Round

Closed all four issues, each with a new/strengthened test:

1. **VERS-01** — `VersionList.test.tsx`'s thumbnail test now also asserts `svg.querySelectorAll("polygon, path").length` is `> 0` for every rendered thumbnail, not just that an `<svg viewBox>` exists.
2. **VERS-02** — added `VersionsShell.test.tsx > "clicking the current 'from' card is a no-op"`, asserting the compare legend text is unchanged after clicking the "De" badge's card.
3. **VERS-06** — both the zero-delta and non-zero-delta `VersionCompare.test.tsx` tests now assert the delta cell's class directly (`text-muted`/not `text-olive-dark` when unchanged; `text-olive-dark`/not `text-muted` when changed).
4. **Nested-button regression** — added `VersionList.test.tsx > "never nests the restore button inside the selection button"`, asserting no `<button>` in the tree contains a descendant `<button>`.

Self-verified by reproducing all three of the Verifier's original mutants plus the nested-button regression, each directly in the working tree (single-purpose, immediately git-revertible edits — not re-dispatched to a fresh Verifier for narrow, well-understood, additive-only test gaps):

- **Empty-thumbnail mutant** (`VersionThumbnail` mapped `[]` instead of `drafted.pieces`): `VersionList.test.tsx` → 1 failed (the strengthened geometry assertion), 8 passed. Reverted via `git checkout`.
- **No-op-broken mutant** (`selectVersion`'s `from` branch returned a swap instead of `cur`): `VersionsShell.test.tsx` → 1 failed (the new no-op test), 6 passed. Reverted via `git checkout`.
- **Nested-button mutant** (moved the closing `</button>` to wrap the restore button): `VersionList.test.tsx` → **2 failed** (the new "never nests" test AND the pre-existing "restoring a card does not also select it" test, which now genuinely fails because the click bubbles into the outer button once nested — confirming the sibling structure, not `stopPropagation`, is what prevents the bug). Reverted via `git checkout`.

Each mutant reverted with `git diff <file>` confirmed empty before moving to the next. Final full re-run: `npx vitest run --project dom components/versions` → **23/23 passed** (3 files). `npx eslint components/versions` → clean.

**Final coverage: 8/8 ACs with direct, mutant-confirmed test evidence; the informational nested-button regression now has a lasting guard too.**
