import { describe, it, expect } from "vitest";
import {
  prepareImage,
  isImageMediaType,
  validateAttachmentInput,
  MAX_ATTACHMENT_SOURCE_BYTES,
  MAX_ATTACHMENT_BASE64_CHARS,
} from "./attachment";

// Validation (type, source size) runs BEFORE any decode work, so these two
// cases never touch createImageBitmap/canvas -- what lets them run in the
// "node" project, with no real browser behind them.
describe("prepareImage", () => {
  it("rejects an unsupported file type without decoding it", async () => {
    const file = new File(["not an image"], "molde.pdf", {
      type: "application/pdf",
    });
    const result = await prepareImage(file);
    expect(result).toEqual({ error: "unsupported_type" });
  });

  it("rejects a source file over MAX_ATTACHMENT_SOURCE_BYTES without decoding it", async () => {
    const file = new File(
      [new Uint8Array(MAX_ATTACHMENT_SOURCE_BYTES + 1)],
      "photo.jpg",
      { type: "image/jpeg" },
    );
    const result = await prepareImage(file);
    expect(result).toEqual({ error: "too_large" });
  });

  it("accepts a source file exactly at the size ceiling for decoding (fails past validation, in the decode step no browser here provides)", async () => {
    const file = new File(
      [new Uint8Array(MAX_ATTACHMENT_SOURCE_BYTES)],
      "photo.jpg",
      { type: "image/jpeg" },
    );
    const result = await prepareImage(file);
    // No real image decoder in this environment -- this asserts the
    // size/type gates did NOT reject it, not that decoding succeeded.
    expect(result).not.toEqual({ error: "unsupported_type" });
    expect(result).not.toEqual({ error: "too_large" });
  });

  it("never throws, even on a decode failure", async () => {
    const file = new File(["garbage"], "photo.png", { type: "image/png" });
    await expect(prepareImage(file)).resolves.toBeDefined();
  });
});

describe("isImageMediaType", () => {
  it("accepts the four supported image types", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp", "image/gif"]) {
      expect(isImageMediaType(t)).toBe(true);
    }
  });

  it("rejects anything else, including a non-string", () => {
    expect(isImageMediaType("application/pdf")).toBe(false);
    expect(isImageMediaType("text/html")).toBe(false);
    expect(isImageMediaType(undefined)).toBe(false);
    expect(isImageMediaType(null)).toBe(false);
    expect(isImageMediaType(42)).toBe(false);
  });
});

// The server-side half of the trust boundary: a request that skipped
// prepareImage entirely (or lied about it) is re-validated here, the
// isPurchaseType/validateSizeChartPatch precedent.
describe("validateAttachmentInput", () => {
  it("accepts a well-formed attachment", () => {
    expect(
      validateAttachmentInput({ mediaType: "image/jpeg", data: "abc123" }),
    ).toEqual({ mediaType: "image/jpeg", data: "abc123" });
  });

  it("rejects a non-object", () => {
    expect(validateAttachmentInput(null)).toBeNull();
    expect(validateAttachmentInput("image/jpeg")).toBeNull();
    expect(validateAttachmentInput(42)).toBeNull();
  });

  it("rejects an unrecognized or missing mediaType", () => {
    expect(
      validateAttachmentInput({ mediaType: "text/html", data: "abc" }),
    ).toBeNull();
    expect(validateAttachmentInput({ data: "abc" })).toBeNull();
  });

  it("rejects a missing or empty data field", () => {
    expect(validateAttachmentInput({ mediaType: "image/jpeg" })).toBeNull();
    expect(
      validateAttachmentInput({ mediaType: "image/jpeg", data: "" }),
    ).toBeNull();
    expect(
      validateAttachmentInput({ mediaType: "image/jpeg", data: 12345 }),
    ).toBeNull();
  });

  it("rejects a payload over MAX_ATTACHMENT_BASE64_CHARS", () => {
    const data = "a".repeat(MAX_ATTACHMENT_BASE64_CHARS + 1);
    expect(
      validateAttachmentInput({ mediaType: "image/jpeg", data }),
    ).toBeNull();
  });

  it("accepts a payload exactly at the ceiling", () => {
    const data = "a".repeat(MAX_ATTACHMENT_BASE64_CHARS);
    expect(validateAttachmentInput({ mediaType: "image/jpeg", data })).toEqual({
      mediaType: "image/jpeg",
      data,
    });
  });
});
