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
  // #265: the display name of the piece the user had selected in the editor
  // when they sent this turn -- ALREADY resolved server-side (the generate
  // route looks the client's piece id up against this pattern's own
  // `pieces`, by id) before this options object is ever built. Never a raw
  // id, and never accepted here as free text: an unrecognized or stale id
  // resolves to undefined at that lookup, so this field is simply absent and
  // the turn behaves exactly as unscoped -- there is no validation branch to
  // add on this side of the boundary. Presence emits buildDynamicSection's
  // "# Scoped part" instruction, the same "presence turns on a prompt
  // section" shape formSpec above already uses.
  partScope?: string;
}
