import {
  MEASUREMENT_RANGES,
  Measurements,
  resolveMeasurements,
} from "@/lib/measurements";
import {
  ClarifyQuestion,
  Neckline,
  GarmentSpec,
  GarmentStyle,
  GarmentType,
  SleeveLength,
  SkirtSilhouette,
  Gender,
} from "@/lib/types";
import { autoLayout, DraftedPiece } from "./core";
import { BlockOpts, draftBody } from "./body";
import { draftSleeve } from "./sleeve";
import { draftSkirt } from "./skirt";
import type { Translate } from "@/lib/i18n/translate";

export const TYPES: GarmentType[] = ["blouse", "dress", "skirt", "tshirt"];
export const GENDERS: Gender[] = ["female", "male"];
export const NECKLINES: Neckline[] = ["straight", "V", "round"];
export const SLEEVES: SleeveLength[] = ["none", "short", "long"];
export const SKIRTS: SkirtSilhouette[] = [
  "straight",
  "a-line",
  "gore",
  "half-circle",
  "circle",
];

// Clamp bounds validateSpec applies to numeric style fields. Exported so the
// AI layer (lib/ai) quotes the same numbers in its prompt and tool schema —
// they must never drift from what actually gets enforced here.
export const STYLE_LIMITS = {
  necklineDepthCm: { min: 0, max: 15 },
  skirtLengthCm: { min: 25, max: 120 },
  seamAllowanceCm: { min: 0, max: 4 },
  armholeDeepenCm: { min: 0, max: 6 },
} as const;

const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
const pick = <T>(v: unknown, allowed: T[], def: T): T =>
  allowed.includes(v as T) ? (v as T) : def;
