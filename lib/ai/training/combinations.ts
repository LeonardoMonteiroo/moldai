import type {
  GarmentType,
  Gender,
  GarmentSpec,
  GarmentStyle,
} from "@/lib/types";
import type {
  EngineCapability,
  CapabilityStyleField,
  StyleEnums,
} from "@/lib/draft/engine/capability";
import { MOLDAI_CAPABILITY } from "@/lib/draft/engine/capability";

// #269 Fase 5 (dataset): the combinatorial-generator pivot named in
// docs/decisions/ai-provider.md's "Decisão, then a measured reversal" entry
// and docs/reference/lora-training/README.md's Step 2 -- enumerate
// MOLDAI_CAPABILITY's own supported (type, style-field) combinations
// directly, so a generated example is in-scope by construction, never by
// the luck a corpus built for a broader capability (the pattern-catalog-
// benchmark) turned out not to have.
//
// A LEAF module, the same footing as lib/draft/vocabulary.ts and
// lib/draft/engine/capability.ts themselves: only type-only imports of
// GarmentSpec/GarmentStyle plus the runtime `MOLDAI_CAPABILITY` object, no
// drafter, no validateSpec, no network. The free `draftSucceeds` pre-filter
// the design calls for is NOT run here -- it needs draftGarment/validateSpec,
// which would pull the whole drafting engine into what is otherwise a
// pure-data enumerator reusable from a test, a script, or (eventually) a
// client-side dry-run preview. It runs in combinations.test.ts (as a
// regression pin) and again in scripts/generate-training-data.ts (as the
// real runtime filter, before a single token is spent) -- both non-leaf
// callers that already depend on the drafting engine elsewhere.
//
// Every enum/numeric-bound value drawn here comes from the capability
// itself (styleFieldsByType/styleEnumsByType/styleLimits) -- never a second,
// hardcoded catalog. The only genuinely new data this file adds is (a) a
// small table of representative sample points inside each numeric field's
// declared range (NUMERIC_SAMPLE_VALUES) and (b) the hand-curated
// DECLINE_CASES list, both called out below.

export type CombinationFieldValue = string | number | boolean;

export interface Combination {
  /** Stable, deterministic id: `${type}|${gender}|field=value&field=value...` */
  key: string;
  type: GarmentType;
  gender: Gender;
  fields: Partial<Record<CapabilityStyleField, CombinationFieldValue>>;
  arity: number;
}

/**
 * A hand-curated request MOLDAI_CAPABILITY genuinely does not draft --
 * derived from the same gaps lib/ai/prompt.ts's own prose already names
 * (Peter Pan collar, tapered/flare/skinny trouser leg, elastic/contoured
 * waistband, a lined/lapelled jacket) plus the three GarmentTypes this app's
 * own vocabulary (lib/draft/vocabulary.ts's TYPES) accepts as legitimate
 * requests but MOLDAI_CAPABILITY.types deliberately excludes (hoodie/coat/
 * shirt -- freesewing-only, no moldai drafter exists). `type: null` marks a
 * gap no supported garment type covers at all (a jacket, a hoodie: there is
 * no MOLDAI_CAPABILITY type to attach it to); a CONCRETE `type` marks a
 * shape/silhouette gap on a type the capability otherwise drafts fine, which
 * is why combinations.test.ts asserts every non-null `type` here IS
 * supported.
 */
export interface DeclineCase {
  key: string;
  type: GarmentType | null;
  reasonTag: string;
}

