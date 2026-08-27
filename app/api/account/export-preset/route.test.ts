import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db/exportPreset", () => ({
  getExportPreset: vi.fn(),
  saveExportPreset: vi.fn(),
}));

import { GET, PUT } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { getExportPreset, saveExportPreset } from "@/lib/db/exportPreset";
import { DEFAULT_EXPORT_PRESET } from "@/lib/export/preset";

function putReq(body: unknown) {
  return new Request("http://test/api/account/export-preset", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

describe("GET /api/account/export-preset", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(getExportPreset).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await GET();
    expect(res.status).toBe(401);
    expect(getExportPreset).not.toHaveBeenCalled();
  });

  it("returns null when the account never saved a preset", async () => {
    vi.mocked(getExportPreset).mockResolvedValue(null);
    const res = await GET();
    expect(getExportPreset).toHaveBeenCalledWith("u1");
    expect(await res.json()).toEqual({ preset: null });
  });

  it("returns the saved preset", async () => {
    vi.mocked(getExportPreset).mockResolvedValue(DEFAULT_EXPORT_PRESET);
    const res = await GET();
    expect(await res.json()).toEqual({ preset: DEFAULT_EXPORT_PRESET });
  });
});

describe("PUT /api/account/export-preset", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockReset();
    vi.mocked(saveExportPreset).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
  });

  it("401s without a session", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await PUT(putReq({ format: "svg" }));
    expect(res.status).toBe(401);
    expect(saveExportPreset).not.toHaveBeenCalled();
  });

  it("answers bad_body for a literal null body instead of throwing", async () => {
    const res = await PUT(putReq(null));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ status: "error", error: "bad_body" });
    expect(saveExportPreset).not.toHaveBeenCalled();
  });

  it("answers bad_body for an array body", async () => {
    const res = await PUT(putReq([1, 2, 3]));
    expect(res.status).toBe(400);
    expect(saveExportPreset).not.toHaveBeenCalled();
  });

  // #17 AC: "the preset body is validated server-side and cannot inject an
  // unknown or out-of-range value" -- the route forwards the raw, possibly
  // hostile body straight to saveExportPreset, which owns the sanitisation
  // (see lib/db/exportPreset.test.ts and lib/export/preset.test.ts for the
  // actual drop/clamp assertions). This just proves the route persists only
  // whatever that function hands back, not the request body verbatim.
  it("persists only the sanitised shape saveExportPreset returns, and forwards the hostile body to it", async () => {
    const sanitised = { ...DEFAULT_EXPORT_PRESET, format: "svg" as const };
    vi.mocked(saveExportPreset).mockResolvedValue(sanitised);

    const hostileBody = {
      format: "svg",
      somethingUnexpected: "value",
      fabricWidthCm: 999999,
    };
    const res = await PUT(putReq(hostileBody));

    expect(saveExportPreset).toHaveBeenCalledWith("u1", hostileBody);
    expect(await res.json()).toEqual({ preset: sanitised });
  });
});
