import { describe, it, expect } from "vitest";
import { renderPreviewImage } from "./renderPreviewImage";

describe("renderPreviewImage", () => {
  it("never throws even when the canvas context is unavailable (no jsdom canvas backend)", async () => {
    await expect(
      renderPreviewImage({ viewBox: "0 0 10 10", segments: [] }),
    ).resolves.toBeInstanceOf(File);
  });

  it("names the produced file consistently", async () => {
    const file = await renderPreviewImage({
      viewBox: "0 0 10 10",
      segments: [],
    });
    expect(file.name).toBe("import-preview.png");
  });
});
