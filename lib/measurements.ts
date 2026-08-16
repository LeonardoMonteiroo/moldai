import { SizeLabel, Sexo } from "./types";

export interface Measurements {
  busto: number; // circunferência do busto (cm)
  cintura: number; // circunferência da cintura (cm)
  quadril: number; // circunferência do quadril (cm)
  alturaQuadril: number; // cintura → quadril (cm)
  comprimentoCostas: number; // nuca → cintura (cm)
  ombro: number; // largura de um ombro (cm)
  compSaia: number; // comprimento default da saia (cm)
  compMangaCurta: number; // (cm)
  compMangaLonga: number; // (cm)
}

export const SIZE_TABLE: Record<SizeLabel, Measurements> = {
  PP: {
    busto: 84,
    cintura: 66,
    quadril: 92,
    alturaQuadril: 20.0,
    comprimentoCostas: 40.0,
    ombro: 17.5,
    compSaia: 60,
    compMangaCurta: 18,
    compMangaLonga: 58,
  },
  P: {
    busto: 88,
    cintura: 70,
    quadril: 96,
    alturaQuadril: 20.3,
    comprimentoCostas: 40.5,
    ombro: 18.0,
    compSaia: 60,
    compMangaCurta: 18,
    compMangaLonga: 58,
  },
  M: {
    busto: 92,
    cintura: 74,
    quadril: 100,
    alturaQuadril: 20.6,
    comprimentoCostas: 41.0,
    ombro: 18.5,
    compSaia: 60,
    compMangaCurta: 18,
    compMangaLonga: 58,
  },
  G: {
    busto: 96,
    cintura: 78,
    quadril: 104,
    alturaQuadril: 21.0,
    comprimentoCostas: 41.5,
    ombro: 19.0,
    compSaia: 60,
    compMangaCurta: 18,
    compMangaLonga: 58,
  },
  GG: {
    busto: 100,
    cintura: 82,
    quadril: 108,
    alturaQuadril: 21.3,
    comprimentoCostas: 42.0,
    ombro: 19.5,
    compSaia: 60,
    compMangaCurta: 18,
    compMangaLonga: 58,
  },
};

export const SIZE_TABLE_MASC: Record<SizeLabel, Measurements> = {
  PP: {
    busto: 92,
    cintura: 80,
    quadril: 92,
    alturaQuadril: 21.0,
    comprimentoCostas: 43.0,
    ombro: 21.0,
    compSaia: 60,
    compMangaCurta: 22,
    compMangaLonga: 62,
  },
  P: {
    busto: 96,
    cintura: 84,
    quadril: 96,
    alturaQuadril: 21.3,
    comprimentoCostas: 43.5,
    ombro: 21.5,
    compSaia: 60,
    compMangaCurta: 22,
    compMangaLonga: 62,
  },
  M: {
    busto: 100,
    cintura: 88,
    quadril: 100,
    alturaQuadril: 21.6,
    comprimentoCostas: 44.0,
    ombro: 22.0,
    compSaia: 60,
    compMangaCurta: 22,
    compMangaLonga: 62,
  },
  G: {
    busto: 104,
    cintura: 92,
    quadril: 104,
    alturaQuadril: 22.0,
    comprimentoCostas: 44.5,
    ombro: 22.5,
    compSaia: 60,
    compMangaCurta: 22,
    compMangaLonga: 62,
  },
  GG: {
    busto: 108,
    cintura: 96,
    quadril: 108,
    alturaQuadril: 22.3,
    comprimentoCostas: 45.0,
    ombro: 23.0,
    compSaia: 60,
    compMangaCurta: 22,
    compMangaLonga: 62,
  },
};

export const MEASUREMENT_RANGES: Record<
  keyof Measurements,
  { min: number; max: number }
> = {
  busto: { min: 70, max: 140 },
  cintura: { min: 55, max: 130 },
  quadril: { min: 78, max: 150 },
  alturaQuadril: { min: 15, max: 28 },
  comprimentoCostas: { min: 34, max: 50 },
  ombro: { min: 14, max: 26 },
  compSaia: { min: 25, max: 120 },
  compMangaCurta: { min: 8, max: 35 },
  compMangaLonga: { min: 40, max: 70 },
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function resolveMeasurements(
  size: SizeLabel,
  overrides: Partial<Measurements>,
  sexo: Sexo = "fem",
): Measurements {
  const base = { ...(sexo === "masc" ? SIZE_TABLE_MASC : SIZE_TABLE)[size] };
  for (const k of Object.keys(overrides) as (keyof Measurements)[]) {
    const v = overrides[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      const r = MEASUREMENT_RANGES[k];
      base[k] = clamp(v, r.min, r.max);
    }
  }
  return base;
}
