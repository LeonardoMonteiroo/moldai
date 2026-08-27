import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedPatternState, applyGarmentSpec } from "@/lib/editor/state";
import { seedWallet } from "@/lib/billing/wallet";
import { t } from "@/lib/i18n/test-translate";
import type { PatternState } from "@/lib/types";
import type { Wallet, LedgerEntry } from "@/lib/billing/wallet";

// Graduation now requires drafted pieces, so the default fixture is a pattern
// that has actually been generated once -- a blank seedPatternState is the
// *negative* case, exercised on its own below.
function draftedState(): PatternState {
  const s = seedPatternState(t);
  applyGarmentSpec(
    s,
    { type: "blouse", gender: "female", measurementOverrides: {}, style: {} },
    t,
  );
  return s;
}

const NOW = new Date("2026-08-17T12:00:00.000Z");
let state: PatternState = draftedState();
let wallet: Wallet = seedWallet(NOW);
let ownedPatternId: string | null = "m1";
// #43: captures fn's raw return (including `dirty`), which the mock below
// otherwise discards down to just `.result` -- the route's own contract with
// withPatternAndWallet is what a rejecting branch signals, not what the POST
// response ends up looking like.
let lastFnReturn: { entries: LedgerEntry[]; dirty?: boolean } | null = null;
// #16: the same fake tx reference both withPatternAndWallet's mock and the
// route's own recordVersion call see -- proving the snapshot write happens
// inside the transaction, not after it.
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
vi.mock("@/lib/db/pattern-wallet", () => ({
  withPatternAndWallet: vi.fn(
    async (
      patternId: string,
      _userId: string,
      fn: (
        s: PatternState,
        w: Wallet,
        tx: unknown,
      ) => Promise<{
        result: unknown;
        entries: LedgerEntry[];
        dirty?: boolean;
      }>,
    ) => {
      if (patternId !== ownedPatternId) return null;
      const out = await fn(state, wallet, FAKE_TX);
      lastFnReturn = { entries: out.entries, dirty: out.dirty };
      return out.result;
    },
  ),
}));
vi.mock("@/lib/db/patternVersion", () => ({ recordVersion: vi.fn() }));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { withPatternAndWallet } from "@/lib/db/pattern-wallet";
import { recordVersion } from "@/lib/db/patternVersion";

