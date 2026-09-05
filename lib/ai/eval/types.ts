import type { GarmentType, GarmentSpec, GarmentStyle } from "@/lib/types";
import type { Decision } from "@/lib/ai/decision";
import type { SpecField } from "@/lib/draft/specDiff";

// #252: the eval harness's two fixture shapes. Neither carries a real
// PatternState -- the runner (scripts/ai-eval.ts) builds one from
// seedPatternState + a fixed size snapshot, so a fixture stays a plain,
// diffable data literal, the same reason lib/draft/fixtures.ts's
// DECORATION_CASES are `[string, GarmentSpec][]` rather than a built
// PatternState.

/**
 * A single "from scratch" chat turn: a pt-BR prompt, and what the model is
 * expected to decide. `expectedType`/`expectedStyle` are only checked when
 * `expectedDecision === "apply"` -- an unlisted style field is not asserted,
 * so a case can pin only the fields the prompt actually determines.
 */
export interface GenerationCase {
  id: string;
  prompt: string;
  expectedDecision: Decision;
  expectedType?: GarmentType;
  expectedStyle?: Partial<GarmentStyle>;
}

/**
 * An edit turn against an already-drafted spec: the instruction should move
 * every field in `expectedChanged` and none of `expectedUnchanged` --
 * the latter is the collateral-drift check, scored with
 * lib/draft/specDiff.ts's diffSpec against the SAME baseSpec the case
 * declares, never a second ad-hoc comparison.
 */
export interface EditingCase {
  id: string;
  baseSpec: GarmentSpec;
  instruction: string;
  expectedChanged: SpecField[];
  expectedUnchanged: SpecField[];
}
