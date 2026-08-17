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
  SizeLabel,
} from "@/lib/types";
import { autoLayout, DraftedPiece } from "./core";
import { BlockOpts, draftBody } from "./body";
import { draftSleeve } from "./sleeve";
import { draftSkirt } from "./skirt";
import type { Translate } from "@/lib/i18n/translate";

const TYPES: GarmentType[] = ["blouse", "dress", "skirt", "tshirt"];
const GENDERS: Gender[] = ["female", "male"];
const NECKLINES: Neckline[] = ["straight", "V", "round"];
const SLEEVES: SleeveLength[] = ["none", "short", "long"];
const SKIRTS: SkirtSilhouette[] = [
  "straight",
  "a-line",
  "gore",
  "half-circle",
  "circle",
];

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
    if (typeof v === "number" && Number.isFinite(v)) overrides[k] = v; // faixa é aplicada em resolveMeasurements
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
        ? clamp(num(style.necklineDepthCm, 0), 0, 15)
        : undefined,
    skirtLengthCm:
      style.skirtLengthCm !== undefined
        ? clamp(num(style.skirtLengthCm, 60), 25, 120)
        : undefined,
    seamAllowanceCm:
      style.seamAllowanceCm !== undefined
        ? clamp(num(style.seamAllowanceCm, 1), 0, 4)
        : undefined,
    darts: typeof style.darts === "boolean" ? style.darts : undefined,
    armholeDeepenCm:
      style.armholeDeepenCm !== undefined
        ? clamp(num(style.armholeDeepenCm, 0), 0, 6)
        : undefined,
    // sleeveRefit é interno (só o resolver de conflito o define); nunca vem da IA.
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
  size: SizeLabel,
  t: Translate,
): {
  drafted: DraftedPiece[];
  measurements: Measurements;
  armholeLenCm?: number;
  sleeveArmholeCm?: number;
} {
  const gender: Gender = spec.gender ?? "female";
  const measurements: Measurements = resolveMeasurements(
    size,
    spec.measurementOverrides,
    gender,
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
    // Modelo-base camiseta: gola redonda, sem pence, manga curta por padrão.
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
    // A copa da manga é dimensionada pela cava BASE (não ajustada) — a menos que
    // já tenha sido refeita ("Corrigir manga" seta style.sleeveRefit). Assim um
    // ajuste de cava só no corpo faz as costuras divergirem → conflito real.
    const sleeveArmhole = style.sleeveRefit ? a : armholeBaseLenCm;
    const sleeve = draftSleeve(measurements, style, sleeveArmhole, t, opts);
    if (sleeve) {
      drafted.push(sleeve);
      sleeveArmholeCm = sleeveArmhole;
    }
  }
  if (spec.type === "skirt" || spec.type === "dress") {
    drafted.push(draftSkirt(measurements, spec.style, t));
  }

  return { drafted, measurements, armholeLenCm, sleeveArmholeCm };
}

export function draftPiecesCm(
  spec: GarmentSpec,
  size: SizeLabel,
  t: Translate,
): DraftedPiece[] {
  return draftAll(spec, size, t).drafted;
}

export function draftGarment(spec: GarmentSpec, size: SizeLabel, t: Translate) {
  const { drafted, measurements, armholeLenCm, sleeveArmholeCm } = draftAll(
    spec,
    size,
    t,
  );
  const { pieces, viewBox } = autoLayout(drafted, 8);
  return { pieces, viewBox, measurements, armholeLenCm, sleeveArmholeCm };
}
