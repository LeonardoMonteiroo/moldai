import { describe, it, expect, beforeEach } from "vitest";
import { useImportStore, MAX_IMPORT_FILE_BYTES } from "./importStore";
import { buildExportModel } from "@/lib/export/model";
import { toDxf } from "@/lib/export/dxf";
import { t } from "@/lib/i18n/test-translate";
import { SIZE_TABLE } from "@/lib/measurements";
import type { Pattern } from "@/lib/types";

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
