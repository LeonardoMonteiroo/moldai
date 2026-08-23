import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedPatternState } from "@/lib/editor/state";
import { seedWallet } from "@/lib/billing/wallet";
import { t } from "@/lib/i18n/test-translate";
import type { PatternState } from "@/lib/types";
import type { Wallet, LedgerEntry } from "@/lib/billing/wallet";

const NOW = new Date("2026-08-17T12:00:00.000Z");
let state: PatternState = seedPatternState(t);
let wallet: Wallet = seedWallet(NOW);
let ownedPatternId: string | null = "m1";
let lastEntries: LedgerEntry[] = [];

vi.mock("@/lib/ai", () => ({ proposeGarment: vi.fn() }));
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
      ) => Promise<{ result: unknown; entries: LedgerEntry[] }>,
    ) => {
      if (patternId !== ownedPatternId) return null;
      // getSizeChartForGeneration is mocked wholesale below and ignores its
      // arguments, so a fake tx is enough here.
      const { result, entries } = await fn(state, wallet, {});
      lastEntries = entries;
      return result;
    },
  ),
}));
const CHART = {
  chart: {
    name: "Feminino adulto · ABNT",
    gender: "female",
    bodyType: "straight",
    isSystem: true,
    sizes: ["PP", "P", "M", "G", "GG"],
    baseSizeIndex: 2,
    baseMeasurements: {
      bust: 92,
      waist: 74,
      hip: 100,
      hipHeight: 20.6,
      backLength: 41,
      shoulder: 18.5,
      skirtLength: 60,
      shortSleeveLength: 18,
      longSleeveLength: 58,
    } as Record<string, number>,
    progressionRule: {},
    overrides: {},
  },
  rejectedActiveName: null as string | null,
};
vi.mock("@/lib/db/sizeChart", () => ({
  getSizeChartForGeneration: vi.fn(async () => CHART),
}));

import { POST } from "./route";
import { proposeGarment } from "@/lib/ai";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { withPatternAndWallet } from "@/lib/db/pattern-wallet";

