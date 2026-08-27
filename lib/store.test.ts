import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EditorState } from "./types";

// ApiError comes from the real module (the store narrows on it with
// instanceof, so a stub class would not be the same constructor).
vi.mock("./api-client", async () => {
  const actual =
    await vi.importActual<typeof import("./api-client")>("./api-client");
  return {
    ApiError: actual.ApiError,
    errorCode: actual.errorCode,
    fetchPattern: vi.fn(),
    generate: vi.fn(),
    graduate: vi.fn(),
    resolveConflict: vi.fn(),
    purchase: vi.fn(),
    createSloper: vi.fn(),
  };
});

import * as api from "./api-client";
import { ApiError } from "./api-client";
import { useEditorStore } from "./store";

const genMock = api.generate as unknown as ReturnType<typeof vi.fn>;

// A promise this test can resolve on its own schedule, for asserting what
// happens while a call is still in flight (e.g. a pattern switch racing a
// slow response). Typed generically so `mockReturnValue` sees the exact
// shape each api-client function's own Promise return type expects.
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

function emptyState(): EditorState {
  return {
    pattern: {
      id: "p",
      name: "Novo molde",
      version: 0,
      updatedAt: "2026-08-21T00:00:00.000Z",
      baseSize: "M",
      unit: "cm",
      sizes: ["M"],
      sizesApplied: [],
      sizesPending: [],
      sizeTable: {
        M: {
          bust: 92,
          waist: 74,
          hip: 100,
          hipHeight: 20.6,
          backLength: 41,
          shoulder: 18.5,
          skirtLength: 60,
          shortSleeveLength: 18,
          longSleeveLength: 58,
        },
      },
      pieces: [],
    },
    chat: [
      {
        id: "m1",
        author: "ai",
        text: "Me conta mais:",
        questions: [
          { id: "q0", label: "Gola", options: ["a", "b"], allowOther: false },
        ],
        createdAt: 1,
      },
    ],
    credits: {
      plan: "atelier",
      balance: 100,
      total: 500,
      renewsInDays: 10,
    },
    conflict: null,
  };
}

describe("store.sendMessage", () => {
  beforeEach(() => {
    genMock.mockReset();
    useEditorStore.setState({
      patternId: "m1",
      selectedPieceId: null,
      generationStatus: "idle",
    });
  });

  it("forwards patternId, message, and answering to api.generate", async () => {
    genMock.mockResolvedValue({ status: "clarify", state: emptyState() });
    await useEditorStore
      .getState()
      .sendMessage("gola redonda", { answering: true });

    expect(genMock).toHaveBeenCalledWith("m1", "gola redonda", true, undefined);
    expect(useEditorStore.getState().generationStatus).toBe("idle");
    expect(useEditorStore.getState().selectedPieceId).toBeNull();
    const last = useEditorStore.getState().chat.at(-1)!;
    expect(last.questions).toHaveLength(1);
  });

  // #18: the prepared attachment travels with the request only -- the
  // optimistic chat message records that one was used (for the "imagem
  // enviada" chip), never the bytes themselves. Checked mid-flight, before
  // applyState replaces `chat` wholesale with the server's own response.
  it("forwards a prepared image to api.generate and marks the optimistic message", async () => {
    const gen = deferred<Awaited<ReturnType<typeof api.generate>>>();
    genMock.mockReturnValue(gen.promise);
    const image = { mediaType: "image/jpeg" as const, base64: "ZmFrZQ==" };

    const promise = useEditorStore
      .getState()
      .sendMessage("uma blusa assim", { image });

    expect(genMock).toHaveBeenCalledWith(
      "m1",
      "uma blusa assim",
      undefined,
      image,
    );
    const optimistic = useEditorStore
      .getState()
      .chat.find((m) => m.id.startsWith("optimistic-"));
    expect(optimistic?.hasImage).toBe(true);

    gen.resolve({ status: "clarify", state: emptyState() });
    await promise;
  });
});