// Not derived from the capability -- there is nothing to enumerate a "gap"
// from; a capability only states what it supports. Kept small and named
// after the exact prose in lib/ai/prompt.ts's own decision-policy /
// vocabulary-mapping sections, so this list drifts alongside that prompt
// text rather than inventing new claims about what's unsupported.
export const DECLINE_CASES: DeclineCase[] = [
  { key: "type-hoodie", type: null, reasonTag: "hoodie" },
  { key: "type-coat", type: null, reasonTag: "coat" },
  { key: "type-shirt-freesewing-only", type: null, reasonTag: "shirt" },
  { key: "collar-peterpan", type: "blouse", reasonTag: "peterPanCollar" },
  { key: "collar-peterpan-dress", type: "dress", reasonTag: "peterPanCollar" },
  { key: "trousers-cargo", type: "trousers", reasonTag: "cargoLeg" },
  { key: "trousers-flare", type: "trousers", reasonTag: "flareLeg" },
  { key: "trousers-skinny", type: "trousers", reasonTag: "skinnyLeg" },
  { key: "trousers-wide", type: "trousers", reasonTag: "wideLeg" },
  {
    key: "waistband-elastic-skirt",
    type: "skirt",
    reasonTag: "elasticWaistband",
  },
  {
    key: "waistband-elastic-trousers",
    type: "trousers",
    reasonTag: "elasticWaistband",
  },
  { key: "jacket-blazer", type: null, reasonTag: "tailoredJacket" },
  // #328: a godet INSERT (a triangular wedge sewn into a straight panel) is
  // not what `skirt: "gore"` drafts -- gore cuts the full-sweep flare into
  // whole wedge PANELS sewn to each other (#351), so no drafter produces a
  // wedge insert at all. A shape gap on a type the capability
  // otherwise drafts fine, hence `type: "skirt"`.
  { key: "skirt-godet-insert", type: "skirt", reasonTag: "godetInsert" },
];

// Representative sample points inside each numeric style field's declared
// STYLE_LIMITS range (lib/draft/vocabulary.ts) -- a discretization the
// capability itself doesn't declare (a continuous range has no finite
// enumeration), chosen as round, natural-to-say cm values rather than the
// bound's own min/max (which would skew every generated phrase toward an
// edge case a real customer rarely states). Asserted, in
// combinations.test.ts, to fall inside the capability's own range -- so a
// future STYLE_LIMITS change that shrinks a range is caught here rather than
// silently generating an out-of-range training example.
const NUMERIC_SAMPLE_VALUES: Record<
  keyof EngineCapability["styleLimits"],
  number[]
> = {
  necklineDepthCm: [3, 6, 10],
  skirtLengthCm: [40, 60, 90, 110],
  seamAllowanceCm: [1, 2, 3],
  armholeDeepenCm: [2, 4],
  trouserLengthCm: [70, 90, 100, 110],
  // #259: signed -- both a "cintura alta" (positive) and a "gancho baixo"
  // (negative) sample, plus a small positive value, inside STYLE_LIMITS.
  // riseCm's own [-10, 15] range.
  riseCm: [-6, 5, 10],
  // #351: deliberately empty -- gorePanels only shapes a `skirt: "gore"`
  // panel, and this combinator samples each field independently, so it
  // would pair "8 gomos" with a straight skirt as often as with a gore one
  // and teach the model a coupling the drafter ignores. buildFieldPool
  // skips an empty list, the same way it skips an empty enum.
  gorePanels: [],
};

interface FieldSpec {
  field: CapabilityStyleField;
  kind: "enum" | "numeric" | "boolean";
  values: CombinationFieldValue[];
}

// Derives the sampleable field/value pool for one GarmentType PURELY from
// the capability -- `styleFieldsByType[type]` gates which fields are even in
// play; `styleEnumsByType[type]`'s own keys (a real runtime object, never a
// second hardcoded field-name list) give every enum field; `styleLimits`'
// own keys give every numeric field; "darts" is the one boolean field, special-
// cased since it has no enum/limit table of its own.
function buildFieldPool(
  capability: EngineCapability,
  type: GarmentType,
): FieldSpec[] {
  const supported = new Set(capability.styleFieldsByType[type]);
  const pool: FieldSpec[] = [];
  const enumsForType = capability.styleEnumsByType[type];
  for (const field of Object.keys(enumsForType) as (keyof StyleEnums)[]) {
    if (!supported.has(field)) continue;
    const values = enumsForType[field];
    if (values.length === 0) continue;
    pool.push({ field, kind: "enum", values: [...values] });
  }
  for (const field of Object.keys(
    capability.styleLimits,
  ) as (keyof EngineCapability["styleLimits"])[]) {
    if (!supported.has(field)) continue;
    const values = NUMERIC_SAMPLE_VALUES[field];
    if (values.length === 0) continue;
    pool.push({ field, kind: "numeric", values });
  }
  if (supported.has("darts")) {
    pool.push({ field: "darts", kind: "boolean", values: [true, false] });
  }
  return pool;
}

