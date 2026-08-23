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
  $queryRaw: vi.fn(
    async (..._args: unknown[]): Promise<{ data: unknown }[]> => [],
  ),
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
    pattern: {
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
  withPattern,
  loadPattern,
  createPattern,
  listPatternsForUser,
  renamePattern,
  deletePattern,
  patternNotFound,
  savePattern,
} from "./pattern";
import { prisma } from "@/lib/db/prisma";
import { seedPatternState, bumpVersion } from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";
import { MAX_PATTERNS_LISTED } from "@/lib/types";

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
        // Interpolation order matches savePattern: json, id, userId.
        const [jsonStr, id, userId] = vals as [string, string, string];
        const row = rows.find((r) => r.id === id && r.userId === userId);
        if (row) {
          row.data = JSON.parse(jsonStr);
          row.updatedAt = new Date();
        }
      }
      return 0;
    },
  );
}

describe("withPattern", () => {
  beforeEach(() => {
    rows = [
      {
        id: "m1",
        userId: "u1",
        data: seedPatternState(t),
        updatedAt: new Date(),
      },
    ];
    nextId = 2;
    tx.$queryRaw.mockReset();
    tx.$executeRaw.mockReset();
    wireTx();
  });

  it("passes the state to fn when the pattern belongs to the user", async () => {
    let seen: number | null = null;
    await withPattern("m1", "u1", (state) => {
      seen = state.pattern.version;
    });
    expect(seen).toBe(0);
  });

  it("persists fn's mutations", async () => {
    await withPattern("m1", "u1", (state) => bumpVersion(state));
    const row = rows.find((r) => r.id === "m1")!;
    expect((row.data as { pattern: { version: number } }).pattern.version).toBe(
      1,
    );
  });

  it("returns null and does not call fn for a pattern owned by someone else", async () => {
    let called = false;
    const out = await withPattern("m1", "someone-else", () => {
      called = true;
    });
    expect(out).toBeNull();
    expect(called).toBe(false);
  });

  it("returns null for a pattern id that doesn't exist", async () => {
    const out = await withPattern("does-not-exist", "u1", () => "x");
    expect(out).toBeNull();
  });

  it("returns the value fn returns", async () => {
    const out = await withPattern("m1", "u1", () => "resp");
    expect(out).toBe("resp");
  });

  // #72: every current caller only reaches savePattern after lockPattern has
  // already verified ownership inside the same transaction, so this can't be
  // exploited through withPattern's own API today -- it guards a future
  // caller that saves without locking first, mirroring lockPattern's own
  // (id, userId) scoping on the read side.
  it("savePattern does not persist a mutation for a userId that doesn't own the row", async () => {
    const before = JSON.stringify(rows.find((r) => r.id === "m1")!.data);
    const mutated = seedPatternState(t);
    bumpVersion(mutated);
    await savePattern(tx as never, "m1", "someone-else", mutated);
    expect(JSON.stringify(rows.find((r) => r.id === "m1")!.data)).toBe(before);
  });
});

describe("loadPattern", () => {
  const ROW_UPDATED_AT = new Date("2026-08-21T11:30:00.000Z");

  beforeEach(() => {
    rows = [
      {
        id: "m1",
        userId: "u1",
        data: seedPatternState(t),
        updatedAt: ROW_UPDATED_AT,
      },
    ];
  });

  it("returns the state for the owning user", async () => {
    const s = await loadPattern("m1", "u1");
    expect(s?.state.pattern.version).toBe(0);
  });

  it("returns the row's own updatedAt column alongside the state", async () => {
    const s = await loadPattern("m1", "u1");
    expect(s?.updatedAt).toEqual(ROW_UPDATED_AT);
  });

  it("returns null when owned by someone else", async () => {
    expect(await loadPattern("m1", "u2")).toBeNull();
  });

  it("returns null when the id doesn't exist", async () => {
    expect(await loadPattern("nope", "u1")).toBeNull();
  });
});

describe("createPattern", () => {
  beforeEach(() => {
    rows = [];
    nextId = 1;
  });

  it("creates a blank pattern for the user and returns its id", async () => {
    const id = await createPattern("u1", t);
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe("u1");
    expect(id).toBe(rows[0].id);
    expect(
      (rows[0].data as { pattern: { version: number } }).pattern.version,
    ).toBe(0);
  });
});

