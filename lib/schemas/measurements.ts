import { z } from "zod";
import { MEASUREMENT_KEYS } from "@/lib/measurements";

// Built from MEASUREMENT_KEYS (the same list the size-chart table and
// validateSpec iterate) instead of a hand-written field list, so a new
// Measurements field only needs adding there. z.number() already rejects
// NaN as its own type (distinct from `number`), which matters here: a blob
// missing a required key isn't representable as valid JSON NaN, but a
// caller merging `{...undefined}` onto it downstream is exactly the
// corruption issue #58 describes -- this schema stops that at the read
// boundary by requiring every key to be present and finite.
export const MeasurementsSchema = z.object(
  Object.fromEntries(MEASUREMENT_KEYS.map((k) => [k, z.number()])) as Record<
    (typeof MEASUREMENT_KEYS)[number],
    z.ZodNumber
  >,
);
