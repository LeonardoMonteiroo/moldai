import {
  addMessage,
  applyGarmentSpec,
  bumpVersion,
  seedPatternState,
} from "@/lib/editor/state";
import type { Pattern, PatternState, SloperData } from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";

/**
 * Snapshots a drafted pattern as a reusable base. Throws on a pattern with no
 * spec: the routes check `pieces.length === 0 || !spec` first and answer 400,
 * so reaching here without one is a broken invariant, not user input — and
 * defaulting to a blouse the way validateSpec would is exactly the failure
 * `resolveDecision` learned to throw on.
 */
export function sloperFromPattern(pattern: Pattern, name: string): SloperData {
  if (!pattern.spec) throw new Error("sloperFromPattern: pattern has no spec");
  return {
    name,
    spec: pattern.spec,
    sizes: pattern.sizes,
    baseSize: pattern.baseSize,
    sizeTable: pattern.sizeTable,
    // Spread-if-present, not `sizeChartName: pattern.sizeChartName`: an
    // explicit `undefined` survives JSON.stringify as a *dropped* key here but
    // as a present-and-undefined key in memory, and the tests read `in`.
    ...(pattern.sizeChartName === undefined
      ? {}
      : { sizeChartName: pattern.sizeChartName }),
  };
}

/**
 * Builds a fresh, already-drafted PatternState from a base. Goes through the
 * same seedPatternState → applyGarmentSpec → bumpVersion path a generation
 * uses, so pieces, viewBox, baseMeasurements, the version and seam-conflict
 * detection all come from one place rather than a parallel one.
 *
 * Grading does not carry over: a base is a base size and a chart.
 */
export function patternFromSloper(
  sloper: SloperData,
  t: Translate,
): PatternState {
  const state = seedPatternState(t);
  state.pattern = {
    ...state.pattern,
    name: sloper.name,
    sizes: sloper.sizes,
    baseSize: sloper.baseSize,
    sizeTable: sloper.sizeTable,
    sizesApplied: [],
    sizesPending: sloper.sizes,
    ...(sloper.sizeChartName === undefined
      ? {}
      : { sizeChartName: sloper.sizeChartName }),
  };
  applyGarmentSpec(state, sloper.spec, t);
  bumpVersion(state);
  addMessage(state, {
    id: `msg-${Date.now()}-ai`,
    author: "ai",
    text: t("chat.fromSloper", { name: sloper.name }),
    createdAt: Date.now(),
  });
  return state;
}
