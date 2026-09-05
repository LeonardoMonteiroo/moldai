import type { GarmentSpec } from "@/lib/types";
import type { Measurements } from "@/lib/measurements";
import type { Translate } from "@/lib/i18n/translate";
import type { EngineCapability, EngineId } from "@/lib/draft/engine/capability";
import { checkEngineSupport } from "@/lib/draft/engine/capability";
import { draftGarment } from "@/lib/draft/engine/facade";
import { seamCheck } from "@/lib/draft/garment";
import type { Combination } from "./combinations";
import { expectsArmholeCapConflict } from "./combinations";

// #269 Fase 5 (dataset): the shared "does this enumerated combination
// actually draft" check -- deliberately NOT lib/ai/eval/score.ts's
// `draftSucceeds`. That helper requires a fully empty seamCheck, which is
// the wrong bar for a combination naming `armholeDeepenCm`: that field's own
// documented behavior (lib/ai/prompt.ts's own armholeDeepenCm line) is to
// deepen the body's armhole WITHOUT touching the sleeve cap, which BY
// DESIGN produces a real "armhole-cap" seam conflict the user resolves via
// "Corrigir manga" -- `sleeveRefit` (the field that would pre-empt this) is
// internal-only, so no spec a generated combination sets can avoid it.
//
// One shared helper so combinations.test.ts (pinning the default seed's
// output) and scripts/generate-training-data.ts (re-verifying whatever
// seed/options a real run actually used, before spending a token) can't
// drift into two different definitions of "drafts cleanly".
export function draftsCleanly(
  engine: EngineId,
  capability: EngineCapability,
  combo: Combination,
  spec: GarmentSpec,
  baseRow: Measurements,
  t: Translate,
): boolean {
  const gaps = checkEngineSupport(capability, spec, baseRow);
  if (gaps.some((g) => g.kind === "type" || g.kind === "measurements")) {
    return false;
  }
  try {
    const { pieces, seamGraph } = draftGarment(engine, spec, baseRow, t);
    if (pieces.length === 0) return false;
    const conflicts = seamCheck(seamGraph);
    if (expectsArmholeCapConflict(combo)) {
      return conflicts.every((c) => c.key === "armhole-cap");
    }
    return conflicts.length === 0;
  } catch {
    return false;
  }
}
