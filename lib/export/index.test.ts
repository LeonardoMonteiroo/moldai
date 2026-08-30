import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTranslator } from "next-intl";
import type { Pattern } from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";
import { exportPattern } from "./index";
import { downloadFile } from "./download";
import { buildExportModel } from "./model";
import { toSvg } from "./svg";
import { toDxf } from "./dxf";
import { toDxfAama } from "./dxf-aama";
import { toPdf, toPdfLayered } from "./pdf";
import { toPlt } from "./plt";
import ptBR from "@/messages/pt-BR.json";
import { recordChecklistEvent } from "@/lib/api-client";

// #88: model.size used to be interpolated into the download filename raw --
// a combined size label like "38/40" (routine in Brazilian charts) put a
// path separator straight into a.download. Everything downstream of
// buildExportModel is irrelevant to that bug, so the format serializers and
// buildExportModel itself are stubbed; only `slug` (the real implementation)
// and the filename passed to downloadFile matter here. #85 reuses these same
// stubs to assert exportPattern's dispatch/filenames/failure paths without
// depending on any one serializer's real output.
vi.mock("./download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./download")>();
  return { ...actual, downloadFile: vi.fn() };
});

vi.mock("@/lib/api-client", () => ({
  recordChecklistEvent: vi.fn(() => Promise.resolve()),
}));

vi.mock("./model", () => ({
  buildExportModel: vi.fn(() => ({ size: "38/40" })),
}));
vi.mock("./svg", () => ({ toSvg: vi.fn(() => "<svg/>") }));
vi.mock("./dxf", () => ({ toDxf: vi.fn(() => "dxf") }));
vi.mock("./dxf-aama", () => ({ toDxfAama: vi.fn(() => "dxf-aama") }));
vi.mock("./pdf", () => ({
  toPdf: vi.fn(async () => new Uint8Array()),
  toPdfLayered: vi.fn(async () => new Uint8Array()),
}));
vi.mock("./plt", () => ({ toPlt: vi.fn(() => "plt-content") }));

const t = ((key: string) => key) as Translate;

// #85: a real next-intl translator scoped the way the Footer actually calls
// it -- `useTranslations("PatternData")` then `t("exportFailed")` -- so the
// failure-path assertions below compare onError's argument against the real
// resolved pt-BR string from the exported `messages/pt-BR.json` catalog,
// never a pasted literal (per CLAUDE.md's vacuous-assertion rule: next-intl
// doesn't throw on a missing/moved key, it renders the literal key path
// instead). Same idiom as lib/i18n/patternDataChat.test.ts's `t`/`tFormat`.
const tCatalog = createTranslator({
  locale: "pt-BR",
  messages: ptBR,
  namespace: "PatternData",
}) as Translate;

function pattern(name: string): Pattern {
  return {
    name,
    spec: {},
    pieces: [{}],
  } as unknown as Pattern;
}

// #85: the early-return guard (`!pattern.spec || pattern.pieces.length === 0`)
// covers both halves independently.
function patternWithoutSpec(): Pattern {
  return {
    name: "Vazio",
    spec: undefined,
    pieces: [{}],
  } as unknown as Pattern;
}

function patternWithNoPieces(): Pattern {
  return { name: "Vazio", spec: {}, pieces: [] } as unknown as Pattern;
}

describe("exportPattern filename (#88)", () => {
  beforeEach(() => {
    vi.mocked(downloadFile).mockClear();
  });

  it("slugs a combined size label instead of interpolating it raw", () => {
    exportPattern(pattern("Vestido floral"), "svg", t);
    expect(downloadFile).toHaveBeenCalledWith(
      "vestido-floral-38-40.svg",
      "image/svg+xml",
      expect.anything(),
    );
  });

  it("never lets a path separator reach a.download's filename", () => {
    exportPattern(pattern("Vestido floral"), "dxf", t);
    const [filename] = vi.mocked(downloadFile).mock.calls[0];
    expect(filename).not.toContain("/");
  });
});

