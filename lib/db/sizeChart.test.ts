import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Translate } from "@/lib/i18n/translate";

interface Row {
  id: string;
  userId: string;
  data: unknown;
  updatedAt: Date;
}
let rows: Row[] = [];
let users: Record<string, { activeSizeChartId: string | null }> = {};
let nextId = 1;
// #21: set to a row's id right before calling the function under test to
// simulate a concurrent delete racing in between that function's own read
// and its write -- the row is still returned by this findUnique (as it
// existed when read), but is gone from `rows` by the time the write runs.
let deleteRowOnNextRead: string | null = null;

// #166: matches the specifier this file's own subject imports (see
// lib/db/aliasResolution.test.ts and CLAUDE.md's testing-conventions note).
vi.mock("./prisma", () => ({
  prisma: {
    // #71: deleteSizeChart's delete+pointer-clear now runs as one
    // $transaction([...]) array, mirroring lib/db/verification.ts's
    // issueToken/consumeToken -- the fake just resolves the already-invoked
    // promises together, since each mocked query below runs synchronously
    // against the in-memory `rows`/`users` stores anyway.
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    sizeChart: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        rows
          .filter((r) => r.userId === where.userId)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = rows.find((r) => r.id === where.id);
        if (row && deleteRowOnNextRead === where.id) {
          rows = rows.filter((r) => r.id !== where.id);
          deleteRowOnNextRead = null;
        }
        return row ?? null;
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: { userId: string; data: unknown };
        }): Promise<Row> => {
          const row: Row = {
            id: `g${nextId++}`,
            userId: data.userId,
            data: data.data,
            updatedAt: new Date(),
          };
          rows.push(row);
          return row;
        },
      ),
      // Mirrors the real partial unique index added for #68 (userId, gender
      // WHERE isSystem): with skipDuplicates, a row whose (userId, gender)
      // already has a system chart is silently dropped instead of inserted,
      // the same as Postgres's ON CONFLICT DO NOTHING.
      createMany: vi.fn(
        async ({
          data,
          skipDuplicates,
        }: {
          data: {
            userId: string;
            data: { gender?: string; isSystem?: boolean };
          }[];
          skipDuplicates?: boolean;
        }): Promise<{ count: number }> => {
          let count = 0;
          for (const d of data) {
            if (skipDuplicates && d.data.isSystem) {
              const conflict = rows.some(
                (r) =>
                  r.userId === d.userId &&
                  (r.data as { gender?: string; isSystem?: boolean })
                    .isSystem &&
                  (r.data as { gender?: string }).gender === d.data.gender,
              );
              if (conflict) continue;
            }
            rows.push({
              id: `g${nextId++}`,
              userId: d.userId,
              data: d.data,
              updatedAt: new Date(),
            });
            count++;
          }
          return { count };
        },
      ),
      // Real Prisma's single-record update()/delete() throw P2025 when the
      // row is gone -- these mocks reproduce that so a regression test
      // against the pre-#21 code (which called these) actually throws.
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { data: unknown };
        }): Promise<Row> => {
          const row = rows.find((r) => r.id === where.id);
          if (!row) throw new Error("P2025: Record to update not found.");
          row.data = data.data;
          row.updatedAt = new Date();
          return row;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const idx = rows.findIndex((r) => r.id === where.id);
        if (idx === -1) throw new Error("P2025: Record to delete not found.");
        rows.splice(idx, 1);
      }),
      // #21: the scoped (id, userId) counterparts -- never throw, just
      // report how many rows matched, which is what lets updateSizeChart/
      // deleteSizeChart answer null/false instead of throwing on a
      // concurrent delete.
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; userId: string };
          data: { data: unknown; updatedAt?: Date };
        }): Promise<{ count: number }> => {
          const row = rows.find(
            (r) => r.id === where.id && r.userId === where.userId,
          );
          if (!row) return { count: 0 };
          row.data = data.data;
          row.updatedAt = data.updatedAt ?? new Date();
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
      count: vi.fn(
        async ({
          where,
        }: {
          where: { id: string; userId: string };
        }): Promise<number> =>
          rows.filter((r) => r.id === where.id && r.userId === where.userId)
            .length,
      ),
    },
    user: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          users[where.id] ?? { activeSizeChartId: null },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { activeSizeChartId: string | null };
        }) => {
          users[where.id] = { activeSizeChartId: data.activeSizeChartId };
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; activeSizeChartId: string };
          data: { activeSizeChartId: string | null };
        }) => {
          const u = users[where.id];
          if (u && u.activeSizeChartId === where.activeSizeChartId) {
            users[where.id] = { activeSizeChartId: data.activeSizeChartId };
          }
        },
      ),
    },
  },
}));

