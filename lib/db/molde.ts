import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { seedMoldeState } from "@/lib/editor/state";
import { buildThumbnailSvg } from "@/lib/editor/thumbnail";
import type { GarmentType, MoldeState } from "@/lib/types";

type Tx = Prisma.TransactionClient;

// The timeout needs to cover the AI call (proposeGarment ~5–12s), which runs
// INSIDE the transaction — Prisma's 5s default would time out. Holding the
// lock during the AI call is intentional: it's what serializes the user's requests.
export const TX_OPTS = { timeout: 30_000, maxWait: 10_000 } as const;

function toState(data: Prisma.JsonValue): MoldeState {
  return data as unknown as MoldeState;
}

export function moldeNotFound(): NextResponse {
  return NextResponse.json(
    { status: "not_found", error: "Molde não encontrado." },
    { status: 404 },
  );
}

// Locks and reads the row, scoped to (id, userId) — a molde owned by someone
// else reads as null, identical to a molde that doesn't exist at all.
// Exported so lib/db/molde-wallet.ts can lock this row inside its own
// combined transaction without duplicating the SQL.
export async function lockMolde(
  tx: Tx,
  moldeId: string,
  userId: string,
): Promise<MoldeState | null> {
  const rows = await tx.$queryRaw<{ data: Prisma.JsonValue }[]>`
    SELECT "data" FROM "Molde" WHERE "id" = ${moldeId} AND "userId" = ${userId} FOR UPDATE`;
  return rows[0] ? toState(rows[0].data) : null;
}

export async function saveMolde(
  tx: Tx,
  moldeId: string,
  state: MoldeState,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Molde" SET "data" = ${JSON.stringify(state)}::jsonb, "updatedAt" = now()
    WHERE "id" = ${moldeId}`;
}

// load → fn(state) → save, inside an interactive transaction with a row lock.
// Returns null (without calling fn) when the molde doesn't exist or isn't
// the caller's — routes turn that into moldeNotFound().
export async function withMolde<T>(
  moldeId: string,
  userId: string,
  fn: (state: MoldeState) => T | Promise<T>,
): Promise<T | null> {
  return prisma.$transaction(async (tx) => {
    const state = await lockMolde(tx, moldeId, userId);
    if (!state) return null;
    const result = await fn(state);
    await saveMolde(tx, moldeId, state);
    return result;
  }, TX_OPTS);
}

// Read-only fetch, ownership-scoped. Null when missing or not owned.
export async function loadMolde(
  moldeId: string,
  userId: string,
): Promise<MoldeState | null> {
  const row = await prisma.molde.findUnique({ where: { id: moldeId } });
  if (!row || row.userId !== userId) return null;
  return toState(row.data);
}

export async function createMolde(userId: string): Promise<string> {
  const data = seedMoldeState() as unknown as Prisma.InputJsonValue;
  const row = await prisma.molde.create({ data: { userId, data } });
  return row.id;
}

export interface MoldeListItem {
  id: string;
  name: string;
  garmentType: GarmentType | null;
  updatedAt: string;
  thumbnailSvg: string;
}

export async function listMoldesForUser(
  userId: string,
): Promise<MoldeListItem[]> {
  const rows = await prisma.molde.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map((row) => {
    const state = toState(row.data);
    return {
      id: row.id,
      name: state.pattern.name,
      // `pattern.spec` always has a default `type` (even pre-generation, for
      // baseMeasurements) — a molde only really "is" that garment type once
      // it's been drafted into pieces. A blank molde reports null.
      garmentType:
        state.pattern.pieces.length > 0
          ? (state.pattern.spec?.type ?? null)
          : null,
      updatedAt: row.updatedAt.toISOString(),
      thumbnailSvg: buildThumbnailSvg(state.pattern),
    };
  });
}

export async function renameMolde(
  moldeId: string,
  userId: string,
  name: string,
): Promise<boolean> {
  const renamed = await withMolde(moldeId, userId, (state) => {
    state.pattern = { ...state.pattern, name };
  });
  return renamed !== null;
}

export async function deleteMolde(
  moldeId: string,
  userId: string,
): Promise<boolean> {
  const res = await prisma.molde.deleteMany({
    where: { id: moldeId, userId },
  });
  return res.count > 0;
}
