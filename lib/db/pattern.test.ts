import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake Prisma: a "table" of rows, each `{ id, userId, data, updatedAt }`.
interface Row {
  id: string;
  userId: string;
  data: unknown;
  updatedAt: Date;
  createdAt?: Date;
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

// #166: matches the specifier this file's own subject imports (see
// lib/db/aliasResolution.test.ts and CLAUDE.md's testing-conventions note).
vi.mock("./prisma", () => ({
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
      count: vi.fn(
        async ({
          where,
        }: {
          where: { userId: string; createdAt?: { gte: Date } };
        }) =>
          rows.filter(
            (r) =>
              r.userId === where.userId &&
              (!where.createdAt ||
                (r.createdAt?.getTime() ?? 0) >= where.createdAt.gte.getTime()),
          ).length,
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
  countPatternsForUser,
  countPatternsCreatedSince,
  renamePattern,
  deletePattern,
  patternNotFound,
  savePattern,
} from "./pattern";
import { prisma } from "./prisma";
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

  // #216: lockPattern shares toState with loadPattern, so a mutation path
  // (generate/graduate/etc.) sees the corrected id too, not just a plain
  // read -- and the id it sees is what gets persisted back on save.
  it("sees the row's real id, not the blob's stale one, inside a mutation", async () => {
    let seen: string | null = null;
    await withPattern("m1", "u1", (state) => {
      seen = state.pattern.id;
    });
    expect(seen).toBe("m1");
  });

  // PFORM-67: ChatMessageSchema strips any message key it does not name, and
  // the strip is not confined to the response -- lockPattern returns the
  // PARSED state and savePattern writes that same object straight back, so an
  // unlisted field is deleted from the row by the very next mutating turn.
  // A route that writes imageCount into a message it never reads again would
  // pass its own "the persisted message carries imageCount" assertion and
  // still lose the value one turn later, which is what this pins.
  //
  // Note it asserts imageCount only. `hasImage` and `assembly` are absent
  // from that same schema and are being destroyed the same way today -- a
  // real pre-existing defect, reported separately rather than folded into
  // this feature's commit, since it predates it and needs its own coverage.
  it("keeps a chat message's imageCount across a read-modify-write round trip", async () => {
    const seeded = seedPatternState(t);
    seeded.chat.push({
      id: "c1",
      author: "user",
      text: "uma blusa como nessas fotos",
      createdAt: 1,
      hasImage: true,
      imageCount: 3,
    });
    rows = [
      {
        id: "m1",
        userId: "u1",
        data: JSON.parse(JSON.stringify(seeded)),
        updatedAt: new Date(),
      },
    ];

    await withPattern("m1", "u1", (state) => bumpVersion(state));

    const saved = rows.find((r) => r.id === "m1")!.data as {
      chat: { imageCount?: number }[];
    };
    expect(saved.chat[0].imageCount).toBe(3);
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

  // #58: used to be a bare `data as unknown as PatternState` assertion, so a
  // row whose baseSize had drifted out of its own sizeTable (or any other
  // structural corruption) was trusted as-is and fed straight to the
  // drafter, which computed NaN geometry. It's now rejected at the read
  // boundary and treated the same as a missing pattern.
  it("returns null instead of the raw blob when the stored row is unparseable", async () => {
    const state = seedPatternState(t);
    delete state.pattern.sizeTable[state.pattern.baseSize];
    rows = [{ id: "m1", userId: "u1", data: state, updatedAt: new Date() }];
    expect(await loadPattern("m1", "u1")).toBeNull();
  });

  // #216: seedPattern() bakes id: "demo" into every blank pattern's blob and
  // nothing ever rewrote it, so the editor footer's "Exportar"/"Histórico de
  // versões" links (which read pattern.id off the composed EditorState)
  // always pointed at /pattern/demo/... instead of the row it was actually
  // reading. The row's real id must win over whatever the blob claims.
  it("overrides the blob's own (possibly stale) pattern.id with the row's real id", async () => {
    const s = await loadPattern("m1", "u1");
    expect(s?.state.pattern.id).toBe("m1");
    expect(s?.state.pattern.id).not.toBe("demo");
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

  // PFORM-04: the creation form knows the pattern's name before the pattern
  // exists, so it starts under that name rather than being created as "Novo
  // molde" and immediately renamed.
  it("starts the pattern under a supplied name", async () => {
    await createPattern("u1", t, "Blusa gola alta");
    expect((rows[0].data as { pattern: { name: string } }).pattern.name).toBe(
      "Blusa gola alta",
    );
  });

  // Every existing caller passes no name, and must keep resolving the
  // catalog's own default through the injected translator.
  it("keeps the catalog's default name when none is supplied", async () => {
    await createPattern("u1", t);
    expect((rows[0].data as { pattern: { name: string } }).pattern.name).toBe(
      t("newPatternName"),
    );
  });

  // PFORM-04's empty-name case: submitting with the field untouched creates
  // the pattern under the default rather than under an empty string, and the
  // fallback holds here too, not only where the route trims.
  it("falls back to the default name for a blank name", async () => {
    await createPattern("u1", t, "");
    expect((rows[0].data as { pattern: { name: string } }).pattern.name).toBe(
      t("newPatternName"),
    );
  });

  // A supplied name changes the name and nothing else -- an implementation
  // that built its own state instead of seeding one would pass the name
  // assertion above and fail here.
  it("changes only the name, leaving the rest of the seeded blank state intact", async () => {
    await createPattern("u1", t, "Saia godê");
    const state = rows[0].data as {
      pattern: { version: number; pieces: unknown[] };
      chat: unknown[];
      conflict: unknown;
    };
    expect(state.pattern.version).toBe(0);
    expect(state.pattern.pieces).toEqual([]);
    expect(state.chat).toEqual([]);
    expect(state.conflict).toBeNull();
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

  // STGS-04: the settings account-summary card's pattern count reads this,
  // not listPatternsForUser's MAX_PATTERNS_LISTED-capped, blob-parsing list.
  // Asserted against real per-user counting behavior (not a spied call), so
  // a mutation hardcoding the count is caught.
  it("countPatternsForUser counts only that user's rows, uncapped", async () => {
    await expect(countPatternsForUser("u1")).resolves.toBe(2);
    await expect(countPatternsForUser("u2")).resolves.toBe(1);
    await expect(countPatternsForUser("nobody")).resolves.toBe(0);
  });

  // Settings' "Moldes ativos" stat card's own sub-caption.
  it("countPatternsCreatedSince counts only that user's patterns created on or after the cutoff", async () => {
    rows.push(
      {
        id: "m4",
        userId: "u1",
        data: seedPatternState(t),
        updatedAt: new Date("2026-03-05"),
        createdAt: new Date("2026-03-05"),
      },
      {
        id: "m5",
        userId: "u2",
        data: seedPatternState(t),
        updatedAt: new Date("2026-03-05"),
        createdAt: new Date("2026-03-05"),
      },
    );
    await expect(
      countPatternsCreatedSince("u1", new Date("2026-03-01")),
    ).resolves.toBe(1);
    await expect(
      countPatternsCreatedSince("u1", new Date("2027-01-01")),
    ).resolves.toBe(0);
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

  // #58: one drifted blob used to be trusted and fed straight to
  // buildThumbnailSvg -- now it's skipped and logged, so a single corrupt
  // pattern costs its own tile, not the whole dashboard load.
  it("skips an unparseable row instead of throwing or listing corrupt data", async () => {
    const corrupt = seedPatternState(t);
    delete corrupt.pattern.sizeTable[corrupt.pattern.baseSize];
    rows.push({
      id: "corrupt",
      userId: "u1",
      data: corrupt,
      updatedAt: new Date("2026-05-01"),
    });
    const list = await listPatternsForUser("u1");
    expect(list.map((m) => m.id)).not.toContain("corrupt");
    expect(list.map((m) => m.id)).toEqual(["m2", "m1"]);
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
