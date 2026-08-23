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
// #125: how loose the body/bodice is drafted relative to the body measurement.
// A closed enum (not a numeric cm/percent field) so the AI expresses fit
// through a named class rather than by inflating measurementOverrides to fake
// ease. fit governs woven garments; stretch governs knit ones -- see
// lib/draft/garment.ts's FIT_EASE_CM / STRETCH_EASE_PCT.
export type FitClass = "close" | "fitted" | "semiFitted" | "loose";
export type StretchClass = "none" | "low" | "medium" | "high";

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
  fit?: FitClass;
  stretch?: StretchClass;
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
  // #122: an array, not a single dart -- a full front/back panel (qty 1,
  // mirrored about its own centre line) takes two darts, symmetric about
  // that centre, never one centred on it.
  darts?: { d: string }[];
  label: { x: number; y: number };
  vertices?: Point[]; // outline anchors in px, for the measure tool's snap
  // #126: the two `vertices` indices bounding the piece's own cut-on-fold
  // line (its axis of symmetry) -- additive metadata, not a boundary edge
  // walked by `outline` itself. Absent on a piece with no fold (e.g. a
  // sleeve) and on a piece drafted before this existed.
  foldEdge?: [number, number];
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
  // "notice" shares the amber bubble with "conflict" but is not a conflict:
  // it marks an informational caveat, e.g. that generation could not use the
  // account's active size chart.
  tone?: "neutral" | "conflict" | "notice";
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
  /**
   * Name of the size chart this pattern was drafted from, frozen at the first
   * generation alongside `sizeTable` — renaming or reassigning the account's
   * charts must not rewrite an existing pattern's history, for the same reason
   * the resolved measurements are snapshotted rather than looked up.
   *
   * Optional because patterns drafted before this existed simply do not carry
   * it (an additive blob key, so no reset migration); the tech sheet omits the
   * row when it is absent rather than inventing a name.
   */
  sizeChartName?: string;
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

/**
 * A saved atelier base — "base do ateliê" in the UI. Holds exactly what a
 * Pattern needs to be redrafted (the spec plus the frozen size snapshot it was
 * drafted against) and nothing that draftGarment can reproduce: no pieces, no
 * viewBox, no baseMeasurements. Persisting those would duplicate what `spec` +
 * `sizeTable` already determine — the savedAgo / planLabel mistake.
 *
 * Persisted 1:1 as a Sloper row's `data` JSON (lib/db/sloper.ts), the same
 * shape convention as PatternState and SizeChartData.
 */
export interface SloperData {
  name: string;
  spec: GarmentSpec;
  sizes: string[];
  baseSize: SizeLabel;
  sizeTable: Record<string, Measurements>;
  /** Frozen like Pattern.sizeChartName; absent on none, never guessed. */
  sizeChartName?: string;
}

/**
 * Wire shape for GET /api/slopers — a projection, not the blob (the
 * PatternListItem precedent). `thumbnailSvg` is built server-side by drafting
 * the sloper, since the geometry is not stored.
 */
export interface SloperListItem {
  id: string;
  name: string;
  garmentType: GarmentType;
  baseSize: string;
  sizeChartName?: string;
  updatedAt: string;
  thumbnailSvg: string;
}

/**
 * Cap on a pattern's name, shared by the PATCH route and the rename dialog's
 * `maxLength` so the client stops you before the server has to. Matches
 * MAX_NAME_LENGTH in lib/account/settings.ts, which already capped the *user's*
 * name while a pattern's was unbounded -- a 5000-character name was accepted
 * and then rendered untruncated into the editor header and the dashboard card.
 */
export const MAX_PATTERN_NAME_LENGTH = 80;

/**
 * #101: `listPatternsForUser` had no `take` at all -- a query bound only by
 * however many rows an account happens to have, each one deserialized and
 * built into a thumbnail on every dashboard load. The `create` rate-limit
 * bucket bounds new growth going forward; this bounds the read itself, so
 * an account that already has many patterns degrades into "the query stays
 * fast and returns the most recent N" rather than an unbounded scan. Well
 * above what any real account approaches today, so no on-screen pagination
 * or truncation notice exists yet -- there is nothing for a legitimate
 * account to hit.
 */
export const MAX_PATTERNS_LISTED = 500;

/**
 * #55: a chat message had no length cap at all -- `presence` was checked
 * (`!trimmed`), `length` never was. Paste a large document into the
 * composer and it's appended to the pattern blob by addMessage; savePattern
 * re-serialises the whole blob on every subsequent mutation,
 * composeEditorState ships the whole chat array on every load, and
 * buildHistory feeds it to Anthropic, which rejects the request on context
 * length -- the route's catch refunds and answers status:"error" for the
 * next several turns until the message rolls out of HISTORY_WINDOW. The
 * pattern is effectively bricked while staying permanently fat. ~2000 chars
 * is generous for a garment description, matching the cap-and-truncate
 * convention MAX_PATTERN_NAME_LENGTH already sets: MessageInput's Textarea
 * gets the same value as its maxLength, so the client stops you before the
 * server has to.
 */
export const MAX_CHAT_MESSAGE_LENGTH = 2000;

// #108: `generate` and `cuttingPlan` used to exist here too, but nothing
// ever debited them — the first draft of a pattern debits `adjust` like
// every later AI-driven change, and the cut plan is computed client-side,
// free. Keep only actions a real debit site actually charges (or, for
// `correction`, that a route provably never debits — see prompt.test.ts).
export const COSTS = {
  adjust: 1,
  graduate: 6,
  correction: 0,
} as const;
