import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { seedState } from "@/lib/editor/state";
import type { EditorState } from "@/lib/types";

// The timeout needs to cover the AI call (proposeGarment ~5–12s), which runs
// INSIDE the transaction — Prisma's 5s default would time out. Holding the
// lock during the AI call is intentional: it's what serializes the user's requests.
const TX_OPTS = { timeout: 30_000, maxWait: 10_000 } as const;

function toState(data: Prisma.JsonValue): EditorState {
  return data as unknown as EditorState;
}

// load → fn(state) → save, inside an interactive transaction with a row lock.
// Guarantees the credit flow's atomicity.
export async function withMolde<T>(
  userId: string,
  fn: (state: EditorState) => T | Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Materializes the seed if missing, so there's a row to lock even on the
    // very first concurrent access (INSERT ... ON CONFLICT DO NOTHING).
    const seed = JSON.stringify(seedState());
    await tx.$executeRaw`
      INSERT INTO "Molde" ("userId", "data", "updatedAt")
      VALUES (${userId}, ${seed}::jsonb, now())
      ON CONFLICT ("userId") DO NOTHING`;
    // Locks the row and reads the current state.
    const rows = await tx.$queryRaw<{ data: Prisma.JsonValue }[]>`
      SELECT "data" FROM "Molde" WHERE "userId" = ${userId} FOR UPDATE`;
    const state = toState(rows[0].data);
    const result = await fn(state);
    await tx.$executeRaw`
      UPDATE "Molde" SET "data" = ${JSON.stringify(state)}::jsonb, "updatedAt" = now()
      WHERE "userId" = ${userId}`;
    return result;
  }, TX_OPTS);
}

// Read-only fetch for the GET: returns seedState() without writing if there's no row.
export async function loadMolde(userId: string): Promise<EditorState> {
  const row = await prisma.molde.findUnique({ where: { userId } });
  return row ? toState(row.data) : seedState();
}

// Resets the user's molde to the blank molde and persists it.
export async function resetMolde(userId: string): Promise<EditorState> {
  const state = seedState();
  const data = state as unknown as Prisma.InputJsonValue;
  await prisma.molde.upsert({
    where: { userId },
    create: { userId, data },
    update: { data },
  });
  return state;
}
