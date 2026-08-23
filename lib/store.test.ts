import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { EditorState } from "./types";

// ApiError comes from the real module (the store narrows on it with
// instanceof, so a stub class would not be the same constructor).
vi.mock("./api-client", async () => {
  const actual =
    await vi.importActual<typeof import("./api-client")>("./api-client");
  return {
    ApiError: actual.ApiError,
    fetchPattern: vi.fn(),
    generate: vi.fn(),
    graduate: vi.fn(),
    resolveConflict: vi.fn(),
    purchase: vi.fn(),
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

    expect(genMock).toHaveBeenCalledWith("m1", "gola redonda", true);
    expect(useEditorStore.getState().generationStatus).toBe("idle");
    expect(useEditorStore.getState().selectedPieceId).toBeNull();
    const last = useEditorStore.getState().chat.at(-1)!;
    expect(last.questions).toHaveLength(1);
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
