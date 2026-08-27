import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUnique, update } = vi.hoisted(() => ({
  findUnique: vi.fn(async (_args: unknown): Promise<unknown> => null),
  update: vi.fn(async (_args: unknown) => undefined),
}));

// #166: mocked by the exact relative specifier this module itself imports
// ("./prisma", matching lib/db/exportPreset.ts) -- an alias-resolved mock
// ("@/lib/db/prisma") silently never intercepts on this repo's worktree
// setup, and prisma.user.findUnique/update would run against a real,
// unreachable PrismaClient instead (a ~13s hang, not a clean failure).
vi.mock("./prisma", () => ({
  prisma: {
    user: {
      findUnique,
      update,
    },
  },
}));

import { getExportPreset, saveExportPreset } from "./exportPreset";
import { DEFAULT_EXPORT_PRESET } from "@/lib/export/preset";

describe("getExportPreset", () => {
  beforeEach(() => {
    findUnique.mockClear();
  });

  it("returns null when the user has never saved a preset", async () => {
    findUnique.mockResolvedValueOnce({ exportPreset: null });
    expect(await getExportPreset("u1")).toBeNull();
  });

  it("returns null when the user row itself is gone", async () => {
    findUnique.mockResolvedValueOnce(null);
    expect(await getExportPreset("u1")).toBeNull();
  });

  it("re-validates a saved preset on read", async () => {
    findUnique.mockResolvedValueOnce({
      exportPreset: { format: "svg", fabricWidthCm: 999999 },
    });
    const result = await getExportPreset("u1");
    expect(result?.format).toBe("svg");
    // an out-of-range value never survives the read, even though nothing
    // but this app's own PUT route should have written it
    expect(result?.fabricWidthCm).toBe(DEFAULT_EXPORT_PRESET.fabricWidthCm);
  });

  it("scopes the read to the requested user", async () => {
    findUnique.mockResolvedValueOnce({ exportPreset: null });
    await getExportPreset("u1");
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "u1" },
      select: { exportPreset: true },
    });
  });
});

describe("saveExportPreset", () => {
  beforeEach(() => {
    update.mockClear();
  });

  it("persists only the sanitised shape, never the hostile input verbatim", async () => {
    const saved = await saveExportPreset("u1", {
      format: "dxf",
      somethingUnexpected: "value",
      fabricWidthCm: -1,
    });
    expect(saved.format).toBe("dxf");
    expect(saved).not.toHaveProperty("somethingUnexpected");
    expect(saved.fabricWidthCm).toBe(DEFAULT_EXPORT_PRESET.fabricWidthCm);
    expect(update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { exportPreset: saved },
    });
  });

  it("never throws on a completely hostile body", async () => {
    await expect(saveExportPreset("u1", "not an object")).resolves.toEqual(
      DEFAULT_EXPORT_PRESET,
    );
  });
});
