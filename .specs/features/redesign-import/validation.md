# Validation Report — redesign-import

**Result:** PASS ✅ — the IMPT-01e gap below was closed in a post-verification fix round, self-verified by reproducing the Verifier's own surviving mutant and confirming it is now killed. See that section.

**Diff range covered:** `HEAD~2..HEAD` (`e8723fd` feat(import): surface real balance, mapping progress, and cut-line hint; `e9af633` fix(import): update ImportShell's stale credits doc comment).

One acceptance criterion (IMPT-01) has a real, confirmed discrimination gap: the `loadCredits` failure-path test does not guard the "never surfaces an error state" half of its own contract. A discrimination-sensor mutant that makes the catch block set `actionError` on fetch failure survives the full `lib/importStore.test.ts` suite (23/23 still pass). IMPT-02 and IMPT-03 are both solidly covered and their sensors killed the injected mutants. All gate commands (vitest dom, vitest node, eslint, tsc) pass cleanly on the real tree.

---

## Per-AC evidence

| AC       | Requirement                                                           | Test(s)                                               | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                   | Verdict                           |
| -------- | --------------------------------------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| IMPT-01a | Balance shown once loaded                                             | `components/import/VerificationPanel.test.tsx:85-93`  | Sets `credits: {..., balance: 12}`, asserts `getByText(tImport("balanceLabel", {balance: 12}))` is in the document. Matches spec's "show 'Saldo: N créditos'".                                                                                                                                                                                                                                                             | Covered                           |
| IMPT-01b | Balance genuinely absent (not placeholder) while unloaded             | `components/import/VerificationPanel.test.tsx:95-101` | Sets `credits: null`, asserts `queryByText(...)` is `null` (`.not.toBeInTheDocument()`) — a true absence check, not a loading-state string match.                                                                                                                                                                                                                                                                          | Covered                           |
| IMPT-01c | `loadCredits` success sets real balance                               | `lib/importStore.test.ts:469-482`                     | Mocks `api.getAccountSummary` to resolve `{credits: {balance: 12, ...}}`, calls `loadCredits()`, asserts `credits?.balance === 12`.                                                                                                                                                                                                                                                                                        | Covered                           |
| IMPT-01d | `loadCredits` failure leaves `credits` null, no throw                 | `lib/importStore.test.ts:488-497`                     | Mocks rejection, asserts `loadCredits()` resolves `undefined` (doesn't throw) and `credits` stays `null`.                                                                                                                                                                                                                                                                                                                  | Covered for the "stays null" half |
| IMPT-01e | Failure never surfaces as an error state (side-effect-free catch)     | _(none)_                                              | No test in `lib/importStore.test.ts:488-497` or elsewhere asserts `actionError` (or any other error flag) is unaffected after a `loadCredits` failure. **Confirmed by discrimination sensor below: a mutant that sets `actionError` in the catch block survives all 23 tests in the file.**                                                                                                                                | **NOT covered — gap**             |
| IMPT-02  | `LayerMappingPanel` progress count, real mapped<total case            | `components/import/ImportShell.test.tsx:172-177`      | State has `roles: {L1: "cut"}` only, against `EXPECTED_ROLES = ["cut","seam","grain"]` (`components/import/LayerMappingPanel.tsx:19`) — a genuine 1-of-3 case, not 0-of-0 or all-mapped. Asserts `layersMappedProgress` text with `{mapped: 1, total: 3}`, matching the real arithmetic (`EXPECTED_ROLES.length - missingExpected.length`, `LayerMappingPanel.tsx:53-54`) rather than a value hardcoded independent of it. | Covered                           |
| IMPT-03a | Hint shown while no `cut` role mapped (even with another role mapped) | `components/import/LayerPreviewCanvas.test.tsx:77-81` | `roles: {CUTLAYER: "ignore"}` — a role IS mapped, just not to `cut` — asserts hint text present. This specifically discriminates "cut role absent" from "no role mapped at all".                                                                                                                                                                                                                                           | Covered                           |
| IMPT-03b | Hint hidden once `cut` role mapped                                    | `components/import/LayerPreviewCanvas.test.tsx:83-89` | `roles: {CUTLAYER: "cut"}`, asserts hint text absent via `queryByText(...).not.toBeInTheDocument()`.                                                                                                                                                                                                                                                                                                                       | Covered                           |

---

## Discrimination sensor

Ran in an isolated scratch worktree (`git worktree add <tmp>/wt-verify HEAD`, `node_modules` symlinked from the main tree since the worktree carries no install), one mutant at a time, reverted between each via `git checkout --`, worktree removed with `git worktree remove --force` afterward. Confirmed `git status --porcelain` on the real tree is unchanged (clean) both before and after.

1. **`lib/importStore.ts` `loadCredits` catch block** — changed the empty catch to `set({ actionError: "request_failed" })`.
   - Ran `npx vitest run --project node lib/importStore.test.ts`.
   - **Result: SURVIVED — 23/23 tests still pass.** No test asserts `actionError` (or any other flag) stays untouched after a `loadCredits` failure. This is the gap behind IMPT-01e above.

2. **`components/import/LayerPreviewCanvas.tsx` `hasNoCutMapped`** — changed `.includes("cut")` to `.includes("seam")`.
   - Ran `npx vitest run --project dom components/import/LayerPreviewCanvas.test.tsx`.
   - **Result: KILLED.** `hides the hint once a layer is mapped to the cut role` failed (hint still rendered because the mutant condition no longer keys off `cut`).

3. **`components/import/LayerMappingPanel.tsx` progress math** — hardcoded `mapped: 0` regardless of `missingExpected.length`.
   - Ran `npx vitest run --project dom components/import/ImportShell.test.tsx`.
   - **Result: KILLED.** The "Only 'cut' is mapped -- 1 of the 3 expected roles" test failed, `getByText` found no `"1 de 3..."` text.

---

## Gate results (real tree, HEAD = `e9af633`)

- `npx vitest run --project dom components/import` — **PASS** (5 files, 32 tests).
- `npx vitest run --project node lib/importStore.test.ts` — **PASS** (23 tests).
- `npx eslint components/import lib/importStore.ts` — **PASS** (clean, no output).
- `npx tsc --noEmit -p .` — **PASS** (clean, no output).

---

## Gap (ranked)

1. **[Medium] IMPT-01e uncovered, confirmed by a surviving mutant.** `lib/importStore.test.ts:488-497` ("leaves credits null on failure, without throwing") only asserts `credits` stays `null` and the promise doesn't reject. It does not assert `actionError` (or any other store error field) is left untouched. The spec's own assumption row (`spec.md:28`) and the store's doc comment (`lib/importStore.ts:79-88`, "never a loading placeholder or error state for a display-only figure") both promise silent-failure behavior beyond just "`credits` stays null" — a regression that turned the catch block into one that sets `actionError` (or rethrows) would ship undetected, potentially breaking `VerificationPanel`'s unrelated `actionError`-driven error message (`components/import/VerificationPanel.tsx` renders `t("createError")` off `actionError !== "image_failed"`) for a reason having nothing to do with the paid import action itself. Fix: add an assertion to the existing failure test (or a new one) that `useImportStore.getState().actionError` is unchanged (e.g. still `null`) after a failed `loadCredits()` call.

No other gaps found — IMPT-02 and IMPT-03 are both fully covered with real discriminating test cases, and all mutants targeting them were killed.

---

## Post-Verification Fix Round

Closed IMPT-01e by adding `lib/importStore.test.ts > "useImportStore.loadCredits" > "leaves actionError untouched on failure"`, asserting `actionError` stays `null` after a failed `loadCredits()` call (with `actionError` explicitly seeded to `null` first, so the assertion is real rather than incidentally true).

Self-verified by reproducing the Verifier's exact surviving mutant directly in the working tree (single-line, immediately git-revertible — not re-dispatched to a fresh Verifier for a narrow, well-understood, additive-only test gap): changed `loadCredits`'s empty `catch {}` to `catch { set({ actionError: "request_failed" }); }`.

- With the mutant applied: `npx vitest run --project node lib/importStore.test.ts` → **1 failed** (the new test, `expected 'request_failed' to be null`), 23 passed.
- Mutant reverted via `git checkout -- lib/importStore.ts` (confirmed `git diff` empty): `npx vitest run --project node lib/importStore.test.ts` → **24/24 passed**.
- `npx eslint lib/importStore.ts lib/importStore.test.ts` → clean.

**Final coverage: 3/3 ACs (all sub-criteria) with direct, mutant-confirmed test evidence.**

This closes the redesign-import feature — the 11th and final screen of the redesign pass.
