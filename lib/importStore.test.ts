import { describe, it, expect, beforeEach, vi } from "vitest";
import { useImportStore, MAX_IMPORT_FILE_BYTES } from "./importStore";
import { buildExportModel } from "@/lib/export/model";
import { toDxf } from "@/lib/export/dxf";
import { t } from "@/lib/i18n/test-translate";
import { SIZE_TABLE } from "@/lib/measurements";
import type { Pattern } from "@/lib/types";

vi.mock("@/lib/api-client", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/api-client")>(
      "@/lib/api-client",
    );
  return {
    ...actual,
    createPattern: vi.fn(),
    generate: vi.fn(),
    recordChecklistEvent: vi.fn(() => Promise.resolve()),
  };
});

vi.mock("@/lib/editor/attachment", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/editor/attachment")
  >("@/lib/editor/attachment");
  return { ...actual, prepareImage: vi.fn() };
});

import * as api from "@/lib/api-client";
import { prepareImage } from "@/lib/editor/attachment";

function fakePattern(): Pattern {
  return {
    id: "p1",
    name: "Camiseta Teste",
    version: 1,
    baseSize: "M",
    unit: "cm",
    sizes: ["PP", "P", "M", "G", "GG"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: { M: SIZE_TABLE.M },
    pieces: [],
    spec: {
      type: "tshirt",
      gender: "male",
      measurementOverrides: {},
      style: { seamAllowanceCm: 1.5 },
    },
  };
}

function validDxfText(): string {
  return toDxf(buildExportModel(fakePattern(), t));
}

// A real closed piece boundary, but on a layer name neither vocabulary
// recognises (0 hits from either AAMA or moldai's known layer set) — the
// case that must still reach step 2 for manual mapping, not be rejected as
// "no pieces found".
function genericDxfText(): string {
  return [
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    "0",
    "LWPOLYLINE",
    "8",
    "MEU_CONTORNO",
    "70",
    "1",
    "10",
    "0",
    "20",
    "0",
    "10",
    "5",
    "20",
    "0",
    "10",
    "5",
    "20",
    "5",
    "0",
    "ENDSEC",
    "0",
    "EOF",
  ].join("\n");
}

beforeEach(() => {
  useImportStore.setState({
    step: 1,
    fileName: null,
    fileSizeBytes: 0,
    doc: null,
    analysis: null,
    roles: {},
    pieces: [],
    pieceLabels: {},
    hoveredPieceKey: null,
    creating: false,
    pendingPatternId: null,
    loading: false,
    actionError: null,
  });
});

describe("useImportStore.pick", () => {
  it("parses+analyzes a valid file, advances to step 2, and seeds roles from suggestedRoles", async () => {
    const file = new File([validDxfText()], "molde.dxf", {
      type: "application/dxf",
    });
    await useImportStore.getState().pick(file);
    const s = useImportStore.getState();
    expect(s.step).toBe(2);
    expect(s.analysis).not.toBeNull();
    expect(s.fileName).toBe("molde.dxf");
    expect(s.roles.CONTORNO).toBe("cut");
    expect(s.actionError).toBeNull();
    expect(s.loading).toBe(false);
  });

  it("rejects an oversized file before reading it, without advancing to step 2", async () => {
    const big = "x".repeat(MAX_IMPORT_FILE_BYTES + 1);
    const file = new File([big], "huge.dxf", { type: "application/dxf" });
    await useImportStore.getState().pick(file);
    const s = useImportStore.getState();
    expect(s.step).toBe(1);
    expect(s.actionError).toBe("file_too_large");
  });

  it("records no_pieces_found when the file parses but yields zero closed pieces", async () => {
    const file = new File(["not a dxf file at all"], "garbage.dxf", {
      type: "application/dxf",
    });
    await useImportStore.getState().pick(file);
    const s = useImportStore.getState();
    expect(s.step).toBe(1);
    expect(s.actionError).toBe("no_pieces_found");
    expect(s.analysis).toBeNull();
  });

  // Found by code review: pick() used to gate on `analysis.pieceCount === 0`,
  // which is legitimately 0 for ANY unrecognised-vocabulary file (nothing is
  // mapped to "cut" yet) — so a real, importable file with real geometry was
  // rejected outright before the user ever got to map its layers.
  it("still advances to step 2 for a file with real geometry on an unrecognised layer, even though pieceCount starts at 0", async () => {
    const file = new File([genericDxfText()], "generic.dxf", {
      type: "application/dxf",
    });
    await useImportStore.getState().pick(file);
    const s = useImportStore.getState();
    expect(s.step).toBe(2);
    expect(s.actionError).toBeNull();
    expect(s.analysis?.format).toBe("dxf-generic");
    expect(s.analysis?.pieceCount).toBe(0);
    expect(s.roles.MEU_CONTORNO).toBe("ignore");
  });
});

describe("useImportStore.setRole / reset / clearActionError", () => {
  it("setRole overrides one layer's role without touching the others", async () => {
    const file = new File([validDxfText()], "molde.dxf", {
      type: "application/dxf",
    });
    await useImportStore.getState().pick(file);
    useImportStore.getState().setRole("CONTORNO", "ignore");
    const s = useImportStore.getState();
    expect(s.roles.CONTORNO).toBe("ignore");
    expect(s.roles.COSTURA).toBe("seam");
  });

  // Found by code review: step 2's entire purpose is correcting the layer
  // mapping, and the old store never recomputed pieceCount/checks after a
  // setRole call -- the panel kept showing the stale initial guess even
  // after the user told it otherwise.
  it("setRole recomputes analysis.pieceCount/checks live from the corrected role map", async () => {
    const file = new File([genericDxfText()], "generic.dxf", {
      type: "application/dxf",
    });
    await useImportStore.getState().pick(file);
    expect(useImportStore.getState().analysis?.pieceCount).toBe(0);

    useImportStore.getState().setRole("MEU_CONTORNO", "cut");

    const s = useImportStore.getState();
    expect(s.roles.MEU_CONTORNO).toBe("cut");
    expect(s.analysis?.pieceCount).toBe(1);
    const piecesClosed = s.analysis?.checks.find(
      (c) => c.code === "piecesClosed",
    );
    expect(piecesClosed?.values).toEqual({ closed: 1, total: 1 });
  });

  it("reset clears the file/analysis/roles and returns to step 1", async () => {
    const file = new File([validDxfText()], "molde.dxf", {
      type: "application/dxf",
    });
    await useImportStore.getState().pick(file);
    useImportStore.getState().reset();
    const s = useImportStore.getState();
    expect(s.step).toBe(1);
    expect(s.analysis).toBeNull();
    expect(s.fileName).toBeNull();
    expect(s.roles).toEqual({});
  });

  it("clearActionError clears the code without touching anything else", async () => {
    const file = new File(["x".repeat(MAX_IMPORT_FILE_BYTES + 1)], "huge.dxf", {
      type: "application/dxf",
    });
    await useImportStore.getState().pick(file);
    useImportStore.getState().clearActionError();
    expect(useImportStore.getState().actionError).toBeNull();
  });
});

describe("piece labeling", () => {
  it("setPieceLabel records a label, and setHoveredPieceKey records the hover", () => {
    useImportStore.getState().setPieceLabel("0", "front");
    expect(useImportStore.getState().pieceLabels["0"]).toEqual({
      label: "front",
    });
    useImportStore.getState().setHoveredPieceKey("0");
    expect(useImportStore.getState().hoveredPieceKey).toBe("0");
    useImportStore.getState().setHoveredPieceKey(null);
    expect(useImportStore.getState().hoveredPieceKey).toBeNull();
  });

  it("setPieceLabel records a custom name for 'other'", () => {
    useImportStore.getState().setPieceLabel("0", "other", "yoke");
    expect(useImportStore.getState().pieceLabels["0"]).toEqual({
      label: "other",
      customName: "yoke",
    });
  });

  it("reset() clears piece labels and hover state", () => {
    useImportStore.getState().setPieceLabel("0", "front");
    useImportStore.getState().setHoveredPieceKey("0");
    useImportStore.getState().reset();
    expect(useImportStore.getState().pieceLabels).toEqual({});
    expect(useImportStore.getState().hoveredPieceKey).toBeNull();
  });
});

describe("createPatternFromImport", () => {
  const file = new File([], "import-preview.png", { type: "image/png" });
  const preparedImage = { mediaType: "image/jpeg" as const, base64: "abc" };

  beforeEach(() => {
    vi.mocked(api.createPattern).mockReset();
    vi.mocked(api.generate).mockReset();
    vi.mocked(prepareImage).mockReset();
    vi.mocked(prepareImage).mockResolvedValue(preparedImage);
    // Cleared, not reset -- keeps the factory's Promise-resolving default
    // (recordChecklistEvent's real return type), only forgetting call history.
    vi.mocked(api.recordChecklistEvent).mockClear();
    useImportStore.setState({ pendingPatternId: null });
  });

  it("returns null without calling the API when no file has been picked", async () => {
    const id = await useImportStore
      .getState()
      .createPatternFromImport(file, "msg", "auto");
    expect(id).toBeNull();
    expect(api.createPattern).not.toHaveBeenCalled();
  });

  it("creates a pattern and generates with the prepared image and importContext, returning the id on ok", async () => {
    useImportStore.setState({
      doc: {} as never,
      analysis: { fileName: "oskar.dxf" } as never,
    });
    vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
    vi.mocked(api.generate).mockResolvedValue({
      status: "ok",
      state: {} as never,
    });

    const id = await useImportStore
      .getState()
      .createPatternFromImport(file, "msg", "auto");

    expect(id).toBe("p1");
    expect(api.generate).toHaveBeenCalledWith(
      "p1",
      "msg",
      undefined,
      preparedImage,
      expect.stringContaining("oskar.dxf"),
    );
    expect(useImportStore.getState().pendingPatternId).toBeNull();
  });

  it("pings the onboarding checklist once import succeeds", async () => {
    useImportStore.setState({
      doc: {} as never,
      analysis: { fileName: "oskar.dxf" } as never,
    });
    vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
    vi.mocked(api.generate).mockResolvedValue({
      status: "ok",
      state: {} as never,
    });

    await useImportStore
      .getState()
      .createPatternFromImport(file, "msg", "auto");

    expect(api.recordChecklistEvent).toHaveBeenCalledWith("imported");
  });

  it("does not ping the checklist when import fails", async () => {
    useImportStore.setState({
      doc: {} as never,
      analysis: { fileName: "oskar.dxf" } as never,
    });
    vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
    vi.mocked(api.generate).mockResolvedValue({
      status: "error",
      state: {} as never,
    });

    const id = await useImportStore
      .getState()
      .createPatternFromImport(file, "msg", "auto");

    expect(id).toBeNull();
    expect(api.recordChecklistEvent).not.toHaveBeenCalled();
  });

  it("auto-resends once with answering:true on a clarify response", async () => {
    useImportStore.setState({
      doc: {} as never,
      analysis: { fileName: "oskar.dxf" } as never,
    });
    vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
    vi.mocked(api.generate)
      .mockResolvedValueOnce({ status: "clarify", state: {} as never })
      .mockResolvedValueOnce({ status: "ok", state: {} as never });

    const id = await useImportStore
      .getState()
      .createPatternFromImport(file, "msg", "auto fallback");

    expect(id).toBe("p1");
    expect(api.generate).toHaveBeenCalledTimes(2);
    expect(api.generate).toHaveBeenNthCalledWith(
      2,
      "p1",
      "auto fallback",
      true,
      preparedImage,
      expect.stringContaining("oskar.dxf"),
    );
  });

  it("sets actionError to image_failed and never calls the API when prepareImage fails", async () => {
    useImportStore.setState({
      doc: {} as never,
      analysis: { fileName: "oskar.dxf" } as never,
    });
    vi.mocked(prepareImage).mockResolvedValue({ error: "decode_failed" });

    const id = await useImportStore
      .getState()
      .createPatternFromImport(file, "msg", "auto");

    expect(id).toBeNull();
    expect(useImportStore.getState().actionError).toBe("image_failed");
    expect(api.createPattern).not.toHaveBeenCalled();
  });

  it("sets actionError and returns null when generate declines", async () => {
    useImportStore.setState({
      doc: {} as never,
      analysis: { fileName: "oskar.dxf" } as never,
    });
    vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
    vi.mocked(api.generate).mockResolvedValue({
      status: "declined",
      state: {} as never,
    });

    const id = await useImportStore
      .getState()
      .createPatternFromImport(file, "msg", "auto");

    expect(id).toBeNull();
    expect(useImportStore.getState().actionError).toBe("create_failed");
  });

  it("sets actionError to insufficient_credits and keeps pendingPatternId for a retry, without creating a second pattern", async () => {
    useImportStore.setState({
      doc: {} as never,
      analysis: { fileName: "oskar.dxf" } as never,
    });
    vi.mocked(api.createPattern).mockResolvedValue({ id: "p1" });
    vi.mocked(api.generate).mockResolvedValue({
      status: "insufficient_credits",
      required: 1,
      balance: 0,
    });

    const id = await useImportStore
      .getState()
      .createPatternFromImport(file, "msg", "auto");

    expect(id).toBeNull();
    expect(useImportStore.getState().actionError).toBe("insufficient_credits");
    expect(useImportStore.getState().pendingPatternId).toBe("p1");

    // Retrying (e.g. after buying credits) reuses the same pattern instead
    // of creating another blank one.
    vi.mocked(api.generate).mockResolvedValue({
      status: "ok",
      state: {} as never,
    });
    const retryId = await useImportStore
      .getState()
      .createPatternFromImport(file, "msg", "auto");
    expect(retryId).toBe("p1");
    expect(api.createPattern).toHaveBeenCalledTimes(1);
  });

  it("preserves the real ApiError wire code, rather than a fixed literal, when createPattern throws", async () => {
    useImportStore.setState({
      doc: {} as never,
      analysis: { fileName: "oskar.dxf" } as never,
    });
    vi.mocked(api.createPattern).mockRejectedValue(
      new api.ApiError(500, "service_unavailable"),
    );

    const id = await useImportStore
      .getState()
      .createPatternFromImport(file, "msg", "auto");

    expect(id).toBeNull();
    expect(useImportStore.getState().actionError).toBe("service_unavailable");
  });

  it("falls back to request_failed for a non-ApiError throw", async () => {
    useImportStore.setState({
      doc: {} as never,
      analysis: { fileName: "oskar.dxf" } as never,
    });
    vi.mocked(api.createPattern).mockRejectedValue(new Error("boom"));

    const id = await useImportStore
      .getState()
      .createPatternFromImport(file, "msg", "auto");

    expect(id).toBeNull();
    expect(useImportStore.getState().actionError).toBe("request_failed");
  });
});
