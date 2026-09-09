import type { DraftingEngine, EngineDraft } from "../types";
import { FREESEWING_CAPABILITY } from "../capability";
import { draftTshirt } from "./designs/tshirt";
import { draftBlouse } from "./designs/blouse";
import { draftSkirt } from "./designs/skirt";
import { draftTrousers } from "./designs/trousers";
import { draftHoodie } from "./designs/hoodie";
import { draftJett } from "./designs/jett";
import { draftShirt } from "./designs/shirt";

// #269: the freesewing DraftingEngine -- registered in
// lib/draft/engine/registry.ts alongside moldai. Dispatches by
// `spec.type` (our own GarmentType vocabulary, never an upstream design's
// own codename); tshirt/blouse/skirt/trousers/hoodie/coat/shirt are wired
// today (each design wrapper's own file explains why the upstream name
// stays confined to one import line there), matching
// FREESEWING_CAPABILITY.types -- dress was evaluated and declined (Sophie,
// Sasha; neither maps to moldai's own bodice+skirt dress concept, see
// docs/decisions/drafting.md), not deferred. A caller reaching
// this for an unsupported type is a bug in the caller,
// not user input -- checkEngineSupport (lib/draft/engine/capability.ts)
// is the actual gate a route/store checks BEFORE ever calling draft(),
// the same "checkEngineSupport gates, draft() trusts its caller already
// gated" contract moldai.ts's own draft() relies on (garment.ts's
// draftAll has no type-support branch of its own either).
export const freesewingEngine: DraftingEngine = {
  id: "freesewing",
  capability: FREESEWING_CAPABILITY,
  // #249: `referenceMeasurements` was previously accepted by
  // DraftingEngine.draft's own declared signature but silently dropped
  // here -- every other design ignores it (no other archetype reads an
  // absolute, chart-relative style length the way skirtLengthCm does), but
  // "skirt" needs it forwarded to draftSkirt so an explicit
  // style.skirtLengthCm grades correctly across sizes on THIS engine too,
  // not only on "moldai" (lib/draft/engine/freesewing/designs/skirt.ts).
  draft(spec, base, t, referenceMeasurements): EngineDraft {
    switch (spec.type) {
      case "tshirt":
        return draftTshirt(spec, base, t);
      case "blouse":
        return draftBlouse(spec, base, t);
      case "skirt":
        return draftSkirt(spec, base, t, referenceMeasurements);
      case "trousers":
        return draftTrousers(spec, base, t);
      case "hoodie":
        return draftHoodie(spec, base, t);
      case "coat":
        return draftJett(spec, base, t);
      case "shirt":
        return draftShirt(spec, base, t);
      default:
        throw new Error(
          `freesewing engine: no design wired for garment type "${spec.type}"`,
        );
    }
  },
};