// #41: cancelGeneration never aborted the request server-side -- only its
// result was discarded -- while withPatternAndWallet's transaction still
// committed. It used to also fabricate a `+ COSTS.adjust` credit refund
// unconditionally, regardless of what the server actually did.
describe("store.cancelGeneration (#41)", () => {
  beforeEach(() => {
    genMock.mockReset();
    useEditorStore.setState({
      patternId: "m1",
      selectedPieceId: null,
      generationStatus: "idle",
      credits: {
        plan: "atelier",
        balance: 100,
        total: 500,
        renewsInDays: 10,
      },
    });
  });

  it("does not fabricate a credit refund on cancel", async () => {
    const gen = deferred<Awaited<ReturnType<typeof api.generate>>>();
    genMock.mockReturnValue(gen.promise);
    const sendPromise = useEditorStore.getState().sendMessage("uma blusa");

    useEditorStore.getState().cancelGeneration();

    // Balance is exactly what it was before sendMessage ran -- no invented
    // "+1" while the real outcome is still unknown.
    expect(useEditorStore.getState().credits?.balance).toBe(100);
    expect(useEditorStore.getState().generationStatus).toBe("idle");
    expect(
      useEditorStore
        .getState()
        .chat.some((m) => m.id.startsWith("optimistic-")),
    ).toBe(false);

    gen.resolve({ status: "ok", state: emptyState() });
    await sendPromise;
  });

  it("applies the server's committed state once a canceled request's response arrives", async () => {
    const gen = deferred<Awaited<ReturnType<typeof api.generate>>>();
    genMock.mockReturnValue(gen.promise);
    const sendPromise = useEditorStore.getState().sendMessage("uma blusa");

    useEditorStore.getState().cancelGeneration();

    // The server committed: debited the credit and drafted a piece. This
    // arrives AFTER cancel -- it must not be silently dropped.
    const committed = emptyState();
    committed.credits = { ...committed.credits, balance: 99 };
    committed.pattern = {
      ...committed.pattern,
      version: 1,
      pieces: [
        {
          id: "piece-1",
          name: "Frente",
          qty: 1,
          outline: { kind: "path", d: "M0 0" },
          label: { x: 0, y: 0 },
          detailRows: [],
        },
      ],
    };
    gen.resolve({ status: "ok", state: committed });
    await sendPromise;

    const s = useEditorStore.getState();
    expect(s.credits?.balance).toBe(99); // the real, server-committed balance
    expect(s.pattern?.version).toBe(1);
    expect(s.pattern?.pieces).toHaveLength(1);
    // cancelGeneration already put this back to idle -- reconciling the
    // late response must not resurface the overlay.
    expect(s.generationStatus).toBe("idle");
  });

  it("selects the first piece when reconciling a canceled request that drafted one", async () => {
    const gen = deferred<Awaited<ReturnType<typeof api.generate>>>();
    genMock.mockReturnValue(gen.promise);
    const sendPromise = useEditorStore.getState().sendMessage("uma blusa");
    useEditorStore.getState().cancelGeneration();

    const committed = emptyState();
    committed.pattern = {
      ...committed.pattern,
      pieces: [
        {
          id: "piece-1",
          name: "Frente",
          qty: 1,
          outline: { kind: "path", d: "M0 0" },
          label: { x: 0, y: 0 },
          detailRows: [],
        },
      ],
    };
    gen.resolve({ status: "ok", state: committed });
    await sendPromise;

    expect(useEditorStore.getState().selectedPieceId).toBe("piece-1");
  });

  it("does not reconcile a canceled request answered with insufficient_credits (nothing was committed)", async () => {
    const gen = deferred<Awaited<ReturnType<typeof api.generate>>>();
    genMock.mockReturnValue(gen.promise);
    const sendPromise = useEditorStore.getState().sendMessage("uma blusa");
    useEditorStore.getState().cancelGeneration();

    gen.resolve({ status: "insufficient_credits", required: 1, balance: 0 });
    await sendPromise;

    expect(useEditorStore.getState().paywall.open).toBe(false);
    expect(useEditorStore.getState().credits?.balance).toBe(100);
  });

  it("still discards a canceled request's response if the pattern itself changed (#32)", async () => {
    const gen = deferred<Awaited<ReturnType<typeof api.generate>>>();
    genMock.mockReturnValue(gen.promise);
    const sendPromise = useEditorStore.getState().sendMessage("uma blusa");
    useEditorStore.getState().cancelGeneration();

    vi.mocked(api.fetchPattern).mockResolvedValue(emptyState());
    await useEditorStore.getState().init("m2");
    const m2Pattern = useEditorStore.getState().pattern;

    const committed = emptyState();
    committed.pattern = { ...committed.pattern, version: 5 };
    gen.resolve({ status: "ok", state: committed });
    await sendPromise;

    expect(useEditorStore.getState().pattern).toBe(m2Pattern);
  });
});

