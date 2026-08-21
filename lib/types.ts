import type { Measurements } from "./measurements";

export type SizeLabel = string;

export type BodyType = "straight" | "hourglass" | "pear" | "apple";

// One exported source for the enum, the same rule the drafting/AI enums follow:
// the size-chart <Select>, the validator, and anything else all read this list
// rather than each hand-rolling its own copy.
export const BODY_TYPES: BodyType[] = [
  "straight",
  "hourglass",
  "pear",
  "apple",
];

export type PieceOutline =
  { kind: "polygon"; points: string } | { kind: "path"; d: string };

export interface Point {
  x: number;
  y: number;
}

export interface Measurement {
  id: string;
  a: Point;
  b: Point;
}

export type GarmentType = "blouse" | "dress" | "skirt" | "tshirt";
export type Gender = "female" | "male";
export type Neckline = "straight" | "V" | "round";
export type SleeveLength = "none" | "short" | "long";
export type SkirtSilhouette =
  "straight" | "a-line" | "gore" | "half-circle" | "circle";

export interface ClarifyQuestion {
  id: string;
  label: string;
  options: string[];
  allowOther: boolean;
}

export interface GarmentStyle {
  neckline?: Neckline;
  necklineDepthCm?: number;
  sleeve?: SleeveLength;
  skirt?: SkirtSilhouette;
  skirtLengthCm?: number;
  darts?: boolean;
  seamAllowanceCm?: number;
  // Deepening of the body's armhole (cm), settable by the AI and clamped in
  // validateSpec. Since it only touches the body, the sleeve cap (sized from the
  // base armhole) stops matching → seam conflict detected by seamCheck.
  armholeDeepenCm?: number;
  // Internal (NOT settable by the AI — validateSpec discards it): set by
  // "Corrigir manga" (sleeve fix) in the resolver, remakes the cap for the adjusted armhole.
  sleeveRefit?: boolean;
}

export interface GarmentSpec {
  type: GarmentType;
  gender?: Gender;
  measurementOverrides: Record<string, number>;
  style: GarmentStyle;
}

export interface DetailRow {
  label: string;
  value: string;
}

export interface Piece {
  id: string;
  name: string;
  qty: number;
  outline: PieceOutline;
  guideOutline?: PieceOutline;
  grainline?: { x1: number; y1: number; x2: number; y2: number };
  dart?: { d: string };
  label: { x: number; y: number };
  vertices?: Point[]; // outline anchors in px, for the measure tool's snap
  detailRows: DetailRow[];
}

export interface ChatChip {
  label: string;
  tone: "neutral" | "credit";
}

export interface ChatMessage {
  id: string;
  author: "user" | "ai";
  text: string;
  chips?: ChatChip[];
  questions?: ClarifyQuestion[];
  tone?: "neutral" | "conflict";
  createdAt: number;
}

export type PlanId = "free" | "atelier" | "studio" | "factory";

export interface Credits {
  plan: PlanId;
  balance: number;
  total: number;
  renewsInDays: number;
}

// Every ledger entry type lib/billing/wallet.ts's applyPurchase/debitWallet/
// refundWallet/renewWallet can produce, mirrored here (not imported from
// lib/billing) the same way Credits mirrors Wallet — wire/display shape,
// decoupled from the internal billing module.
export type LedgerEntryType =
  "debit" | "refund" | "topup" | "subscribe" | "renew";

export interface LedgerHistoryEntry {
  type: LedgerEntryType;
  reason: string | null;
  amount: number;
  createdAt: string;
}

export interface ConflictInfo {
  id: string;
  title: string;
  description: string;
  diffCm: number;
  suggestion: string;
  pieceAId: string;
  pieceBId: string;
  markers: { cx: number; cy: number; r: number }[];
}

export type GenerationStatus = "idle" | "generating" | "error";

export interface GenerationStep {
  label: string;
  pieceProgress: string;
}

export interface Pattern {
  id: string;
  name: string;
  version: number;
  baseSize: SizeLabel;
  unit: string;
  sizes: string[];
  sizesApplied: SizeLabel[];
  sizesPending: SizeLabel[];
  sizeTable: Record<string, Measurements>;
  pieces: Piece[];
  spec?: GarmentSpec;
  viewBox?: { w: number; h: number };
  baseMeasurements?: Measurements;
}

// Wire shape: the persisted Pattern blob plus the row's own `updatedAt`
// column, composed on by lib/api/compose.ts. `updatedAt` is never part of
// the persisted blob itself, so pre-compose pattern objects (e.g.
// seedPatternState's output) are plain `Pattern` and legitimately have none.
export interface PatternRecord extends Pattern {
  updatedAt: string;
}

// The pattern's own state — the drafted garment/chat/conflict. Credits/billing
// live in a separate Wallet (lib/billing/wallet.ts), composed in only for the
// API/store wire shape below.
export interface PatternState {
  pattern: Pattern;
  chat: ChatMessage[];
  conflict: ConflictInfo | null;
}

export interface EditorState extends PatternState {
  pattern: PatternRecord;
  credits: Credits;
}

// A size chart's editable data — grid library entries + the source of truth
// for resolveSizeChartSize/buildSizeTable (lib/sizeCharts/compute.ts).
// Persisted 1:1 as a SizeChart row's `data` JSON (lib/db/sizeChart.ts), same
// shape convention as PatternState.
export interface SizeChartData {
  name: string;
  gender: Gender;
  bodyType: BodyType; // descriptive metadata only — never affects drafted geometry
  isSystem: boolean; // seeded, read-only (no edit/delete), duplicable
  sizes: string[]; // ordered size labels, e.g. ["PP","P","M","G","GG"] or ["36",...,"46"]
  baseSizeIndex: number; // index into sizes[] — the highlighted/base column
  baseMeasurements: Measurements; // values at the base size
  progressionRule: Partial<Record<keyof Measurements, number>>; // cm delta per size step
  overrides: Record<string, Partial<Measurements>>; // size -> field -> manual value, wins over the rule
}

export interface SizeChartRecord extends SizeChartData {
  id: string;
  updatedAt: string;
}

// Wire shape for GET /api/size-charts — isActive is computed server-side by
// comparing each record's id to the account's User.activeSizeChartId.
export interface SizeChartListEntry extends SizeChartRecord {
  isActive: boolean;
}

export const COSTS = {
  generate: 4,
  adjust: 1,
  graduate: 6,
  cuttingPlan: 2,
  correction: 0,
} as const;