import { prisma } from "./prisma";
import {
  ensureSystemSizeCharts,
  listSizeChartsForUser,
  getActiveSizeChartId,
  createSizeChart,
  createSizeChartFromImport,
  updateSizeChart,
  deleteSizeChart,
  setActiveSizeChart,
  getSizeChartForGeneration,
  getSizeChartGenderForUser,
  hasCustomActiveSizeChart,
  MAX_SIZE_CHARTS_LISTED,
} from "./sizeChart";
import {
  buildSystemSizeChart,
  buildSystemSizeChartData,
} from "@/lib/sizeCharts/seed";

// #3: deliberately distinct from the real catalog's " (cópia)" and
// "Feminino adulto"/"Masculino adulto" so these tests prove the name/suffix
// are threaded through from the caller, not hardcoded -- the real catalog
// values are covered separately by lib/i18n/sizeChartsSeed.test.ts.
const T: Translate = (key) => "T:" + key;

describe("ensureSystemSizeCharts / listSizeChartsForUser", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
  });

  it("seeds exactly two system charts (female + male) on first access", async () => {
    const charts = await listSizeChartsForUser(prisma, "u1", T);
    expect(charts).toHaveLength(2);
    expect(charts.every((c) => c.isSystem)).toBe(true);
    expect(charts.map((c) => c.gender).sort()).toEqual(["female", "male"]);
  });

  // #3: the name used to be a hardcoded literal baked into the row at seed
  // time -- now it comes from whatever translator ensureSystemSizeCharts was
  // called with.
  it("names the seeded charts from the injected translator", async () => {
    const charts = await listSizeChartsForUser(prisma, "u1", T);
    expect(charts.find((c) => c.gender === "female")!.name).toBe(
      "T:systemChartName.female",
    );
    expect(charts.find((c) => c.gender === "male")!.name).toBe(
      "T:systemChartName.male",
    );
  });

  it("is idempotent — a second call doesn't reseed", async () => {
    await listSizeChartsForUser(prisma, "u1", T);
    await ensureSystemSizeCharts(prisma, "u1", T);
    const charts = await listSizeChartsForUser(prisma, "u1", T);
    expect(charts).toHaveLength(2);
  });

  it("scopes to the requesting user", async () => {
    await listSizeChartsForUser(prisma, "u1", T);
    const other = await listSizeChartsForUser(prisma, "u2", T);
    expect(other).toHaveLength(2);
    expect(rows.filter((r) => r.userId === "u1")).toHaveLength(2);
  });

  // #66: listSizeChartsForUser had no `take` at all, the same gap
  // listPatternsForUser was fixed for under #101. Asserted against the
  // literal 500, not just "equals MAX_SIZE_CHARTS_LISTED": importing the
  // same constant the fix reads from would make this pass vacuously
  // (undefined === undefined) if the fix and the constant were ever
  // reverted together.
  it("bounds the query with MAX_SIZE_CHARTS_LISTED", async () => {
    await listSizeChartsForUser(prisma, "u1", T);
    const call = vi.mocked(prisma.sizeChart.findMany).mock.calls.at(-1)![0];
    expect(call?.take).toBe(500);
    expect(MAX_SIZE_CHARTS_LISTED).toBe(500);
  });

  // #66 (code review follow-up): listSizeChartsForUser's own bound above is
  // undermined if ensureSystemSizeCharts -- its unconditional first call, on
  // the identical hot path -- still scans every row to answer "does a
  // system chart already exist". Asserted separately from the test above,
  // against the same call site's first (not last) findMany invocation.
  it("also bounds ensureSystemSizeCharts's own existence-check query", async () => {
    await listSizeChartsForUser(prisma, "u1", T);
    const calls = vi.mocked(prisma.sizeChart.findMany).mock.calls;
    const seedCheckCall = calls[calls.length - 2]![0];
    expect(seedCheckCall?.take).toBe(500);
  });

  // #133 AC: renaming the seeded chart must not retroactively rewrite a row
  // that was already seeded under an older translator -- same precedent as
  // PatternData.newPatternName. A row already in the store, named as if by a
  // translator that predates a rename, must survive untouched: the seed
  // check ("hasSystem") only ever fires when NO system chart exists yet, so
  // it can never reach (and overwrite) an existing row.
  it("does not rename an already-seeded system chart when called again with a different translator", async () => {
    rows.push({
      id: "legacy-female",
      userId: "u1",
      data: {
        ...buildSystemSizeChart("female"),
        name: "Feminino adulto · ABNT",
      },
      updatedAt: new Date(),
    });
    const renamed: Translate = (key) => "RENAMED:" + key;

    const charts = await listSizeChartsForUser(prisma, "u1", renamed);

    expect(charts.map((c) => c.name)).toContain("Feminino adulto · ABNT");
    expect(charts.some((c) => c.name.startsWith("RENAMED:"))).toBe(false);
  });

  // #68: check-then-insert with nothing atomic in between -- two overlapping
  // first-ever requests for the same brand-new account (e.g. /size-charts
  // loading while a generate is in flight) both used to see zero rows and
  // both insert, leaving the account with two copies of each system chart,
  // permanently (hasSystem is true from then on, so it never self-heals).
  it("firing two seed calls concurrently still leaves exactly two system charts", async () => {
    await Promise.all([
      ensureSystemSizeCharts(prisma, "u1", T),
      ensureSystemSizeCharts(prisma, "u1", T),
    ]);
    expect(rows.filter((r) => r.userId === "u1")).toHaveLength(2);
    const charts = await listSizeChartsForUser(prisma, "u1", T);
    expect(charts.map((c) => c.gender).sort()).toEqual(["female", "male"]);
  });

  // #58: a row whose stored shape has drifted (here, an emptied-out
  // baseMeasurements -- the exact trigger validateSizeChartPatch already
  // guards on the write side) used to be trusted as-is, so
  // resolveSizeChartSize would compute NaN for every consumer of the list.
  // It's now skipped -- one corrupt chart costs its own library entry, not
  // the whole list (and, transitively, generation itself).
  it("skips an unparseable row instead of throwing or returning corrupt data", async () => {
    await listSizeChartsForUser(prisma, "u1", T); // seeds the two system charts
    rows.push({
      id: "corrupt",
      userId: "u1",
      data: {
        ...(rows[0].data as Record<string, unknown>),
        baseMeasurements: {},
      },
      updatedAt: new Date(),
    });
    const charts = await listSizeChartsForUser(prisma, "u1", T);
    expect(charts.map((c) => c.id)).not.toContain("corrupt");
    expect(charts).toHaveLength(2);
  });
});