// Deterministic PRNG (mulberry32) -- no dependency, reproducible across a
// resumed/re-run generation for the same seed, unlike Math.random().
function mulberry32(seed: number): () => number {
  let a = seed;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Real requests vary in richness -- a bare "quero uma blusa" and a
// four-clause request are both real, and a thin one is exactly what the
// prompt's own blank-pattern rule pushes toward decision=ask. Weighted so
// most combinations name 1-2 features (the common case) while a minority
// name up to 4, capped to however many fields this type's pool actually has.
const ARITY_WEIGHTS: [number, number][] = [
  [1, 0.3],
  [2, 0.35],
  [3, 0.25],
  [4, 0.1],
];

function pickArity(rng: () => number, maxAvailable: number): number {
  const capped = ARITY_WEIGHTS.filter(([arity]) => arity <= maxAvailable);
  if (capped.length === 0) return 1;
  const total = capped.reduce((sum, [, weight]) => sum + weight, 0);
  let r = rng() * total;
  for (const [arity, weight] of capped) {
    r -= weight;
    if (r <= 0) return arity;
  }
  return capped[capped.length - 1][0];
}

function comboKeyFor(
  type: GarmentType,
  gender: Gender,
  fields: Partial<Record<CapabilityStyleField, CombinationFieldValue>>,
): string {
  const parts = (Object.keys(fields) as CapabilityStyleField[])
    .sort()
    .map((f) => `${f}=${fields[f]}`);
  return `${type}|${gender}|${parts.join("&")}`;
}

// A hard ceiling on named fields per combination -- independent of
// ARITY_WEIGHTS' own soft distribution goal, and enforced at the point a
// field is actually added (see `setField` below) rather than as a
// post-hoc patch. Applying the cuff-needs-long-sleeve coupling AFTER the
// fields were already picked once silently produced a 5-field combination
// (caught by this generator's own combinations.test.ts) -- fixed by making
// `setField` the single place that both adds a field and enforces the cap.
const MAX_ARITY = 4;

function buildCombination(
  type: GarmentType,
  gender: Gender,
  anchorField: CapabilityStyleField,
  anchorValue: CombinationFieldValue,
  pool: FieldSpec[],
  rng: () => number,
): Combination {
  const fields: Partial<Record<CapabilityStyleField, CombinationFieldValue>> =
    {};

  // The one legality rule the design calls for: a cuff is only meaningful
  // alongside a long sleeve (lib/ai/prompt.ts's own cuff line: "only
  // meaningful with sleeve: long"). frontClosure being blouse-only, darts
  // being blouse/dress-only, and fit/stretch never co-occurring are already
  // enforced structurally -- buildFieldPool only ever offers a field the
  // type actually supports, so no cross-type combination is possible.
  function setField(
    field: CapabilityStyleField,
    value: CombinationFieldValue,
  ): void {
    if (field === "cuff" && value === "straight" && fields.sleeve !== "long") {
      const slotsNeeded = fields.sleeve === undefined ? 2 : 1;
      if (Object.keys(fields).length + slotsNeeded > MAX_ARITY) return;
      fields.cuff = value;
      fields.sleeve = "long";
      return;
    }
    if (field === "sleeve" && fields.cuff === "straight") {
      fields.sleeve = "long"; // cuff already forced this; a conflicting draw is simply overridden, not a second field
      return;
    }
    if (Object.keys(fields).length + (field in fields ? 0 : 1) > MAX_ARITY) {
      return;
    }
    fields[field] = value;
  }

  setField(anchorField, anchorValue);
  const targetArity = pickArity(rng, Math.min(pool.length, MAX_ARITY));
  const rest = shuffle(
    pool.filter((f) => f.field !== anchorField),
    rng,
  );
  for (const fieldSpec of rest) {
    if (Object.keys(fields).length >= targetArity) break;
    const value = fieldSpec.values[Math.floor(rng() * fieldSpec.values.length)];
    setField(fieldSpec.field, value);
  }
  return {
    key: comboKeyFor(type, gender, fields),
    type,
    gender,
    fields,
    arity: Object.keys(fields).length,
  };
}

export interface CombinationOptions {
  /** Deterministic seed -- same seed, same combinations, every run. */
  seed?: number;
  /** Minimum times every (type, field, value) triple must appear. Default 2. */
  targetTripleCoverage?: number;
  /** Safety cap on total combinations generated. Default 500. */
  maxTotal?: number;
}

/**
 * Enumerates a stratified sample of `apply`-shaped combinations covering
 * every (type, field, value) triple MOLDAI_CAPABILITY declares at least
 * `targetTripleCoverage` times (default 2). Deliberately does NOT attempt
 * full pairwise coverage of every field pair -- the full enum-only cross
 * product is ~3,250 combinations (blouse 864, dress 2,160, tshirt 216,
 * skirt 10, trousers 2) before numerics, so exhaustive pairwise coverage at
 * this dataset's budget is dishonest to promise. `coverageReport` below
 * reports pairwise coverage on the two highest-cardinality fields per type
 * as a measurement, not a guarantee.
 */
export function enumerateApplyCombinations(
  capability: EngineCapability = MOLDAI_CAPABILITY,
  opts: CombinationOptions = {},
): Combination[] {
  const rng = mulberry32(opts.seed ?? 269);
  const target = opts.targetTripleCoverage ?? 2;
  const maxTotal = opts.maxTotal ?? 500;
  const seenTriples = new Map<string, number>();
  const comboKeys = new Set<string>();
  const combos: Combination[] = [];

  for (const type of capability.types) {
    const pool = buildFieldPool(capability, type);
    if (pool.length === 0) continue;
    const triples = pool.flatMap((fieldSpec) =>
      fieldSpec.values.map((value) => ({ field: fieldSpec.field, value })),
    );
    for (const { field, value } of triples) {
      const tripleKey = `${type}:${field}=${value}`;
      while ((seenTriples.get(tripleKey) ?? 0) < target) {
        if (combos.length >= maxTotal) return combos;
        const gender: Gender = rng() < 0.5 ? "female" : "male";
        let combo: Combination | null = null;
        // Dedup retries -- collisions are rare for a large field pool
        // (blouse/dress) but genuinely likely for a small one (skirt's
        // 4-field pool has only 120 possible full combinations), so this
        // needs real headroom, not just a token attempt or two, before
        // conceding a slot as saturated. Never loops forever chasing one.
        for (let attempt = 0; attempt < 40; attempt++) {
          const candidate = buildCombination(
            type,
            gender,
            field,
            value,
            pool,
            rng,
          );
          if (!comboKeys.has(candidate.key)) {
            combo = candidate;
            break;
          }
        }
        // Retries exhausted: this triple's slot is effectively saturated by
        // dedup collisions. coverageReport's `underCovered` is what makes
        // this honest rather than silent -- combinations.test.ts asserts it
        // is empty for the shipped default seed.
        if (!combo) break;
        comboKeys.add(combo.key);
        combos.push(combo);
        for (const [f, v] of Object.entries(combo.fields)) {
          const k = `${type}:${f}=${v}`;
          seenTriples.set(k, (seenTriples.get(k) ?? 0) + 1);
        }
      }
    }
  }
  return combos;
}

export interface CoverageEntry {
  type: GarmentType;
  field: CapabilityStyleField;
  value: string;
  count: number;
}

export interface PairwiseCoverage {
  type: GarmentType;
  fieldA: CapabilityStyleField;
  fieldB: CapabilityStyleField;
  coveredPairs: number;
  totalPairs: number;
}

export interface CoverageReport {
  totalCombinations: number;
  perTriple: CoverageEntry[];
  /** Any triple below the target -- empty is the healthy case. */
  underCovered: CoverageEntry[];
  /** Reported, not asserted -- see enumerateApplyCombinations' own doc. */
  pairwise: PairwiseCoverage[];
}

export function coverageReport(
  capability: EngineCapability,
  combos: Combination[],
  targetTripleCoverage = 2,
): CoverageReport {
  const counts = new Map<string, CoverageEntry>();
  for (const combo of combos) {
    for (const [field, value] of Object.entries(combo.fields)) {
      const k = `${combo.type}:${field}=${value}`;
      const existing = counts.get(k);
      if (existing) existing.count++;
      else
        counts.set(k, {
          type: combo.type,
          field: field as CapabilityStyleField,
          value: String(value),
          count: 1,
        });
    }
  }
  const perTriple = [...counts.values()];
  const underCovered = perTriple.filter((e) => e.count < targetTripleCoverage);

  const pairwise: PairwiseCoverage[] = [];
  for (const type of capability.types) {
    const pool = [...buildFieldPool(capability, type)].sort(
      (a, b) => b.values.length - a.values.length,
    );
    const [a, b] = pool;
    if (!a || !b) continue;
    const seenPairs = new Set<string>();
    for (const combo of combos) {
      if (combo.type !== type) continue;
      const va = combo.fields[a.field];
      const vb = combo.fields[b.field];
      if (va !== undefined && vb !== undefined) seenPairs.add(`${va}|${vb}`);
    }
    pairwise.push({
      type,
      fieldA: a.field,
      fieldB: b.field,
      coveredPairs: seenPairs.size,
      totalPairs: a.values.length * b.values.length,
    });
  }

  return {
    totalCombinations: combos.length,
    perTriple,
    underCovered,
    pairwise,
  };
}

/**
 * The raw, untrusted-shaped payload validateSpec (lib/draft/garment.ts)
 * expects -- structurally a GarmentSpec, but built from a plain combination
 * rather than a real AI tool call, so it's returned as `unknown`-friendly
 * plain data rather than asserted to already BE a GarmentSpec (that
 * assertion is validateSpec's own job, at the caller, which is not a leaf).
 */
export function specPayloadFor(combo: Combination): {
  type: GarmentType;
  gender: Gender;
  measurementOverrides: Record<string, number>;
  style: Partial<Record<CapabilityStyleField, CombinationFieldValue>>;
} {
  return {
    type: combo.type,
    gender: combo.gender,
    measurementOverrides: {},
    style: { ...combo.fields },
  };
}

/**
 * True when this combination sets a nonzero `armholeDeepenCm` -- a style
 * field whose own documented behavior (lib/ai/prompt.ts's own
 * armholeDeepenCm line) is to deepen the body's armhole WITHOUT touching
 * the sleeve cap, which BY DESIGN produces a real "armhole-cap" seam
 * conflict the user resolves via "Corrigir manga". `sleeveRefit` (the field
 * that pre-empts this) is internal-only -- validateSpec discards it, so no
 * spec value a generated combination could set ever avoids this conflict.
 * A drafting check that demands a fully empty seamCheck (draftSucceeds'
 * own bar) would incorrectly reject every one of these as a drafting
 * failure; callers (combinations.test.ts, scripts/generate-training-data.ts)
 * use this to allow exactly the "armhole-cap" conflict through instead of
 * requiring zero conflicts -- discovered by this generator's own test, not
 * assumed in advance.
 */
export function expectsArmholeCapConflict(combo: Combination): boolean {
  const value = combo.fields.armholeDeepenCm;
  return typeof value === "number" && value > 0;
}

// Re-exported so a caller (the generator script, the test) can build the
// GarmentSpec-shaped style object with full type safety without importing
// GarmentSpec/GarmentStyle a second time from @/lib/types itself.
export type { GarmentSpec, GarmentStyle };