function req(body: unknown) {
  return new Request("http://test/api/patterns/m1/graduate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function ctx(id = "m1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/patterns/[id]/graduate", () => {
  beforeEach(() => {
    state = draftedState();
    wallet = seedWallet(NOW);
    ownedPatternId = "m1";
    lastFnReturn = null;
    vi.mocked(recordVersion).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
  });

  it("debits, applies sizes, and versions", async () => {
    const balanceBefore = wallet.balance;
    const res = await POST(req({ sizes: ["G"] }), ctx());
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.state.credits.balance).toBe(balanceBefore - 6);
    expect(state.pattern.sizesApplied).toContain("G");
    expect(state.pattern.version).toBe(1);
    // #43: a real grade actually changed both rows, so it must not opt out
    // of the save withPatternAndWallet would otherwise skip.
    expect(lastFnReturn?.dirty).not.toBe(false);
    // #16: reason "graduate", the credit actually debited (COSTS.graduate),
    // written through the same tx withPatternAndWallet handed the callback.
    expect(recordVersion).toHaveBeenCalledWith(
      FAKE_TX,
      "m1",
      "u1",
      expect.objectContaining({ version: 1 }),
      "graduate",
      6,
    );
  });

  it("writes the graduated chat message and credit chip through the translator", async () => {
    const res = await POST(req({ sizes: ["G"] }), ctx());
    expect(res.status).toBe(200);
    const last = state.chat[state.chat.length - 1];
    expect(last.author).toBe("ai");
    expect(last.text).toBe("chat.graduated");
    expect(last.chips).toEqual([{ label: "chat.creditChip", tone: "credit" }]);
  });

  it("400s on no valid sizes", async () => {
    const res = await POST(req({ sizes: ["XX"] }), ctx());
    expect(res.status).toBe(400);
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(req({ sizes: ["G"] }), ctx());
    expect(res.status).toBe(401);
  });

  it("insufficient balance returns 402", async () => {
    wallet.balance = 0;
    const res = await POST(req({ sizes: ["G"] }), ctx());
    expect(res.status).toBe(402);
    // #43: nothing was mutated before this branch returns, so it must tell
    // withPatternAndWallet to skip the otherwise-unconditional save --
    // rejecting a graduate request must not bump the pattern's updatedAt.
    expect(lastFnReturn?.dirty).toBe(false);
    expect(recordVersion).not.toHaveBeenCalled();
  });

  it("404s when the pattern isn't found/owned", async () => {
    const res = await POST(req({ sizes: ["G"] }), ctx("someone-elses"));
    expect(res.status).toBe(404);
  });

  // "null" is valid JSON: it survived request.json() and threw on body.sizes.
  it("400s on a literal null body instead of throwing", async () => {
    const res = await POST(req(null), ctx("m1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_body");
  });

  // A blank pattern has no pieces but DOES have a seeded `sizes` list, so the
  // existing "no gradable sizes" guard never fired: grading nothing versioned
  // the pattern and charged the most expensive action in the app.
  it("400s and does not debit when the pattern has no pieces", async () => {
    state = seedPatternState(t); // blank: version 0, pieces []
    const balanceBefore = wallet.balance;
    const res = await POST(req({ sizes: ["G"] }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("pattern_not_drafted");
    expect(wallet.balance).toBe(balanceBefore);
    expect(state.pattern.version).toBe(0);
    expect(state.pattern.sizesApplied).not.toContain("G");
    // #43: same reasoning as the 402 case -- a blank pattern must not have
    // its updatedAt bumped by a request that drafted nothing.
    expect(lastFnReturn?.dirty).toBe(false);
    expect(recordVersion).not.toHaveBeenCalled();
  });

  // #60: the guard used to check membership in `pattern.sizes` (the full
  // label list), not `sizesPending` -- so a size already graduated still
  // passed validation. Two POSTs with the same sizes (double-click, two
  // tabs, or a direct replay) debited twice for one graduation.
  it("400s and does not debit a second grade request for an already-applied size", async () => {
    const first = await POST(req({ sizes: ["G"] }), ctx());
    expect(first.status).toBe(200);
    const balanceAfterFirst = wallet.balance;
    const versionAfterFirst = state.pattern.version;

    const second = await POST(req({ sizes: ["G"] }), ctx());
    expect(second.status).toBe(400);
    expect((await second.json()).error).toBe("no_gradable_sizes");
    expect(wallet.balance).toBe(balanceAfterFirst);
    expect(state.pattern.version).toBe(versionAfterFirst);
    expect(lastFnReturn?.dirty).toBe(false);
  });

  // The base size is already the drafted size -- PieceDetailsPanel's
  // `gradable` list excludes it, and the route must reject it too rather
  // than relying on the client to never ask.
  it("400s and does not debit a request for the base size", async () => {
    const balanceBefore = wallet.balance;
    const res = await POST(req({ sizes: ["M"] }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("no_gradable_sizes");
    expect(wallet.balance).toBe(balanceBefore);
    expect(state.pattern.version).toBe(0);
    expect(lastFnReturn?.dirty).toBe(false);
  });

  // #61: a throw past withPatternAndWallet's own transaction close (e.g. it
  // already timed out) used to escape as a bare, uncoded HTTP 500.
  it("maps a withPatternAndWallet failure to a coded 503 instead of a bare 500", async () => {
    vi.mocked(withPatternAndWallet).mockRejectedValueOnce(
      new Error("Transaction already closed"),
    );
    const res = await POST(req({ sizes: ["G"] }), ctx());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("service_unavailable");
  });
});