describe("createSizeChart", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
  });

  it("duplicates the system female-adult chart by default", async () => {
    const created = (await createSizeChart("u1", T))!;
    expect(created.isSystem).toBe(false);
    expect(created.gender).toBe("female");
    expect(created.name).toContain("T:copySuffix");
  });

  it("duplicates a given source chart", async () => {
    const charts = await listSizeChartsForUser(prisma, "u1", T);
    const male = charts.find((c) => c.gender === "male")!;
    const created = (await createSizeChart("u1", T, male.id))!;
    expect(created.gender).toBe("male");
  });

  // #64: a given-but-unresolved sourceSizeChartId (a stale list, another
  // account's id) used to fall through to the same system-chart fallback as
  // "no id given at all" -- silently substituting the wrong gender/
  // measurements with no error. Only omitting the id should fall back now.
  it("returns null (does not silently substitute the system chart) for an unresolved sourceSizeChartId", async () => {
    const result = await createSizeChart("u1", T, "does-not-exist");
    expect(result).toBeNull();
  });

  it("returns null for another account's chart id, without creating a copy", async () => {
    const otherUsersChart = (await createSizeChart("u2", T))!;
    // Seed u1's own system charts first (an unrelated, expected side effect
    // of listing) so the count below isolates what this test actually
    // cares about: no *additional* row gets created for the failed copy.
    await listSizeChartsForUser(prisma, "u1", T);
    const before = rows.filter((r) => r.userId === "u1").length;
    const result = await createSizeChart("u1", T, otherUsersChart.id);
    expect(result).toBeNull();
    expect(rows.filter((r) => r.userId === "u1")).toHaveLength(before);
  });
});

