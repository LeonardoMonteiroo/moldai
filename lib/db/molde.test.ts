import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake do client Prisma: uma "tabela" em memória keyed por userId.
const store = new Map<string, unknown>();

const tx = {
  // INSERT ... ON CONFLICT DO NOTHING (materializa seed) — só cria se ausente.
  $executeRaw: vi.fn(async () => 0),
  // SELECT data ... FOR UPDATE — devolve a linha atual (após o insert-if-absent).
  $queryRaw: vi.fn(async (): Promise<{ data: unknown }[]> => []),
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    // interactive transaction: chama o callback com o tx fake.
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    molde: {
      findUnique: vi.fn(async ({ where }: { where: { userId: string } }) => {
        const data = store.get(where.userId);
        return data === undefined ? null : { userId: where.userId, data };
      }),
      upsert: vi.fn(async ({ where, create, update }: {
        where: { userId: string };
        create: { userId: string; data: unknown };
        update: { data: unknown };
      }) => {
        const exists = store.has(where.userId);
        store.set(where.userId, exists ? update.data : create.data);
        return { userId: where.userId, data: store.get(where.userId) };
      }),
    },
  },
}));

import { withMolde, loadMolde, resetMolde } from "./molde";
import { seedState, debitCredits } from "@/lib/editor/state";

// Faz $executeRaw materializar o seed (INSERT-if-absent) e $queryRaw devolver a
// linha atual, imitando INSERT ON CONFLICT DO NOTHING + SELECT FOR UPDATE.
function wireTx() {
  tx.$executeRaw.mockImplementation(async () => 0); // no-op; o seed é semeado abaixo
  tx.$queryRaw.mockImplementation(async () => {
    const uid = "u1";
    if (!store.has(uid)) store.set(uid, seedState());
    return [{ data: store.get(uid) }];
  });
}

describe("withMolde", () => {
  beforeEach(() => {
    store.clear();
    tx.$executeRaw.mockReset();
    tx.$queryRaw.mockReset();
    wireTx();
  });

  it("semeia o blank molde no primeiro acesso e passa ao fn", async () => {
    let seen: number | null = null;
    await withMolde("u1", (state) => { seen = state.credits.balance; });
    expect(seen).toBe(320);
  });

  it("persiste as mutações do fn (débito sobrevive)", async () => {
    await withMolde("u1", (state) => { debitCredits(state, 4); });
    const s = store.get("u1") as ReturnType<typeof seedState>;
    expect(s.credits.balance).toBe(316);
  });

  it("retorna o valor devolvido pelo fn", async () => {
    const out = await withMolde("u1", () => "resp");
    expect(out).toBe("resp");
  });
});

describe("loadMolde", () => {
  beforeEach(() => { store.clear(); });
  it("devolve seed sem gravar quando não há linha", async () => {
    const s = await loadMolde("novo");
    expect(s.credits.balance).toBe(320);
    expect(store.has("novo")).toBe(false); // read-only: nada foi persistido
  });
  it("devolve o estado persistido quando existe", async () => {
    const seeded = seedState(); seeded.credits.balance = 7;
    store.set("u1", seeded);
    const s = await loadMolde("u1");
    expect(s.credits.balance).toBe(7);
  });
});

describe("resetMolde", () => {
  beforeEach(() => { store.clear(); });
  it("sobrescreve com o blank molde e persiste", async () => {
    const dirty = seedState(); dirty.credits.balance = 0; dirty.pattern.version = 9;
    store.set("u1", dirty);
    const s = await resetMolde("u1");
    expect(s.credits.balance).toBe(320);
    expect(s.pattern.version).toBe(0);
    expect((store.get("u1") as ReturnType<typeof seedState>).pattern.version).toBe(0);
  });
});
