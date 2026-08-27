import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake Prisma: a "table" of rows, each `{ id, userId, data, updatedAt }` --
// same in-memory-rows precedent as lib/db/pattern.test.ts and
// lib/db/sizeChart.test.ts.
interface Row {
  id: string;
  userId: string;
  data: unknown;
  updatedAt: Date;
}
let rows: Row[] = [];
let nextId = 1;

// #166: matches the specifier this file's own subject imports (see
// lib/db/aliasResolution.test.ts and CLAUDE.md's testing-conventions note).
vi.mock("./prisma", () => ({
  prisma: {
    sloper: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        rows
          .filter((r) => r.userId === where.userId)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = rows.find((r) => r.id === where.id);
        return row ?? null;
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: { userId: string; data: unknown };
        }): Promise<Row> => {
          const row: Row = {
            id: `s${nextId++}`,
            userId: data.userId,
            data: data.data,
            updatedAt: new Date(),
          };
          rows.push(row);
          return row;
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; userId: string };
          data: { data: unknown };
        }): Promise<{ count: number }> => {
          const row = rows.find(
            (r) => r.id === where.id && r.userId === where.userId,
          );
          if (!row) return { count: 0 };
          row.data = data.data;
          row.updatedAt = new Date();
          return { count: 1 };
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
  listSlopersForUser,
  createSloper,
  loadSloper,
  renameSloper,
  deleteSloper,
  sloperNotFound,
  MAX_SLOPERS_LISTED,
} from "./sloper";
import { prisma } from "./prisma";
import { sloperFromPattern } from "@/lib/slopers/convert";
import { seedPatternState, applyGarmentSpec } from "@/lib/editor/state";
import { t } from "@/lib/i18n/test-translate";

function draftedSloper(name = "Base blusa") {
  const state = seedPatternState(t);
  applyGarmentSpec(
    state,
    { type: "blouse", gender: "female", measurementOverrides: {}, style: {} },
    t,
  );
  return sloperFromPattern(state.pattern, name);
}

describe("createSloper / listSlopersForUser", () => {
  beforeEach(() => {
    rows = [];
    nextId = 1;
  });

  it("creates a sloper and lists it back with a drafted thumbnail", async () => {
    const created = await createSloper("u1", draftedSloper(), t);
    expect(created.name).toBe("Base blusa");
    expect(created.garmentType).toBe("blouse");
    expect(created.thumbnailSvg).toContain("<svg");

    const list = await listSlopersForUser("u1", t);
    expect(list.map((s) => s.id)).toEqual([created.id]);
  });

  it("scopes the list to the requesting user", async () => {
    await createSloper("u1", draftedSloper(), t);
    await createSloper("u2", draftedSloper(), t);
    const list = await listSlopersForUser("u1", t);
    expect(list).toHaveLength(1);
  });

  // #58: used to be a bare assertion, so a row whose baseSize had drifted
  // out of its own sizeTable was trusted as-is and fed straight to
  // patternFromSloper, which would draft NaN geometry.
  it("skips an unparseable row instead of throwing or listing corrupt data", async () => {
    const good = await createSloper("u1", draftedSloper(), t);
    const corruptSloper = draftedSloper("Corrupted");
    delete corruptSloper.sizeTable[corruptSloper.baseSize];
    rows.push({
      id: "corrupt",
      userId: "u1",
      data: corruptSloper,
      updatedAt: new Date(),
    });
    const list = await listSlopersForUser("u1", t);
    expect(list.map((s) => s.id)).toEqual([good.id]);
  });

  // #66: listSlopersForUser had no `take` at all -- an account with many
  // slopers scanned and deserialized every row, re-running draftGarment for
  // each one's thumbnail, on every /slopers load. Asserted against the
  // literal 500, not just "equals MAX_SLOPERS_LISTED": importing the same
  // constant the fix reads from would make this pass vacuously
  // (undefined === undefined) if the fix and the constant were ever
  // reverted together -- the pattern.test.ts precedent for #101.
  it("bounds the query with MAX_SLOPERS_LISTED", async () => {
    await listSlopersForUser("u1", t);
    const call = vi.mocked(prisma.sloper.findMany).mock.calls.at(-1)![0];
    expect(call?.take).toBe(500);
    expect(MAX_SLOPERS_LISTED).toBe(500);
  });
});

describe("loadSloper", () => {
  beforeEach(() => {
    rows = [];
    nextId = 1;
  });

  it("returns the data for the owning user", async () => {
    const created = await createSloper("u1", draftedSloper(), t);
    const loaded = await loadSloper(created.id, "u1");
    expect(loaded?.name).toBe("Base blusa");
  });

  it("returns null when owned by someone else", async () => {
    const created = await createSloper("u1", draftedSloper(), t);
    expect(await loadSloper(created.id, "u2")).toBeNull();
  });

  it("returns null when the id doesn't exist", async () => {
    expect(await loadSloper("nope", "u1")).toBeNull();
  });

  it("returns null instead of the raw blob when the stored row is unparseable", async () => {
    const corruptSloper = draftedSloper();
    delete corruptSloper.sizeTable[corruptSloper.baseSize];
    rows = [
      { id: "s1", userId: "u1", data: corruptSloper, updatedAt: new Date() },
    ];
    expect(await loadSloper("s1", "u1")).toBeNull();
  });
});

describe("renameSloper", () => {
  beforeEach(() => {
    rows = [];
    nextId = 1;
  });

  it("renames when owned by the user and returns true", async () => {
    const created = await createSloper("u1", draftedSloper(), t);
    expect(await renameSloper(created.id, "u1", "Nova base")).toBe(true);
    expect((await loadSloper(created.id, "u1"))?.name).toBe("Nova base");
  });

  it("returns false and does not rename when owned by someone else", async () => {
    const created = await createSloper("u1", draftedSloper(), t);
    expect(await renameSloper(created.id, "u2", "Roubado")).toBe(false);
    expect((await loadSloper(created.id, "u1"))?.name).toBe("Base blusa");
  });

  it("returns false instead of throwing when the stored row is unparseable", async () => {
    const corruptSloper = draftedSloper();
    delete corruptSloper.sizeTable[corruptSloper.baseSize];
    rows = [
      { id: "s1", userId: "u1", data: corruptSloper, updatedAt: new Date() },
    ];
    expect(await renameSloper("s1", "u1", "Nova base")).toBe(false);
  });
});

describe("deleteSloper", () => {
  beforeEach(() => {
    rows = [];
    nextId = 1;
  });

  it("deletes when owned by the user and returns true", async () => {
    const created = await createSloper("u1", draftedSloper(), t);
    expect(await deleteSloper(created.id, "u1")).toBe(true);
    expect(rows).toHaveLength(0);
  });

  it("returns false and does not delete when owned by someone else", async () => {
    const created = await createSloper("u1", draftedSloper(), t);
    expect(await deleteSloper(created.id, "u2")).toBe(false);
    expect(rows).toHaveLength(1);
  });
});

describe("sloperNotFound", () => {
  it("carries the sloper_not_found code, not pt-BR prose", async () => {
    const res = sloperNotFound();
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      status: "not_found",
      error: "sloper_not_found",
    });
  });
});
