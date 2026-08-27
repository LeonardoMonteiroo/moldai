import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedPatternState } from "@/lib/editor/state";
import { seedWallet } from "@/lib/billing/wallet";
import { t } from "@/lib/i18n/test-translate";
import type { PatternState } from "@/lib/types";

const NOW = new Date("2026-08-17T12:00:00.000Z");
let state: PatternState = seedPatternState(t);
let ownedPatternId: string | null = "m1";
// #16: the same fake tx reference both withPatternVersioned's mock and the
// route's own recordVersion call see, proving the "fix" snapshot write
// happens inside the transaction, not after it.
const FAKE_TX = {};

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
// #16: withPatternVersioned replaces withPattern here -- a Pattern-only
// transaction (never Wallet) that also records "fix"'s version snapshot.
// recordVersion is mocked wholesale, matching the route/generate/graduate
// test precedent.
vi.mock("@/lib/db/patternVersion", () => ({
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
  recordVersion: vi.fn(),
}));
vi.mock("@/lib/db/wallet", () => ({
  loadWallet: vi.fn(async () => seedWallet(NOW)),
}));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { loadWallet } from "@/lib/db/wallet";
import { recordVersion } from "@/lib/db/patternVersion";
import { setConflict } from "@/lib/editor/state";

function req(action: unknown) {
  return new Request("http://test/api/patterns/m1/conflict/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action }),
  });
}
function ctx(id = "m1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/patterns/[id]/conflict/resolve", () => {
  beforeEach(() => {
    state = seedPatternState(t);
    setConflict(state, {
      id: "conf-1",
      title: "t",
      description: "d",
      diffCm: 1.8,
      suggestion: "s",
      pieceAId: "body-front",
      pieceBId: "sleeve",
      markers: [],
    });
    ownedPatternId = "m1";
    vi.mocked(recordVersion).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
  });

  it("ignore clears the conflict for free and does not version", async () => {
    const res = await POST(req("ignore"), ctx());
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(state.conflict).toBeNull();
    // #16: "ignore" never calls bumpVersion, so it must not snapshot either.
    expect(recordVersion).not.toHaveBeenCalled();
  });

  it("fix refits the sleeve, versions, and records the free reason inside the same tx", async () => {
    const versionBefore = state.pattern.version;
    const res = await POST(req("fix"), ctx());
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(state.pattern.version).toBe(versionBefore + 1);
    expect(recordVersion).toHaveBeenCalledWith(
      FAKE_TX,
      "m1",
      "u1",
      expect.objectContaining({ version: versionBefore + 1 }),
      "conflict_fix",
      0,
    );
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(req("ignore"), ctx());
    expect(res.status).toBe(401);
  });

  it("404s when the pattern isn't found/owned", async () => {
    const res = await POST(req("ignore"), ctx("someone-elses"));
    expect(res.status).toBe(404);
  });

  // #62: requireUser() already re-checks the account exists, so this is
  // only the race window between that check and this route's own read.
  it("401s if the account vanished between requireUser() and loadWallet()", async () => {
    vi.mocked(loadWallet).mockResolvedValueOnce(null);
    const res = await POST(req("ignore"), ctx());
    expect(res.status).toBe(401);
  });

  // #54: an unrecognised action used to fall through to "ignore" -- silently
  // clearing a real conflict warning and re-enabling Export with divergent
  // armholes -- instead of being rejected.
  it("400s on an unrecognised action instead of silently resolving as ignore", async () => {
    const res = await POST(req("Fix"), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_body");
    expect(state.conflict).not.toBeNull();
  });

  it("400s when action is missing entirely", async () => {
    const res = await POST(req(undefined), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_body");
    expect(state.conflict).not.toBeNull();
  });
});
