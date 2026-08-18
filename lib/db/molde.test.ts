import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake Prisma: a "table" of rows, each `{ id, userId, data, updatedAt }`.
interface Row {
  id: string;
  userId: string;
  data: unknown;
  updatedAt: Date;
}
let rows: Row[] = [];
let nextId = 1;

const tx = {
  $queryRaw: vi.fn(async (): Promise<{ data: unknown }[]> => []),
  $executeRaw: vi.fn(
    async (
      _strings: TemplateStringsArray,
      ..._vals: unknown[]
    ): Promise<number> => 0,
  ),
};

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
    molde: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = rows.find((r) => r.id === where.id);
        return row ?? null;
      }),
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        rows
          .filter((r) => r.userId === where.userId)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: { userId: string; data: unknown };
        }): Promise<Row> => {
          const row: Row = {
            id: `m${nextId++}`,
            userId: data.userId,
            data: data.data,
            updatedAt: new Date(),
          };
          rows.push(row);
          return row;
        },
      ),
      deleteMany: vi.fn(
        async ({
          where,
        }: {
          where: { id: string; userId: string };
        }): Promise<{ count: number }> => {
          const before = rows.length;
          rows = rows.filter(
            (r) => !(r.id === where.id && r.userId === where.userId),
          );
          return { count: before - rows.length };
        },
      ),
    },
  },
}));

import {
  withMolde,
  loadMolde,
  createMolde,
  listMoldesForUser,
  renameMolde,
  deleteMolde,
} from "./molde";
import { seedMoldeState, bumpVersion } from "@/lib/editor/state";

// Wires the fake tx to read/write `rows` by (id, userId), mimicking
// `SELECT ... WHERE id = $1 AND userId = $2 FOR UPDATE` + the final UPDATE.
function wireTx() {
  tx.$queryRaw.mockImplementation(async (_s: unknown, ...vals: unknown[]) => {
    const [id, userId] = vals as [string, string];
    const row = rows.find((r) => r.id === id && r.userId === userId);
    return row ? [{ data: JSON.parse(JSON.stringify(row.data)) }] : [];
  });
  tx.$executeRaw.mockImplementation(
    async (strings: TemplateStringsArray, ...vals: unknown[]) => {
      const sql = Array.isArray(strings) ? strings.join("") : String(strings);
      if (sql.includes("UPDATE")) {
        const id = vals.find(
          (v) => typeof v === "string" && rows.some((r) => r.id === v),
        ) as string | undefined;
        const jsonStr = vals.find(
          (v): v is string =>
            typeof v === "string" && v.trimStart().startsWith("{"),
        );
        const row = rows.find((r) => r.id === id);
        if (row && jsonStr) {
          row.data = JSON.parse(jsonStr);
          row.updatedAt = new Date();
        }
      }
      return 0;
    },
  );
}

describe("withMolde", () => {
  beforeEach(() => {
    rows = [
      { id: "m1", userId: "u1", data: seedMoldeState(), updatedAt: new Date() },
    ];
    nextId = 2;
    tx.$queryRaw.mockReset();
    tx.$executeRaw.mockReset();
    wireTx();
  });

  it("passes the state to fn when the molde belongs to the user", async () => {
    let seen: number | null = null;
    await withMolde("m1", "u1", (state) => {
      seen = state.pattern.version;
    });
    expect(seen).toBe(0);
  });

  it("persists fn's mutations", async () => {
    await withMolde("m1", "u1", (state) => bumpVersion(state));
    const row = rows.find((r) => r.id === "m1")!;
    expect((row.data as { pattern: { version: number } }).pattern.version).toBe(
      1,
    );
  });

  it("returns null and does not call fn for a molde owned by someone else", async () => {
    let called = false;
    const out = await withMolde("m1", "someone-else", () => {
      called = true;
    });
    expect(out).toBeNull();
    expect(called).toBe(false);
  });

  it("returns null for a molde id that doesn't exist", async () => {
    const out = await withMolde("does-not-exist", "u1", () => "x");
    expect(out).toBeNull();
  });

  it("returns the value fn returns", async () => {
    const out = await withMolde("m1", "u1", () => "resp");
    expect(out).toBe("resp");
  });
});

