import { describe, it, expect, vi, beforeEach } from "vitest";

interface Row {
  id: string;
  userId: string;
  data: unknown;
  updatedAt: Date;
}
let rows: Row[] = [];
let users: Record<string, { activeGradeId: string | null }> = {};
let nextId = 1;

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    grade: {
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
          users[where.id] ?? { activeGradeId: null },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { activeGradeId: string | null };
        }) => {
          users[where.id] = { activeGradeId: data.activeGradeId };
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; activeGradeId: string };
          data: { activeGradeId: string | null };
        }) => {
          const u = users[where.id];
          if (u && u.activeGradeId === where.activeGradeId) {
            users[where.id] = { activeGradeId: data.activeGradeId };
          }
        },
      ),
    },
  },
}));

import {
  ensureSystemGrades,
  listGradesForUser,
  getActiveGradeId,
  createGrade,
  updateGrade,
  deleteGrade,
  setActiveGrade,
  getGradeForGeneration,
} from "./grade";

describe("ensureSystemGrades / listGradesForUser", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
  });

  it("seeds exactly two system grades (female + male) on first access", async () => {
    const grades = await listGradesForUser("u1");
    expect(grades).toHaveLength(2);
    expect(grades.every((g) => g.isSystem)).toBe(true);
    expect(grades.map((g) => g.gender).sort()).toEqual(["female", "male"]);
  });

  it("is idempotent — a second call doesn't reseed", async () => {
    await listGradesForUser("u1");
    await ensureSystemGrades("u1");
    const grades = await listGradesForUser("u1");
    expect(grades).toHaveLength(2);
  });

  it("scopes to the requesting user", async () => {
    await listGradesForUser("u1");
    const other = await listGradesForUser("u2");
    expect(other).toHaveLength(2);
    expect(rows.filter((r) => r.userId === "u1")).toHaveLength(2);
  });
});

describe("createGrade", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
  });

  it("duplicates the system female-adult grade by default", async () => {
    const created = await createGrade("u1");
    expect(created.isSystem).toBe(false);
    expect(created.gender).toBe("female");
    expect(created.name).toContain("(cópia)");
  });

  it("duplicates a given source grade", async () => {
    const grades = await listGradesForUser("u1");
    const male = grades.find((g) => g.gender === "male")!;
    const created = await createGrade("u1", male.id);
    expect(created.gender).toBe("male");
  });
});

describe("updateGrade", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
  });

  it("rejects edits to a system grade", async () => {
    const grades = await listGradesForUser("u1");
    const sys = grades.find((g) => g.isSystem)!;
    const result = await updateGrade(sys.id, "u1", { name: "hacked" });
    expect(result).toBeNull();
  });

  it("merges a partial patch into a custom grade", async () => {
    const created = await createGrade("u1");
    const updated = await updateGrade(created.id, "u1", { name: "Nova" });
    expect(updated!.name).toBe("Nova");
    expect(updated!.gender).toBe(created.gender); // untouched field preserved
  });

  it("returns null when the grade isn't owned by the caller", async () => {
    const created = await createGrade("u1");
    const result = await updateGrade(created.id, "someone-else", {
      name: "x",
    });
    expect(result).toBeNull();
  });
});

describe("deleteGrade", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
  });

  it("rejects deleting a system grade", async () => {
    const grades = await listGradesForUser("u1");
    const sys = grades.find((g) => g.isSystem)!;
    expect(await deleteGrade(sys.id, "u1")).toBe(false);
  });

  it("deletes a custom grade and clears it as the active grade", async () => {
    const created = await createGrade("u1");
    await setActiveGrade("u1", created.id);
    expect(await deleteGrade(created.id, "u1")).toBe(true);
    expect(await getActiveGradeId("u1")).toBeNull();
  });
});

describe("setActiveGrade / getGradeForGeneration", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
  });

  it("sets the account's active grade", async () => {
    const created = await createGrade("u1");
    expect(await setActiveGrade("u1", created.id)).toBe(true);
    expect(await getActiveGradeId("u1")).toBe(created.id);
  });

  it("returns false when activating a grade not owned by the caller", async () => {
    const created = await createGrade("u1");
    expect(await setActiveGrade("someone-else", created.id)).toBe(false);
  });

  it("uses the active grade when its gender matches the request", async () => {
    const created = await createGrade("u1"); // female, per createGrade's default
    await setActiveGrade("u1", created.id);
    const grade = await getGradeForGeneration("u1", "female");
    expect(grade.name).toBe(created.name);
  });

  it("falls back to the system grade when the active grade's gender doesn't match", async () => {
    const created = await createGrade("u1"); // female
    await setActiveGrade("u1", created.id);
    const grade = await getGradeForGeneration("u1", "male");
    expect(grade.isSystem).toBe(true);
    expect(grade.gender).toBe("male");
  });
});
