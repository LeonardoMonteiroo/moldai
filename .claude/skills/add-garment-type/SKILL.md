---
name: add-garment-type
description: Extend what the drafting engine can draft — either wire an existing GarmentType onto a second registered engine (the freesewing pattern used for tshirt/blouse/skirt/trousers), or add a brand-new GarmentType to the app end-to-end (the trousers precedent). Use when asked to add support for a new garment type/archetype, register a design on the freesewing engine, or extend MOLDAI_CAPABILITY/FREESEWING_CAPABILITY — also invocable with /add-garment-type. Do not use for a style-field tweak on an already-supported type.
---

# Add garment type

Two different tasks share this name — pick the right track before touching anything, since they touch almost disjoint file sets.

- **Track A — wire an already-supported `GarmentType` onto a second engine.** `GarmentType` (`lib/types.ts:31`) already has the value; you're teaching one more `DraftingEngine` (`lib/draft/engine/registry.ts`) how to draft it. This is what happened for tshirt/blouse/skirt/trousers on the `freesewing` engine across the last four commits.
- **Track B — add a brand-new `GarmentType` to the app.** Nothing drafts it yet, on any engine. This is what `trousers` was for the `moldai` engine (see `docs/decisions/drafting.md`'s fifth-archetype entry). Rarer, much bigger blast radius: AI prompt/schema, `validateSpec`, i18n, every engine's capability declares it or explicitly doesn't.

Read `docs/architecture/drafting.md` and `docs/decisions/drafting.md` first regardless of track — they carry the *why* (the #266→#267 swappable-engine decision, the #269 GarmentCode-decline / FreeSewing-adopt decision) that this checklist assumes.

**Before locking in any new identifier** (a `GarmentType` value, a style field, a capability key), run it past the translate-don't-transliterate check in `.claude/agents/migration-safety.md` — a pt-BR design term spelled in English letters instead of translated has cost this repo a wiped table three times.

---

## Track A — wire an existing GarmentType onto the `freesewing` engine

Template: any file in `lib/draft/engine/freesewing/designs/` (e.g. `skirt.ts`) — read one fully before starting, including its header comment, which records *why* that specific upstream design was chosen over its siblings.

1. **Pick the upstream `@freesewing/*` design.** Check `@freesewing/collection`'s own `requiredMeasurements` for every candidate tagged for this garment shape and pick the cheapest (fewest measurements this app doesn't already have) — that's the criterion every existing wrapper's header comment applies (see `skirt.ts:20-40`'s Sandy-vs-alternatives reasoning). Add the package to `package.json` if not already a dependency (`@freesewing/sandy`, `@freesewing/teagan`, `@freesewing/titan`, `@freesewing/diana` are already installed).
2. **Write the wrapper** in `lib/draft/engine/freesewing/designs/<name>.ts`:
   - Import the upstream design under a local alias (`import { Sandy as SkirtDesign } from "@freesewing/sandy"`) — the upstream codename is confined to this one line, never leaks further, per every existing wrapper's own comment.
   - Convert this app's `Measurements` (cm) to the upstream design's expected units/keys (mm, in `skirt.ts`'s case) via a local `toXMeasurementsMm` function.
   - Use `flattenFreesewingSeam` / `mirrorFoldedPanel` (`lib/draft/engine/freesewing/geometry.ts`) and `edgeRef` (`seamHelpers.ts`) to convert the upstream part geometry into this app's `DraftedPiece`/`SeamPairDecl` shapes — don't hand-roll geometry conversion per wrapper.
   - Record, in a comment, any measured discrepancy between what the upstream design produces and what a naive reading of the input measurement would suggest (see `skirt.ts:29-40`'s ~15cm waist-ease finding) — that's a "record it, don't silently fix it" precedent, not optional documentation.
   - Export a `draft<Name>(spec, base, t): EngineDraft` function.
3. **Wire it into the engine.** `lib/draft/engine/freesewing/index.ts`: add the `import`, add a `case "<garmentType>":` in the `switch (spec.type)`.
4. **Declare capability honestly.** `lib/draft/engine/capability.ts`'s `FREESEWING_CAPABILITY` (currently line ~361):
   - Add the type to `types: [...]` if not already listed.
   - Add its entry to `styleEnumsByType` — start from `FREESEWING_EMPTY_STYLE_ENUMS` and only override the style axes this specific upstream design actually exposes (e.g. `skirt: { ...FREESEWING_EMPTY_STYLE_ENUMS, skirt: ["circle"] }` — declaring an enum value the design can't honor is the exact silent-substitution `checkEngineSupport` exists to prevent).
   - Add its entry to `styleFieldsByType` — only the style fields this wrapper actually reads.
   - **Never widen `measurements.required`/`optional` beyond what this specific design needs** — a capability's measurement list gates what `checkEngineSupport` reports as a gap for every type on that engine, not just the one you're adding.
5. **Test the wrapper**, mirroring the sibling `<name>.test.ts` in the same directory (containment: every drafted vertex inside its own outline; seam-length sanity against the input measurement; the ease/discrepancy finding from step 2 asserted, not just commented).
6. **Run `capability.test.ts`** — it cross-checks every registered engine's capability shape structurally; a `styleEnumsByType`/`styleFieldsByType` entry that's missing or shaped wrong for the new type fails there before it ever reaches a route.
7. **Do not touch `lib/ai/prompt.ts`/`schema.ts` for this track** — those render from the *active* engine's capability (`generation-flow.md`), and the active engine defaults to `"moldai"`; a second engine's capability only matters once a pattern is drafted on it or `checkEngineSupport` is asked about it.

## Track B — add a brand-new GarmentType to the whole app

Follow the `trousers` precedent (`docs/decisions/drafting.md`, `docs/architecture/drafting.md`'s "fifth archetype" entry). This is a superset of Track A's engine-capability step, plus:

1. **`lib/types.ts:31`** — add the value to the `GarmentType` union. This is the one identifier every other step below keys off; get the English name right per translate-don't-transliterate before anything else references it.
2. **`lib/draft/vocabulary.ts`** — add any new style enum values this archetype needs (only if it introduces a genuinely new style axis; reuse existing ones like `neckline`/`sleeve` where the shape overlaps an existing archetype).
3. **`lib/draft/garment.ts`'s `validateSpec`** (line 107) — the new type must be accepted, and every style field that doesn't apply to it must be rejected/ignored, never silently passed through. This is the untrusted-input trust boundary (CLAUDE.md's non-negotiable) — the AI's output for this type is not safe until this function says so.
4. **Write the actual drafter** for the `moldai` engine: a new file in `lib/draft/` (pattern after `trousers.ts` if the shape is bottom-half, `skirt.ts`/`body.ts` otherwise), wired into `draftGarment`'s dispatch in `garment.ts`. Follow `drafting.md`'s existing rules verbatim: pieces drafted from measurements not deltas, curvature only on marked spans via `outlinePath`'s `curvedSpans`, decorations placed from the piece's real boundary never its bounding box, notches typed via `notchAt` and never persisted.
5. **`lib/draft/engine/capability.ts`'s `MOLDAI_CAPABILITY`** — add the type, its `styleEnumsByType`, `styleFieldsByType`, and any newly-required/optional measurement keys (check whether a new measurement is one of the existing `EXTENDED_MEASUREMENT_KEYS`, `lib/measurements.ts`, before inventing a new one).
6. **`lib/ai/prompt.ts`/`schema.ts`** — confirm they render the new type's enums/bounds from `MOLDAI_CAPABILITY` (they should, structurally, with zero hardcoding needed) rather than a literal list that needs manual updating; if you find a hardcoded list, that's a separate bug to flag, not something to extend.
7. **i18n** — a `garmentType.<value>` key for the type-name catalog lookup (`TechSheetTab.tsx` pattern, `conventions.md`), plus any new `PatternData` namespace strings the drafter emits via its injected `Translate`.
8. **Tests**:
   - Add representative specs to `DECORATION_CASES` (`lib/draft/fixtures.ts`, consumed by `garment.test.ts`) so the containment/decoration-placement suite covers the new archetype.
   - `tshirtBenchmark.test.ts` scores every *registered engine* against its own size table — check whether the new type needs a benchmark entry or is correctly out of scope (a type the benchmark's own size table can't satisfy is reported and skipped, not silently scored zero — don't fight that by inventing fake measurements).
   - `capability.test.ts` for the capability-shape cross-check.
9. **Every registered engine's capability must say something about the new type** — either it supports it (declare it properly) or it doesn't (simply omit it from `types`); never leave a stale/partial entry.
10. **Proof3D**: check `components/editor/Proof3DTab.tsx` — if the new archetype isn't supported by the 3D preview yet, add a named gap message (the `notSupportedForTrousers` pattern), never a silently empty or fake preview.
11. **Docs**: update `docs/architecture/drafting.md`'s archetype list and `docs/decisions/drafting.md` with the decision record. **While you're in `drafting.md`, verify its "No second engine is registered" line (top of the file) still matches `lib/draft/engine/registry.ts` before you save** — it does not as of the `freesewing` engine's registration, so don't propagate that stale claim into your own edit.

---

## Verification

Run `npx vitest run lib/draft` scoped to the drafting engine before the full `/verify` sequence — it's the fast signal. Then run `/verify` in full before considering the work done.
