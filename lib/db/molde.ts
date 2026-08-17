import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { seedMoldeState } from "@/lib/editor/state";
import type { MoldeState } from "@/lib/types";

type Tx = Prisma.TransactionClient;

// The timeout needs to cover the AI call (proposeGarment ~5–12s), which runs
// INSIDE the transaction — Prisma's 5s default would time out. Holding the
// lock during the AI call is intentional: it's what serializes the user's requests.
export const TX_OPTS = { timeout: 30_000, maxWait: 10_000 } as const;

function toState(data: Prisma.JsonValue): MoldeState {
  return data as unknown as MoldeState;
}

// Materializes the seed if missing (INSERT ... ON CONFLICT DO NOTHING), then
// locks and reads the row (SELECT ... FOR UPDATE). Exported so
// lib/db/molde-wallet.ts can lock this row inside its own combined transaction
// without duplicating the SQL.
export async function lockMolde(tx: Tx, userId: string): Promise<MoldeState> {
  const seed = JSON.stringify(seedMoldeState());
  await tx.$executeRaw`
    INSERT INTO "Molde" ("userId", "data", "updatedAt")
    VALUES (${userId}, ${seed}::jsonb, now())
    ON CONFLICT ("userId") DO NOTHING`;
  const rows = await tx.$queryRaw<{ data: Prisma.JsonValue }[]>`
    SELECT "data" FROM "Molde" WHERE "userId" = ${userId} FOR UPDATE`;
  return toState(rows[0].data);
}

export async function saveMolde(
  tx: Tx,
  userId: string,
  state: MoldeState,
): Promise<void> {
  await tx.$executeRaw`
    UPDATE "Molde" SET "data" = ${JSON.stringify(state)}::jsonb, "updatedAt" = now()
    WHERE "userId" = ${userId}`;
}

// load → fn(state) → save, inside an interactive transaction with a row lock.
// Guarantees mutations made inside fn are all-or-nothing.
export async function withMolde<T>(
  userId: string,
  fn: (state: MoldeState) => T | Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    const state = await lockMolde(tx, userId);
    const result = await fn(state);
    await saveMolde(tx, userId, state);
    return result;
  }, TX_OPTS);
}

// Read-only fetch for the GET: returns seedMoldeState() without writing if there's no row.
export async function loadMolde(userId: string): Promise<MoldeState> {
  const row = await prisma.molde.findUnique({ where: { userId } });
  return row ? toState(row.data) : seedMoldeState();
}

// Resets the user's molde to the blank molde and persists it.
export async function resetMolde(userId: string): Promise<MoldeState> {
  const state = seedMoldeState();
  const data = state as unknown as Prisma.InputJsonValue;
  await prisma.molde.upsert({
    where: { userId },
    create: { userId, data },
    update: { data },
  });
  return state;
}
