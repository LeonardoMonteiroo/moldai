import { describe, it, expect, vi, beforeEach } from "vitest";
import { seedPatternState } from "@/lib/editor/state";
import { COSTS, MAX_CHAT_MESSAGE_LENGTH } from "@/lib/types";
import { MEASUREMENT_RANGES } from "@/lib/measurements";
import {
  MAX_ATTACHMENT_BASE64_CHARS,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENTS_TOTAL_BASE64_CHARS,
} from "@/lib/editor/attachment";
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
// #16: the same fake tx object flows from withPatternAndWallet's mock into
// the route's own recordVersion call below -- asserting recordVersion was
// called WITH this exact reference is what proves the snapshot write is
// happening inside the same transaction as the debit, not after it.
const FAKE_TX = {};

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
      // getSizeChartForGeneration is mocked wholesale below and recordVersion
      // is mocked wholesale too, so a fake tx object is enough here -- what
      // matters for the atomicity assertion is that it's the SAME reference
      // both withPatternAndWallet and recordVersion see.
      const { result, entries, dirty } = await fn(state, wallet, FAKE_TX);
      lastEntries = entries;
      lastDirty = dirty;
      return result;
    },
  ),
}));
vi.mock("@/lib/db/patternVersion", () => ({ recordVersion: vi.fn() }));
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
// PFORM-42: the id a request names is the pick's first preference, so the
// double has to honour it -- returning CHART regardless would let a route
// that dropped `requestedId` on the floor pass every assertion below.
const REQUESTED_CHART_ID = "g-male-atelier";
const REQUESTED_CHART = {
  chart: { ...CHART.chart, name: "Masculino do ateliê", gender: "male" },
  rejectedActiveName: null as string | null,
};
vi.mock("@/lib/db/sizeChart", () => ({
  getSizeChartForGeneration: vi.fn(
    async (
      _tx: unknown,
      _userId: string,
      _gender: string,
      _t: unknown,
      requestedId?: string | null,
    ) => (requestedId === REQUESTED_CHART_ID ? REQUESTED_CHART : CHART),
  ),
  getSizeChartGenderForUser: vi.fn(async () => null),
  // PFORM-47: never called by this route. Mocked purely so "not called" is
  // an assertion a future edit that reached for it would fail, rather than a
  // claim resting on the import list.
  setActiveSizeChart: vi.fn(),
}));
vi.mock("@/lib/observability/report", () => ({ reportError: vi.fn() }));