describe("loadMolde", () => {
  beforeEach(() => {
    rows = [
      { id: "m1", userId: "u1", data: seedMoldeState(), updatedAt: new Date() },
    ];
  });

  it("returns the state for the owning user", async () => {
    const s = await loadMolde("m1", "u1");
    expect(s?.pattern.version).toBe(0);
  });

  it("returns null when owned by someone else", async () => {
    expect(await loadMolde("m1", "u2")).toBeNull();
  });

  it("returns null when the id doesn't exist", async () => {
    expect(await loadMolde("nope", "u1")).toBeNull();
  });
});

describe("createMolde", () => {
  beforeEach(() => {
    rows = [];
    nextId = 1;
  });

  it("creates a blank molde for the user and returns its id", async () => {
    const id = await createMolde("u1");
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe("u1");
    expect(id).toBe(rows[0].id);
    expect(
      (rows[0].data as { pattern: { version: number } }).pattern.version,
    ).toBe(0);
  });
});

describe("listMoldesForUser", () => {
  beforeEach(() => {
    rows = [
      {
        id: "m1",
        userId: "u1",
        data: seedMoldeState(),
        updatedAt: new Date("2026-01-01"),
      },
      {
        id: "m2",
        userId: "u1",
        data: seedMoldeState(),
        updatedAt: new Date("2026-02-01"),
      },
      {
        id: "m3",
        userId: "u2",
        data: seedMoldeState(),
        updatedAt: new Date("2026-03-01"),
      },
    ];
  });

  it("returns only the user's moldes, most recently updated first", async () => {
    const list = await listMoldesForUser("u1");
    expect(list.map((m) => m.id)).toEqual(["m2", "m1"]);
  });

  it("projects name/garmentType/thumbnail from the stored state", async () => {
    const list = await listMoldesForUser("u1");
    expect(list[0].name).toBe("Novo molde");
    expect(list[0].garmentType).toBe("blouse");
    expect(list[0].thumbnailSvg).toContain("<svg");
  });
});

describe("renameMolde", () => {
  beforeEach(() => {
    rows = [
      { id: "m1", userId: "u1", data: seedMoldeState(), updatedAt: new Date() },
    ];
    tx.$queryRaw.mockReset();
    tx.$executeRaw.mockReset();
    wireTx();
  });

  it("renames when owned by the user and returns true", async () => {
    const ok = await renameMolde("m1", "u1", "Vestido de festa");
    expect(ok).toBe(true);
    const row = rows.find((r) => r.id === "m1")!;
    expect((row.data as { pattern: { name: string } }).pattern.name).toBe(
      "Vestido de festa",
    );
  });

  it("returns false and does not rename when owned by someone else", async () => {
    const ok = await renameMolde("m1", "u2", "Roubado");
    expect(ok).toBe(false);
    const row = rows.find((r) => r.id === "m1")!;
    expect((row.data as { pattern: { name: string } }).pattern.name).toBe(
      "Novo molde",
    );
  });
});

describe("deleteMolde", () => {
  beforeEach(() => {
    rows = [
      { id: "m1", userId: "u1", data: seedMoldeState(), updatedAt: new Date() },
    ];
  });

  it("deletes when owned by the user and returns true", async () => {
    const ok = await deleteMolde("m1", "u1");
    expect(ok).toBe(true);
    expect(rows).toHaveLength(0);
  });

  it("returns false and does not delete when owned by someone else", async () => {
    const ok = await deleteMolde("m1", "u2");
    expect(ok).toBe(false);
    expect(rows).toHaveLength(1);
  });
});
