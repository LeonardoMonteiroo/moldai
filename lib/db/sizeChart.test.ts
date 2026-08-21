import { describe, it, expect, vi, beforeEach } from "vitest";

interface Row {
  id: string;
  userId: string;
  data: unknown;
  updatedAt: Date;
}
let rows: Row[] = [];
let users: Record<string, { activeSizeChartId: string | null }> = {};
let nextId = 1;

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    sizeChart: {
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
            id: `g${nextId++}`,
            userId: data.userId,
            data: data.data,
            updatedAt: new Date(),
          };
          rows.push(row);
          return row;
        },
      ),
      createMany: vi.fn(
        async ({
          data,
        }: {
          data: { userId: string; data: unknown }[];
        }): Promise<{ count: number }> => {
          for (const d of data) {
            rows.push({
              id: `g${nextId++}`,
              userId: d.userId,
              data: d.data,
              updatedAt: new Date(),
            });
          }
          return { count: data.length };
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { data: unknown };
        }): Promise<Row> => {
          const row = rows.find((r) => r.id === where.id)!;
          row.data = data.data;
          row.updatedAt = new Date();
          return row;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        rows = rows.filter((r) => r.id !== where.id);
      }),
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

import {
  ensureSystemSizeCharts,
  listSizeChartsForUser,
  getActiveSizeChartId,
  createSizeChart,
  updateSizeChart,
  deleteSizeChart,
  setActiveSizeChart,
  getSizeChartForGeneration,
} from "./sizeChart";

// Deliberately distinct from the real catalog's " (cópia)" so these tests
// prove the suffix is threaded through from the caller, not hardcoded.
const SUFFIX = " (copy-test)";

describe("ensureSystemSizeCharts / listSizeChartsForUser", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
  });

  it("seeds exactly two system charts (female + male) on first access", async () => {
    const charts = await listSizeChartsForUser("u1");
    expect(charts).toHaveLength(2);
    expect(charts.every((c) => c.isSystem)).toBe(true);
    expect(charts.map((c) => c.gender).sort()).toEqual(["female", "male"]);
  });

  it("is idempotent — a second call doesn't reseed", async () => {
    await listSizeChartsForUser("u1");
    await ensureSystemSizeCharts("u1");
    const charts = await listSizeChartsForUser("u1");
    expect(charts).toHaveLength(2);
  });

  it("scopes to the requesting user", async () => {
    await listSizeChartsForUser("u1");
    const other = await listSizeChartsForUser("u2");
    expect(other).toHaveLength(2);
    expect(rows.filter((r) => r.userId === "u1")).toHaveLength(2);
  });
});

describe("createSizeChart", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
  });

  it("duplicates the system female-adult chart by default", async () => {
    const created = await createSizeChart("u1", SUFFIX);
    expect(created.isSystem).toBe(false);
    expect(created.gender).toBe("female");
    expect(created.name).toContain("(copy-test)");
  });

  it("duplicates a given source chart", async () => {
    const charts = await listSizeChartsForUser("u1");
    const male = charts.find((c) => c.gender === "male")!;
    const created = await createSizeChart("u1", SUFFIX, male.id);
    expect(created.gender).toBe("male");
  });
});

describe("updateSizeChart", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
  });

  it("rejects edits to a system chart", async () => {
    const charts = await listSizeChartsForUser("u1");
    const sys = charts.find((c) => c.isSystem)!;
    const result = await updateSizeChart(sys.id, "u1", { name: "hacked" });
    expect(result).toBeNull();
  });

  it("merges a partial patch into a custom chart", async () => {
    const created = await createSizeChart("u1", SUFFIX);
    const updated = await updateSizeChart(created.id, "u1", { name: "Nova" });
    expect(updated!.name).toBe("Nova");
    expect(updated!.gender).toBe(created.gender); // untouched field preserved
  });

  it("returns null when the chart isn't owned by the caller", async () => {
    const created = await createSizeChart("u1", SUFFIX);
    const result = await updateSizeChart(created.id, "someone-else", {
      name: "x",
    });
    expect(result).toBeNull();
  });
});

describe("deleteSizeChart", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
  });

  it("rejects deleting a system chart", async () => {
    const charts = await listSizeChartsForUser("u1");
    const sys = charts.find((c) => c.isSystem)!;
    expect(await deleteSizeChart(sys.id, "u1")).toBe(false);
  });

  it("deletes a custom chart and clears it as the active chart", async () => {
    const created = await createSizeChart("u1", SUFFIX);
    await setActiveSizeChart("u1", created.id);
    expect(await deleteSizeChart(created.id, "u1")).toBe(true);
    expect(await getActiveSizeChartId("u1")).toBeNull();
  });
});

describe("setActiveSizeChart / getSizeChartForGeneration", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
  });

  it("sets the account's active chart", async () => {
    const created = await createSizeChart("u1", SUFFIX);
    expect(await setActiveSizeChart("u1", created.id)).toBe(true);
    expect(await getActiveSizeChartId("u1")).toBe(created.id);
  });

  it("returns false when activating a chart not owned by the caller", async () => {
    const created = await createSizeChart("u1", SUFFIX);
    expect(await setActiveSizeChart("someone-else", created.id)).toBe(false);
  });

  it("uses the active chart when its gender matches the request", async () => {
    const created = await createSizeChart("u1", SUFFIX); // female, per createSizeChart's default
    await setActiveSizeChart("u1", created.id);
    const { chart, rejectedActiveName } = await getSizeChartForGeneration(
      "u1",
      "female",
    );
    expect(chart.name).toBe(created.name);
    expect(rejectedActiveName).toBeNull();
  });

  it("falls back to the system chart when the active chart's gender doesn't match", async () => {
    const created = await createSizeChart("u1", SUFFIX); // female
    await setActiveSizeChart("u1", created.id);
    const { chart } = await getSizeChartForGeneration("u1", "male");
    expect(chart.isSystem).toBe(true);
    expect(chart.gender).toBe("male");
  });

  // Reported so the generate route can say so in the chat instead of drafting
  // from measurements the user did not pick, silently.
  it("names the active chart it had to pass over", async () => {
    const created = await createSizeChart("u1", SUFFIX); // female
    await setActiveSizeChart("u1", created.id);
    const { rejectedActiveName } = await getSizeChartForGeneration(
      "u1",
      "male",
    );
    expect(rejectedActiveName).toBe(created.name);
  });

  it("reports nothing passed over when the account has no active chart", async () => {
    await createSizeChart("u1", SUFFIX);
    const { rejectedActiveName } = await getSizeChartForGeneration(
      "u1",
      "female",
    );
    expect(rejectedActiveName).toBeNull();
  });
});
