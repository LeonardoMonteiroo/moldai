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

export type GarmentType =
  | "blouse"
  | "dress"
  | "skirt"
  | "tshirt"
  | "trousers"
  | "hoodie"
  | "coat"
  | "shirt";
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
// #137: the three girths the drafted-ease report compares against the body
// (lib/draft/easeReport.ts) -- co-located with FitClass/StretchClass since
// FIT_EASE_CM's own shape (lib/draft/ease.ts) already keys its per-class
// figures by these same three names.
export type Girth = "bust" | "waist" | "hip";
// #129/#130/#131 (Wave 2/W4): the three sub-piece types, each a closed enum
// of exactly what's actually drafted today plus "none" -- there is no third
// value the AI can select, unlike a proportion-tunable numeric field. Other
// shapes (Peter Pan collar, shaped cuff, contoured waistband) are "em
// breve", surfaced inline on the drafted piece's own detail row (see
// lib/draft/subpieces.ts) and in lib/ai/prompt.ts's guidance, rather than a
// silently-ignored enum value -- there IS no such value to silently accept.
// #221: "band" (stand/mandarin collar) joined "convertible" as a second real
// collar shape -- a straight-up stand with no folded-over fall, drafted by
// lib/draft/subpieces.ts's draftBandCollar against a neckline lowered by
// small position-specific deltas (see body.ts's own note beside
// BAND_COLLAR_SHOULDER_DROP_CM).
// #222: "shirt" is the classic two-piece shirt collar -- a stand (the SAME
// lowered-neckline construction as "band") plus a separate fall (the
// "convertible" shape) sewn on top of it, drafted as TWO mated
// DraftedPieces by lib/draft/subpieces.ts's draftShirtCollar. Still a
// closed enum: any OTHER stand-alike shape (a Peter Pan, a notched collar)
// is still "em breve".
export type CollarType = "none" | "convertible" | "band" | "shirt";
export type CuffType = "none" | "straight";
export type WaistbandType = "none" | "straight";
// #223: closed enum, same shape as the three above -- "buttonStand" is the
// only front-closure shape MoldAI drafts; anything else is "em breve",
// surfaced by lib/ai/prompt.ts's guidance rather than a silent substitute.
export type FrontClosureType = "none" | "buttonStand";

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
  // #129: a convertible collar, drafted from the front+back neckline's own
  // measured arc (lib/draft/subpieces.ts's draftCollar). Applies to any
  // body-having garment (blouse/dress/tshirt); undefined/"none" drafts no
  // collar at all, unchanged from before this issue.
  // #221: "band" drafts a straight-up stand instead (draftBandCollar), off
  // the SAME neckline arc but lowered first -- see body.ts.
  // #222: "shirt" drafts a stand (same lowered neckline + shape as "band",
  // sized wider by the button-stand width) PLUS a separate fall (the
  // "convertible" shape) sewn on top of it -- draftShirtCollar, two mated
  // pieces instead of one.
  collar?: CollarType;
  // #130: a straight cuff (plus its placket) drafted from the sleeve's own
  // measured hem edge. Only meaningful with sleeve: "long" -- a short or
  // sleeveless garment simply never reaches the drafting branch that reads
  // this, the same way skirt-only style fields are unused on a bodice.
  cuff?: CuffType;
  // #131/#128: a straight waistband drafted from the skirt/trousers panel's
  // own measured waist edge plus a fixed closure overlap. Applies to the
  // standalone skirt archetype (spec.type === "skirt") and to trousers
  // (spec.type === "trousers", #128 reuses this same field/drafter rather
  // than a second one) -- a dress's bodice joins the skirt panel directly at
  // the natural waist instead (see the seam-conflict section below), so this
  // field is simply unread for a dress. Undefined defaults to "straight":
  // unlike collar/cuff (new capabilities the AI must actively request), a
  // skirt or trousers with no waistband can't be finished, so every
  // newly-drafted one gets a band unless explicitly set to "none".
  waistband?: WaistbandType;
  // #223: a button-stand extension sewn to the front bodice's own
  // center-front edge (lib/draft/subpieces.ts's draftButtonStand). Applies
  // only to spec.type === "blouse" (lib/draft/body.ts gates it off dress and
  // tshirt internally -- see docs/superpowers/specs/2026-08-28-front-button-
  // stand-design.md's Non-goals for why dress is excluded). Opt-in, default
  // "none", the collar/cuff precedent (a new capability the AI must
  // actively request) rather than waistband's "defaults on".
  frontClosure?: FrontClosureType;
  // #128: total waist-to-hem length for the (straight-leg only) trousers
  // block, AI/user-settable and clamped like skirtLengthCm. Unlike
  // skirtLengthCm there is no per-size Measurements field to fall back to
  // (no drafter has ever needed a trouser leg length before #128) -- absent,
  // it defaults to a flat per-gender constant
  // (lib/draft/trousers.ts's TROUSER_DEFAULT_LENGTH_CM), the same size, at
  // every graded size, until a future measurement-vocabulary issue adds a
  // real per-size leg-length field. Simply unread for any other garment
  // type, the same "type-mismatched style field is a no-op" precedent
  // skirtLengthCm/waistband already follow.
  trouserLengthCm?: number;
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

