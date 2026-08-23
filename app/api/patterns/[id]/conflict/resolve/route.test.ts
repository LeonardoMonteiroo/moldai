import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedPatternState } from "@/lib/editor/state";
import { seedWallet } from "@/lib/billing/wallet";
import { t } from "@/lib/i18n/test-translate";
import type { PatternState } from "@/lib/types";

const NOW = new Date("2026-08-17T12:00:00.000Z");
let state: PatternState = seedPatternState(t);
let ownedPatternId: string | null = "m1";

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
vi.mock("@/lib/db/pattern", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/db/pattern")>(
      "@/lib/db/pattern",
    );
  return {
    ...actual,
    withPattern: vi.fn(
      async (
        patternId: string,
        _userId: string,
        fn: (s: PatternState) => PatternState,
      ) => (patternId === ownedPatternId ? fn(state) : null),
    ),
  };
});
vi.mock("@/lib/db/wallet", () => ({
  loadWallet: vi.fn(async () => seedWallet(NOW)),
}));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { loadWallet } from "@/lib/db/wallet";
import { setConflict } from "@/lib/editor/state";

function req(action: "fix" | "ignore") {
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
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
  });

  it("ignore clears the conflict for free", async () => {
    const res = await POST(req("ignore"), ctx());
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(state.conflict).toBeNull();
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
});
