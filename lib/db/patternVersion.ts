import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { lockPattern, savePattern, TX_OPTS } from "@/lib/db/pattern";
import type { GarmentSpec, Pattern, PatternState } from "@/lib/types";
import type { Measurements } from "@/lib/measurements";

type Tx = Prisma.TransactionClient;

// Machine-readable, mirroring the version bump that produced the row -- never
// pt-BR prose (the wire-error-codes precedent). "explain" and "ask"/"decline"
// never appear here: a version is recorded on bumpVersion, not on debit, and
// none of those three call it.
export type PatternVersionReason =
  "generate" | "adjust" | "graduate" | "conflict_fix" | "restore";

export interface PatternVersionRecord {
  id: string;
  version: number;
  spec: GarmentSpec;
  sizes: string[];
  baseSize: string;
  sizeTable: Record<string, Measurements>;
  sizeChartName: string | null;
  // #267: which drafting engine this version was drafted with. Nullable
  // like sizeChartName -- absent means "moldai" through engineFor
  // (lib/draft/engine/capability.ts), never guessed here.
  engine: string | null;
  reason: PatternVersionReason;
  cost: number;
  createdAt: string;
}

interface Row {
  id: string;
  version: number;
  spec: Prisma.JsonValue;
  sizes: Prisma.JsonValue;
  baseSize: string;
  sizeTable: Prisma.JsonValue;
  sizeChartName: string | null;
  engine: string | null;
  reason: string;
  cost: number;
  createdAt: Date;
}

// No schema validation here the way lib/db/pattern.ts's toState() has one --
// every row is either written by recordVersion below (from an already-typed
// Pattern) or by the migration's own backfill (read from a Pattern blob this
// same release still understands). A future blob-shape change to spec/
// sizeTable would need its own tolerant reader here, same as PatternState's.
function toRecord(row: Row): PatternVersionRecord {
  return {
    id: row.id,
    version: row.version,
    spec: row.spec as unknown as GarmentSpec,
    sizes: row.sizes as unknown as string[],
    baseSize: row.baseSize,
    sizeTable: row.sizeTable as unknown as Record<string, Measurements>,
    sizeChartName: row.sizeChartName,
    engine: row.engine,
    reason: row.reason as PatternVersionReason,
    cost: row.cost,
    createdAt: row.createdAt.toISOString(),
  };
}

// Ownership-scoped like every sibling repo function: a pattern owned by
// someone else (or gone) returns null, never an empty array -- an empty array
// would be indistinguishable from "yours, but no history yet", which can't
// happen for a real pattern (every pattern gets at least the migration's
// backfilled row or its own first generate), so null stays the one signal
// meaning "not yours." Routes turn that into patternNotFound().
export async function listVersions(
  patternId: string,
  userId: string,
): Promise<PatternVersionRecord[] | null> {
  const pattern = await prisma.pattern.findUnique({
    where: { id: patternId },
  });
  if (!pattern || pattern.userId !== userId) return null;
  const rows = await prisma.patternVersion.findMany({
    where: { patternId, userId },
    orderBy: { version: "desc" },
  });
  return rows.map(toRecord);
}

// versionId is the PatternVersion row's own id -- untrusted wire input (see
// the restore route), so ownership is re-checked here rather than trusted
// from the caller having already loaded the list.
export async function getVersion(
  patternId: string,
  userId: string,
  versionId: string,
): Promise<PatternVersionRecord | null> {
  const row = await prisma.patternVersion.findUnique({
    where: { id: versionId },
  });
  if (!row || row.patternId !== patternId || row.userId !== userId) {
    return null;
  }
  return toRecord(row);
}

// A Pattern-only transaction (no Wallet lock) that ALSO records a version
// snapshot in the same transaction -- for the two mutations that bump a
// version but must never touch the wallet: conflict/resolve's "fix" and
// restore. Mirrors lib/db/pattern.ts's own withPattern (load -> mutate ->
// save) built from the same exported primitives (lockPattern/savePattern/
// TX_OPTS) withPatternAndWallet already reuses -- but deliberately does NOT
// route through withPatternAndWallet, even with zero debits: an always-empty
// `entries` array would still lock (and re-save) the Wallet row for an
// action the rest of the codebase (lib/ai/prompt.test.ts's own structural
// guard, which greps the route source for "withPatternAndWallet"/
// "debitWallet") documents as truly free. `fn` gets `tx` for its own
// recordVersion call, so a version row can never exist without the pattern
// save that produced it -- if the transaction rolls back, both roll back
// together.
export async function withPatternVersioned<T>(
  patternId: string,
  userId: string,
  fn: (state: PatternState, tx: Tx) => T | Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    const state = await lockPattern(tx, patternId, userId);
    if (!state) return null;
    const result = await fn(state, tx);
    await savePattern(tx, patternId, userId, state);
    return result;
  }, TX_OPTS);
}

// Callable from inside an existing transaction -- withPatternAndWallet
// already exposes `tx` to its callers for exactly this (see #67's comment
// there). Recording here, in the same transaction as the debit and the
// pattern save, is what makes "a version row can never exist without the
// state that produced it" true: if the transaction rolls back, this insert
// rolls back with it.
//
// No-ops on a pattern with no spec (a version can only be recorded once
// something has actually been drafted -- generate's own pieces.length===0
// check, graduate's pattern_not_drafted guard, and conflict/resolve's "fix"
// action all only ever run against an already-drafted pattern in practice,
// but this stays a defensive no-op rather than persisting a spec-less row).
export async function recordVersion(
  tx: Tx,
  patternId: string,
  userId: string,
  pattern: Pick<
    Pattern,
    | "version"
    | "spec"
    | "sizes"
    | "baseSize"
    | "sizeTable"
    | "sizeChartName"
    | "engine"
  >,
  reason: PatternVersionReason,
  cost: number,
): Promise<void> {
  if (!pattern.spec) return;
  await tx.patternVersion.create({
    data: {
      patternId,
      userId,
      version: pattern.version,
      spec: pattern.spec as unknown as Prisma.InputJsonValue,
      sizes: pattern.sizes as unknown as Prisma.InputJsonValue,
      baseSize: pattern.baseSize,
      sizeTable: pattern.sizeTable as unknown as Prisma.InputJsonValue,
      sizeChartName: pattern.sizeChartName ?? null,
      engine: pattern.engine ?? null,
      reason,
      cost,
      // #281: stamped from the app's own clock rather than left to the
      // column's `@default(now())` (a Postgres-generated timestamp) --
      // POST .../restore compares this value against ChatMessage.createdAt
      // (also Date.now(), lib/editor/state.ts's addMessage) to truncate
      // chat to what existed at the restored version. Comparing a
      // DB-generated timestamp against an app-generated one would make that
      // cutoff depend on the app and DB server clocks staying in sync;
      // stamping both sides from the same clock removes that dependency
      // entirely, and is a value-only change -- the column keeps its
      // default for any other writer, so no migration is needed.
      createdAt: new Date(),
    },
  });
}
