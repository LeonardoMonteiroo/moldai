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