describe("updateSizeChart", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
    deleteRowOnNextRead = null;
  });

  it("rejects edits to a system chart", async () => {
    const charts = await listSizeChartsForUser(prisma, "u1", T);
    const sys = charts.find((c) => c.isSystem)!;
    const result = await updateSizeChart(sys.id, "u1", { name: "hacked" });
    expect(result).toBeNull();
  });

  it("merges a partial patch into a custom chart", async () => {
    const created = (await createSizeChart("u1", T))!;
    const updated = await updateSizeChart(created.id, "u1", { name: "Nova" });
    expect(updated!.name).toBe("Nova");
    expect(updated!.gender).toBe(created.gender); // untouched field preserved
  });

  it("returns null when the chart isn't owned by the caller", async () => {
    const created = (await createSizeChart("u1", T))!;
    const result = await updateSizeChart(created.id, "someone-else", {
      name: "x",
    });
    expect(result).toBeNull();
  });

  // #21: simulates another request deleting the chart between this
  // function's own findUnique read and its write. The pre-fix code called
  // prisma.sizeChart.update({where:{id}}), which throws P2025 on a missing
  // row (reproduced by the update() mock above); updateMany scoped to
  // (id, userId) just reports count: 0.
  it("returns null instead of throwing when the chart is deleted between the read and the write", async () => {
    const created = (await createSizeChart("u1", T))!;
    deleteRowOnNextRead = created.id;
    await expect(
      updateSizeChart(created.id, "u1", { name: "x" }),
    ).resolves.toBeNull();
  });

  // #58: reading `current.isSystem` off an unguarded cast would have thrown
  // (or silently continued with garbage) on a corrupt row; it now returns
  // null the same way an unowned or already-deleted chart does.
  it("returns null instead of throwing when the stored row is unparseable", async () => {
    const created = (await createSizeChart("u1", T))!;
    const row = rows.find((r) => r.id === created.id)!;
    row.data = { ...(row.data as object), baseMeasurements: {} };
    await expect(
      updateSizeChart(created.id, "u1", { name: "x" }),
    ).resolves.toBeNull();
  });
});

describe("deleteSizeChart", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
    deleteRowOnNextRead = null;
  });

  it("rejects deleting a system chart", async () => {
    const charts = await listSizeChartsForUser(prisma, "u1", T);
    const sys = charts.find((c) => c.isSystem)!;
    expect(await deleteSizeChart(sys.id, "u1")).toBe(false);
  });

  it("deletes a custom chart and clears it as the active chart", async () => {
    const created = (await createSizeChart("u1", T))!;
    await setActiveSizeChart("u1", created.id);
    expect(await deleteSizeChart(created.id, "u1")).toBe(true);
    expect(await getActiveSizeChartId(prisma, "u1")).toBeNull();
  });

  // #71: the delete and the pointer clear used to be two independent awaits
  // -- a crash between them could delete the row while User.activeSizeChartId
  // still named it, a dangling id no FK exists to reject. Asserting the pair
  // goes through a single $transaction call (rather than just checking the
  // end state, which an unrelated two-write implementation could also reach)
  // is what actually guards the atomicity, not just the outcome.
  it("clears the active pointer through the same transaction as the delete, not two independent writes", async () => {
    const created = (await createSizeChart("u1", T))!;
    await setActiveSizeChart("u1", created.id);
    vi.mocked(prisma.$transaction).mockClear();

    await deleteSizeChart(created.id, "u1");

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(prisma.$transaction).mock.calls[0][0]).toHaveLength(2);
  });

  // #21: the pre-fix code called prisma.sizeChart.delete({where:{id}}),
  // which throws P2025 on a row already gone by write time (reproduced by
  // the delete() mock above); deleteMany scoped to (id, userId) just
  // reports count: 0.
  it("returns false instead of throwing when the chart is deleted between the read and the write", async () => {
    const created = (await createSizeChart("u1", T))!;
    deleteRowOnNextRead = created.id;
    await expect(deleteSizeChart(created.id, "u1")).resolves.toBe(false);
  });

  it("returns false instead of throwing when the stored row is unparseable", async () => {
    const created = (await createSizeChart("u1", T))!;
    const row = rows.find((r) => r.id === created.id)!;
    row.data = { ...(row.data as object), baseMeasurements: {} };
    await expect(deleteSizeChart(created.id, "u1")).resolves.toBe(false);
  });
});

