import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Pattern } from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";
import { exportPattern } from "./index";
import { downloadFile } from "./download";

// #88: model.size used to be interpolated into the download filename raw --
// a combined size label like "38/40" (routine in Brazilian charts) put a
// path separator straight into a.download. Everything downstream of
// buildExportModel is irrelevant to that bug, so the format serializers and
// buildExportModel itself are stubbed; only `slug` (the real implementation)
// and the filename passed to downloadFile matter here.
vi.mock("./download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./download")>();
  return { ...actual, downloadFile: vi.fn() };
});

vi.mock("./model", () => ({
  buildExportModel: vi.fn(() => ({ size: "38/40" })),
}));
vi.mock("./svg", () => ({ toSvg: vi.fn(() => "<svg/>") }));
vi.mock("./dxf", () => ({ toDxf: vi.fn(() => "dxf") }));
vi.mock("./dxf-aama", () => ({ toDxfAama: vi.fn(() => "dxf-aama") }));
vi.mock("./pdf", () => ({ toPdf: vi.fn(async () => new Uint8Array()) }));

const t = ((key: string) => key) as Translate;

function pattern(name: string): Pattern {
  return {
    name,
    spec: {},
    pieces: [{}],
  } as unknown as Pattern;
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