import { POST } from "./route";
import { proposeGarment } from "@/lib/ai";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { withPatternAndWallet } from "@/lib/db/pattern-wallet";
import { reportError } from "@/lib/observability/report";
import {
  getSizeChartForGeneration,
  getSizeChartGenderForUser,
  setActiveSizeChart,
} from "@/lib/db/sizeChart";
import { recordVersion } from "@/lib/db/patternVersion";

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
    vi.mocked(recordVersion).mockReset();
    vi.mocked(getSizeChartForGeneration).mockClear();
    vi.mocked(getSizeChartGenderForUser).mockReset();
    vi.mocked(getSizeChartGenderForUser).mockResolvedValue(null);
    vi.mocked(setActiveSizeChart).mockClear();
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
    // #16: no bump means no snapshot -- a version is recorded on bumpVersion,
    // never on debit (which ask never does anyway).
    expect(recordVersion).not.toHaveBeenCalled();
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
    // #16: a pattern's very first draft (pieces.length was 0 beforehand) is
    // reason "generate", carries the credit actually debited, and is written
    // through the SAME tx withPatternAndWallet handed the callback --
    // proving the write happened inside the transaction, not after it.
    expect(recordVersion).toHaveBeenCalledWith(
      FAKE_TX,
      "m1",
      "u1",
      expect.objectContaining({ version: 1 }),
      "generate",
      COSTS.adjust,
    );
  });

  it("a later apply (not the pattern's first draft) versions with reason 'adjust'", async () => {
    // Pre-drafted, so pieces.length > 0 before this request's own apply.
    state.pattern = {
      ...state.pattern,
      pieces: [
        {
          id: "x",
          name: "x",
          qty: 1,
          outline: { kind: "polygon", points: "0,0" },
          label: { x: 0, y: 0 },
          detailRows: [],
        },
      ],
    };
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
    await POST(req({ message: "ajusta a cava" }), ctx());
    expect(recordVersion).toHaveBeenCalledWith(
      FAKE_TX,
      "m1",
      "u1",
      expect.anything(),
      "adjust",
      COSTS.adjust,
    );
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
    // #16: explain debits but never bumps the version -- it must not version.
    expect(recordVersion).not.toHaveBeenCalled();
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

  // #138: assemblyOrder is the structured signal proposeGarment/
  // resolveDecision carry through on an explain answer that walked the
  // sewing/assembly order (lib/ai/decision.ts) -- the route must tag the
  // persisted ChatMessage so ChatBubble can attach the catalog-sourced
  // disclaimer, same debit/no-draft/no-version shape as every other
  // explain answer.
  it("explain with assemblyOrder=true tags the chat message with assembly:true", async () => {
    mockPropose.mockResolvedValue({
      decision: "explain",
      spec: {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: {},
      },
      assistantMessage:
        "1. Pences. 2. Ombro. 3. Cava/manga. 4. Lateral. 5. Barra.",
      assemblyOrder: true,
    });

    const res = await POST(
      req({ message: "qual a ordem de montagem?" }),
      ctx(),
    );
    const json = await res.json();

    expect(json.status).toBe("answered");
    const answer = state.chat.at(-1)!;
    expect(answer.assembly).toBe(true);
    expect(answer.chips?.[0].tone).toBe("credit");
  });

  it("an ordinary explain answer (no assemblyOrder) leaves assembly unset", async () => {
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

    await POST(req({ message: "o que é pence?" }), ctx());

    const answer = state.chat.at(-1)!;
    expect(answer.assembly).toBeUndefined();
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
    expect(recordVersion).not.toHaveBeenCalled();
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
    expect(recordVersion).not.toHaveBeenCalled();
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
    // #16: the chart lookup rejected before applyGarmentSpec/bumpVersion ever
    // ran, so nothing produced a state worth versioning.
    expect(recordVersion).not.toHaveBeenCalled();
  });

  // #18: the route re-validates the attachments regardless of what the
  // browser's own prepareImage() already enforced -- rejected before any
  // debit or Anthropic call, same as the message-length/NUL checks.
  it("rejects an unrecognized image mediaType before debiting or calling the AI", async () => {
    const balanceBefore = wallet.balance;
    const res = await POST(
      req({
        message: "uma blusa",
        images: [{ mediaType: "text/html", data: "abc" }],
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
  it("rejects an oversized entry's data before debiting or calling the AI", async () => {
    const balanceBefore = wallet.balance;
    const res = await POST(
      req({
        message: "uma blusa",
        images: [
          {
            mediaType: "image/jpeg",
            data: "a".repeat(MAX_ATTACHMENT_BASE64_CHARS + 1),
          },
        ],
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_attachment");
    expect(wallet.balance).toBe(balanceBefore);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  // PFORM-65: every other way the list can be unusable answers the same one
  // code, and none of them may cost a credit or reach the paid call.
  it.each([
    ["not an array", { mediaType: "image/jpeg", data: "ZmFrZQ==" }],
    ["an empty array", []],
    [
      "more entries than MAX_ATTACHMENT_COUNT",
      Array.from({ length: MAX_ATTACHMENT_COUNT + 1 }, () => ({
        mediaType: "image/jpeg",
        data: "ZmFrZQ==",
      })),
    ],
    ["an entry with empty data", [{ mediaType: "image/jpeg", data: "" }]],
  ] as const)(
    "rejects images that is %s, with no debit and no proposeGarment call",
    async (_label, images) => {
      const balanceBefore = wallet.balance;
      const res = await POST(req({ message: "uma blusa", images }), ctx());
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_attachment");
      expect(wallet.balance).toBe(balanceBefore);
      expect(lastEntries).toEqual([]);
      expect(mockPropose).not.toHaveBeenCalled();
    },
  );

  // PFORM-65's combined cap: each entry is individually legal, so only the
  // sum can refuse this -- and it must refuse it as invalid_attachment, not
  // as the body reader's generic bad_body, which is what would happen if
  // MAX_GENERATE_BODY_BYTES were the smaller of the two ceilings.
  it("rejects a combined payload over the total ceiling, with no debit and no proposeGarment call", async () => {
    const balanceBefore = wallet.balance;
    const half = "a".repeat(MAX_ATTACHMENTS_TOTAL_BASE64_CHARS / 2);
    const res = await POST(
      req({
        message: "uma blusa",
        images: [
          { mediaType: "image/jpeg", data: half },
          { mediaType: "image/jpeg", data: half + "a" },
        ],
      }),
      ctx(),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_attachment");
    expect(wallet.balance).toBe(balanceBefore);
    expect(lastEntries).toEqual([]);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  // The other side of that derivation: a request sitting exactly ON the
  // combined ceiling is accepted rather than refused by the byte cap before
  // validateAttachmentInputs ever runs. Under the pre-change ceiling (the
  // per-image figure plus 16 KB) this body was too large outright.
  it("accepts a request whose attachments sit exactly on the combined ceiling", async () => {
    mockPropose.mockResolvedValue({
      decision: "explain",
      assistantMessage: "ok",
    });
    const half = "a".repeat(MAX_ATTACHMENTS_TOTAL_BASE64_CHARS / 2);
    const res = await POST(
      req({
        message: "uma blusa",
        images: [
          { mediaType: "image/jpeg", data: half },
          { mediaType: "image/jpeg", data: half },
        ],
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(mockPropose).toHaveBeenCalledTimes(1);
  });

  // PFORM-64: N image blocks, in the order received. The N=1 case is #18's
  // original test, migrated to the list rather than duplicated.
  it.each([1, 2, 4] as const)(
    "forwards %i attachments to proposeGarment in the order received",
    async (count) => {
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
      const images = Array.from({ length: count }, (_, i) => ({
        mediaType: "image/jpeg" as const,
        data: `foto-${i}`,
      }));

      const res = await POST(
        req({ message: "uma blusa como nessas fotos", images }),
        ctx(),
      );

      expect(res.status).toBe(200);
      expect(mockPropose).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          answering: false,
          images: images.map((a, i) => ({
            mediaType: "image/jpeg",
            base64: `foto-${i}`,
          })),
        }),
      );
      expect(wallet.balance).toBe(balanceBefore - COSTS.adjust);
    },
  );

  // PFORM-67: the count is persisted, the bytes are not -- asserted against
  // the SERIALIZED blob, which is what actually reaches the jsonb column, so
  // a payload hidden anywhere in the state (not just on the message object
  // the assertion above reads) would fail this.
  it("persists hasImage and imageCount on the user turn, and no image bytes anywhere in the state", async () => {
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
    const data = "Y2FmZS1iYXNlNjQtcGF5bG9hZA==";

    await POST(
      req({
        message: "uma blusa como nessas fotos",
        images: [
          { mediaType: "image/jpeg", data },
          { mediaType: "image/png", data },
          { mediaType: "image/webp", data },
        ],
      }),
      ctx(),
    );

    const userTurn = state.chat.find((m) => m.author === "user")!;
    expect(userTurn.hasImage).toBe(true);
    expect(userTurn.imageCount).toBe(3);
    expect(JSON.stringify(state)).not.toContain(data);
  });

  // A text-only request omits the key entirely, and must behave exactly as
  // it did before the wire carried a list at all.
  it("an omitted images key sends no attachments and marks the turn with neither field", async () => {
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

    const res = await POST(req({ message: "uma blusa" }), ctx());

    expect(res.status).toBe(200);
    expect(mockPropose.mock.calls[0][1]).toEqual({
      answering: false,
      importContext: undefined,
    });
    const userTurn = state.chat.find((m) => m.author === "user")!;
    expect(userTurn.hasImage).toBeUndefined();
    expect(userTurn.imageCount).toBeUndefined();
  });

  // The rename's own failure mode, pinned so it is a known shape rather than
  // a surprise: a caller still on the singular `image` key is treated as
  // carrying no attachment at all -- not as a silent one-image request that
  // quietly keeps some of the reference. It is charged as the text-only
  // request it now is, which is precisely why the rename had to make every
  // caller a compile error instead of accepting both shapes.
  it("treats the old singular image key as no attachment at all", async () => {
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
    expect(mockPropose.mock.calls[0][1]).toEqual({
      answering: false,
      importContext: undefined,
    });
    const userTurn = state.chat.find((m) => m.author === "user")!;
    expect(userTurn.hasImage).toBeUndefined();
    expect(userTurn.imageCount).toBeUndefined();
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
        images: [{ mediaType: "image/jpeg", data: "ZmFrZS1iYXNlNjQ=" }],
      }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(state.pattern.baseMeasurements?.bust).toBe(
      MEASUREMENT_RANGES.bust.max,
    );
  });

  it("passes importContext through to proposeGarment but never persists it in chat", async () => {
    mockPropose.mockResolvedValue({
      decision: "explain",
      assistantMessage: "ok",
    });
    const res = await POST(
      req({ message: "reconstruct", importContext: "MARKER TEXT" }),
      ctx(),
    );
    expect(res.status).toBe(200);
    expect(mockPropose).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        answering: false,
        importContext: "MARKER TEXT",
      }),
    );
    const userTurn = state.chat.find((m) => m.author === "user");
    expect(userTurn?.text).toBe("reconstruct");
    expect(userTurn?.text).not.toContain("MARKER TEXT");
  });

  it("caps an oversized importContext instead of rejecting the request", async () => {
    mockPropose.mockResolvedValue({
      decision: "explain",
      assistantMessage: "ok",
    });
    const huge = "x".repeat(10_000);
    const res = await POST(
      req({ message: "reconstruct", importContext: huge }),
      ctx(),
    );
    expect(res.status).toBe(200);
    const sentContext = mockPropose.mock.calls[0][1].importContext;
    expect((sentContext as string).length).toBeLessThanOrEqual(4000);
  });

  it("empty message returns 400 without debiting or calling the AI", async () => {
    const balanceBefore = wallet.balance;
    const res = await POST(req({ message: "   " }), ctx());
    expect(res.status).toBe(400);
    expect(wallet.balance).toBe(balanceBefore);
    expect(mockPropose).not.toHaveBeenCalled();
  });

  // #152: "null" is valid JSON, so it survives parseBody's JSON.parse and
  // fails GenerateBodySchema's own object check -- the generic bad_body,
  // before the wallet is ever touched or withPatternAndWallet even runs.
  it("a literal null body answers bad_body without debiting or calling the AI", async () => {
    const balanceBefore = wallet.balance;
    const res = await POST(req(null), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("bad_body");
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

  // PFORM-28: a present-but-unusable formSpec is refused, never ignored.
  // validateSpec defaults an absent `type` to "blouse", so dropping the
  // field silently would merge that default over whatever garment the model
  // correctly inferred -- the one failure the explicit-type rule exists for.
  it.each([
    ["carries no type", {}],
    ["is not an object", "blouse"],
    ["names an unrecognized type", { type: "corset" }],
    ["is an array", [{ type: "blouse" }]],
    ["is null", null],
  ] as const)(
    "answers invalid_form_spec when the form spec %s, with no debit and no proposeGarment call",
    async (_label, formSpec) => {
      const balanceBefore = wallet.balance;
      const res = await POST(req({ message: "uma blusa", formSpec }), ctx());
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_form_spec");
      expect(wallet.balance).toBe(balanceBefore);
      expect(lastEntries).toEqual([]);
      expect(mockPropose).not.toHaveBeenCalled();
    },
  );

  // PFORM-25: the guarantee is structural, not an instruction the model may
  // ignore -- the form's value is re-applied over whatever it returned.
  it("overwrites the model's garment type with the form's", async () => {
    mockPropose.mockResolvedValue({
      decision: "apply",
      spec: {
        type: "tshirt",
        gender: "female",
        measurementOverrides: {},
        style: {},
      },
      assistantMessage: "Pronto",
    });

    await POST(
      req({ message: "uma saia", formSpec: { type: "skirt" } }),
      ctx(),
    );

    expect(state.pattern.spec?.type).toBe("skirt");
  });

  it.each([
    ["collar", "shirt", "none"],
    ["sleeve", "long", "short"],
    ["neckline", "V", "round"],
  ] as const)(
    "overwrites the model's %s with the form's",
    async (field, formValue, aiValue) => {
      mockPropose.mockResolvedValue({
        decision: "apply",
        spec: {
          type: "blouse",
          gender: "female",
          measurementOverrides: {},
          style: { [field]: aiValue },
        },
        assistantMessage: "Pronto",
      });

      await POST(
        req({
          message: "uma blusa",
          formSpec: { type: "blouse", style: { [field]: formValue } },
        }),
        ctx(),
      );

      expect(state.pattern.spec?.style[field]).toBe(formValue);
    },
  );

  // PFORM-25's other half: a select the user left on "deixar a IA decidir"
  // sends nothing for that field, and the model's inference has to stand.
  it("leaves a style field the form did not set at the model's own value", async () => {
    mockPropose.mockResolvedValue({
      decision: "apply",
      spec: {
        type: "blouse",
        gender: "female",
        measurementOverrides: {},
        style: { neckline: "V", collar: "none" },
      },
      assistantMessage: "Pronto",
    });

    await POST(
      req({
        message: "uma blusa",
        formSpec: { type: "blouse", style: { collar: "shirt" } },
      }),
      ctx(),
    );

    expect(state.pattern.spec?.style.collar).toBe("shirt");
    expect(state.pattern.spec?.style.neckline).toBe("V");
  });

  // The form has no measurement fields, so its own measurementOverrides is
  // always empty -- spreading it would wipe an override the model extracted
  // from the details text ("cintura 4 cm mais folgada"), a real capability
  // the form must not cost.
  it("keeps a measurementOverride the model returned", async () => {
    mockPropose.mockResolvedValue({
      decision: "apply",
      spec: {
        type: "blouse",
        gender: "female",
        measurementOverrides: { waist: 80 },
        style: {},
      },
      assistantMessage: "Pronto",
    });

    await POST(
      req({
        message: "uma blusa com a cintura mais folgada",
        formSpec: { type: "blouse", style: { collar: "shirt" } },
      }),
      ctx(),
    );

    expect(state.pattern.spec?.measurementOverrides.waist).toBe(80);
    expect(state.pattern.baseMeasurements?.waist).toBe(80);
  });

  // PFORM-26: the validated form spec reaches the prompt through
  // proposeGarment's options. The rest of that chain is pinned where it
  // lives -- lib/ai/index.test.ts:410 asserts formSpec reaches the SDK's
  // captured `system` blocks, and lib/ai/prompt.test.ts asserts the section's
  // content and its position after the blank-pattern ask instruction.
  it("forwards the validated form spec to proposeGarment", async () => {
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

    await POST(
      req({
        message: "uma blusa",
        formSpec: { type: "blouse", style: { collar: "shirt" } },
      }),
      ctx(),
    );

    expect(mockPropose.mock.calls[0][1].formSpec).toEqual({
      type: "blouse",
      measurementOverrides: {},
      style: { collar: "shirt" },
    });
  });

  it("sends no formSpec and persists the model's spec verbatim when the request carries none", async () => {
    mockPropose.mockResolvedValue({
      decision: "apply",
      spec: {
        type: "tshirt",
        gender: "male",
        measurementOverrides: {},
        style: { neckline: "round" },
      },
      assistantMessage: "Pronto",
    });

    await POST(req({ message: "uma camiseta" }), ctx());

    expect(mockPropose.mock.calls[0][1].formSpec).toBeUndefined();
    expect(state.pattern.spec?.type).toBe("tshirt");
    expect(state.pattern.spec?.style.neckline).toBe("round");
  });

  // The merge belongs to the apply branch alone: the other three decisions
  // draft nothing, so there is no spec of theirs to correct, and running it
  // there would rewrite the pattern's stored spec for a turn that produced
  // no geometry.
  it.each(["ask", "decline", "explain"] as const)(
    "leaves the pattern's spec and version untouched on %s even with a form spec",
    async (decision) => {
      const specBefore = JSON.stringify(state.pattern.spec);
      const versionBefore = state.pattern.version;
      mockPropose.mockResolvedValue({
        decision,
        spec: {
          type: "tshirt",
          gender: "male",
          measurementOverrides: {},
          style: {},
        },
        questions:
          decision === "ask"
            ? [{ id: "q0", label: "Gola", options: ["redonda"] }]
            : undefined,
        assistantMessage: "…",
      });

      await POST(
        req({
          message: "uma saia",
          formSpec: { type: "skirt", style: { waistband: "straight" } },
        }),
        ctx(),
      );

      expect(JSON.stringify(state.pattern.spec)).toBe(specBefore);
      expect(state.pattern.version).toBe(versionBefore);
      expect(state.pattern.pieces).toHaveLength(0);
    },
  );

  // PFORM-42: the chart the request names is what gets frozen, so a one-off
  // menswear molde does not force the account to change the grade its whole
  // library uses.
  it("freezes the requested chart into the snapshot on a first draft", async () => {
    vi.mocked(getSizeChartGenderForUser).mockResolvedValue("male");
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
      req({ message: "uma blusa", sizeChartId: REQUESTED_CHART_ID }),
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(getSizeChartGenderForUser).toHaveBeenCalledWith(
      REQUESTED_CHART_ID,
      "u1",
    );
    expect(vi.mocked(getSizeChartForGeneration).mock.calls[0][4]).toBe(
      REQUESTED_CHART_ID,
    );
    expect(state.pattern.sizeChartName).toBe("Masculino do ateliê");
  });

  // PFORM-41: the chart IS the measurements the molde is drafted from, so
  // its gender is the only one the geometry can honestly claim -- it wins
  // over the model's inference, and it is the gender the pick is asked for.
  it("drafts under the requested chart's gender even when the model returned the other one", async () => {
    vi.mocked(getSizeChartGenderForUser).mockResolvedValue("male");
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

    await POST(
      req({ message: "uma blusa", sizeChartId: REQUESTED_CHART_ID }),
      ctx(),
    );

    expect(state.pattern.spec?.gender).toBe("male");
    expect(vi.mocked(getSizeChartForGeneration).mock.calls[0][2]).toBe("male");
  });

  // The prompt half: the model is told the gender as the user's own decision
  // rather than inferring the other one and having its answer quietly
  // contradicted by the spec the merge produces.
  it("states the requested chart's gender in the form spec it sends the model", async () => {
    vi.mocked(getSizeChartGenderForUser).mockResolvedValue("male");
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

    await POST(
      req({
        message: "uma blusa",
        formSpec: { type: "blouse" },
        sizeChartId: REQUESTED_CHART_ID,
      }),
      ctx(),
    );

    expect(mockPropose.mock.calls[0][1].formSpec.gender).toBe("male");
  });

  // PFORM-43: unreachable from the real UI, so a forged or badly stale
  // request -- refused before any lock, debit or AI call rather than
  // substituted, which would draft from measurements nobody asked for.
  // getSizeChartGenderForUser answers null identically for both causes on
  // purpose (its own two cases are covered in lib/db/sizeChart.test.ts), so
  // this route cannot become an existence oracle for another account's ids.
  it.each([
    "an id that names no chart at all",
    "an id owned by another account",
  ])(
    "answers invalid_size_chart for %s, with no debit and no proposeGarment call",
    async () => {
      const balanceBefore = wallet.balance;
      vi.mocked(getSizeChartGenderForUser).mockResolvedValue(null);

      const res = await POST(
        req({ message: "uma blusa", sizeChartId: "not-mine" }),
        ctx(),
      );

      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("invalid_size_chart");
      expect(wallet.balance).toBe(balanceBefore);
      expect(lastEntries).toEqual([]);
      expect(mockPropose).not.toHaveBeenCalled();
      expect(getSizeChartForGeneration).not.toHaveBeenCalled();
    },
  );

  // A consequence of PFORM-41/42, not an AC of its own: nothing was passed over silently, so there is no substitution
  // to report -- naming the active chart here would report a choice the user
  // made deliberately.
  it("adds no substitution notice when the request named its own chart", async () => {
    vi.mocked(getSizeChartGenderForUser).mockResolvedValue("male");
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

    await POST(
      req({ message: "uma blusa", sizeChartId: REQUESTED_CHART_ID }),
      ctx(),
    );

    expect(state.chat.some((m) => m.tone === "notice")).toBe(false);
  });

  // PFORM-44: the existing active-then-system pick is reached with no
  // requested id, and the ownership read is not even performed -- the whole
  // path a chat-driven generation takes is untouched.
  it("leaves the active-then-system pick alone when no chart is named", async () => {
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

    await POST(req({ message: "uma blusa" }), ctx());

    expect(getSizeChartGenderForUser).not.toHaveBeenCalled();
    expect(vi.mocked(getSizeChartForGeneration).mock.calls[0][4]).toBeNull();
    expect(state.pattern.sizeChartName).toBe("Feminino adulto · ABNT");
  });

  // PFORM-44's tolerance boundary: "no chart named" has a well-defined
  // fallback (the account's active chart), so a blank id is treated as
  // absent rather than refused -- unlike one that genuinely resolves to
  // nothing, which has no safe default.
  it("treats a blank sizeChartId as no chart named rather than refusing it", async () => {
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
      req({ message: "uma blusa", sizeChartId: "" }),
      ctx(),
    );

    expect(res.status).toBe(200);
    expect(getSizeChartGenderForUser).not.toHaveBeenCalled();
    expect(state.pattern.sizeChartName).toBe("Feminino adulto · ABNT");
  });

  // PFORM-45: a pattern freezes its snapshot at the first generation on
  // purpose, so editing or reassigning a chart never retroactively redraws
  // an in-progress molde. A late sizeChartId cannot reopen that.
  it("leaves an already-drafted pattern's frozen snapshot untouched", async () => {
    vi.mocked(getSizeChartGenderForUser).mockResolvedValue("male");
    state.pattern = {
      ...state.pattern,
      sizeChartName: "Feminino adulto · ABNT",
      pieces: [
        {
          id: "x",
          name: "x",
          qty: 1,
          outline: { kind: "polygon", points: "0,0" },
          label: { x: 0, y: 0 },
          detailRows: [],
        },
      ],
    };
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

    await POST(
      req({ message: "ajusta a cava", sizeChartId: REQUESTED_CHART_ID }),
      ctx(),
    );

    expect(getSizeChartForGeneration).not.toHaveBeenCalled();
    expect(state.pattern.sizeChartName).toBe("Feminino adulto · ABNT");
  });

  // PFORM-47: a per-molde choice is not an account-level setting. The molde
  // gets the grade it asked for; /size-charts still shows whatever the
  // account made active.
  it("never changes which chart is account-active", async () => {
    vi.mocked(getSizeChartGenderForUser).mockResolvedValue("male");
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

    await POST(
      req({ message: "uma blusa", sizeChartId: REQUESTED_CHART_ID }),
      ctx(),
    );

    expect(setActiveSizeChart).not.toHaveBeenCalled();
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
