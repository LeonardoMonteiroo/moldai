import {
  MEASUREMENT_RANGES,
  Measurements,
  resolveMeasurements,
} from "@/lib/measurements";
import {
  ClarifyQuestion,
  Decote,
  GarmentSpec,
  GarmentStyle,
  GarmentType,
  MangaLen,
  SaiaSilhueta,
  Sexo,
  SizeLabel,
} from "@/lib/types";
import { autoLayout, DraftedPiece } from "./core";
import { BlockOpts, draftCorpo } from "./corpo";
import { draftManga } from "./manga";
import { draftSaia } from "./saia";

const TIPOS: GarmentType[] = ["blusa", "vestido", "saia", "camiseta"];
const SEXOS: Sexo[] = ["fem", "masc"];
const DECOTES: Decote[] = ["reto", "V", "redondo"];
const MANGAS: MangaLen[] = ["sem", "curta", "longa"];
const SAIAS: SaiaSilhueta[] = ["reta", "evase", "gode", "meia-roda", "circulo"];

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
    decote:
      style.decote !== undefined
        ? pick(style.decote, DECOTES, "reto")
        : undefined,
    manga:
      style.manga !== undefined ? pick(style.manga, MANGAS, "sem") : undefined,
    saia:
      style.saia !== undefined ? pick(style.saia, SAIAS, "reta") : undefined,
    decoteProfundidadeCm:
      style.decoteProfundidadeCm !== undefined
        ? clamp(num(style.decoteProfundidadeCm, 0), 0, 15)
        : undefined,
    compSaiaCm:
      style.compSaiaCm !== undefined
        ? clamp(num(style.compSaiaCm, 60), 25, 120)
        : undefined,
    folgaCosturaCm:
      style.folgaCosturaCm !== undefined
        ? clamp(num(style.folgaCosturaCm, 1), 0, 4)
        : undefined,
    pences: typeof style.pences === "boolean" ? style.pences : undefined,
    cavaAjusteCm:
      style.cavaAjusteCm !== undefined
        ? clamp(num(style.cavaAjusteCm, 0), 0, 6)
        : undefined,
    // mangaRefit é interno (só o resolver de conflito o define); nunca vem da IA.
  };
  return {
    tipo: pick(r.tipo, TIPOS, "blusa"),
    sexo: pick(r.sexo, SEXOS, "fem"),
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
  mangaCavaCm?: number,
): { diffCm: number } | null {
  if (armholeLenCm == null || mangaCavaCm == null) return null;
  const diff = Math.abs(armholeLenCm - mangaCavaCm);
  return diff > 1 ? { diffCm: Math.round(diff * 10) / 10 } : null;
}

function draftAll(
  spec: GarmentSpec,
  size: SizeLabel,
): {
  drafted: DraftedPiece[];
  measurements: Measurements;
  armholeLenCm?: number;
  mangaArmholeCm?: number;
} {
  const sexo: Sexo = spec.sexo ?? "fem";
  const measurements: Measurements = resolveMeasurements(
    size,
    spec.measurementOverrides,
    sexo,
  );
  const drafted: DraftedPiece[] = [];
  let armholeLenCm: number | undefined;
  let mangaArmholeCm: number | undefined;

  const isCorpo =
    spec.tipo === "blusa" ||
    spec.tipo === "vestido" ||
    spec.tipo === "camiseta";
  if (isCorpo) {
    const knit = spec.tipo === "camiseta";
    const lengthCm =
      spec.tipo === "vestido"
        ? measurements.backLength
        : measurements.backLength + measurements.hipHeight + 5;
    const opts: BlockOpts = { sexo, knit, lengthCm };
    // Arquétipo camiseta: gola redonda, sem pences, manga curta por padrão.
    const style: GarmentStyle =
      spec.tipo === "camiseta"
        ? {
            ...spec.style,
            decote: spec.style.decote ?? "redondo",
            pences: false,
            manga: spec.style.manga ?? "curta",
          }
        : spec.style;
    const {
      frente,
      costas,
      armholeLenCm: a,
      armholeBaseLenCm,
    } = draftCorpo(measurements, style, opts);
    armholeLenCm = a;
    drafted.push(frente, costas);
    // A copa da manga é dimensionada pela cava BASE (não ajustada) — a menos que
    // já tenha sido refeita ("Corrigir manga" seta style.mangaRefit). Assim um
    // ajuste de cava só no corpo faz as costuras divergirem → conflito real.
    const mangaCava = style.mangaRefit ? a : armholeBaseLenCm;
    const manga = draftManga(measurements, style, mangaCava, opts);
    if (manga) {
      drafted.push(manga);
      mangaArmholeCm = mangaCava;
    }
  }
  if (spec.tipo === "saia" || spec.tipo === "vestido") {
    drafted.push(draftSaia(measurements, spec.style));
  }

  return { drafted, measurements, armholeLenCm, mangaArmholeCm };
}

export function draftPiecesCm(
  spec: GarmentSpec,
  size: SizeLabel,
): DraftedPiece[] {
  return draftAll(spec, size).drafted;
}

export function draftGarment(spec: GarmentSpec, size: SizeLabel) {
  const { drafted, measurements, armholeLenCm, mangaArmholeCm } = draftAll(
    spec,
    size,
  );
  const { pieces, viewBox } = autoLayout(drafted, 8);
  return { pieces, viewBox, measurements, armholeLenCm, mangaArmholeCm };
}