describe("listPatternsForUser", () => {
  beforeEach(() => {
    rows = [
      {
        id: "m1",
        userId: "u1",
        data: seedPatternState(t),
        updatedAt: new Date("2026-01-01"),
      },
      {
        id: "m2",
        userId: "u1",
        data: seedPatternState(t),
        updatedAt: new Date("2026-02-01"),
      },
      {
        id: "m3",
        userId: "u2",
        data: seedPatternState(t),
        updatedAt: new Date("2026-03-01"),
      },
    ];
  });

  it("returns only the user's patterns, most recently updated first", async () => {
    const list = await listPatternsForUser("u1");
    expect(list.map((m) => m.id)).toEqual(["m2", "m1"]);
  });

  // #101: the query had no `take` at all -- an account with many patterns
  // scanned and deserialized every row (and built a thumbnail for each) on
  // every dashboard load, with no bound. Asserted against the literal 500,
  // not just "equals MAX_PATTERNS_LISTED": importing the same constant the
  // fix reads from would make this pass vacuously (undefined === undefined)
  // if the fix and the constant were ever reverted together.
  it("bounds the query with MAX_PATTERNS_LISTED", async () => {
    await listPatternsForUser("u1");
    const call = vi.mocked(prisma.pattern.findMany).mock.calls.at(-1)![0];
    expect(call?.take).toBe(500);
    expect(MAX_PATTERNS_LISTED).toBe(500);
  });

  it("projects name/thumbnail from the stored state", async () => {
    const list = await listPatternsForUser("u1");
    expect(list[0].name).toBe("newPatternName");
    expect(list[0].thumbnailSvg).toContain("<svg");
  });

  it("garmentType is null for a still-blank pattern (0 pieces), even though spec.type defaults to a value", async () => {
    const list = await listPatternsForUser("u1");
    expect(list[0].garmentType).toBeNull();
  });

  it("garmentType reflects spec.type once the pattern has drafted pieces", async () => {
    const drafted = seedPatternState(t);
    drafted.pattern.pieces = [
      {
        id: "body-front",
        name: "Frente",
        qty: 1,
        outline: { kind: "polygon", points: "0,0 10,0 10,10" },
        label: { x: 0, y: 0 },
        detailRows: [],
      },
    ];
    rows.push({
      id: "m4",
      userId: "u1",
      data: drafted,
      updatedAt: new Date("2026-04-01"),
    });
    const list = await listPatternsForUser("u1");
    expect(list[0].garmentType).toBe("blouse");
  });
});

describe("renamePattern", () => {
  beforeEach(() => {
    rows = [
      {
        id: "m1",
        userId: "u1",
        data: seedPatternState(t),
        updatedAt: new Date(),
      },
    ];
    tx.$queryRaw.mockReset();
    tx.$executeRaw.mockReset();
    wireTx();
  });

  it("renames when owned by the user and returns true", async () => {
    const ok = await renamePattern("m1", "u1", "Vestido de festa");
    expect(ok).toBe(true);
    const row = rows.find((r) => r.id === "m1")!;
    expect((row.data as { pattern: { name: string } }).pattern.name).toBe(
      "Vestido de festa",
    );
  });

  it("returns false and does not rename when owned by someone else", async () => {
    const ok = await renamePattern("m1", "u2", "Roubado");
    expect(ok).toBe(false);
    const row = rows.find((r) => r.id === "m1")!;
    expect((row.data as { pattern: { name: string } }).pattern.name).toBe(
      "newPatternName",
    );
  });
});

describe("deletePattern", () => {
  beforeEach(() => {
    rows = [
      {
        id: "m1",
        userId: "u1",
        data: seedPatternState(t),
        updatedAt: new Date(),
      },
    ];
  });

  it("deletes when owned by the user and returns true", async () => {
    const ok = await deletePattern("m1", "u1");
    expect(ok).toBe(true);
    expect(rows).toHaveLength(0);
  });

  it("returns false and does not delete when owned by someone else", async () => {
    const ok = await deletePattern("m1", "u2");
    expect(ok).toBe(false);
    expect(rows).toHaveLength(1);
  });
});

describe("patternNotFound", () => {
  it("carries the pattern_not_found code, not pt-BR prose", async () => {
    const res = patternNotFound();
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      status: "not_found",
      error: "pattern_not_found",
    });
  });
});