describe("hasCustomActiveSizeChart", () => {
  beforeEach(() => {
    rows = [];
    users = {};
  });

  it("is false when the account has no active chart", async () => {
    users.u1 = { activeSizeChartId: null };
    expect(await hasCustomActiveSizeChart(prisma, "u1")).toBe(false);
  });

  it("is false when the active chart is a system chart", async () => {
    rows = [
      {
        id: "g1",
        userId: "u1",
        data: buildSystemSizeChartData("female", T),
        updatedAt: new Date(),
      },
    ];
    users.u1 = { activeSizeChartId: "g1" };
    expect(await hasCustomActiveSizeChart(prisma, "u1")).toBe(false);
  });

  it("is true when the active chart is a real custom chart", async () => {
    rows = [
      {
        id: "g2",
        userId: "u1",
        data: { ...buildSystemSizeChartData("female", T), isSystem: false },
        updatedAt: new Date(),
      },
    ];
    users.u1 = { activeSizeChartId: "g2" };
    expect(await hasCustomActiveSizeChart(prisma, "u1")).toBe(true);
  });

  it("is false when the active chart id points at a row that no longer exists", async () => {
    rows = [];
    users.u1 = { activeSizeChartId: "gone" };
    expect(await hasCustomActiveSizeChart(prisma, "u1")).toBe(false);
  });
});

describe("setActiveSizeChart / getSizeChartForGeneration", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
    deleteRowOnNextRead = null;
  });

  it("sets the account's active chart", async () => {
    const created = (await createSizeChart("u1", T))!;
    expect(await setActiveSizeChart("u1", created.id)).toBe(true);
    expect(await getActiveSizeChartId(prisma, "u1")).toBe(created.id);
  });

  it("returns false when activating a chart not owned by the caller", async () => {
    const created = (await createSizeChart("u1", T))!;
    expect(await setActiveSizeChart("someone-else", created.id)).toBe(false);
  });

  // #21: the ownership check now folds userId into the query itself
  // (count({where:{id, userId}})) instead of an unscoped findUnique plus an
  // application-code compare -- this proves activation for a chart deleted
  // right before the call still cleanly returns false.
  it("returns false when the chart no longer exists", async () => {
    const created = (await createSizeChart("u1", T))!;
    await deleteSizeChart(created.id, "u1");
    expect(await setActiveSizeChart("u1", created.id)).toBe(false);
  });

  it("uses the active chart when its gender matches the request", async () => {
    const created = (await createSizeChart("u1", T))!; // female, per createSizeChart's default
    await setActiveSizeChart("u1", created.id);
    const { chart, rejectedActiveName } = await getSizeChartForGeneration(
      prisma,
      "u1",
      "female",
      T,
    );
    expect(chart.name).toBe(created.name);
    expect(rejectedActiveName).toBeNull();
  });

  it("falls back to the system chart when the active chart's gender doesn't match", async () => {
    const created = (await createSizeChart("u1", T))!; // female
    await setActiveSizeChart("u1", created.id);
    const { chart } = await getSizeChartForGeneration(prisma, "u1", "male", T);
    expect(chart.isSystem).toBe(true);
    expect(chart.gender).toBe("male");
  });

  // Reported so the generate route can say so in the chat instead of drafting
  // from measurements the user did not pick, silently.
  it("names the active chart it had to pass over", async () => {
    const created = (await createSizeChart("u1", T))!; // female
    await setActiveSizeChart("u1", created.id);
    const { rejectedActiveName } = await getSizeChartForGeneration(
      prisma,
      "u1",
      "male",
      T,
    );
    expect(rejectedActiveName).toBe(created.name);
  });

  it("reports nothing passed over when the account has no active chart", async () => {
    await createSizeChart("u1", T);
    const { rejectedActiveName } = await getSizeChartForGeneration(
      prisma,
      "u1",
      "female",
      T,
    );
    expect(rejectedActiveName).toBeNull();
  });

  // PFORM-42: a per-molde choice wins outright -- its gender is not
  // re-checked (the drafted spec's gender comes FROM this chart) and nothing
  // was passed over silently, so rejectedActiveName stays null even though a
  // different chart is active.
  it("drafts from the requested chart even when its gender differs and another chart is active", async () => {
    const charts = await listSizeChartsForUser(prisma, "u1", T);
    const male = charts.find((c) => c.gender === "male")!;
    const female = charts.find((c) => c.gender === "female")!;
    await setActiveSizeChart("u1", female.id);

    const { chart, rejectedActiveName } = await getSizeChartForGeneration(
      prisma,
      "u1",
      "female",
      T,
      male.id,
    );

    expect(chart.name).toBe(male.name);
    expect(chart.gender).toBe("male");
    expect(rejectedActiveName).toBeNull();
  });

  // PFORM-46: an id naming no chart in the account's list falls through to
  // every existing branch unchanged -- which is also what makes a chart
  // deleted between the route's ownership check and the lock resolve to
  // today's safe behavior instead of an error.
  it("falls through to the active-then-system pick, substitution notice included, for a requestedId it cannot resolve", async () => {
    const created = (await createSizeChart("u1", T))!; // female
    await setActiveSizeChart("u1", created.id);

    const { chart, rejectedActiveName } = await getSizeChartForGeneration(
      prisma,
      "u1",
      "male",
      T,
      "does-not-exist",
    );

    expect(chart.isSystem).toBe(true);
    expect(chart.gender).toBe("male");
    expect(rejectedActiveName).toBe(created.name);
  });
});

