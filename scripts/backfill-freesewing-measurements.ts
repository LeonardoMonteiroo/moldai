import { pathToFileURL } from "node:url";
import { PrismaClient, Prisma } from "@prisma/client";
import { cisFemaleAdult, cisMaleAdult } from "@freesewing/models";
import { reportError } from "../lib/observability/report";
import {
  FRONT_BACK_LENGTH_DELTA_CM,
  type Measurements,
} from "../lib/measurements";

// #269: registering FreeSewing as a second drafting engine added 14 keys
// directly to lib/measurements.ts's CORE_MEASUREMENT_KEYS (not the optional
// EXTENDED tier, which always has a graceful moldai-side fallback formula --
// these don't). Per the migration-safety review that preceded this script:
// making those 14 keys required in the shared Zod schema WITHOUT first
// backfilling every already-persisted `Measurements` row makes the read
// boundary (PatternStateSchema/SizeChartDataSchema/SloperDataSchema.
// safeParse) reject the WHOLE blob for any row that predates this change --
// not "redraft throws," but the row silently vanishing from every list and
// 404ing on direct open, with the SizeChart case additionally deadlocking
// the lazy system-chart reseed (a raw-SQL partial unique index still sees
// the unparseable old row as "the system chart"). This script must run
// (with --apply) BEFORE that Zod tightening is deployed against real data.
//
// Every value is INTERPOLATED from @freesewing/models' own reference bodies
// (cisFemaleAdult/cisMaleAdult, the same tables lib/draft/engine/freesewing's
// design wrappers are measured against in docs/reference/freesewing-spike),
// keyed on the row's OWN `bust` girth at that size -- not an arbitrary
// guess, and not a flat constant repeated across every size the way a
// simpler backfill might be tempted to do.
const prisma = new PrismaClient();

const NEW_KEYS = [
  "waistToArmpit",
  "shoulderToWrist",
  "wrist",
  "underbust",
  "bustPointToUnderbust",
  "bustFront",
  "waistToUnderbust",
  "seat",
  "waistToSeat",
  "waistToKnee",
  "waistToFloor",
  "inseam",
  "shoulderToElbow",
  "head",
  // #269: these four were already EXTENDED (optional, each with a moldai-
  // side fallback formula) -- promoted to CORE alongside the 14 genuinely
  // new keys above because a FreeSewing design requires them outright (no
  // fallback for FreeSewing to fall back to). A row that never set one
  // (most don't -- these have always been optional) needs the identical
  // backfill treatment, or promoting them to CORE breaks it the same way
  // leaving them out would.
  "bicep",
  "bustPointHeight",
  "neckGirth",
  "bustSpan",
  // #269 (trousers/Titan follow-up): 6 more genuinely new keys -- a fitted
  // trouser block (Titan, and every other trouser design in the FreeSewing
  // collection) splits front/back at waist and seat, which moldai's own
  // flat `rise` never captured. Same treatment, same source, run again
  // AFTER the first 18 keys were already backfilled -- re-running this
  // whole script is still idempotent (backfillRow only fills a key that's
  // currently missing/non-finite), so it's safe to append here and re-run
  // rather than writing a second script.
  "crossSeam",
  "crossSeamFront",
  "knee",
  "seatBack",
  "waistBack",
  "waistToUpperLeg",
  // #269 (coat/Jett follow-up): a placket-front coat needs the front
  // bodice length independently of backLength -- see lib/measurements.ts's
  // own comment. Same idempotent re-run story as the trousers follow-up,
  // but NOT sourced via `interpolate` below -- see DERIVED_FROM_BACK_LENGTH.
  "hpsToWaistFront",
] as const satisfies readonly (keyof Measurements)[];

// Our own key name -> @freesewing/models' key name, wherever they differ.
const FS_KEY: Partial<Record<(typeof NEW_KEYS)[number], string>> = {
  bicep: "biceps",
  bustPointHeight: "hpsToBust",
  neckGirth: "neck",
};

