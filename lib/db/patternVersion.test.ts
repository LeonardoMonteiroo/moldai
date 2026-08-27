import { describe, it, expect, vi, beforeEach } from "vitest";

// Fake Prisma: a "table" of Pattern rows (just enough for ownership checks)
// plus a "table" of PatternVersion rows -- same in-memory-rows precedent as
// lib/db/pattern.test.ts / lib/db/sloper.test.ts.
interface PatternRow {
  id: string;
  userId: string;
}
interface VersionRow {
  id: string;
  patternId: string;
  userId: string;
  version: number;
  spec: unknown;
  sizes: unknown;
  baseSize: string;
  sizeTable: unknown;
  sizeChartName: string | null;
  reason: string;
  cost: number;
  createdAt: Date;
}

let patternRows: PatternRow[] = [];
let versionRows: VersionRow[] = [];
let nextId = 1;
// withPatternVersioned's own transaction: a real Pattern "data" blob store
// (lockPattern/savePattern's raw-SQL shape, the same fake precedent
// lib/db/pattern-wallet.test.ts already uses) plus the patternVersion.create
// calls recordVersion makes inside that same transaction.
const patternDataStore = new Map<string, { userId: string; data: unknown }>();
const createdVersions: unknown[] = [];

// #16: mocked by its RELATIVE specifier ("./prisma", matching exactly how
// lib/db/patternVersion.ts itself imports it) rather than the "@/lib/db/
// prisma" alias every sibling repo test uses (pattern-wallet.test.ts,
// sloper.test.ts, ...). This sandbox's vitest resolves that alias for
// lib/db/prisma to a module identity the SUT's relative import doesn't
// share, so the mock silently never intercepts and the real PrismaClient
// gets constructed instead -- reproduced against pattern-wallet.test.ts and
// sloper.test.ts too, both unmodified by this branch, so it is an
// environment quirk (verified: a fresh checkout has none of the ~40 sibling
// worktrees or the node_modules junction this machine has), not a bug this
// mock shape can create. Matching the SUT's own specifier sidesteps it.
vi.mock("./prisma", () => ({
  prisma: {
    pattern: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          patternRows.find((r) => r.id === where.id) ?? null,
      ),
    },
    patternVersion: {
      findMany: vi.fn(
        async ({ where }: { where: { patternId: string; userId: string } }) =>
          versionRows
            .filter(
              (r) =>
                r.patternId === where.patternId && r.userId === where.userId,
            )
            .sort((a, b) => b.version - a.version),
      ),
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          versionRows.find((r) => r.id === where.id) ?? null,
      ),
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        $queryRaw: vi.fn(
          async (strings: TemplateStringsArray, ...vals: unknown[]) => {
            const sql = strings.join("");
            if (!sql.includes('"Pattern"')) return [];
            const [patternId, userId] = vals as [string, string];
            const row = patternDataStore.get(patternId);
            if (!row || row.userId !== userId) return [];
            return [{ data: JSON.parse(JSON.stringify(row.data)) }];
          },
        ),
        $executeRaw: vi.fn(
          async (strings: TemplateStringsArray, ...vals: unknown[]) => {
            const sql = strings.join("");
            if (!sql.includes('"Pattern"')) return 0;
            const [jsonStr, patternId, userId] = vals as [
              string,
              string,
              string,
            ];
            const row = patternDataStore.get(patternId);
            if (row && row.userId === userId) row.data = JSON.parse(jsonStr);
            return 0;
          },
        ),
        patternVersion: {
          create: vi.fn(async ({ data }: { data: unknown }) => {
            createdVersions.push(data);
            return data;
          }),
        },
      };
      return fn(tx);
    }),
  },
}));

import {
  listVersions,
  getVersion,
  recordVersion,
  withPatternVersioned,
} from "./patternVersion";
import { seedPatternState, applyGarmentSpec } from "@/lib/editor/state";
import { draftGarment } from "@/lib/draft/garment";
import { t } from "@/lib/i18n/test-translate";
import type { GarmentSpec } from "@/lib/types";

