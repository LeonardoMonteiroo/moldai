import type { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { seedPatternState } from "@/lib/editor/state";
import { buildThumbnailSvg } from "@/lib/editor/thumbnail";
import { apiError, ERROR_STATUS } from "@/lib/api/errors";
import type { GarmentType, PatternState } from "@/lib/types";

type Tx = Prisma.TransactionClient;

// The timeout needs to cover the AI call (proposeGarment ~5–12s), which runs
// INSIDE the transaction — Prisma's 5s default would time out. Holding the
// lock during the AI call is intentional: it's what serializes the user's requests.
export const TX_OPTS = { timeout: 30_000, maxWait: 10_000 } as const;

function toState(data: Prisma.JsonValue): PatternState {
  return data as unknown as PatternState;
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
  return rows[0] ? toState(rows[0].data) : null;
}

export async function savePattern(
  tx: Tx,
  patternId: string,
  state: PatternState,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Pattern" SET "data" = ${JSON.stringify(state)}::jsonb, "updatedAt" = now()
    WHERE "id" = ${patternId}`;
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
    await savePattern(tx, patternId, state);
    return result;
  }, TX_OPTS);
}

// Read-only fetch, ownership-scoped. Null when missing or not owned.
export async function loadPattern(
  patternId: string,
  userId: string,
): Promise<PatternState | null> {
  const row = await prisma.pattern.findUnique({ where: { id: patternId } });
  if (!row || row.userId !== userId) return null;
  return toState(row.data);
}

export async function createPattern(userId: string): Promise<string> {
  const data = seedPatternState() as unknown as Prisma.InputJsonValue;
  const row = await prisma.pattern.create({ data: { userId, data } });
  return row.id;
}

export interface PatternListItem {
  id: string;
  name: string;
  garmentType: GarmentType | null;
  updatedAt: string;
  thumbnailSvg: string;
}

export async function listPatternsForUser(
  userId: string,
): Promise<PatternListItem[]> {
  const rows = await prisma.pattern.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((row) => {
    const state = toState(row.data);
    return {
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
    };
  });
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