const num = (v: unknown, def: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

export function validateSpec(raw: unknown): GarmentSpec {
  const r = (raw ?? {}) as Record<string, unknown>;
  const style = (r.style ?? {}) as Record<string, unknown>;
  const ovRaw = (r.measurementOverrides ?? {}) as Record<string, unknown>;
  const overrides: Record<string, number> = {};
  for (const k of Object.keys(MEASUREMENT_RANGES)) {
    const v = ovRaw[k];
    if (typeof v === "number" && Number.isFinite(v)) overrides[k] = v; // range is applied in resolveMeasurements
  }
  const outStyle: GarmentStyle = {
    neckline:
      style.neckline !== undefined
        ? pick(style.neckline, NECKLINES, "straight")
        : undefined,
    sleeve:
      style.sleeve !== undefined
        ? pick(style.sleeve, SLEEVES, "none")
        : undefined,
    skirt:
      style.skirt !== undefined
        ? pick(style.skirt, SKIRTS, "straight")
        : undefined,
    necklineDepthCm:
      style.necklineDepthCm !== undefined
        ? clamp(
            num(style.necklineDepthCm, 0),
            STYLE_LIMITS.necklineDepthCm.min,
            STYLE_LIMITS.necklineDepthCm.max,
          )
        : undefined,
    skirtLengthCm:
      style.skirtLengthCm !== undefined
        ? clamp(
            num(style.skirtLengthCm, 60),
            STYLE_LIMITS.skirtLengthCm.min,
            STYLE_LIMITS.skirtLengthCm.max,
          )
        : undefined,
    seamAllowanceCm:
      style.seamAllowanceCm !== undefined
        ? clamp(
            num(style.seamAllowanceCm, 1),
            STYLE_LIMITS.seamAllowanceCm.min,
            STYLE_LIMITS.seamAllowanceCm.max,
          )
        : undefined,
    darts: typeof style.darts === "boolean" ? style.darts : undefined,
    armholeDeepenCm:
      style.armholeDeepenCm !== undefined
        ? clamp(
            num(style.armholeDeepenCm, 0),
            STYLE_LIMITS.armholeDeepenCm.min,
            STYLE_LIMITS.armholeDeepenCm.max,
          )
        : undefined,
    // sleeveRefit is internal (only the conflict resolver sets it); never comes from the AI.
  };
  return {
    type: pick(r.type, TYPES, "blouse"),
    gender: pick(r.gender, GENDERS, "female"),
    measurementOverrides: overrides,
    style: outStyle,
  };
}

export function validateQuestions(raw: unknown): ClarifyQuestion[] {
  if (!Array.isArray(raw)) return [];
  const out: ClarifyQuestion[] = [];
  for (const item of raw.slice(0, 4)) {
    const q = (item ?? {}) as Record<string, unknown>;
    const label = typeof q.label === "string" ? q.label.trim() : "";
    if (!label) continue;
    const optsRaw = Array.isArray(q.options) ? q.options : [];
    const options: string[] = [];
    for (const o of optsRaw) {
      const s = typeof o === "string" ? o.trim() : "";
      if (s && !options.includes(s)) options.push(s);
      if (options.length === 6) break;
    }
    if (options.length < 2) continue;
    out.push({
      id: `q${out.length}`,
      label,
      options,
      allowOther: q.allowOther === true,
    });
  }
  return out;
}

export function seamCheck(
  armholeLenCm?: number,
  sleeveArmholeCm?: number,
): { diffCm: number } | null {
  if (armholeLenCm == null || sleeveArmholeCm == null) return null;
  const diff = Math.abs(armholeLenCm - sleeveArmholeCm);
  return diff > 1 ? { diffCm: Math.round(diff * 10) / 10 } : null;
}

function draftAll(
  spec: GarmentSpec,
  baseMeasurements: Measurements,
  t: Translate,
): {
  drafted: DraftedPiece[];
  measurements: Measurements;
  armholeLenCm?: number;
  sleeveArmholeCm?: number;
} {
  const gender: Gender = spec.gender ?? "female";
  const measurements: Measurements = resolveMeasurements(
    baseMeasurements,
    spec.measurementOverrides,
  );
  const drafted: DraftedPiece[] = [];
  let armholeLenCm: number | undefined;
  let sleeveArmholeCm: number | undefined;

  const isBody =
    spec.type === "blouse" || spec.type === "dress" || spec.type === "tshirt";
  if (isBody) {
    const knit = spec.type === "tshirt";
    const lengthCm =
      spec.type === "dress"
        ? measurements.backLength
        : measurements.backLength + measurements.hipHeight + 5;
    const opts: BlockOpts = { gender, knit, lengthCm };
    // T-shirt base model: round neckline, no darts, short sleeve by default.
    const style: GarmentStyle =
      spec.type === "tshirt"
        ? {
            ...spec.style,
            neckline: spec.style.neckline ?? "round",
            darts: false,
            sleeve: spec.style.sleeve ?? "short",
          }
        : spec.style;
    const {
      front,
      back,
      armholeLenCm: a,
      armholeBaseLenCm,
    } = draftBody(measurements, style, t, opts);
    armholeLenCm = a;
    drafted.push(front, back);
    // The sleeve cap is sized from the BASE (un-adjusted) armhole — unless it's
    // already been refit (the sleeve-fix action sets style.sleeveRefit). This way
    // an armhole adjustment on the body alone makes the seams diverge → real conflict.
    const sleeveArmhole = style.sleeveRefit ? a : armholeBaseLenCm;
    const sleeve = draftSleeve(measurements, style, sleeveArmhole, t, opts);
    if (sleeve) {
      drafted.push(sleeve);
      // The armhole the drafted cap actually fits, measured from its own
      // curve — not the target argument (#78) — so seamCheck stays able to
      // detect a real cap/armhole mismatch instead of comparing an input to
      // itself.
      sleeveArmholeCm = sleeve.armholeLenCm;
    }
  }
  if (spec.type === "skirt" || spec.type === "dress") {
    drafted.push(draftSkirt(measurements, spec.style, t));
  }

  return { drafted, measurements, armholeLenCm, sleeveArmholeCm };
}

export function draftPiecesCm(
  spec: GarmentSpec,
  baseMeasurements: Measurements,
  t: Translate,
): DraftedPiece[] {
  return draftAll(spec, baseMeasurements, t).drafted;
}

// The pair of seam lengths seamCheck compares, without the pieces or the layout.
// Both are undefined for a garment with no armhole (a skirt). The conflict card
// and the canvas markers derive their numbers from here rather than reading them
// off a persisted ConflictInfo: they follow from the spec, so storing them beside
// the armholeDeepenCm that moved them would be the same duplication CLAUDE.md
// already removed twice (Pattern.savedAgo, Wallet.planLabel) — and deriving also
// gives the lengths to conflicts persisted before this existed.
export function measureSeams(
  spec: GarmentSpec,
  baseMeasurements: Measurements,
  t: Translate,
): { armholeLenCm?: number; sleeveArmholeCm?: number } {
  const { armholeLenCm, sleeveArmholeCm } = draftAll(spec, baseMeasurements, t);
  return { armholeLenCm, sleeveArmholeCm };
}

export function draftGarment(
  spec: GarmentSpec,
  baseMeasurements: Measurements,
  t: Translate,
) {
  const { drafted, measurements, armholeLenCm, sleeveArmholeCm } = draftAll(
    spec,
    baseMeasurements,
    t,
  );
  const { pieces, viewBox } = autoLayout(drafted, 8);
  return { pieces, viewBox, measurements, armholeLenCm, sleeveArmholeCm };
}