// #85: exportPattern's dispatch, per-format filenames and early-return guard.
describe("exportPattern dispatch (#85)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("svg: calls toSvg and downloads it under the .svg filename/mime", () => {
    exportPattern(pattern("Vestido floral"), "svg", t);
    expect(toSvg).toHaveBeenCalledWith({ size: "38/40" });
    expect(toDxf).not.toHaveBeenCalled();
    expect(toDxfAama).not.toHaveBeenCalled();
    expect(toPdf).not.toHaveBeenCalled();
    expect(downloadFile).toHaveBeenCalledWith(
      "vestido-floral-38-40.svg",
      "image/svg+xml",
      "<svg/>",
    );
  });

  it("pings the onboarding checklist after a successful export", () => {
    exportPattern(pattern("Vestido floral"), "svg", t);
    expect(recordChecklistEvent).toHaveBeenCalledWith("exported");
  });

  it("dxf: calls toDxf and downloads it under the .dxf filename/mime", () => {
    exportPattern(pattern("Vestido floral"), "dxf", t);
    expect(toDxf).toHaveBeenCalledWith({ size: "38/40" });
    expect(toSvg).not.toHaveBeenCalled();
    expect(downloadFile).toHaveBeenCalledWith(
      "vestido-floral-38-40.dxf",
      "image/vnd.dxf",
      "dxf",
    );
  });

  it("dxf-aama: calls toDxfAama and downloads it under the '-aama.dxf' filename/mime", () => {
    exportPattern(pattern("Vestido floral"), "dxf-aama", t);
    expect(toDxfAama).toHaveBeenCalledWith({ size: "38/40" });
    expect(toDxf).not.toHaveBeenCalled();
    expect(downloadFile).toHaveBeenCalledWith(
      "vestido-floral-38-40-aama.dxf",
      "image/vnd.dxf",
      "dxf-aama",
    );
  });

  it("pdf-a4: calls toPdf(model, 'a4', t, opts) and, once resolved, downloads it under the '-a4.pdf' filename/mime", async () => {
    exportPattern(pattern("Vestido floral"), "pdf-a4", t);
    expect(toPdf).toHaveBeenCalledWith({ size: "38/40" }, "a4", t, {
      pageSize: undefined,
    });
    expect(downloadFile).not.toHaveBeenCalled(); // fire-and-forget: not yet
    await vi.waitFor(() => expect(downloadFile).toHaveBeenCalled());
    expect(downloadFile).toHaveBeenCalledWith(
      "vestido-floral-38-40-a4.pdf",
      "application/pdf",
      expect.any(Uint8Array),
    );
  });

  it("pdf-a4: forwards an explicit pageSize option", () => {
    exportPattern(
      pattern("Vestido floral"),
      "pdf-a4",
      t,
      undefined,
      undefined,
      {
        pageSize: "a0",
      },
    );
    expect(toPdf).toHaveBeenCalledWith({ size: "38/40" }, "a4", t, {
      pageSize: "a0",
    });
  });

  it("pdf-single: calls toPdf(model, 'single', t) and, once resolved, downloads it under the '-folha.pdf' filename/mime", async () => {
    exportPattern(pattern("Vestido floral"), "pdf-single", t);
    expect(toPdf).toHaveBeenCalledWith({ size: "38/40" }, "single", t, {});
    await vi.waitFor(() => expect(downloadFile).toHaveBeenCalled());
    expect(downloadFile).toHaveBeenCalledWith(
      "vestido-floral-38-40-folha.pdf",
      "application/pdf",
      expect.any(Uint8Array),
    );
  });

  // #135/#136: a roll width switches pdf-single into the "roll" (copyshop)
  // mode instead of a plain single sheet.
  it("pdf-single: a rollWidthCm option dispatches to toPdf(model, 'roll', t, {rollWidthCm})", () => {
    exportPattern(
      pattern("Vestido floral"),
      "pdf-single",
      t,
      undefined,
      undefined,
      {
        rollWidthCm: 150,
      },
    );
    expect(toPdf).toHaveBeenCalledWith({ size: "38/40" }, "roll", t, {
      rollWidthCm: 150,
    });
  });

  // #135
  it("plt: calls toPlt and downloads it under the .plt filename/mime", () => {
    exportPattern(pattern("Vestido floral"), "plt", t);
    expect(toPlt).toHaveBeenCalledWith(
      { size: "38/40" },
      { rollWidthCm: undefined },
    );
    expect(downloadFile).toHaveBeenCalledWith(
      "vestido-floral-38-40.plt",
      "application/vnd.hp-hpgl",
      "plt-content",
    );
  });

  it("plt: forwards an explicit rollWidthCm option", () => {
    exportPattern(pattern("Vestido floral"), "plt", t, undefined, undefined, {
      rollWidthCm: 150,
    });
    expect(toPlt).toHaveBeenCalledWith({ size: "38/40" }, { rollWidthCm: 150 });
  });

  // #136
  it("pdf-layered: builds one model per graded size (base + sizesApplied) and downloads the result", async () => {
    const pat = {
      name: "Vestido floral",
      spec: {},
      pieces: [{}],
      baseSize: "M",
      sizesApplied: ["G", "GG"],
    } as unknown as Pattern;
    exportPattern(pat, "pdf-layered", t);
    await vi.waitFor(() => expect(downloadFile).toHaveBeenCalled());
    expect(toPdfLayered).toHaveBeenCalledWith(
      [
        { size: "M", model: { size: "38/40" } },
        { size: "G", model: { size: "38/40" } },
        { size: "GG", model: { size: "38/40" } },
      ],
      t,
    );
    expect(downloadFile).toHaveBeenCalledWith(
      "vestido-floral-graduado.pdf",
      "application/pdf",
      expect.any(Uint8Array),
    );
  });

  it("pdf-layered: dedupes when the base size is also in sizesApplied", async () => {
    const pat = {
      name: "Vestido floral",
      spec: {},
      pieces: [{}],
      baseSize: "M",
      sizesApplied: ["M", "G"],
    } as unknown as Pattern;
    exportPattern(pat, "pdf-layered", t);
    await vi.waitFor(() => expect(downloadFile).toHaveBeenCalled());
    expect(toPdfLayered).toHaveBeenCalledWith(
      [
        { size: "M", model: { size: "38/40" } },
        { size: "G", model: { size: "38/40" } },
      ],
      t,
    );
  });

  it("does nothing for a pattern with no spec (no model build, no download, no error)", () => {
    const onError = vi.fn();
    exportPattern(patternWithoutSpec(), "svg", t, onError);
    expect(buildExportModel).not.toHaveBeenCalled();
    expect(downloadFile).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("does nothing for a pattern with a spec but zero drafted pieces", () => {
    const onError = vi.fn();
    exportPattern(patternWithNoPieces(), "svg", t, onError);
    expect(buildExportModel).not.toHaveBeenCalled();
    expect(downloadFile).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});

// #85: every failure path -- the model-build catch, each format's own
// synchronous catch, and the two async pdf `.catch(fail)` branches -- must
// actually reach onError with the real catalog string, not just avoid
// throwing.
describe("exportPattern failure paths (#85)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls onError with the resolved PatternData.exportFailed string when buildExportModel throws", () => {
    vi.mocked(buildExportModel).mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const onError = vi.fn();
    exportPattern(pattern("Vestido floral"), "svg", tCatalog, onError);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(ptBR.PatternData.exportFailed);
    expect(toSvg).not.toHaveBeenCalled();
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it("calls onError when the svg serializer throws synchronously", () => {
    vi.mocked(toSvg).mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const onError = vi.fn();
    exportPattern(pattern("Vestido floral"), "svg", tCatalog, onError);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(ptBR.PatternData.exportFailed);
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it("does not ping the checklist when the export fails", () => {
    vi.mocked(toSvg).mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const onError = vi.fn();
    exportPattern(pattern("Vestido floral"), "svg", tCatalog, onError);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(recordChecklistEvent).not.toHaveBeenCalled();
  });

  it("calls onError when the dxf serializer throws synchronously", () => {
    vi.mocked(toDxf).mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const onError = vi.fn();
    exportPattern(pattern("Vestido floral"), "dxf", tCatalog, onError);
    expect(onError).toHaveBeenCalledWith(ptBR.PatternData.exportFailed);
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it("calls onError when the dxf-aama serializer throws synchronously", () => {
    vi.mocked(toDxfAama).mockImplementationOnce(() => {
      throw new Error("boom");
    });
    const onError = vi.fn();
    exportPattern(pattern("Vestido floral"), "dxf-aama", tCatalog, onError);
    expect(onError).toHaveBeenCalledWith(ptBR.PatternData.exportFailed);
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it("does not throw when onError is omitted on a synchronous failure", () => {
    vi.mocked(toSvg).mockImplementationOnce(() => {
      throw new Error("boom");
    });
    expect(() =>
      exportPattern(pattern("Vestido floral"), "svg", tCatalog),
    ).not.toThrow();
    expect(downloadFile).not.toHaveBeenCalled();
  });

  // toPdf is async and fire-and-forget (`.then(...).catch(fail)`) --
  // exportPattern itself returns void before the promise settles, so this is
  // the one failure path a purely synchronous assertion can't observe: a
  // rejection has to actually propagate to onError rather than becoming an
  // unhandled rejection.
  it("reaches onError on a pdf-a4 rejection instead of swallowing it", async () => {
    vi.mocked(toPdf).mockRejectedValueOnce(new Error("pdf-lib boom"));
    const onError = vi.fn();
    exportPattern(pattern("Vestido floral"), "pdf-a4", tCatalog, onError);
    expect(onError).not.toHaveBeenCalled(); // hasn't settled synchronously
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith(ptBR.PatternData.exportFailed);
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it("reaches onError on a pdf-single rejection instead of swallowing it", async () => {
    vi.mocked(toPdf).mockRejectedValueOnce(new Error("pdf-lib boom"));
    const onError = vi.fn();
    exportPattern(pattern("Vestido floral"), "pdf-single", tCatalog, onError);
    await vi.waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    expect(onError).toHaveBeenCalledWith(ptBR.PatternData.exportFailed);
    expect(downloadFile).not.toHaveBeenCalled();
  });

  it("does not call onError once a pdf export resolves successfully", async () => {
    const onError = vi.fn();
    exportPattern(pattern("Vestido floral"), "pdf-a4", tCatalog, onError);
    await vi.waitFor(() => expect(downloadFile).toHaveBeenCalled());
    expect(onError).not.toHaveBeenCalled();
  });
});
