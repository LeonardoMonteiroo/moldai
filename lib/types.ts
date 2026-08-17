import type { Measurements } from "./measurements";

export type SizeLabel = "PP" | "P" | "M" | "G" | "GG";

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
  planLabel: string;
  balance: number;
  total: number;
  renewsInDays: number;
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
  savedAgo: string;
  baseSize: SizeLabel;
  unit: string;
  sizesApplied: SizeLabel[];
  sizesPending: SizeLabel[];
  pieces: Piece[];
  spec?: GarmentSpec;
  viewBox?: { w: number; h: number };
  baseMeasurements?: Measurements;
}

export interface EditorState {
  pattern: Pattern;
  chat: ChatMessage[];
  credits: Credits;
  conflict: ConflictInfo | null;
}

export const ALL_SIZES: SizeLabel[] = ["PP", "P", "M", "G", "GG"];

export const COSTS = {
  generate: 4,
  adjust: 1,
  graduate: 6,
  cuttingPlan: 2,
  correction: 0,
} as const;
