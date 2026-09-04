import { moldaiEngine } from "./moldai";
import { freesewingEngine } from "./freesewing";
import type { DraftingEngine } from "./types";
import type { EngineId } from "./capability";

// #267/#269: every registered drafting engine. "freesewing" is #269's
// registration -- see docs/decisions/drafting.md's #266->#267 entry for
// the original registry design, and its #269 entry for why FreeSewing
// (not GarmentCode) was the candidate registered.
export const ENGINES: Record<EngineId, DraftingEngine> = {
  moldai: moldaiEngine,
  freesewing: freesewingEngine,
};

export function getEngine(id: EngineId): DraftingEngine {
  return ENGINES[id];
}
