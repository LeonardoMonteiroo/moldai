# STATE

## Decisions

### AD-001

- **Decision**: An optional `EXTENDED_MEASUREMENT_KEYS` field whose fallback formula has no cited source tying it proportionally to bust/another core girth falls back to a flat, cited "typical/standard" constant (per gender when relevant) rather than an invented proportional scaling.
- **Reason**: `body.ts`/`sleeve.ts` already hold every existing drafting formula to a "cite a real source" bar (Aldrich, ikatbag.com, dresspatternmaking.com, muellerundsohn.com). Some real body measurements (e.g. `shoulderSlope`, and now `bustPointHeight`/`bustSpan`) are frame/torso characteristics with no cited girth-proportional relationship — inventing a scaling coefficient for them would fabricate precision the sourcing doesn't support.
- **Trade-off**: A flat fallback doesn't vary across PP→GG the way a proportional one would, so every size drafts from the identical assumed value until a real per-chart measurement is entered. Judged acceptable because the field is optional and editable, and the flat value is still real and cited — never an invented number.
- **Scope**: `lib/measurements.ts` (`EXTENDED_MEASUREMENT_KEYS`), `lib/sizeCharts/seed.ts` (system-chart seeding), and any future drafting feature adding a new optional measurement field — established by `shoulderSlope` (`lib/sizeCharts/seed.ts:63-68`), reaffirmed by `bustPointHeight`/`bustSpan` (`bust-dart-shaping` feature).
- **Date**: 2026-09-01
- **Status**: active

### AD-002

- **Decision**: When a structured user choice duplicates a field the AI also returns, the validated user value is **re-applied over the model's after the call**, never left to prompt instruction alone.
- **Reason**: Telling the model in the prompt is necessary — it keeps the model's own reply text coherent and stops it asking about a field already answered — but it is not a defence. The repo already holds the equivalent line elsewhere: `applyGarmentSpec` clamps every measurement to `MEASUREMENT_RANGES` regardless of what the model claims prompted the value, and `validateSpec` re-checks every enum rather than trusting the returned spec. `lib/ai/formSpec.ts`'s `mergeFormSpec` is the same rule for a form's fields.
- **Trade-off**: The merge must know which fields the user actually set, so "unset" has to stay representable — `validateSpec` leaving an untouched style field `undefined` is what makes that free. A select defaulting to a concrete enum value would destroy the distinction, which is why the form's own default is a sentinel that is never sent. It also means the user can pick something the model would have talked them out of; the model's `decline`/`ask` path still exists for a request that is impossible rather than merely unwise.
- **Scope**: `lib/ai/formSpec.ts` (`mergeFormSpec`), `app/api/patterns/[id]/generate/route.ts`'s `apply` branch, and any future surface that offers a structured control over a field the AI also proposes. Established by the `pattern-form-creation` feature.
- **Date**: 2026-09-03
- **Status**: active

## Handoff

**Feature `pattern-form-creation`: DONE.** 25 commits, `ee32304..3d28a8e`, on `fix/design-reference-alignment`. Never pushed.

- All 23 tasks complete; `tasks.md` Status: Done. All 36 requirements Verified.
- Verifier: FAIL (iteration 1) then **PASS** (iteration 2), 36/36 ACs, report in `validation.md` with both iterations kept. `validate_state.py` exit 0.
- Gate at HEAD: 3396 tests pass, `npx eslint app lib components` exit 0, `npm run build` compiles.
- Visual check via the `playwright-skill` harness: 0 mismatches against `Dashboard.dc.html`'s stated values at 1280x900.

**Open follow-ups, none owned by this feature:**

1. `ChatMessageSchema` was destroying `hasImage` and `assembly` on every read-then-write (fixed here as T22, with `assembly` a user-approved scope increase). Worth checking whether any OTHER blob schema in `lib/schemas/` omits a field its writer sets — the same silent strip would apply.
2. `eslint.config.mjs` has no ignore entries for `.claude/worktrees/` or `docs/design/screens/support.js`, so the bare `lint` script reports 9 errors belonging to no file in this checkout. Use `npx eslint app lib components`.
3. `PatternData.fit.semiFitted` reads `semi-ajustado` where the new `NewPatternForm.value.fit.semiFitted` reads `Semiajustado` (correct post-2009 orthography). One word, values-only, but it is drafter text baked into DXF/PLT/SVG exports, so it wants its own change.
4. Two throwaway dev accounts remain in the dev database (`form-visual-*@moldai.test`), verified by a scoped script because `SMTP_HOST` is unset on the host so the signup link went to stdout rather than Mailpit.
5. Three lessons recorded as candidates (L-018..L-020); they need a second corroboration each before they confirm.
