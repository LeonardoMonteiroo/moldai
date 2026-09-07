import { draftAll } from "../garment";
import { MOLDAI_CAPABILITY } from "./capability";
import type { DraftingEngine, EngineDraft } from "./types";

// #267: the ONLY drafting engine registered by this issue -- wraps
// garment.ts's own draftAll (blouse/dress/skirt/tshirt/trousers via
// body.ts/sleeve.ts/skirt.ts/trousers.ts/subpieces.ts) into the declared
// DraftingEngine contract. This is the one file, besides garment.ts's own
// internal drafters, allowed to import draftAll directly.
export const moldaiEngine: DraftingEngine = {
  id: "moldai",
  capability: MOLDAI_CAPABILITY,
  draft(spec, base, t, referenceMeasurements): EngineDraft {
    const {
      drafted,
      measurements,
      armholeLenCm,
      sleeveArmholeCm,
      garmentLengthCm,
      seamPairs,
    } = draftAll(spec, base, t, referenceMeasurements);
    return {
      drafted,
      measurements,
      armholeLenCm,
      sleeveArmholeCm,
      garmentLengthCm,
      seamPairs,
    };
  },
};