function makeVersionRow(overrides: Partial<VersionRow> = {}): VersionRow {
  return {
    id: `pv${nextId++}`,
    patternId: "m1",
    userId: "u1",
    version: 1,
    spec: {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: {},
    },
    sizes: ["PP", "P", "M", "G", "GG"],
    baseSize: "M",
    sizeTable: { M: { bust: 92 } },
    sizeChartName: "Feminino adulto",
    reason: "generate",
    cost: 1,
    createdAt: new Date("2026-08-17T12:00:00.000Z"),
    ...overrides,
  };
}

describe("lib/db/patternVersion", () => {
  beforeEach(() => {
    patternRows = [{ id: "m1", userId: "u1" }];
    versionRows = [];
    nextId = 1;
    patternDataStore.clear();
    patternDataStore.set("m1", { userId: "u1", data: seedPatternState(t) });
    createdVersions.length = 0;
  });

  describe("listVersions", () => {
    it("returns null when the pattern doesn't exist -- never an existence oracle", async () => {
      expect(await listVersions("missing", "u1")).toBeNull();
    });

    it("returns null when the pattern is owned by someone else", async () => {
      versionRows.push(makeVersionRow());
      expect(await listVersions("m1", "u2")).toBeNull();
    });

    it("returns the owner's versions, newest first", async () => {
      versionRows.push(
        makeVersionRow({ id: "pv1", version: 1 }),
        makeVersionRow({ id: "pv2", version: 2 }),
      );
      const rows = await listVersions("m1", "u1");
      expect(rows).not.toBeNull();
      expect(rows!.map((r) => r.version)).toEqual([2, 1]);
    });

    it("maps every stored field onto the wire record", async () => {
      versionRows.push(makeVersionRow({ id: "pv1" }));
      const rows = await listVersions("m1", "u1");
      expect(rows![0]).toEqual({
        id: "pv1",
        version: 1,
        spec: {
          type: "blouse",
          gender: "female",
          measurementOverrides: {},
          style: {},
        },
        sizes: ["PP", "P", "M", "G", "GG"],
        baseSize: "M",
        sizeTable: { M: { bust: 92 } },
        sizeChartName: "Feminino adulto",
        reason: "generate",
        cost: 1,
        createdAt: "2026-08-17T12:00:00.000Z",
      });
    });
  });

  describe("getVersion", () => {
    it("returns null when the row doesn't exist", async () => {
      expect(await getVersion("m1", "u1", "missing")).toBeNull();
    });

    it("returns null when the row belongs to a different pattern", async () => {
      versionRows.push(makeVersionRow({ id: "pv1", patternId: "m2" }));
      expect(await getVersion("m1", "u1", "pv1")).toBeNull();
    });

    it("returns null when the row belongs to a different owner -- untrusted versionId off the wire", async () => {
      versionRows.push(makeVersionRow({ id: "pv1", userId: "u2" }));
      expect(await getVersion("m1", "u1", "pv1")).toBeNull();
    });

    it("returns the row when patternId and userId both match", async () => {
      versionRows.push(makeVersionRow({ id: "pv1" }));
      const row = await getVersion("m1", "u1", "pv1");
      expect(row?.id).toBe("pv1");
    });
  });

  describe("recordVersion", () => {
    function fakeTx() {
      const create = vi.fn(async () => undefined);
      return { tx: { patternVersion: { create } } as never, create };
    }

    it("writes through the given tx, not the module-level prisma singleton", async () => {
      const { tx, create } = fakeTx();
      const spec: GarmentSpec = {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: {},
      };
      await recordVersion(
        tx,
        "m1",
        "u1",
        {
          version: 3,
          spec,
          sizes: ["PP", "P", "M"],
          baseSize: "M",
          sizeTable: { M: { bust: 92 } as never },
          sizeChartName: "Feminino adulto",
        },
        "adjust",
        1,
      );
      expect(create).toHaveBeenCalledWith({
        data: {
          patternId: "m1",
          userId: "u1",
          version: 3,
          spec,
          sizes: ["PP", "P", "M"],
          baseSize: "M",
          sizeTable: { M: { bust: 92 } },
          sizeChartName: "Feminino adulto",
          reason: "adjust",
          cost: 1,
        },
      });
    });

    it("drops an absent sizeChartName to null rather than undefined -- JSON has no undefined", async () => {
      const { tx, create } = fakeTx();
      await recordVersion(
        tx,
        "m1",
        "u1",
        {
          version: 1,
          spec: {
            type: "blouse",
            gender: "female",
            measurementOverrides: {},
            style: {},
          },
          sizes: ["M"],
          baseSize: "M",
          sizeTable: { M: {} as never },
          sizeChartName: undefined,
        },
        "generate",
        1,
      );
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sizeChartName: null }),
        }),
      );
    });

    it("no-ops on a pattern with no spec rather than persisting a spec-less row", async () => {
      const { tx, create } = fakeTx();
      await recordVersion(
        tx,
        "m1",
        "u1",
        {
          version: 0,
          spec: undefined,
          sizes: ["M"],
          baseSize: "M",
          sizeTable: { M: {} as never },
          sizeChartName: undefined,
        },
        "generate",
        0,
      );
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe("withPatternVersioned", () => {
    it("passes a locked pattern state and tx to fn, then saves the mutation", async () => {
      let seenVersion: number | null = null;
      await withPatternVersioned("m1", "u1", (state) => {
        seenVersion = state.pattern.version;
        state.pattern = { ...state.pattern, name: "renamed" };
        return undefined;
      });
      expect(seenVersion).toBe(0);
      expect(
        (patternDataStore.get("m1")!.data as { pattern: { name: string } })
          .pattern.name,
      ).toBe("renamed");
    });

    it("returns null and mutates nothing when the pattern isn't owned", async () => {
      const out = await withPatternVersioned("m1", "someone-else", (state) => {
        state.pattern = { ...state.pattern, name: "should not stick" };
        return undefined;
      });
      expect(out).toBeNull();
      expect(
        (patternDataStore.get("m1")!.data as { pattern: { name: string } })
          .pattern.name,
      ).not.toBe("should not stick");
    });

    it("returns the value fn returns", async () => {
      const out = await withPatternVersioned("m1", "u1", () => "resp");
      expect(out).toBe("resp");
    });

    // The whole point: a version row written via fn's own tx lands in the
    // SAME transaction as the pattern save -- proven here by asserting both
    // side effects happened, backed by one $transaction call.
    it("records a version snapshot in the same transaction as the pattern save", async () => {
      await withPatternVersioned("m1", "u1", async (state, tx) => {
        state.pattern = { ...state.pattern, version: 1 };
        await recordVersion(
          tx as never,
          "m1",
          "u1",
          state.pattern,
          "conflict_fix",
          0,
        );
        return undefined;
      });
      expect(createdVersions).toHaveLength(1);
      expect((createdVersions[0] as { reason: string }).reason).toBe(
        "conflict_fix",
      );
      expect(
        (patternDataStore.get("m1")!.data as { pattern: { version: number } })
          .pattern.version,
      ).toBe(1);
    });
  });

  // The test that licenses not storing geometry (the Sloper round-trip
  // precedent, lib/slopers/convert.test.ts): what a PatternVersion row
  // actually stores -- spec + baseSize + sizeTable, nothing else -- is
  // sufficient to reproduce the exact pieces that were on the pattern when
  // the snapshot was taken.
  describe("round-trip: a stored snapshot reproduces byte-identical pieces", () => {
    it.each([
      [
        "blouse",
        {
          type: "blouse",
          gender: "female",
          measurementOverrides: {},
          style: { neckline: "V", necklineDepthCm: 12, sleeve: "long" },
        } satisfies GarmentSpec,
      ],
      [
        "tshirt",
        {
          type: "tshirt",
          gender: "male",
          measurementOverrides: { bust: 104 },
          style: {},
        } satisfies GarmentSpec,
      ],
      [
        "skirt",
        {
          type: "skirt",
          gender: "female",
          measurementOverrides: {},
          style: { skirt: "a-line", skirtLengthCm: 60 },
        } satisfies GarmentSpec,
      ],
    ])("%s", (_label, spec) => {
      const state = seedPatternState(t);
      applyGarmentSpec(state, spec, t);

      // What recordVersion would have persisted for this exact state.
      const snapshot = {
        spec: state.pattern.spec!,
        baseSize: state.pattern.baseSize,
        sizeTable: state.pattern.sizeTable,
      };

      const redrafted = draftGarment(
        snapshot.spec,
        snapshot.sizeTable[snapshot.baseSize],
        t,
      );

      expect(redrafted.pieces).toEqual(state.pattern.pieces);
      expect(redrafted.viewBox).toEqual(state.pattern.viewBox);
    });
  });
});