// #269 (coat/Jett follow-up, migration-safety catch): @freesewing/models'
// own `hpsToWaistFront` is flagged by its own upstream maintainers as a
// rough placeholder (neckstimate.mjs: `hpsToWaistFront: [400, 460], //
// FIXME: Estimate`), and interpolating it independently of `backLength`
// produced a front/back relationship that flipped sign across the female
// size range -- caught before this script ever ran with --apply. Derived
// from the row's OWN already-present `backLength` instead (a flat,
// per-gender delta -- see lib/measurements.ts's own
// FRONT_BACK_LENGTH_DELTA_CM), which is monotonic by construction and
// never touches the flagged-as-estimate upstream figure at all.
const DERIVED_FROM_BACK_LENGTH = new Set<(typeof NEW_KEYS)[number]>([
  "hpsToWaistFront",
]);

type FsModel = Record<string, Record<string, number>>;

function interpolate(
  model: FsModel,
  targetChestMm: number,
  key: string,
): number {
  const rows = Object.values(model).sort((a, b) => a.chest - b.chest);
  if (targetChestMm <= rows[0].chest) return rows[0][key];
  const last = rows[rows.length - 1];
  if (targetChestMm >= last.chest) return last[key];
  for (let i = 0; i < rows.length - 1; i++) {
    const a = rows[i];
    const b = rows[i + 1];
    if (targetChestMm >= a.chest && targetChestMm <= b.chest) {
      const t = (targetChestMm - a.chest) / (b.chest - a.chest);
      return a[key] + t * (b[key] - a[key]);
    }
  }
  /* c8 ignore next */
  throw new Error(
    "interpolate: unreachable (rows sorted, bounds already checked)",
  );
}

/**
 * Fills every missing NEW_KEYS field on `row` in place, sourced from
 * @freesewing/models at the row's OWN bust girth. Returns whether anything
 * was actually added, so a caller can skip a no-op write. A row missing or
 * with a non-finite `bust` (a genuinely corrupt legacy entry, pre-dating
 * even the original nine CORE keys) is left untouched and reported --
 * fabricating a value from nothing would be worse than leaving the gap for
 * `assertResolvedMeasurements` to report honestly.
 */
export function backfillRow(
  row: Record<string, unknown> & { bust?: unknown; backLength?: unknown },
  gender: "female" | "male",
): boolean {
  if (typeof row.bust !== "number" || !Number.isFinite(row.bust)) return false;
  const model = gender === "male" ? cisMaleAdult : cisFemaleAdult;
  let changed = false;
  for (const key of NEW_KEYS) {
    const existing = row[key];
    if (typeof existing === "number" && Number.isFinite(existing)) continue;
    if (DERIVED_FROM_BACK_LENGTH.has(key)) {
      // backLength is one of the original nine CORE keys -- present on
      // every row that ever passed assertResolvedMeasurements, even the
      // oldest legacy ones. Still guarded (never fabricate from nothing),
      // matching the same discipline the `bust` check above already uses.
      if (
        typeof row.backLength !== "number" ||
        !Number.isFinite(row.backLength)
      ) {
        continue;
      }
      row[key] =
        Math.round((row.backLength + FRONT_BACK_LENGTH_DELTA_CM[gender]) * 10) /
        10;
      changed = true;
      continue;
    }
    const mm = interpolate(model, row.bust * 10, FS_KEY[key] ?? key);
    row[key] = Math.round((mm / 10) * 10) / 10; // cm, 0.1 precision
    changed = true;
  }
  return changed;
}

function genderOf(spec: unknown): "female" | "male" {
  const g = (spec as { gender?: unknown } | null)?.gender;
  return g === "male" ? "male" : "female";
}

async function backfillPatterns(apply: boolean) {
  const rows = await prisma.pattern.findMany({
    select: { id: true, data: true },
  });
  let touched = 0;
  for (const row of rows) {
    const data = row.data as Prisma.JsonObject;
    const pattern = data?.pattern as Prisma.JsonObject | undefined;
    if (!pattern) continue;
    const gender = genderOf(pattern.spec);
    let changed = false;
    const sizeTable = pattern.sizeTable as
      Record<string, Record<string, unknown> & { bust?: unknown }> | undefined;
    if (sizeTable) {
      for (const size of Object.keys(sizeTable)) {
        if (backfillRow(sizeTable[size], gender)) changed = true;
      }
    }
    const baseMeasurements = pattern.baseMeasurements as
      (Record<string, unknown> & { bust?: unknown }) | undefined;
    if (baseMeasurements && backfillRow(baseMeasurements, gender))
      changed = true;
    if (changed) {
      touched++;
      if (apply) {
        await prisma.pattern.update({ where: { id: row.id }, data: { data } });
      }
    }
  }
  console.log(`[backfill] Pattern: ${touched}/${rows.length} row(s) touched`);
}

