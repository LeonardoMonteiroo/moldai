import type { ImageMediaType } from "@/lib/editor/attachment";
import type { GarmentSpec } from "@/lib/types";

// The propose call's inputs, named once. This module exists to break an
// import cycle rather than to add a layer: prompt.ts needs ProposeOptions
// for buildDynamicSection/buildSystem's own signature and index.ts needs
// both types, so neither of those two files can own them.
//
// #18: the prepared (already downscaled/re-encoded) attachment
// proposeGarment forwards to the model, one image content block per entry --
// never persisted, see lib/editor/attachment.ts. Re-exported from
// lib/ai/index.ts, where it used to be declared, so no importer has to know
// it moved.
export interface ProposeImage {
  mediaType: ImageMediaType;
  base64: string;
}

// An options object rather than positional parameters: formSpec and images
// would make proposeGarment six positional parameters and
// buildDynamicSection four. The signature stays readable for the next
// addition, at the cost of a mechanical change to three call sites.
export interface ProposeOptions {
  answering: boolean;
  images?: ProposeImage[];
  importContext?: string;
  // The user's own explicit choices, already through validateFormSpec. Its
  // presence is what emits the prompt's "# Fields already decided by the
  // user" section; the structural guarantee is the merge the route applies
  // afterwards, not this.
  formSpec?: GarmentSpec;
  // #276: true only for scripts/ai-eval.ts's own calls. Read solely to tag
  // this call's Langfuse trace (lib/observability/langfuse.ts) so eval-
  // harness traffic is distinguishable from the generate route's real
  // production traffic -- never read for any other purpose. Defaults to
  // false (production) when omitted, so every existing ProposeOptions call
  // site keeps typechecking unchanged.
  evalRun?: boolean;
}
