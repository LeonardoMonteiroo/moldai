export type SizeLabel = "PP" | "P" | "M" | "G" | "GG";

export type PieceOutline =
  | { kind: "polygon"; points: string }
  | { kind: "path"; d: string };

export type PieceParams = Record<string, number>;

export interface PieceDetails {
  folgaCostura: string;
  penceBusto: string;
  cava: string;
  fio: string;
  consumo: string;
}

export interface Piece {
  id: string;
  name: string;
  qty: number;
  params: PieceParams;
  outline: PieceOutline;
  guideOutline?: PieceOutline;
  grainline?: { x1: number; y1: number; x2: number; y2: number };
  dart?: { d: string };
  label: { x: number; y: number };
  details: PieceDetails;
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
