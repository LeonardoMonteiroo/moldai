# STATE

## Decisions

### AD-001

- **Decision**: An optional `EXTENDED_MEASUREMENT_KEYS` field whose fallback formula has no cited source tying it proportionally to bust/another core girth falls back to a flat, cited "typical/standard" constant (per gender when relevant) rather than an invented proportional scaling.
- **Reason**: `body.ts`/`sleeve.ts` already hold every existing drafting formula to a "cite a real source" bar (Aldrich, ikatbag.com, dresspatternmaking.com, muellerundsohn.com). Some real body measurements (e.g. `shoulderSlope`, and now `bustPointHeight`/`bustSpan`) are frame/torso characteristics with no cited girth-proportional relationship — inventing a scaling coefficient for them would fabricate precision the sourcing doesn't support.
- **Trade-off**: A flat fallback doesn't vary across PP→GG the way a proportional one would, so every size drafts from the identical assumed value until a real per-chart measurement is entered. Judged acceptable because the field is optional and editable, and the flat value is still real and cited — never an invented number.
- **Scope**: `lib/measurements.ts` (`EXTENDED_MEASUREMENT_KEYS`), `lib/sizeCharts/seed.ts` (system-chart seeding), and any future drafting feature adding a new optional measurement field — established by `shoulderSlope` (`lib/sizeCharts/seed.ts:63-68`), reaffirmed by `bustPointHeight`/`bustSpan` (`bust-dart-shaping` feature).
- **Date**: 2026-09-01
- **Status**: active

## Handoff
