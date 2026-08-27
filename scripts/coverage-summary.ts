/**
 * Renders the merged coverage report as a markdown table for the GitHub run
 * summary (.github/workflows/ci.yml's `coverage` job pipes stdout into
 * $GITHUB_STEP_SUMMARY).
 *
 * It reads the thresholds out of vitest.config.ts rather than restating
 * them, so the summary can never claim a floor the gate is not actually
 * enforcing -- which is the whole reason this is a .ts file run through
 * tsx (already a dependency, for scripts/cron-renew.ts) instead of a plain
 * .mjs one.
 */
import { readFileSync } from "node:fs";
import config from "../vitest.config";

type Metric = "statements" | "branches" | "functions" | "lines";
const METRICS: Metric[] = ["statements", "branches", "functions", "lines"];

// `coverage` is a union across the v8/istanbul/custom providers, and the
// custom member declares no `thresholds` at all -- so the narrowing has to
// happen on the coverage object, not on the property.
const thresholds = (
  config.test?.coverage as
    { thresholds?: Partial<Record<Metric, number>> } | undefined
)?.thresholds;

let total: Record<Metric, { pct: number; covered: number; total: number }>;
try {
  ({ total } = JSON.parse(
    readFileSync("coverage/coverage-summary.json", "utf8"),
  ));
} catch {
  // The merge step failed before writing a report (a crashed run, a missing
  // blob artifact). Say so plainly instead of printing an empty table --
  // the job itself has already failed, this is only the explanation.
  console.log("## Coverage\n\nNo report was produced — see the job log.");
  process.exit(0);
}

const rows = METRICS.map((m) => {
  const floor = thresholds?.[m];
  const { pct, covered, total: n } = total[m];
  const ok = floor === undefined || pct >= floor;
  return `| ${m} | ${pct.toFixed(2)}% | ${floor === undefined ? "—" : `${floor}%`} | ${covered}/${n} | ${ok ? "✅" : "❌"} |`;
});

console.log(
  [
    "## Coverage",
    "",
    "| | measured | floor | covered | |",
    "| --- | ---: | ---: | ---: | :-: |",
    ...rows,
    "",
    "Both vitest projects merged (`node` + `dom`). The floor is a ratchet —",
    "raise it when coverage improves, never lower it to make a run pass.",
  ].join("\n"),
);
