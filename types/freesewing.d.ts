// None of the @freesewing/* packages publish TypeScript types (verified: no
// .d.ts file and no "types"/"typings" field in any installed package.json).
// lib/draft/engine/freesewing/geometry.ts already narrows its OWN input to
// the minimal FreesewingPathOp/FreesewingPath shape it actually reads, so
// this file exists only so importing a design PACKAGE itself (`new
// Teagan(...)`, `pattern.draft()`, `pattern.parts`) type-checks at all --
// narrowed to the properties this repo's adapter actually touches, not a
// full model of @freesewing/core's API surface. Every design package
// shares the identical shape (a `Design` subclass with `patternConfig`/
// `parts`/`draft()`), so it's declared ONCE here and reused per package,
// rather than repeating the same five interfaces per `declare module`
// block -- add one `type X = FreesewingDesignClass` line per design
// package as the freesewing engine grows to cover more archetypes (see
// docs/architecture/drafting.md).

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
  context: {
    settings: { options: Record<string, unknown> };
  };
}
interface FreesewingPatternConfig {
  measurements: string[];
  optionalMeasurements: string[];
}
declare class FreesewingDesignClass {
  static patternConfig: FreesewingPatternConfig;
  parts: Record<string, FreesewingPart>[];
  constructor(settings: {
    measurements: Record<string, number>;
    options?: Record<string, unknown>;
  });
  draft(): void;
}

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
  export class Teagan extends FreesewingDesignClass {}
}

declare module "@freesewing/diana" {
  export class Diana extends FreesewingDesignClass {}
}

declare module "@freesewing/sandy" {
  export class Sandy extends FreesewingDesignClass {}
}

declare module "@freesewing/titan" {
  export class Titan extends FreesewingDesignClass {}
}

declare module "@freesewing/hugo" {
  export class Hugo extends FreesewingDesignClass {}
}
