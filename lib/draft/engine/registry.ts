import { moldaiEngine } from "./moldai";
import type { DraftingEngine } from "./types";
import type { EngineId } from "./capability";

// #267: every registered drafting engine. Only "moldai" is registered by
// this issue -- see docs/decisions/drafting.md's #266->#267 entry for why adding a
// second one is a separate, later decision, not a reason to build this
// registry speculatively wider than it needs to be today.
export const ENGINES: Record<EngineId, DraftingEngine> = {
  moldai: moldaiEngine,
};

export function getEngine(id: EngineId): DraftingEngine {
  return ENGINES[id];
}