// PFORM-43: the generate route needs one chart's gender before it enters the
// transaction -- the gender goes into the drafted spec and the prompt, and a
// 400 for a chart the account does not own has to land before any lock,
// debit or Anthropic call.
describe("getSizeChartGenderForUser", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
    deleteRowOnNextRead = null;
  });

  it("returns the chart's own gender for a chart the account owns", async () => {
    const charts = await listSizeChartsForUser(prisma, "u1", T);
    const male = charts.find((c) => c.gender === "male")!;
    const female = charts.find((c) => c.gender === "female")!;

    expect(await getSizeChartGenderForUser(male.id, "u1")).toBe("male");
    expect(await getSizeChartGenderForUser(female.id, "u1")).toBe("female");
  });

  it("returns null for an id that names no chart at all", async () => {
    await listSizeChartsForUser(prisma, "u1", T);
    expect(await getSizeChartGenderForUser("does-not-exist", "u1")).toBeNull();
  });

  it("returns null for a chart owned by another account", async () => {
    const otherUsersChart = (await createSizeChart("u2", T))!;
    expect(
      await getSizeChartGenderForUser(otherUsersChart.id, "u1"),
    ).toBeNull();
  });

  // The loadPattern contract: both misses answer with the identical value, so
  // the reader can never be used to probe whether another account's chart id
  // exists.
  it("answers identically for a nonexistent chart and another account's chart", async () => {
    const otherUsersChart = (await createSizeChart("u2", T))!;
    const missing = await getSizeChartGenderForUser("does-not-exist", "u1");
    const unowned = await getSizeChartGenderForUser(otherUsersChart.id, "u1");
    expect(missing).toBe(unowned);
    expect(missing).toBeNull();
  });

  // #58's precedent, applied to this reader: a drifted blob returns null the
  // same way an unowned chart does, rather than throwing into the route.
  it("returns null instead of throwing when the stored row is unparseable", async () => {
    const created = (await createSizeChart("u1", T))!;
    const row = rows.find((r) => r.id === created.id)!;
    row.data = { ...(row.data as object), baseMeasurements: {} };
    await expect(
      getSizeChartGenderForUser(created.id, "u1"),
    ).resolves.toBeNull();
  });
});

