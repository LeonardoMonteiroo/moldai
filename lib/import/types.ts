// Shared types for the DXF import pass (issue #11, scoped to a "beta" first
// pass — see the module docs on dxf.ts/analyze.ts for what is and isn't
// parsed). Kept inside lib/import/ rather than lib/types.ts: this unit is
// deliberately barred from touching lib/types.ts (four other in-flight units
// are already adding Prisma migrations/blob fields), and nothing outside
// lib/import/ + components/import/ needs these types yet — the moment a
// later pass actually persists an imported Pattern, that's when a `LayerRole`
// export earns a home beside `BODY_TYPES`/`MEASUREMENT_KEYS` in lib/types.ts,
// the one-exported-source precedent those follow.

/**
 * What a detected DXF layer is understood to represent. Five values, no
 * `"fold"` — the source layer semantics fold/mirror lines carry (D6673 layer
 * 6, MoldAI's own DOBRA) has no first-class role in this pass, so it maps to
 * `"ignore"` like any other layer nothing here reads.
 */
export type LayerRole = "cut" | "seam" | "notch" | "grain" | "ignore";

export const LAYER_ROLES: LayerRole[] = [
  "cut",
  "seam",
  "notch",
  "grain",
  "ignore",
];

/**
 * A garment-part vocabulary for a detected imported piece (#238 follow-up:
 * creating a Pattern from an import). Fixed + "other" rather than free text,
 * so the reconstruction prompt gets a known token it can trust literally
 * instead of an arbitrary string — the same catalog-enum-over-label-map
 * reasoning LayerRole already follows.
 */
export type PieceLabel =
  | "front"
  | "back"
  | "sleeve"
  | "collar"
  | "cuff"
  | "waistband"
  | "skirtFront"
  | "skirtBack"
  | "trouserFront"
  | "trouserBack"
  | "other";

export const PIECE_LABELS: PieceLabel[] = [
  "front",
  "back",
  "sleeve",
  "collar",
  "cuff",
  "waistband",
  "skirtFront",
  "skirtBack",
  "trouserFront",
  "trouserBack",
  "other",
];

/**
 * Only DXF is actually parsed this pass — Audaces' and Molde.me's own native
 * formats are explicitly out of scope (see the PR body). The three values
 * here distinguish the two *DXF* vocabularies this app itself recognises
 * (its own writers, lib/export/dxf.ts and lib/export/dxf-aama.ts) from any
 * other DXF, not three input formats.
 */
export type ImportFormat = "dxf-aama" | "dxf-moldai" | "dxf-generic";

export type ImportCheckCode =
  | "unitCm"
  | "unitUnknown"
  | "piecesClosed"
  | "sizesUnknown"
  | "missingGrain"
  | "unsupportedEntities"
  | "fileTruncated"
  | "rulLoaded"
  | "rulNoRulesFound"
  | "rulUnrecognizedLines"
  | "rulUnitsUnknown"
  | "rulFileTruncated"
  | "rulNameMismatch";

/**
 * Machine-readable, never prose — the wire-carries-codes rule (CLAUDE.md's
 * i18n section) applied to a client-only module: analyzeDxf has no
 * next-intl import, so it can only ever hand back a code, and the screen
 * resolves it as `t("checks." + code, values)`.
 */
export interface ImportCheck {
  code: ImportCheckCode;
  level: "ok" | "warning";
  values?: Record<string, string | number>;
}

export interface DetectedLayer {
  name: string;
  entityCount: number;
}

/**
 * What was recovered from an optional `.RUL` companion file (#231) — the
 * ANSI/AAMA "grade rule table" that routinely ships alongside an AAMA/ASTM
 * DXF export to carry the grading deltas a bare DXF has no way to encode.
 * Absent (`ImportAnalysis.rul` is `undefined`) whenever no `.RUL` was
 * uploaded — that state, not an empty object, is what the screen reads to
 * show "no companion found" rather than a table with nothing in it.
 */
export interface RulSummary {
  fileName: string;
  /** From "GRADE RULE TABLE: <id>" — the table's own identifier, not a piece name. */
  tableId: string | null;
  product: string | null;
  author: string | null;
  units: "metric" | "english" | null;
  sizeList: string[];
  sampleSize: string | null;
  ruleCount: number;
  checks: ImportCheck[];
}

export interface ImportAnalysis {
  format: ImportFormat;
  fileName: string;
  fileSizeBytes: number;
  /** mm→0.1, cm→1, inch→2.54; null when $INSUNITS was absent/unrecognised. */
  unitScaleToCm: number | null;
  layers: DetectedLayer[];
  suggestedRoles: Record<string, LayerRole>;
  /** Closed polylines on whichever layer(s) resolve to the "cut" role. */
  pieceCount: number;
  checks: ImportCheck[];
  /** Set only once a `.RUL` companion has been uploaded alongside this DXF. */
  rul?: RulSummary;
}
