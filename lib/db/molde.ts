import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { seedState } from "@/lib/editor/state";
import type { EditorState } from "@/lib/types";

// O timeout precisa cobrir a chamada à IA (proposeGarment ~5–12s) que roda
// DENTRO da transação — o default de 5s do Prisma estouraria. Segurar o lock
// durante a IA é intencional: é o que serializa os requests do usuário.
const TX_OPTS = { timeout: 30_000, maxWait: 10_000 } as const;

function toState(data: Prisma.JsonValue): EditorState {
  return data as unknown as EditorState;
}

// load → fn(state) → save, numa transação interativa com lock de linha.
// Garante a atomicidade do fluxo de crédito.
export async function withMolde<T>(
  userId: string,
  fn: (state: EditorState) => T | Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Materializa o seed se ausente, para haver linha a travar mesmo no
    // primeiríssimo acesso concorrente (INSERT ... ON CONFLICT DO NOTHING).
    const seed = JSON.stringify(seedState());
    await tx.$executeRaw`
      INSERT INTO "Molde" ("userId", "data", "updatedAt")
      VALUES (${userId}, ${seed}::jsonb, now())
      ON CONFLICT ("userId") DO NOTHING`;
    // Trava a linha e lê o estado atual.
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

// Leitura read-only p/ o GET: devolve seedState() sem gravar se não houver linha.
export async function loadMolde(userId: string): Promise<EditorState> {
  const row = await prisma.molde.findUnique({ where: { userId } });
  return row ? toState(row.data) : seedState();
}

// Reseta o molde do usuário para o blank molde e persiste.
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