// #12: the import flow's persistence half -- proves createSizeChartFromImport
// actually runs an untrusted candidate through validateSizeChartPatch (via a
// system-chart base) rather than trusting it, mirroring updateSizeChart's own
// coverage above for the PATCH path.
describe("createSizeChartFromImport", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
  });

  it("creates a non-system chart from a well-formed candidate", async () => {
    const created = await createSizeChartFromImport("u1", T, {
      name: "Grade importada",
      gender: "male",
      bodyType: "hourglass",
      sizes: ["38", "40", "42"],
      baseSizeIndex: 1,
      baseMeasurements: { bust: 96 },
      progressionRule: { bust: 4 },
      overrides: { "42": { bust: 100 } },
    });
    expect(created).not.toBeNull();
    expect(created!.isSystem).toBe(false);
    expect(created!.gender).toBe("male");
    expect(created!.name).toBe("Grade importada");
    expect(created!.sizes).toEqual(["38", "40", "42"]);
    expect(created!.baseMeasurements.bust).toBe(96);
  });

  // The exact bug validateSizeChartPatch exists for (CLAUDE.md's Size charts
  // section): an invalid gender must never persist verbatim.
  it("sanitises an invalid gender instead of persisting it", async () => {
    const created = await createSizeChartFromImport("u1", T, {
      name: "x",
      gender: "banana",
    });
    expect(created!.gender).toBe("female");
  });

  it("can never claim isSystem, even if the candidate says so", async () => {
    const created = await createSizeChartFromImport("u1", T, {
      name: "x",
      isSystem: true,
    });
    expect(created!.isSystem).toBe(false);
  });

  // baseMeasurements MERGES onto the system-chart fallback (validateSizeChartPatch's
  // own contract) -- an incomplete/garbage baseMeasurements can drop a field,
  // never leave it non-finite.
  it("falls back to a complete baseMeasurements row when the candidate's is garbage", async () => {
    const created = await createSizeChartFromImport("u1", T, {
      name: "x",
      gender: "female",
      baseMeasurements: {},
    });
    for (const v of Object.values(created!.baseMeasurements)) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it("ignores a non-object candidate rather than throwing", async () => {
    const created = await createSizeChartFromImport("u1", T, null);
    expect(created).not.toBeNull();
    expect(created!.isSystem).toBe(false);
  });
});

// #67: these four functions used to run their queries through the imported
// `prisma` singleton no matter what — so a caller mid-transaction (holding
// the Pattern+Wallet locks for the whole AI call) had them acquire a
// *second*, unrelated pooled connection instead of joining the open
// transaction. Under the pool's default size that starves concurrent
// generations into a pool_timeout, and a createMany that runs outside the
// transaction survives a rollback of the transaction it looks like it
// belongs to. Proven here with a `tx` double that is deliberately NOT the
// mocked `prisma` singleton above: if a function reached for the singleton
// instead of the argument, its data would show up in `rows`/`users`
// (the singleton's backing store) rather than in this double's own store.
describe("uses the passed tx, not the module-level prisma singleton (#67)", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
    // Earlier describe blocks in this file called the singleton's mocks
    // directly (via `listSizeChartsForUser(prisma, ...)`); clear that call
    // history so "not called" below only asserts about this block's calls.
    vi.mocked(prisma.sizeChart.findMany).mockClear();
    vi.mocked(prisma.sizeChart.createMany).mockClear();
    vi.mocked(prisma.user.findUnique).mockClear();
  });

  function fakeTx() {
    const txRows: Row[] = [];
    const txUsers: Record<string, { activeSizeChartId: string | null }> = {};
    let txNextId = 1;
    return {
      rows: txRows,
      sizeChart: {
        findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
          txRows.filter((r) => r.userId === where.userId),
        ),
        createMany: vi.fn(
          async ({
            data,
          }: {
            data: { userId: string; data: unknown }[];
          }): Promise<{ count: number }> => {
            for (const d of data) {
              txRows.push({
                id: `tx${txNextId++}`,
                userId: d.userId,
                data: d.data,
                updatedAt: new Date(),
              });
            }
            return { count: data.length };
          },
        ),
      },
      user: {
        findUnique: vi.fn(
          async ({ where }: { where: { id: string } }) =>
            txUsers[where.id] ?? { activeSizeChartId: null },
        ),
      },
    };
  }

  it("ensureSystemSizeCharts seeds into tx, leaving the singleton untouched", async () => {
    const tx = fakeTx();
    await ensureSystemSizeCharts(tx as never, "u1", T);
    expect(tx.rows).toHaveLength(2);
    expect(vi.mocked(prisma.sizeChart.createMany)).not.toHaveBeenCalled();
    expect(rows).toHaveLength(0);
  });

  it("listSizeChartsForUser reads from tx, not the singleton", async () => {
    const tx = fakeTx();
    const charts = await listSizeChartsForUser(tx as never, "u1", T);
    expect(charts).toHaveLength(2);
    expect(vi.mocked(prisma.sizeChart.findMany)).not.toHaveBeenCalled();
  });

  it("getSizeChartForGeneration resolves entirely off tx", async () => {
    const tx = fakeTx();
    const { chart } = await getSizeChartForGeneration(
      tx as never,
      "u1",
      "female",
      T,
    );
    expect(chart.isSystem).toBe(true);
    expect(vi.mocked(prisma.sizeChart.findMany)).not.toHaveBeenCalled();
    expect(vi.mocked(prisma.user.findUnique)).not.toHaveBeenCalled();
  });
});