async function backfillSizeCharts(apply: boolean) {
  const rows = await prisma.sizeChart.findMany({
    select: { id: true, data: true },
  });
  let touched = 0;
  for (const row of rows) {
    const data = row.data as Prisma.JsonObject;
    if (!data) continue;
    const gender = genderOf(data);
    const baseMeasurements = data.baseMeasurements as
      (Record<string, unknown> & { bust?: unknown }) | undefined;
    const changed = baseMeasurements
      ? backfillRow(baseMeasurements, gender)
      : false;
    if (changed) {
      touched++;
      if (apply) {
        await prisma.sizeChart.update({
          where: { id: row.id },
          data: { data },
        });
      }
    }
  }
  console.log(`[backfill] SizeChart: ${touched}/${rows.length} row(s) touched`);
}

async function backfillSlopers(apply: boolean) {
  const rows = await prisma.sloper.findMany({
    select: { id: true, data: true },
  });
  let touched = 0;
  for (const row of rows) {
    const data = row.data as Prisma.JsonObject;
    if (!data) continue;
    const gender = genderOf(data.spec);
    let changed = false;
    const sizeTable = data.sizeTable as
      Record<string, Record<string, unknown> & { bust?: unknown }> | undefined;
    if (sizeTable) {
      for (const size of Object.keys(sizeTable)) {
        if (backfillRow(sizeTable[size], gender)) changed = true;
      }
    }
    if (changed) {
      touched++;
      if (apply) {
        await prisma.sloper.update({ where: { id: row.id }, data: { data } });
      }
    }
  }
  console.log(`[backfill] Sloper: ${touched}/${rows.length} row(s) touched`);
}

// PatternVersion.sizeTable is its own top-level Json COLUMN (not nested
// under `data`), and -- per the migration-safety review's own finding --
// has NO Zod schema at all (lib/db/patternVersion.ts's `toRecord` is a bare
// cast). Left un-backfilled, restoring an old version would write its
// stale, 14-keys-short sizeTable straight onto a Pattern row that this
// script already fixed, silently re-breaking it on that Pattern's next
// load. Backfilling PatternVersion history closes that path at the source.
async function backfillPatternVersions(apply: boolean) {
  const rows = await prisma.patternVersion.findMany({
    select: { id: true, spec: true, sizeTable: true },
  });
  let touched = 0;
  for (const row of rows) {
    const gender = genderOf(row.spec);
    const sizeTable = row.sizeTable as Record<
      string,
      Record<string, unknown> & { bust?: unknown }
    > | null;
    if (!sizeTable) continue;
    let changed = false;
    for (const size of Object.keys(sizeTable)) {
      if (backfillRow(sizeTable[size], gender)) changed = true;
    }
    if (changed) {
      touched++;
      if (apply) {
        await prisma.patternVersion.update({
          where: { id: row.id },
          data: { sizeTable: sizeTable as Prisma.InputJsonValue },
        });
      }
    }
  }
  console.log(
    `[backfill] PatternVersion: ${touched}/${rows.length} row(s) touched`,
  );
}

export async function main(apply: boolean) {
  console.log(
    `[backfill] mode: ${apply ? "APPLY (writing)" : "DRY RUN (no writes)"}`,
  );
  await backfillPatterns(apply);
  await backfillSizeCharts(apply);
  await backfillSlopers(apply);
  await backfillPatternVersions(apply);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const apply = process.argv.includes("--apply");
  main(apply)
    .then(() => process.exit(0))
    .catch((e) => {
      reportError("backfill-freesewing-measurements", e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