const mockPropose = proposeGarment as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new Request("http://test/api/patterns/m1/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function ctx(id = "m1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/patterns/[id]/generate", () => {
  beforeEach(() => {
    state = seedPatternState(t);
    wallet = seedWallet(NOW);
    ownedPatternId = "m1";
    lastEntries = [];
    mockPropose.mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
  });

  it("ask refunds the credit, doesn't draft or version, and returns clarify", async () => {
    const balanceBefore = wallet.balance;
    const versionBefore = state.pattern.version;
    mockPropose.mockResolvedValue({
      decision: "ask",
      spec: {
        type: "tshirt",
        gender: "male",
        style: {},
        measurementOverrides: {},
      },
      questions: [
        {
          id: "q0",
          label: "Gola",
          options: ["redonda", "V"],
          allowOther: true,
        },
      ],
      assistantMessage: "Me conta mais:",
    });
    const res = await POST(req({ message: "quero uma camiseta" }), ctx());
    const json = await res.json();
    expect(json.status).toBe("clarify");
    expect(json.state.credits.balance).toBe(balanceBefore);
    expect(state.pattern.version).toBe(versionBefore);
  });

  it("apply debits, drafts, and versions", async () => {
    const balanceBefore = wallet.balance;
    mockPropose.mockResolvedValue({
      decision: "apply",
      spec: {
        type: "tshirt",
        gender: "male",
        style: {},
        measurementOverrides: {},
      },
      assistantMessage: "Pronto",
    });
    const res = await POST(req({ message: "camiseta masc" }), ctx());
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.state.credits.balance).toBe(balanceBefore - 1);
    expect(state.pattern.version).toBe(1);
  });

  it("explain answers, keeps the debit, and neither drafts nor versions", async () => {
    const balanceBefore = wallet.balance;
    const versionBefore = state.pattern.version;
    mockPropose.mockResolvedValue({
      decision: "explain",
      spec: {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: {},
      },
      assistantMessage: "Pence é a dobra costurada que dá volume à peça.",
    });

    const res = await POST(req({ message: "o que é pence?" }), ctx());
    const json = await res.json();

    expect(json.status).toBe("answered");
    expect(json.state.credits.balance).toBe(balanceBefore - 1);
    expect(state.pattern.version).toBe(versionBefore);
    expect(state.pattern.pieces).toHaveLength(0);

    const answer = state.chat.at(-1)!;
    expect(answer.author).toBe("ai");
    expect(answer.text).toBe("Pence é a dobra costurada que dá volume à peça.");
    expect(answer.chips?.[0].label).toBe("chat.creditChip");
    expect(answer.chips?.[0].tone).toBe("credit");
  });

  it("explain writes one debit and no refund", async () => {
    mockPropose.mockResolvedValue({
      decision: "explain",
      spec: {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: {},
      },
      assistantMessage: "A cava é o recorte onde a manga encaixa.",
    });

    await POST(req({ message: "o que é cava?" }), ctx());

    expect(lastEntries.map((e) => e.type)).toEqual(["debit"]);
  });

  // The contrast case: explain is the only non-drafting decision that is paid.
  it("decline still refunds", async () => {
    const balanceBefore = wallet.balance;
    mockPropose.mockResolvedValue({
      decision: "decline",
      spec: {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: {},
      },
      declineReason: "calça",
      assistantMessage: "Ainda não faço calça.",
    });

    const res = await POST(req({ message: "faz uma calça" }), ctx());

    expect((await res.json()).status).toBe("declined");
    expect(wallet.balance).toBe(balanceBefore);
    expect(lastEntries.map((e) => e.type)).toEqual(["debit", "refund"]);
  });

  // #53: a malformed tool_use payload (not an object, an unrecognized
  // decision, ...) now throws inside proposeGarment instead of being cast
  // and trusted -- this asserts the route's existing catch turns that throw
  // into a refund + status:"error" rather than drafting whatever fell out
  // of the untrusted payload.
  it("refunds instead of drafting when proposeGarment rejects", async () => {
    const balanceBefore = wallet.balance;
    const versionBefore = state.pattern.version;
    mockPropose.mockRejectedValue(
      new Error("propose_garment tool_use.input was not an object"),
    );

    const res = await POST(req({ message: "uma blusa" }), ctx());
    const json = await res.json();

    expect(json.status).toBe("error");
    expect(wallet.balance).toBe(balanceBefore);
    expect(state.pattern.version).toBe(versionBefore);
    expect(lastEntries.map((e) => e.type)).toEqual(["debit", "refund"]);
  });

  it("empty message returns 400 without debiting or calling the AI", async () => {
    const balanceBefore = wallet.balance;
    const res = await POST(req({ message: "   " }), ctx());
    expect(res.status).toBe(400);
    expect(wallet.balance).toBe(balanceBefore);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("no session returns 401 without debiting or calling the AI", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(req({ message: "quero uma camiseta" }), ctx());
    expect(res.status).toBe(401);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("insufficient balance returns 402 without debiting or calling the AI", async () => {
    wallet.balance = 0;
    const res = await POST(req({ message: "camiseta" }), ctx());
    expect(res.status).toBe(402);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("404s when the pattern isn't found/owned, without calling the AI", async () => {
    const res = await POST(req({ message: "camiseta" }), ctx("someone-elses"));
    expect(res.status).toBe(404);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  // The fallback was correct but silent: nothing on screen said the account's
  // active chart had not been used, so the user got measurements they never
  // chose while /size-charts still showed their chart as active.
  it("adds a notice message when the active size chart could not be used", async () => {
    CHART.rejectedActiveName = "Masculino adulto (cópia)";
    mockPropose.mockResolvedValue({
      decision: "apply",
      spec: {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: {},
      },
      assistantMessage: "Feito!",
    });

    const res = await POST(req({ message: "uma blusa" }), ctx());
    expect(res.status).toBe(200);

    const notice = state.chat.find((m) => m.tone === "notice");
    expect(notice).toBeDefined();
    expect(notice!.text).toBe("chat.sizeChartSubstituted");
    CHART.rejectedActiveName = null;
  });

  it("adds no notice when the active chart was the one used", async () => {
    CHART.rejectedActiveName = null;
    mockPropose.mockResolvedValue({
      decision: "apply",
      spec: {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: {},
      },
      assistantMessage: "Feito!",
    });

    await POST(req({ message: "uma blusa" }), ctx());

    expect(state.chat.some((m) => m.tone === "notice")).toBe(false);
  });

  it("freezes the chart name onto the pattern for the tech sheet", async () => {
    mockPropose.mockResolvedValue({
      decision: "apply",
      spec: {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: {},
      },
      assistantMessage: "Feito!",
    });

    await POST(req({ message: "uma blusa" }), ctx());

    expect(state.pattern.sizeChartName).toBe("Feminino adulto · ABNT");
  });

  // #61: a throw past withPatternAndWallet's own transaction close (e.g. it
  // already timed out — a slow AI call plus retries could previously
  // outlive TX_OPTS.timeout) used to escape as a bare, uncoded HTTP 500.
  it("maps a withPatternAndWallet failure to a coded 503 instead of a bare 500", async () => {
    vi.mocked(withPatternAndWallet).mockRejectedValueOnce(
      new Error("Transaction already closed"),
    );
    const res = await POST(req({ message: "uma blusa" }), ctx());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("service_unavailable");
  });
});
