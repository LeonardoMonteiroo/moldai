// None of the @freesewing/* packages publish TypeScript types (verified: no
// .d.ts file and no "types"/"typings" field in any installed package.json).
// lib/draft/engine/freesewing/geometry.ts already narrows its OWN input to
// the minimal FreesewingPathOp/FreesewingPath shape it actually reads, so
// this file exists only so importing a design PACKAGE itself (`new
// Teagan(...)`, `pattern.draft()`, `pattern.parts`) type-checks at all --
// narrowed to the properties this repo's adapter actually touches, not a
// full model of @freesewing/core's API surface. Add one `declare module`
// block per design package as the freesewing engine grows to cover more
// archetypes (see docs/architecture/drafting.md).

// scripts/backfill-freesewing-measurements.ts's only consumer -- a plain
// { [sizeKey: string]: { chest: number, ...everything else: number } } bag
// of reference bodies, indexed by an arbitrary size-code string (e.g. "38"),
// never by our own SizeLabel. Not used by the shipped app itself.
declare module "@freesewing/models" {
  type ReferenceBody = Record<string, number>;
  export const cisFemaleAdult: Record<string, ReferenceBody>;
  export const cisMaleAdult: Record<string, ReferenceBody>;
}

declare module "@freesewing/teagan" {
  interface FreesewingPoint {
    x: number;
    y: number;
  }
  interface FreesewingPathOp {
    type: "move" | "line" | "curve" | "close";
    to?: FreesewingPoint;
    cp1?: FreesewingPoint;
    cp2?: FreesewingPoint;
  }
  interface FreesewingPath {
    ops: FreesewingPathOp[];
    length(): number;
  }
  interface FreesewingPart {
    paths: Record<string, FreesewingPath>;
    points: Record<string, FreesewingPoint>;
  }
  interface FreesewingPatternConfig {
    measurements: string[];
    optionalMeasurements: string[];
  }
  export class Teagan {
    static patternConfig: FreesewingPatternConfig;
    parts: Record<string, FreesewingPart>[];
    constructor(settings: {
      measurements: Record<string, number>;
      options?: Record<string, unknown>;
    });
    draft(): void;
  }
}
