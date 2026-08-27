import { z } from "zod";
import { MEASUREMENT_KEYS, type Measurements } from "@/lib/measurements";

// Built from MEASUREMENT_KEYS (the same list the size-chart table and
// validateSpec iterate) instead of a hand-written field list, so a new
// Measurements field only needs adding there. z.number() already rejects
// NaN as its own type (distinct from `number`), which matters here: a blob
// missing a required key isn't representable as valid JSON NaN, but a
// caller merging `{...undefined}` onto it downstream is exactly the
// corruption issue #58 describes -- this schema stops that at the read
// boundary by requiring every CORE key to be present and finite.
//
// #132: the six EXTENDED keys are then relaxed to `.optional()` via
// `.partial(mask)` -- a Pattern's already-frozen sizeTable snapshot, and
// every SizeChart persisted before this change, predates these fields
// entirely, and requiring them here would fail safeParse on every one of
// those existing rows the moment this schema (used by
// PatternStateSchema/SizeChartDataSchema/SloperDataSchema) reads them back.
//
// The mask is a small hardcoded literal, not derived from
// EXTENDED_MEASUREMENT_KEYS the way the base shape above is derived from
// MEASUREMENT_KEYS: that array is exported as the widened
// `(keyof Measurements)[]` (every other consumer just iterates it), so
// `Object.fromEntries(EXTENDED_MEASUREMENT_KEYS.map(...))` cast against
// `(typeof EXTENDED_MEASUREMENT_KEYS)[number]` resolves to the FULL
// `keyof Measurements` union, not just these six -- verified the hard way:
// it silently marked EVERY field (including `bust`) optional, which only
// surfaced as a type error in `Pattern`/`SizeChartRecord`/`SloperData`,
// several files away from the actual mistake. `measurements.test.ts` checks
// this mask's keys against EXTENDED_MEASUREMENT_KEYS at the value level, so
// a drift between them fails a test instead of silently reopening this gap.
export const MeasurementsSchema = z
  .object(
    Object.fromEntries(MEASUREMENT_KEYS.map((k) => [k, z.number()])) as Record<
      keyof Measurements,
      z.ZodNumber
    >,
  )
  .partial({
    neckGirth: true,
    highBust: true,
    shoulderSlope: true,
    backWidth: true,
    bicep: true,
    rise: true,
  });
