import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedPatternState } from "@/lib/editor/state";
import { COSTS, MAX_CHAT_MESSAGE_LENGTH } from "@/lib/types";
import { MEASUREMENT_RANGES } from "@/lib/measurements";
import { seedWallet } from "@/lib/billing/wallet";
import { t } from "@/lib/i18n/test-translate";
import type { PatternState } from "@/lib/types";
import type { Wallet, LedgerEntry } from "@/lib/billing/wallet";

const NOW = new Date("2026-08-17T12:00:00.000Z");
let state: PatternState = seedPatternState(t);
let wallet: Wallet = seedWallet(NOW);
let ownedPatternId: string | null = "m1";
let lastEntries: LedgerEntry[] = [];
// #43: an insufficient-balance rejection returns before touching state or
// wallet at all, so it must tell withPatternAndWallet to skip the save that
// would otherwise stamp Pattern.updatedAt=now() for a request that changed
// nothing.
let lastDirty: boolean | undefined;

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
      ) => Promise<{
        result: unknown;
        entries: LedgerEntry[];
        dirty?: boolean;
      }>,
    ) => {
      if (patternId !== ownedPatternId) return null;
      // getSizeChartForGeneration is mocked wholesale below and ignores its
      // arguments, so a fake tx is enough here.
      const { result, entries, dirty } = await fn(state, wallet, {});
      lastEntries = entries;
      lastDirty = dirty;
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
vi.mock("@/lib/observability/report", () => ({ reportError: vi.fn() }));

import { POST } from "./route";
import { proposeGarment } from "@/lib/ai";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { withPatternAndWallet } from "@/lib/db/pattern-wallet";
import { reportError } from "@/lib/observability/report";
import { getSizeChartForGeneration } from "@/lib/db/sizeChart";

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
    lastDirty = undefined;
    mockPropose.mockReset();
    vi.mocked(reportError).mockReset();
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
  });

  // #39: this used to debit then immediately refund -- a real debit+refund
  // pair on the append-only ledger, not a no-op, which is exactly what made
  // "Uso recente" show three vague prompts as three real charges. `ask` is
  // never chargeable, so it must never touch the wallet at all now.
  it("ask never debits or refunds, doesn't draft or version, and returns clarify", async () => {
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
    expect(lastEntries).toEqual([]);
    // #43: ask has no ledger entries but DOES append a chat message -- an
    // entries-based "nothing changed" heuristic would wrongly skip saving it.
    expect(lastDirty).not.toBe(false);
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
    expect(lastEntries.map((e) => e.type)).toEqual(["debit"]);
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

  // The contrast case: explain is the only non-drafting decision that is
  // paid. #39: decline used to debit then refund in the same request -- a
  // real ledger pair, not a no-op -- now it never touches the wallet.
  it("decline never debits or refunds", async () => {
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
    expect(lastEntries).toEqual([]);
  });

  // #53: a malformed tool_use payload (not an object, an unrecognized
  // decision, ...) now throws inside proposeGarment instead of being cast
  // and trusted -- this asserts the route's existing catch turns that throw
  // into status:"error" rather than drafting whatever fell out of the
  // untrusted payload. #39: proposeGarment throwing here happens BEFORE any
  // decision is known, so (unlike a mid-apply failure) nothing was ever
  // debited -- there is nothing to refund, and no ledger rows are written.
  it("does not debit or refund when proposeGarment rejects before a decision is known", async () => {
    const balanceBefore = wallet.balance;
    const versionBefore = state.pattern.version;
    const thrown = new Error(
      "propose_garment tool_use.input was not an object",
    );
    mockPropose.mockRejectedValue(thrown);

    const res = await POST(req({ message: "uma blusa" }), ctx());
    const json = await res.json();

    expect(json.status).toBe("error");
    expect(wallet.balance).toBe(balanceBefore);
    expect(state.pattern.version).toBe(versionBefore);
    expect(lastEntries).toEqual([]);
    // #100: this catch had no error binding at all before -- an Anthropic
    // 401/429 was structurally unloggable, and the operator's stdout held
    // nothing saying a generation was even attempted.
    expect(reportError).toHaveBeenCalledWith("generate", thrown, {
      patternId: "m1",
      userId: "u1",
    });
  });

  // #39's other half: a debit did happen (decision was "apply"), then
  // something failed while drafting -- unlike the case above, this one DOES
  // need a refund, and the catch block still provides it correctly.
  it("refunds a debit that already happened when drafting fails after the decision is known", async () => {
    const balanceBefore = wallet.balance;
    mockPropose.mockResolvedValue({
      decision: "apply",
      spec: {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: {},
      },
      assistantMessage: "Pronto",
    });
    vi.mocked(getSizeChartForGeneration).mockRejectedValueOnce(
      new Error("db unavailable"),
    );

    const res = await POST(req({ message: "uma blusa" }), ctx());
    const json = await res.json();

    expect(json.status).toBe("error");
    expect(wallet.balance).toBe(balanceBefore);
    expect(lastEntries.map((e) => e.type)).toEqual(["debit", "refund"]);
  });

  // #18: the route re-validates `image` regardless of what the browser's own
  // prepareImage() already enforced -- rejected before any debit or
  // Anthropic call, same as the message-length/NUL checks.
  it("rejects an unrecognized image mediaType before debiting or calling the AI", async () => {
    const balanceBefore = wallet.balance;
    const res = await POST(
      req({
        message: "uma blusa",
        image: { mediaType: "text/html", data: "abc" },
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_attachment");
    expect(wallet.balance).toBe(balanceBefore);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  // Even a base64 payload that would fit inside the route's own raised body
  // ceiling is still rejected once past MAX_ATTACHMENT_BASE64_CHARS -- the
  // browser would have caught this first, but the route is the real boundary.
  it("rejects an oversized image.data before debiting or calling the AI", async () => {
    const balanceBefore = wallet.balance;
    const res = await POST(
      req({
        message: "uma blusa",
        image: {
          mediaType: "image/jpeg",
          data: "a".repeat(6 * 1024 * 1024 + 1),
        },
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_attachment");
    expect(wallet.balance).toBe(balanceBefore);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("a valid image reaches proposeGarment and debits exactly COSTS.adjust, same as text-only", async () => {
    const balanceBefore = wallet.balance;
    mockPropose.mockResolvedValue({
      decision: "apply",
      spec: {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: {},
      },
      assistantMessage: "Pronto",
    });
    const res = await POST(
      req({
        message: "uma blusa como nessa foto",
        image: { mediaType: "image/jpeg", data: "ZmFrZS1iYXNlNjQ=" },
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(mockPropose).toHaveBeenCalledWith(expect.anything(), false, {
      mediaType: "image/jpeg",
      base64: "ZmFrZS1iYXNlNjQ=",
    });
    expect(wallet.balance).toBe(balanceBefore - COSTS.adjust);
    const userTurn = state.chat.find((m) => m.author === "user");
    expect(userTurn?.hasImage).toBe(true);
  });

  // #18: prompt injection via an attached image's own text is not a new
  // attack surface -- it relies on the same structural defence every other
  // untrusted spec value already goes through. applyGarmentSpec drafts
  // through resolveMeasurements, which clamps every measurement to
  // MEASUREMENT_RANGES no matter what the model claims prompted the value.
  it("clamps an out-of-range measurement the model returns as if an attached image had instructed it", async () => {
    mockPropose.mockResolvedValue({
      decision: "apply",
      spec: {
        type: "blouse",
        gender: "female",
        measurementOverrides: { bust: 500 },
        style: {},
      },
      assistantMessage: "Pronto",
    });
    const res = await POST(
      req({
        message: "uma blusa como nessa foto",
        image: { mediaType: "image/jpeg", data: "ZmFrZS1iYXNlNjQ=" },
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(state.pattern.baseMeasurements?.bust).toBe(
      MEASUREMENT_RANGES.bust.max,
    );
  });

  it("empty message returns 400 without debiting or calling the AI", async () => {
    const balanceBefore = wallet.balance;
    const res = await POST(req({ message: "   " }), ctx());
    expect(res.status).toBe(400);
    expect(wallet.balance).toBe(balanceBefore);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  // #69: a NUL code point survives .trim() and used to only abort the
  // jsonb write inside savePattern -- by then the paid Anthropic call had
  // already run and billed. Reject before any of that, at the boundary.
  it("a message containing a NUL code point returns 400 without debiting or calling the AI", async () => {
    const balanceBefore = wallet.balance;
    const res = await POST(
      req({ message: `uma blusa${String.fromCharCode(0)}` }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("missing_message");
    expect(wallet.balance).toBe(balanceBefore);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  // #55: presence was checked, length never was -- a large paste got
  // appended to the pattern's chat, re-serialised on every subsequent save
  // and shipped in full on every load, eventually rejected by Anthropic on
  // context length and bricking the pattern for several turns.
  it("a message over MAX_CHAT_MESSAGE_LENGTH returns 400 without debiting or calling the AI", async () => {
    const balanceBefore = wallet.balance;
    const res = await POST(
      req({ message: "a".repeat(MAX_CHAT_MESSAGE_LENGTH + 1) }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("message_too_long");
    expect(wallet.balance).toBe(balanceBefore);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  it("a message exactly at MAX_CHAT_MESSAGE_LENGTH is accepted", async () => {
    mockPropose.mockResolvedValue({
      decision: "decline",
      declineReason: "fora do escopo",
    });
    const res = await POST(
      req({ message: "a".repeat(MAX_CHAT_MESSAGE_LENGTH) }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(mockPropose).toHaveBeenCalled();
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
    expect(lastDirty).toBe(false);
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
