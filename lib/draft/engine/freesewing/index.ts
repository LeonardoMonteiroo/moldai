import type { DraftingEngine, EngineDraft } from "../types";
import { FREESEWING_CAPABILITY } from "../capability";
import { draftTshirt } from "./designs/tshirt";

// #269: the freesewing DraftingEngine -- registered in
// lib/draft/engine/registry.ts alongside moldai. Dispatches by
// `spec.type` (our own GarmentType vocabulary, never an upstream design's
// own codename); only "tshirt" (backed by @freesewing/teagan -- see that
// design wrapper's own file for why the upstream name stays confined to
// one import line) is wired today, matching FREESEWING_CAPABILITY.types.
// A caller reaching this for an unsupported type is a bug in the caller,
// not user input -- checkEngineSupport (lib/draft/engine/capability.ts)
// is the actual gate a route/store checks BEFORE ever calling draft(),
// the same "checkEngineSupport gates, draft() trusts its caller already
// gated" contract moldai.ts's own draft() relies on (garment.ts's
// draftAll has no type-support branch of its own either).
export const freesewingEngine: DraftingEngine = {
  id: "freesewing",
  capability: FREESEWING_CAPABILITY,
  draft(spec, base, t): EngineDraft {
    switch (spec.type) {
      case "tshirt":
        return draftTshirt(spec, base, t);
      default:
        throw new Error(
          `freesewing engine: no design wired for garment type "${spec.type}"`,
        );
    }
  },
};
