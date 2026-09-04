import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedPatternState, applyGarmentSpec } from "@/lib/editor/state";
import { seedWallet } from "@/lib/billing/wallet";
import { SIZE_TABLE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
import type { PatternState } from "@/lib/types";
import type { PatternVersionRecord } from "@/lib/db/patternVersion";

const NOW = new Date("2026-08-17T12:00:00.000Z");
let state: PatternState = seedPatternState(t);
let ownedPatternId: string | null = "m1";
const FAKE_TX = {};

const VERSION: PatternVersionRecord = {
  id: "pv3",
  version: 3,
  spec: {
    type: "blouse",
    gender: "female",
    measurementOverrides: {},
    style: { neckline: "V", necklineDepthCm: 10 },
  },
  sizes: ["PP", "P", "M", "G", "GG"],
  baseSize: "M",
  sizeTable: {
    M: { ...SIZE_TABLE.M } as never,
  },
  sizeChartName: "Feminino adulto",
  engine: "moldai",
  reason: "adjust",
  cost: 1,
  createdAt: "2026-08-17T11:00:00.000Z",
};

vi.mock("next-intl/server", () => ({
  getTranslations: vi.fn(async () => (key: string) => key),
}));
vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
let getVersionResult: PatternVersionRecord | null = VERSION;
vi.mock("@/lib/db/patternVersion", () => ({
  getVersion: vi.fn(async () => getVersionResult),
  recordVersion: vi.fn(),
  withPatternVersioned: vi.fn(
    async (
      patternId: string,
      _userId: string,
      fn: (
        s: PatternState,
        tx: unknown,
      ) => PatternState | Promise<PatternState>,
    ) => (patternId === ownedPatternId ? fn(state, FAKE_TX) : null),
  ),
}));
vi.mock("@/lib/db/wallet", () => ({
  loadWallet: vi.fn(async () => seedWallet(NOW)),
}));
vi.mock("@/lib/observability/report", () => ({ reportError: vi.fn() }));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { loadWallet } from "@/lib/db/wallet";
import {
  getVersion,
  recordVersion,
  withPatternVersioned,
} from "@/lib/db/patternVersion";
import { reportError } from "@/lib/observability/report";

function ctx(id = "m1", versionId = "pv3") {
  return { params: Promise.resolve({ id, versionId }) };
}

describe("POST /api/patterns/[id]/versions/[versionId]/restore", () => {
  beforeEach(() => {
    state = seedPatternState(t);
    applyGarmentSpec(
      state,
      {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: {},
      },
      t,
    );
    ownedPatternId = "m1";
    getVersionResult = VERSION;
    vi.mocked(recordVersion).mockReset();
    vi.mocked(reportError).mockReset();
    vi.mocked(getVersion).mockClear();
    vi.mocked(withPatternVersioned).mockClear();
    vi.mocked(loadWallet).mockClear();
    vi.mocked(loadWallet).mockResolvedValue(seedWallet(NOW));
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
  });

  it("restores the old spec into a NEW version, for free, never locking the wallet", async () => {
    const balanceBefore = seedWallet(NOW).balance;
    const versionBefore = state.pattern.version;
    const res = await POST(new Request("http://test"), ctx());
    const json = await res.json();

    expect(json.status).toBe("ok");
    expect(json.state.credits.balance).toBe(balanceBefore); // never debits
    expect(state.pattern.version).toBe(versionBefore + 1); // a NEW version
    expect(state.pattern.spec).toEqual(VERSION.spec);
  });

  it("records the new version with reason 'restore' and cost 0, inside the same tx", async () => {
    const versionBefore = state.pattern.version;
    await POST(new Request("http://test"), ctx());
    expect(recordVersion).toHaveBeenCalledWith(
      FAKE_TX,
      "m1",
      "u1",
      expect.objectContaining({ version: versionBefore + 1 }),
      "restore",
      0,
    );
  });

  it("carries the restored version's frozen size snapshot forward", async () => {
    await POST(new Request("http://test"), ctx());
    expect(state.pattern.sizeTable).toEqual(VERSION.sizeTable);
    expect(state.pattern.sizeChartName).toBe(VERSION.sizeChartName);
  });

  // #267: restore carries the OLD version's frozen engine forward, the same
  // "snapshotted once, never re-resolved" rule as sizeChartName above.
  it("carries the restored version's frozen engine forward", async () => {
    await POST(new Request("http://test"), ctx());
    expect(state.pattern.engine).toBe(VERSION.engine);
  });

  it("looks the version up ownership-scoped before touching the drafter", async () => {
    await POST(new Request("http://test"), ctx());
    expect(getVersion).toHaveBeenCalledWith("m1", "u1", "pv3");
  });

  it("404s (as version_not_found) when the version doesn't exist or isn't owned, and never locks the pattern", async () => {
    getVersionResult = null;
    const res = await POST(new Request("http://test"), ctx());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("version_not_found");
    expect(withPatternVersioned).not.toHaveBeenCalled();
    expect(recordVersion).not.toHaveBeenCalled();
  });

  it("404s when the pattern itself isn't found/owned", async () => {
    const res = await POST(new Request("http://test"), ctx("someone-elses"));
    expect(res.status).toBe(404);
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(new Request("http://test"), ctx());
    expect(res.status).toBe(401);
    expect(getVersion).not.toHaveBeenCalled();
  });

  // #62: requireUser() already re-checks the account exists, so this is
  // only the race window between that check and this route's own read.
  it("401s if the account vanished between requireUser() and loadWallet()", async () => {
    vi.mocked(loadWallet).mockResolvedValueOnce(null);
    const res = await POST(new Request("http://test"), ctx());
    expect(res.status).toBe(401);
  });

  it("maps a withPatternVersioned failure to a coded 503 instead of a bare 500", async () => {
    vi.mocked(withPatternVersioned).mockRejectedValueOnce(
      new Error("Transaction already closed"),
    );
    const res = await POST(new Request("http://test"), ctx());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("service_unavailable");
    expect(reportError).toHaveBeenCalledWith(
      "versions.restore",
      expect.any(Error),
      { patternId: "m1", userId: "u1", versionId: "pv3" },
    );
  });
});
