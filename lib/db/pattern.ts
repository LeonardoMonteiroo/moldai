import type { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { seedPatternState } from "@/lib/editor/state";
import { buildThumbnailSvg } from "@/lib/editor/thumbnail";
import { apiError, ERROR_STATUS } from "@/lib/api/errors";
import { reportError } from "@/lib/observability/report";
import { PatternStateSchema } from "@/lib/schemas/pattern";
import {
  MAX_PATTERNS_LISTED,
  type GarmentType,
  type PatternState,
} from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";

type Tx = Prisma.TransactionClient;

// The timeout needs to cover the AI call (proposeGarment ~5–12s), which runs
// INSIDE the transaction — Prisma's 5s default would time out. Holding the
// lock during the AI call is intentional: it's what serializes the user's requests.
export const TX_OPTS = { timeout: 30_000, maxWait: 10_000 } as const;

// #58: used to be a bare assertion (`data as unknown as PatternState`) that
// trusted the stored blob's shape unconditionally. A row whose `sizeTable`
// no longer has a key under `baseSize` (or any other structural drift) now
// fails to parse and returns null instead of feeding NaN geometry to every
// consumer downstream -- see lib/schemas/pattern.ts's PatternStateSchema.
function toState(
  patternId: string,
  data: Prisma.JsonValue,
): PatternState | null {
  const result = PatternStateSchema.safeParse(data);
  if (!result.success) {
    reportError("db.pattern.parse", result.error, { patternId });
    return null;
  }
  // #216: seedPattern() bakes a placeholder `id: "demo"` into the blob, and
  // nothing ever rewrote it -- every consumer of PatternState.pattern.id
  // (the editor footer's export/versions links, ExportShell's back link)
  // inherited that placeholder instead of the row's real id. This is the one
  // place every blob becomes a typed PatternState, so it's the one place
  // that can guarantee pattern.id always matches the row it was read from.
  return {
    ...result.data,
    pattern: { ...result.data.pattern, id: patternId },
  };
}

export function patternNotFound(): NextResponse {
  return apiError("pattern_not_found", ERROR_STATUS.pattern_not_found);
}

// Locks and reads the row, scoped to (id, userId) — a pattern owned by someone
// else reads as null, identical to a pattern that doesn't exist at all.
// Exported so lib/db/pattern-wallet.ts can lock this row inside its own
// combined transaction without duplicating the SQL.
export async function lockPattern(
  tx: Tx,
  patternId: string,
  userId: string,
): Promise<PatternState | null> {
  const rows = await tx.$queryRaw<{ data: Prisma.JsonValue }[]>`
    SELECT "data" FROM "Pattern" WHERE "id" = ${patternId} AND "userId" = ${userId} FOR UPDATE`;
  return rows[0] ? toState(patternId, rows[0].data) : null;
}

export async function savePattern(
  tx: Tx,
  patternId: string,
  userId: string,
  state: PatternState,
): Promise<void> {
  // #72: scoped to (id, userId), mirroring lockPattern's read, even though
  // every current caller only ever reaches this after lockPattern already
  // verified ownership inside the same transaction -- defense in depth
  // against a future caller that saves without locking first.
  await tx.$executeRaw`
    UPDATE "Pattern" SET "data" = ${JSON.stringify(state)}::jsonb, "updatedAt" = now()
    WHERE "id" = ${patternId} AND "userId" = ${userId}`;
}

// load → fn(state) → save, inside an interactive transaction with a row lock.
// Returns null (without calling fn) when the pattern doesn't exist or isn't
// the caller's — routes turn that into patternNotFound().
export async function withPattern<T>(
  patternId: string,
  userId: string,
  fn: (state: PatternState) => T | Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    const state = await lockPattern(tx, patternId, userId);
    if (!state) return null;
    const result = await fn(state);
    await savePattern(tx, patternId, userId, state);
    return result;
  }, TX_OPTS);
}

// Read-only fetch, ownership-scoped. Null when missing or not owned. Widened
// (unlike lockPattern) to also return the row's own `updatedAt` column: this
// is the one non-mutating reader that needs the *stored* save time rather
// than "now" — mutating routes get `updatedAt = now()` from savePattern in
// the same transaction, so they never need to read it back.
export async function loadPattern(
  patternId: string,
  userId: string,
): Promise<{ state: PatternState; updatedAt: Date } | null> {
  const row = await prisma.pattern.findUnique({ where: { id: patternId } });
  if (!row || row.userId !== userId) return null;
  const state = toState(patternId, row.data);
  if (!state) return null;
  return { state, updatedAt: row.updatedAt };
}

export async function createPatternFromState(
  userId: string,
  state: PatternState,
): Promise<string> {
  const row = await prisma.pattern.create({
    data: { userId, data: state as unknown as Prisma.InputJsonValue },
  });
  return row.id;
}

export async function createPattern(
  userId: string,
  t: Translate,
): Promise<string> {
  return createPatternFromState(userId, seedPatternState(t));
}

export interface PatternListItem {
  id: string;
  name: string;
  garmentType: GarmentType | null;
  updatedAt: string;
  thumbnailSvg: string;
}

// A plain count, not listPatternsForUser's length -- that read is capped at
// MAX_PATTERNS_LISTED and parses every row's blob just to build thumbnails,
// which the settings account-summary card (its one caller) needs neither of.
export function countPatternsForUser(userId: string): Promise<number> {
  return prisma.pattern.count({ where: { userId } });
}

export async function listPatternsForUser(
  userId: string,
): Promise<PatternListItem[]> {
  const rows = await prisma.pattern.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: MAX_PATTERNS_LISTED,
  });
  // #58: an unparseable row is skipped rather than thrown on -- one drifted
  // blob costs its own tile, not the whole dashboard.
  const items: PatternListItem[] = [];
  for (const row of rows) {
    const state = toState(row.id, row.data);
    if (!state) continue;
    items.push({
      id: row.id,
      name: state.pattern.name,
      // `pattern.spec` always has a default `type` (even pre-generation, for
      // baseMeasurements) — a pattern only really "is" that garment type once
      // it's been drafted into pieces. A blank pattern reports null.
      garmentType:
        state.pattern.pieces.length > 0
          ? (state.pattern.spec?.type ?? null)
          : null,
      updatedAt: row.updatedAt.toISOString(),
      thumbnailSvg: buildThumbnailSvg(state.pattern),
    });
  }
  return items;
}

export async function renamePattern(
  patternId: string,
  userId: string,
  name: string,
): Promise<boolean> {
  const renamed = await withPattern(patternId, userId, (state) => {
    state.pattern = { ...state.pattern, name };
  });
  return renamed !== null;
}

export async function deletePattern(
  patternId: string,
  userId: string,
): Promise<boolean> {
  const res = await prisma.pattern.deleteMany({
    where: { id: patternId, userId },
  });
  return res.count > 0;
}