// #124: the typed set settled by the 2026-08-22 competitive/domain review --
// single/double is the standard front/back marking convention, triple is a
// third distinct mark for anything else (currently unused by any drafter,
// reserved for a future one). There is no per-type geometry beyond depth
// (see lib/draft/core.ts's NOTCH_DEPTH_CM): the three types are told apart
// purely by how deep the tick reaches into the seam allowance, which is
// simultaneously the AC's own "printable size" (3mm/6mm) -- cm depth and
// printed size are the same number, nothing to keep in sync.
export type NotchType = "single" | "double" | "triple";

// A notch tick, already placed and oriented in px (canvas/export local
// space) -- two points, outer (on the net outline) and inner (depth along
// the local inward normal), the same two-point-line shape `grainline`
// already uses. Derived at draft time, never user-movable and never
// persisted onto the blob (lib/draft/core.ts's `place()` builds these from
// each drafter's `DraftedPiece.notches`).
export interface PieceNotch {
  type: NotchType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

// #127: typed internal-geometry entries, one level up from
// lib/draft/core.ts's InternalCm (already in px/canvas-local space --
// darts/pleat/styleLine are already an SVG `d` string, the same
// path-string-on-Piece-vs-point-list-on-DraftedPiece asymmetry `notches`/
// `NotchCm` already has). Three kinds ship geometry today: `dart` (now zero
// or more per piece, not exactly one -- #122), `foldLine` (a dart's own
// press line, apex-to-apex for a double-ended/fisheye dart or apex-to-seam
// for a single-ended one -- distinct from the piece's own cut-on-fold axis,
// `foldEdge`/`Piece.grainline`'s sibling below), and `drillHole` (1.0-1.5cm
// short of a dart apex, see lib/draft/core.ts's DRILL_HOLE_SETBACK_CM).
// `pleat`/`styleLine`/`placementMark` exist so a future pocket/buttonhole/
// pleat/style-line drafter can attach to this same channel without a second
// one, but no drafter emits any of the three yet -- #127 decision, settled,
// not reopened here.
export type InternalKind =
  "dart" | "foldLine" | "drillHole" | "pleat" | "styleLine" | "placementMark";

export type PieceInternal =
  | { kind: "dart"; d: string }
  | { kind: "foldLine"; x1: number; y1: number; x2: number; y2: number }
  | { kind: "drillHole"; x: number; y: number; r: number }
  | { kind: "pleat"; d: string } // reserved -- no drafter emits one yet
  | { kind: "styleLine"; d: string } // reserved -- no drafter emits one yet
  | { kind: "placementMark"; x: number; y: number }; // reserved -- no drafter emits one yet

export interface Piece {
  id: string;
  name: string;
  qty: number;
  outline: PieceOutline;
  guideOutline?: PieceOutline;
  grainline?: { x1: number; y1: number; x2: number; y2: number };
  // #127 LEGACY: superseded by `internals` below. A pattern drafted before
  // #127 shipped still carries this key (and no `internals`) in its
  // persisted blob -- resolvePieceInternals() below is the one place that
  // reads it; no new draft ever sets it (place(), lib/draft/core.ts, writes
  // `internals` only). #122's array (not a single dart) already applied
  // here, before #127 folded it into the new channel.
  darts?: { d: string }[];
  // #127: drafter-derived internal geometry -- darts, each one's own fold
  // line, and its drill hole(s); the channel a future pocket/buttonhole/
  // pleat/drill-mark would also attach to. Absent on a piece with none (a
  // sleeve, a skirt panel) or drafted before this existed -- call
  // resolvePieceInternals() below rather than reading this field directly,
  // so an old blob's `darts` still renders with no reset migration (the
  // `savedAgo` precedent).
  internals?: PieceInternal[];
  label: { x: number; y: number };
  vertices?: Point[]; // outline anchors in px, for the measure tool's snap
  // #126: the two `vertices` indices bounding the piece's own cut-on-fold
  // line (its axis of symmetry) -- additive metadata, not a boundary edge
  // walked by `outline` itself. Absent on a piece with no fold (e.g. a
  // sleeve) and on a piece drafted before this existed.
  foldEdge?: [number, number];
  // #124: absent on a piece drafted before this existed, or one no
  // convention places a mark on.
  notches?: PieceNotch[];
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
  // #18: set on a user turn that carried a photo/sketch attachment. The
  // image itself is never persisted -- this is only enough to render an
  // "imagem enviada" chip, not a thumbnail. Additive/optional, so a message
  // recorded before this existed simply lacks it.
  hasImage?: boolean;
  // How many attachments that turn carried, once a turn could carry more
  // than one. Additive alongside hasImage rather than replacing it: a
  // message persisted before multi-attachment support has hasImage and no
  // imageCount, and renders as exactly one -- the same readable-when-absent
  // shape Piece.darts and ConflictInfo.entries already use, and the reason
  // no blob migration or reset is needed. Still never the bytes.
  imageCount?: number;
  // #138: set on an "ai" turn that answered a sewing/assembly-order
  // question (decision=explain + assemblyOrder=true, see lib/ai/decision.ts)
  // -- lets ChatBubble attach the catalog-sourced "AI-generated guidance,
  // not verified construction advice" disclaimer without parsing the
  // model's own prose. Additive/optional, like hasImage.
  assembly?: boolean;
  // #269: set on the PRIMARY "ai" bubble of each proposeGarment call (never
  // on a secondary notice like the chart-substitution or spec-adjustment
  // follow-ups) to the decision the model actually made -- "apply" |
  // "decline" | "ask" | "explain", written out here rather than imported
  // from lib/ai/decision.ts's own Decision type, since lib/ai already
  // depends on lib/types and this file stays framework/dependency-free.
  // Exists so a training-data exporter can tell which decision produced a
  // given turn without re-deriving it from prose. Additive/optional, like
  // hasImage/assembly.
  decision?: "apply" | "decline" | "ask" | "explain";
  // #269: only ever set alongside decision="apply" -- the pattern's own
  // `version` number (Pattern.version, post-bump) this turn produced,
  // letting an exporter join this ChatMessage to its PatternVersion row via
  // (patternId, draftVersion) without a fabricated foreign key. A version
  // number, not a versionId string, because PatternVersion's own unique key
  // is already (patternId, version) -- the same value, not a duplicate one.
  draftVersion?: number;
}

export type PlanId = "free" | "atelier" | "studio" | "factory";

// One exported source for the enum, the same rule BODY_TYPES follows above:
// display order, ascending credits. lib/billing/plans.ts's PLAN_CREDITS/
// PLAN_PRICES/PLAN_FEATURES are all keyed off this same PlanId, so a new
// tier is added in one place.
export const PLAN_IDS: PlanId[] = ["free", "atelier", "studio", "factory"];

export interface Credits {
  plan: PlanId;
  balance: number;
  total: number;
  renewsInDays: number;
  // Optional, not mirroring Wallet.planInterval's non-optional shape: 26
  // files construct a Credits-shaped literal (mostly test fixtures), and
  // only PlanSection reads this field. buildCredits always sets it from the
  // real wallet -- absent only in a hand-built fixture that predates this
  // field. The literal union is re-declared here rather than imported from
  // lib/billing/plans.ts's BillingInterval, which would create a cycle
  // (plans.ts already imports PlanId from this file).
  planInterval?: "month" | "year";
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

// Settings' "Usados neste ciclo" stat card -- counts of debit transactions
// since the current billing cycle started, by the only two reasons a debit
// ever carries. "generate" covers every chat-driven draft/adjustment alike
// (this app has no separate "first generation" vs "later edit" distinction
// in its data model), "graduate" covers grading.
export interface UsageThisCycle {
  generate: number;
  graduate: number;
}

// #134: one divergent seam pair out of the full graph lib/draft/seams.ts's
// walkSeamPairs measures -- what ConflictInfo.entries holds, one per
// mismatch beyond SEAM_TOLERANCE_CM (not every declared pair). `label`/
// `aLabel`/`bLabel` are pre-resolved pt-BR text (like ConflictInfo's own
// title/description/suggestion below), not catalog keys -- the same
// locale-snapshot precedent every other piece of drafted display text
// already follows, and `diffCm`/`markers` mirror what the legacy top-level
// ConflictInfo fields already persisted before this issue. The two actual
// seam lengths behind `diffCm` are deliberately NOT here -- like the
// original armhole/cap pair, they're re-derived at render time (this
// issue's own lib/draft/garment.ts's measureSeamGraph, matched back to an
// entry by `key`) rather than persisted, the same "nothing new in the blob"
// rule measureSeams/fitPieceLabel already set and that a bag of per-seam
// numbers would have broken.
export interface ConflictEntry {
  key: string;
  label: string;
  aLabel: string;
  bLabel: string;
  aPieceId: string;
  bPieceId: string;
  diffCm: number;
  fixable: boolean;
  markers: { cx: number; cy: number; r: number }[];
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
  // #134: every mated-pair divergence this generation found, not only the
  // primary one -- absent on a conflict persisted before this existed, so a
  // legacy blob's card/markers/actions still render exactly as they did
  // (the singular fields above stay populated as that fallback). New
  // conflicts always populate this, even when it holds exactly one entry;
  // ConflictInfoCard/ConflictActions/PatternCanvas render off `entries`
  // when present and fall back to the legacy singular fields when absent.
  entries?: ConflictEntry[];
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
  /**
   * #267: which drafting engine this pattern was drafted with, frozen no
   * later than the first generation alongside `sizeTable`/`sizeChartName`
   * -- the same reason: switching the app's default engine must not
   * silently redraw an existing pattern's geometry on its next
   * regeneration.
   *
   * #269 Fase 5: the new-pattern form's own engine choice can freeze this
   * a turn or more BEFORE that -- the generate route sets it as soon as
   * it knows this is the pattern's first-ever `generate` call (so the AI
   * call itself already sees the right engine's tool schema), which can
   * land on an `ask`/`decline`/`explain` turn that drafts nothing yet.
   * Either way it is set at most once per pattern and never changes again
   * once `pieces.length > 0` -- `state.test.ts`'s own "never changes an
   * already-frozen pattern.engine" contract still holds.
   *
   * Optional because patterns drafted before this existed simply do not
   * carry it (an additive blob key, so no reset migration) -- absent means
   * `"moldai"`, the app's default. A plain wire `string`, not `EngineId`,
   * the same reason `sizeChartName` isn't a strict enum: this is untrusted
   * once read back off a persisted blob, and `isEngineId`/`engineFor`
   * (lib/draft/engine/capability.ts) are the trust boundary that narrows
   * it, not the type itself.
   */
  engine?: string;
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
  /** Frozen like Pattern.engine; absent means "moldai", never guessed. */
  engine?: string;
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

/**
 * #127: the one place a legacy `darts` blob is mapped into the new
 * `internals` shape -- "read the old key once and map it," the `savedAgo`
 * precedent: no reset migration, an old pattern simply keeps rendering.
 * Never mixes the two -- a piece redrafted after #127 shipped carries
 * `internals` and no `darts`; one drafted before it carries `darts` and no
 * `internals`. Every renderer/exporter of a *persisted* `Piece` (PatternCanvas
 * today) should call this instead of reading `piece.internals` directly;
 * export's own `ExportPiece` is always freshly redrafted from `spec` and
 * never carries the legacy shape at all, so it has no need for this.
 */
export function resolvePieceInternals(
  piece: Pick<Piece, "internals" | "darts">,
): PieceInternal[] {
  if (piece.internals) return piece.internals;
  if (piece.darts?.length) {
    return piece.darts.map((d) => ({ kind: "dart" as const, d: d.d }));
  }
  return [];
}