// #35: the step timer chain was a local of one sendMessage call, so
// cancelGeneration had no handle to clear it -- an orphaned chain kept
// ticking generationStepIndex forward for a generation the user had already
// canceled (and, if a new one was sent right after, for the wrong one).
describe("store generation step timer (#35)", () => {
  beforeEach(() => {
    genMock.mockReset();
    useEditorStore.setState({
      patternId: "m1",
      selectedPieceId: null,
      generationStatus: "idle",
      generationStepIndex: 0,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("stops advancing generationStepIndex once canceled", async () => {
    const gen = deferred<Awaited<ReturnType<typeof api.generate>>>();
    genMock.mockReturnValue(gen.promise);
    const sendPromise = useEditorStore.getState().sendMessage("uma blusa");

    vi.advanceTimersByTime(600); // past the first 500ms hop
    expect(useEditorStore.getState().generationStepIndex).toBe(1);

    useEditorStore.getState().cancelGeneration();

    vi.advanceTimersByTime(5000); // past every remaining hop
    expect(useEditorStore.getState().generationStepIndex).toBe(1);

    gen.resolve({ status: "ok", state: emptyState() });
    await sendPromise;
  });

  it("a re-entrant send clears the previous chain instead of racing it", async () => {
    const gen1 = deferred<Awaited<ReturnType<typeof api.generate>>>();
    genMock.mockReturnValueOnce(gen1.promise);
    const first = useEditorStore.getState().sendMessage("uma blusa");

    vi.advanceTimersByTime(600);
    expect(useEditorStore.getState().generationStepIndex).toBe(1);

    // A second send while the first is still in flight resets the visible
    // step -- without clearing the first chain's handle, its orphaned tick
    // would fire moments later and jump the index for this new generation.
    const gen2 = deferred<Awaited<ReturnType<typeof api.generate>>>();
    genMock.mockReturnValueOnce(gen2.promise);
    const second = useEditorStore.getState().sendMessage("outra blusa");
    expect(useEditorStore.getState().generationStepIndex).toBe(0);

    vi.advanceTimersByTime(600);
    expect(useEditorStore.getState().generationStepIndex).toBe(1);

    gen1.resolve({ status: "ok", state: emptyState() });
    gen2.resolve({ status: "ok", state: emptyState() });
    await Promise.all([first, second]);
  });
});

// The editor store had no try/catch anywhere, so a rejected call left the UI
// wedged: init never set `ready`, sendMessage never cleared "generating", and
// applyState wrote `undefined` into pattern/chat from a 401's body.
describe("store error handling", () => {
  beforeEach(() => {
    genMock.mockReset();
    useEditorStore.setState({
      patternId: "m1",
      ready: false,
      error: null,
      pattern: null,
      chat: [],
      generationStatus: "idle",
    });
  });

  it("init marks itself ready with an error rather than loading forever", async () => {
    vi.mocked(api.fetchPattern).mockRejectedValue(
      new ApiError(401, "unauthorized"),
    );

    await useEditorStore.getState().init("m1");

    const s = useEditorStore.getState();
    expect(s.ready).toBe(true); // the loading screen must not be permanent
    expect(s.error).toBe("unauthorized");
    expect(s.pattern).toBeNull();
  });

  it("init surfaces a generic code for a non-ApiError failure", async () => {
    vi.mocked(api.fetchPattern).mockRejectedValue(new TypeError("offline"));

    await useEditorStore.getState().init("m1");

    expect(useEditorStore.getState().ready).toBe(true);
    expect(useEditorStore.getState().error).toBe("request_failed");
  });

  it("sendMessage stops generating and rolls back the optimistic message", async () => {
    genMock.mockRejectedValue(new ApiError(500, "request_failed"));

    await useEditorStore.getState().sendMessage("uma blusa");

    const s = useEditorStore.getState();
    expect(s.generationStatus).not.toBe("generating");
    expect(s.error).toBe("request_failed");
    expect(s.chat.some((m) => m.id.startsWith("optimistic-"))).toBe(false);
  });

  it("a failed sendMessage never overwrites the pattern with undefined", async () => {
    const state = emptyState();
    useEditorStore.setState({ pattern: state.pattern, ready: true });
    genMock.mockRejectedValue(new ApiError(401, "unauthorized"));

    await useEditorStore.getState().sendMessage("uma blusa");

    expect(useEditorStore.getState().pattern).toEqual(state.pattern);
  });

  it("graduateSizes surfaces a failure instead of throwing into the void", async () => {
    vi.mocked(api.graduate).mockRejectedValue(new ApiError(500, "boom"));

    await useEditorStore.getState().graduateSizes(["M"]);

    expect(useEditorStore.getState().error).toBe("boom");
  });

  it("clearError dismisses a surfaced failure", async () => {
    useEditorStore.setState({ error: "unauthorized" });
    useEditorStore.getState().clearError();
    expect(useEditorStore.getState().error).toBeNull();
  });
});

describe("store.graduateSizes", () => {
  it("stashes the graduate action code on the paywall, not pt-BR prose", async () => {
    vi.mocked(api.graduate).mockResolvedValue({
      status: "insufficient_credits",
      required: 3,
      balance: 1,
    });
    useEditorStore.setState({ patternId: "p1" });

    await useEditorStore.getState().graduateSizes(["P", "M"]);

    expect(useEditorStore.getState().paywall.action).toBe("graduate");
  });
});

// #31: neither action had any in-flight signal (no spinner, nothing
// disabled) -- a double click sent two requests. The server's row lock
// serialized them but never deduplicated: graduate's route filters against
// the full size list, not against what's already applied, so the second
// request debited again (12 credits for one grading), and a top-up granted
// double credits.
describe("store double submission (#31)", () => {
  beforeEach(() => {
    vi.mocked(api.graduate).mockReset();
    vi.mocked(api.purchase).mockReset();
    useEditorStore.setState({
      patternId: "p1",
      graduating: false,
      purchasing: false,
      paywall: {
        open: false,
        required: 0,
        balance: 0,
        action: null,
        retry: null,
      },
    });
  });

  it("a second graduateSizes call while one is in flight issues only one request", async () => {
    const grad = deferred<Awaited<ReturnType<typeof api.graduate>>>();
    vi.mocked(api.graduate).mockReturnValue(grad.promise);

    const first = useEditorStore.getState().graduateSizes(["M"]);
    expect(useEditorStore.getState().graduating).toBe(true);
    await useEditorStore.getState().graduateSizes(["M"]); // the double click

    expect(api.graduate).toHaveBeenCalledTimes(1);

    grad.resolve({ status: "ok", state: emptyState() });
    await first;
    expect(useEditorStore.getState().graduating).toBe(false);
  });

  it("clears graduating before opening the paywall, so its own retry can re-enter", async () => {
    vi.mocked(api.graduate).mockResolvedValue({
      status: "insufficient_credits",
      required: 6,
      balance: 1,
    });

    await useEditorStore.getState().graduateSizes(["M"]);

    expect(useEditorStore.getState().graduating).toBe(false);
    expect(useEditorStore.getState().paywall.retry).not.toBeNull();
  });

  it("clears graduating on a failed request", async () => {
    vi.mocked(api.graduate).mockRejectedValue(new ApiError(500, "boom"));

    await useEditorStore.getState().graduateSizes(["M"]);

    expect(useEditorStore.getState().graduating).toBe(false);
  });

  it("a second purchase call while one is in flight issues only one request", async () => {
    const buy = deferred<Awaited<ReturnType<typeof api.purchase>>>();
    vi.mocked(api.purchase).mockReturnValue(buy.promise);

    const first = useEditorStore.getState().purchase("topup");
    expect(useEditorStore.getState().purchasing).toBe(true);
    await useEditorStore.getState().purchase("topup"); // the double click

    expect(api.purchase).toHaveBeenCalledTimes(1);

    buy.resolve({ status: "ok", credits: emptyState().credits });
    await first;
    expect(useEditorStore.getState().purchasing).toBe(false);
  });

  it("clears purchasing before invoking the paywall's retry thunk", async () => {
    let retryCalled = false;
    useEditorStore.setState({
      paywall: {
        open: true,
        required: 6,
        balance: 1,
        action: "graduate",
        retry: () => {
          // If purchasing were still true here, a retry that re-enters
          // graduateSizes/sendMessage would matter -- what this test
          // actually pins is that purchasing itself already reads false
          // by the time retry fires, which is what let the issue's
          // implementation notes call out as the failure mode.
          retryCalled = true;
          expect(useEditorStore.getState().purchasing).toBe(false);
        },
      },
    });
    vi.mocked(api.purchase).mockResolvedValue({
      status: "ok",
      credits: emptyState().credits,
    });

    await useEditorStore.getState().purchase("topup");

    expect(retryCalled).toBe(true);
  });

  it("clears purchasing on a failed request", async () => {
    vi.mocked(api.purchase).mockRejectedValue(new ApiError(500, "boom"));

    await useEditorStore.getState().purchase("topup");

    expect(useEditorStore.getState().purchasing).toBe(false);
  });

  // #161: under the real gateway, purchase() answers {status:"redirect",
  // url} instead of crediting instantly -- the wallet isn't touched until
  // the async webhook lands. This pins issue #6's own settled "Drop it"
  // decision: the paywall closes but `retry` is never invoked, since
  // retrying sendMessage/graduateSizes now would spend a second credit
  // hoping the not-yet-confirmed purchase already landed.
  it("navigates to the checkout URL on a redirect result, applies no state, and never invokes retry", async () => {
    let retryCalled = false;
    useEditorStore.setState({
      paywall: {
        open: true,
        required: 6,
        balance: 1,
        action: "graduate",
        retry: () => {
          retryCalled = true;
        },
      },
    });
    const checkoutUrl = "https://checkout.stripe.com/c/pay/cs_test_x";
    vi.mocked(api.purchase).mockResolvedValue({
      status: "redirect",
      url: checkoutUrl,
    });
    // lib/store.test.ts runs in vitest's "node" project (no jsdom `window`
    // global) -- stubbed locally rather than moving this file into the
    // "dom" project, since every other test here is DOM-free by design.
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });

    await useEditorStore.getState().purchase("subscribe", "atelier");

    expect(assign).toHaveBeenCalledWith(checkoutUrl);
    expect(useEditorStore.getState().purchasing).toBe(false);
    expect(useEditorStore.getState().paywall.open).toBe(false);
    expect(retryCalled).toBe(false);

    vi.unstubAllGlobals();
  });
});

// #32: the store is a module-level singleton, so switching patterns without
// resetting the per-pattern slice let one pattern's pieces/chat/conflict/
// paywall (complete with a retry thunk) bleed onto another's screen, and a
// slow response for a pattern the user had already left could overwrite
// whatever the newly-opened pattern had already loaded.
describe("store.init across patterns", () => {
  beforeEach(() => {
    genMock.mockReset();
    vi.mocked(api.fetchPattern).mockReset();
    vi.mocked(api.graduate).mockReset();
    vi.mocked(api.resolveConflict).mockReset();
    vi.mocked(api.purchase).mockReset();
  });

  it("resets the whole per-pattern slice synchronously when switching patterns", () => {
    const state1 = emptyState();
    useEditorStore.setState({
      patternId: "m1",
      ready: true,
      pattern: state1.pattern,
      chat: state1.chat,
      credits: state1.credits,
      conflict: { id: "c1" } as never,
      selectedPieceId: "piece-1",
      paywall: {
        open: true,
        required: 3,
        balance: 1,
        action: "adjust",
        retry: () => {},
      },
    });
    vi.mocked(api.fetchPattern).mockReturnValue(new Promise(() => {})); // never resolves

    void useEditorStore.getState().init("m2"); // deliberately not awaited

    const s = useEditorStore.getState();
    expect(s.patternId).toBe("m2");
    expect(s.ready).toBe(false);
    expect(s.pattern).toBeNull();
    expect(s.chat).toEqual([]);
    expect(s.credits).toBeNull();
    expect(s.conflict).toBeNull();
    expect(s.selectedPieceId).toBeNull();
    expect(s.paywall.open).toBe(false);
    expect(s.paywall.retry).toBeNull();
  });

  it("does not reset the loaded screen when re-initing the same pattern", async () => {
    const state1 = emptyState();
    vi.mocked(api.fetchPattern).mockResolvedValue(state1);
    await useEditorStore.getState().init("m1");
    useEditorStore.setState({ selectedPieceId: "kept" });

    vi.mocked(api.fetchPattern).mockReturnValue(new Promise(() => {}));
    void useEditorStore.getState().init("m1"); // same id -- e.g. strict-mode double-effect

    expect(useEditorStore.getState().ready).toBe(true);
    expect(useEditorStore.getState().pattern).toEqual(state1.pattern);
    expect(useEditorStore.getState().selectedPieceId).toBe("kept");
  });

  it("does not apply a stale sendMessage response after switching to a different pattern", async () => {
    useEditorStore.setState({ patternId: "m1" });
    const gen = deferred<Awaited<ReturnType<typeof api.generate>>>();
    genMock.mockReturnValue(gen.promise);
    const sendPromise = useEditorStore.getState().sendMessage("uma blusa");

    const state2 = emptyState();
    vi.mocked(api.fetchPattern).mockResolvedValue(state2);
    await useEditorStore.getState().init("m2");
    const m2Pattern = useEditorStore.getState().pattern;

    gen.resolve({ status: "ok", state: emptyState() });
    await sendPromise;

    expect(useEditorStore.getState().pattern).toBe(m2Pattern);
  });

  it("does not apply a stale graduateSizes response after switching to a different pattern", async () => {
    useEditorStore.setState({ patternId: "m1" });
    const grad = deferred<Awaited<ReturnType<typeof api.graduate>>>();
    vi.mocked(api.graduate).mockReturnValue(grad.promise);
    const gradPromise = useEditorStore.getState().graduateSizes(["M"]);

    vi.mocked(api.fetchPattern).mockResolvedValue(emptyState());
    await useEditorStore.getState().init("m2");
    const m2Pattern = useEditorStore.getState().pattern;

    grad.resolve({ status: "ok", state: emptyState() });
    await gradPromise;

    expect(useEditorStore.getState().pattern).toBe(m2Pattern);
  });

  it("does not apply a stale resolveConflict response after switching to a different pattern", async () => {
    useEditorStore.setState({ patternId: "m1" });
    const fix = deferred<Awaited<ReturnType<typeof api.resolveConflict>>>();
    vi.mocked(api.resolveConflict).mockReturnValue(fix.promise);
    const fixPromise = useEditorStore.getState().resolveConflict("fix");

    vi.mocked(api.fetchPattern).mockResolvedValue(emptyState());
    await useEditorStore.getState().init("m2");
    const m2Pattern = useEditorStore.getState().pattern;

    fix.resolve({ status: "ok", state: emptyState() });
    await fixPromise;

    expect(useEditorStore.getState().pattern).toBe(m2Pattern);
  });

  it("does not apply a stale purchase response after switching to a different pattern", async () => {
    useEditorStore.setState({ patternId: "m1" });
    const buy = deferred<Awaited<ReturnType<typeof api.purchase>>>();
    vi.mocked(api.purchase).mockReturnValue(buy.promise);
    const purchasePromise = useEditorStore.getState().purchase("topup");

    vi.mocked(api.fetchPattern).mockResolvedValue(emptyState());
    await useEditorStore.getState().init("m2");
    const m2Pattern = useEditorStore.getState().pattern;
    const m2Credits = useEditorStore.getState().credits;

    buy.resolve({ status: "ok", state: emptyState() });
    await purchasePromise;

    expect(useEditorStore.getState().pattern).toBe(m2Pattern);
    expect(useEditorStore.getState().credits).toBe(m2Credits);
  });
});

describe("editor store — tool and measurements", () => {
  beforeEach(() => {
    useEditorStore.setState({ measurements: [], activeTool: "cursor" });
  });

  it("defaults the tool to cursor", () => {
    expect(useEditorStore.getState().activeTool).toBe("cursor");
  });

  it("addMeasurement appends", () => {
    useEditorStore
      .getState()
      .addMeasurement({ id: "m1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    expect(useEditorStore.getState().measurements).toHaveLength(1);
  });

  it("removeMeasurement removes by id", () => {
    const s = useEditorStore.getState();
    s.addMeasurement({ id: "m1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    s.addMeasurement({ id: "m2", a: { x: 0, y: 0 }, b: { x: 8, y: 0 } });
    useEditorStore.getState().removeMeasurement("m1");
    expect(useEditorStore.getState().measurements.map((m) => m.id)).toEqual([
      "m2",
    ]);
  });

  it("clearMeasurements empties the list", () => {
    useEditorStore
      .getState()
      .addMeasurement({ id: "m1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } });
    useEditorStore.getState().clearMeasurements();
    expect(useEditorStore.getState().measurements).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// #168: the store's UI-only actions and the two paths that write no pattern
// state (saveAsSloper, closePaywall). They are one-liners, which is why they
// had no test -- but three of them carry a real coupling that a one-line
// edit silently breaks: selectPiece also opens the details panel, a
// regeneration must invalidate the manual cut placements, and saveAsSloper
// must NOT report failure through `error` (a failed base save leaves a
// perfectly usable editor, so it returns a boolean the Footer renders
// inline instead of an error banner over the whole screen).
// ---------------------------------------------------------------------------

describe("editor store — UI-only actions", () => {
  beforeEach(() => {
    useEditorStore.setState({
      activeTab: "pattern2d",
      selectedPieceId: null,
      detailsPanelOpen: true,
      activeTool: "cursor",
      cutFabricWidthCm: 150,
      nestingMode: "auto",
      cutPlacements: {},
    });
  });

  it("setActiveTab switches the canvas tab", () => {
    useEditorStore.getState().setActiveTab("cutplan");
    expect(useEditorStore.getState().activeTab).toBe("cutplan");
  });

  // The coupling: PieceDetailsPanel is only reachable through a selection,
  // so selecting a piece has to open it and deselecting has to close it --
  // otherwise the panel renders for a piece that is no longer selected, and
  // it shares its slot with ConflictInfoCard.
  it("selectPiece opens the details panel, and clearing the selection closes it", () => {
    useEditorStore.getState().selectPiece("body-front");
    expect(useEditorStore.getState().selectedPieceId).toBe("body-front");
    expect(useEditorStore.getState().detailsPanelOpen).toBe(true);

    useEditorStore.getState().selectPiece(null);
    expect(useEditorStore.getState().selectedPieceId).toBeNull();
    expect(useEditorStore.getState().detailsPanelOpen).toBe(false);
  });

  it("toggleDetailsPanel flips the panel without touching the selection", () => {
    useEditorStore.getState().selectPiece("body-front");
    useEditorStore.getState().toggleDetailsPanel();
    expect(useEditorStore.getState().detailsPanelOpen).toBe(false);
    expect(useEditorStore.getState().selectedPieceId).toBe("body-front");

    useEditorStore.getState().toggleDetailsPanel();
    expect(useEditorStore.getState().detailsPanelOpen).toBe(true);
  });

  it("setActiveTool switches the floating toolbar's tool", () => {
    useEditorStore.getState().setActiveTool("measure");
    expect(useEditorStore.getState().activeTool).toBe("measure");
  });

  it("setCutFabricWidth and setNestingMode drive the cut plan's inputs", () => {
    useEditorStore.getState().setCutFabricWidth(90);
    useEditorStore.getState().setNestingMode("manual");
    expect(useEditorStore.getState().cutFabricWidthCm).toBe(90);
    expect(useEditorStore.getState().nestingMode).toBe("manual");
  });

  it("setCutPlacement merges one instance's origin without dropping the others", () => {
    const s = useEditorStore.getState();
    s.setCutPlacement("body-front#0", { x: 1, y: 2 });
    s.setCutPlacement("sleeve#1", { x: 3, y: 4 });
    // A per-instance write, not a whole-map replace: dragging one copy must
    // not reset every other copy the user already positioned.
    expect(useEditorStore.getState().cutPlacements).toEqual({
      "body-front#0": { x: 1, y: 2 },
      "sleeve#1": { x: 3, y: 4 },
    });

    s.setCutPlacement("body-front#0", { x: 9, y: 9 });
    expect(useEditorStore.getState().cutPlacements["body-front#0"]).toEqual({
      x: 9,
      y: 9,
    });
  });

  it("seedCutPlacements replaces the whole map and resetCutPlacements empties it", () => {
    useEditorStore.getState().seedCutPlacements({ "a#0": { x: 1, y: 1 } });
    expect(useEditorStore.getState().cutPlacements).toEqual({
      "a#0": { x: 1, y: 1 },
    });

    useEditorStore.getState().resetCutPlacements();
    expect(useEditorStore.getState().cutPlacements).toEqual({});
  });
});

describe("store.closePaywall", () => {
  it("closes the paywall and drops its retry thunk", () => {
    useEditorStore.setState({
      paywall: {
        open: true,
        required: 6,
        balance: 1,
        action: "graduate",
        retry: () => {},
      },
    });

    useEditorStore.getState().closePaywall();

    const { paywall } = useEditorStore.getState();
    expect(paywall.open).toBe(false);
    // The thunk has to go with it: a stale retry left behind would fire
    // against whatever the next paywall happens to be opened for.
    expect(paywall.retry).toBeNull();
  });
});

describe("store.saveAsSloper", () => {
  beforeEach(() => {
    (api.createSloper as unknown as ReturnType<typeof vi.fn>).mockReset();
    useEditorStore.setState({ patternId: "p1", error: null });
  });

  it("saves the base under the editor's own pattern id", async () => {
    (api.createSloper as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      { id: "sl1" },
    );

    await expect(
      useEditorStore.getState().saveAsSloper("Base blusa"),
    ).resolves.toBe(true);
    expect(api.createSloper).toHaveBeenCalledWith("p1", "Base blusa");
  });

  // Reports through the return value, NOT through `error`: the editor is
  // still fully usable after a failed base save, so an error banner
  // replacing the screen would be a worse answer than the Footer's own
  // inline notice.
  it("returns false on a failure without setting the screen-level error", async () => {
    (api.createSloper as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new ApiError(400, "invalid_name"),
    );

    await expect(useEditorStore.getState().saveAsSloper("")).resolves.toBe(
      false,
    );
    expect(useEditorStore.getState().error).toBeNull();
  });

  it("refuses to save before a pattern is loaded, issuing no request", async () => {
    useEditorStore.setState({ patternId: null });
    await expect(
      useEditorStore.getState().saveAsSloper("Base blusa"),
    ).resolves.toBe(false);
    expect(api.createSloper).not.toHaveBeenCalled();
  });
});

describe("store cut-placement invalidation (#8)", () => {
  beforeEach(() => {
    genMock.mockReset();
    useEditorStore.setState({
      patternId: "p1",
      pattern: emptyState().pattern,
      chat: [],
      measurements: [{ id: "m1", a: { x: 0, y: 0 }, b: { x: 4, y: 0 } }],
      cutPlacements: { "body-front#0": { x: 1, y: 2 } },
    });
  });

  // A regeneration can change the piece set and each piece's quantity, so a
  // placement keyed on `pieceId#n` no longer names the same copy -- keeping
  // it would silently move an unrelated piece on the cut sheet.
  it("clears manual placements and measurements when the version changes", async () => {
    const next = emptyState();
    next.pattern.version = 1;
    genMock.mockResolvedValue({ status: "ok", state: next });

    await useEditorStore.getState().sendMessage("uma blusa");

    expect(useEditorStore.getState().cutPlacements).toEqual({});
    expect(useEditorStore.getState().measurements).toEqual([]);
  });

  // ...but an answer that drafts nothing (a clarifying question, an
  // explanation) does not bump the version, and must not throw away work the
  // user did on the cut sheet.
  it("keeps them when the answer did not bump the version", async () => {
    const same = emptyState();
    genMock.mockResolvedValue({ status: "answered", state: same });

    await useEditorStore.getState().sendMessage("por que a manga não fecha?");

    expect(useEditorStore.getState().cutPlacements).toEqual({
      "body-front#0": { x: 1, y: 2 },
    });
    expect(useEditorStore.getState().measurements).toHaveLength(1);
  });
});
