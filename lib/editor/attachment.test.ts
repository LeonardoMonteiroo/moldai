import { describe, it, expect } from "vitest";
import {
  prepareImage,
  isImageMediaType,
  validateAttachmentInput,
  validateAttachmentInputs,
  MAX_ATTACHMENT_SOURCE_BYTES,
  MAX_ATTACHMENT_BASE64_CHARS,
  MAX_ATTACHMENT_COUNT,
  MAX_ATTACHMENTS_TOTAL_BASE64_CHARS,
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

// The list form of the same boundary. The form may attach up to
// MAX_ATTACHMENT_COUNT photos, so the route needs a ceiling on the count
// AND on the combined payload -- the per-image ceiling alone would let four
// entries carry 24 MB of base64 into the paid Anthropic call.
describe("validateAttachmentInputs", () => {
  const one = (data: string) => ({ mediaType: "image/jpeg" as const, data });

  it("rejects anything that is not an array", () => {
    expect(validateAttachmentInputs(undefined)).toBeNull();
    expect(validateAttachmentInputs(null)).toBeNull();
    expect(validateAttachmentInputs({})).toBeNull();
    expect(validateAttachmentInputs(one("abc"))).toBeNull();
  });

  // A text-only request omits the key; an empty array is a caller that
  // meant to attach something and sent nothing.
  it("rejects an empty array rather than treating it as text-only", () => {
    expect(validateAttachmentInputs([])).toBeNull();
  });

  it("rejects more than MAX_ATTACHMENT_COUNT entries, even when each is valid", () => {
    const tooMany = Array.from({ length: MAX_ATTACHMENT_COUNT + 1 }, (_, i) =>
      one(`img${i}`),
    );
    expect(validateAttachmentInputs(tooMany)).toBeNull();
  });

  it("rejects the whole list when one entry has an unknown media type", () => {
    expect(
      validateAttachmentInputs([
        one("abc"),
        { mediaType: "application/pdf", data: "abc" },
      ]),
    ).toBeNull();
  });

  it("rejects the whole list when one entry has empty or non-string data", () => {
    expect(validateAttachmentInputs([one("abc"), one("")])).toBeNull();
    expect(
      validateAttachmentInputs([
        one("abc"),
        { mediaType: "image/jpeg", data: 12345 },
      ]),
    ).toBeNull();
  });

  it("rejects the whole list when one entry is over MAX_ATTACHMENT_BASE64_CHARS", () => {
    const over = "a".repeat(MAX_ATTACHMENT_BASE64_CHARS + 1);
    expect(validateAttachmentInputs([one("abc"), one(over)])).toBeNull();
  });

  it("rejects a combined payload over the total ceiling even when every entry is individually valid", () => {
    const atPerImageCeiling = "a".repeat(MAX_ATTACHMENT_BASE64_CHARS);
    expect(validateAttachmentInput(one(atPerImageCeiling))).not.toBeNull();
    expect(MAX_ATTACHMENT_BASE64_CHARS * 2).toBeGreaterThan(
      MAX_ATTACHMENTS_TOTAL_BASE64_CHARS,
    );
    expect(
      validateAttachmentInputs([
        one(atPerImageCeiling),
        one(atPerImageCeiling),
      ]),
    ).toBeNull();
  });

  it("accepts a combined payload exactly at the total ceiling", () => {
    const half = "a".repeat(MAX_ATTACHMENTS_TOTAL_BASE64_CHARS / 2);
    const out = validateAttachmentInputs([one(half), one(half)]);
    expect(out).toHaveLength(2);
  });

  // The single-image case the wire carried before this: still accepted at
  // its own per-image ceiling, so moving to a list changed no limit for it.
  it("still accepts one attachment at the per-image ceiling", () => {
    const data = "a".repeat(MAX_ATTACHMENT_BASE64_CHARS);
    const out = validateAttachmentInputs([one(data)]);
    expect(out).toHaveLength(1);
    expect(out![0].data.length).toBe(MAX_ATTACHMENT_BASE64_CHARS);
  });

  it("returns 1, 2 and MAX_ATTACHMENT_COUNT entries in the order received", () => {
    for (const n of [1, 2, MAX_ATTACHMENT_COUNT]) {
      const input = Array.from({ length: n }, (_, i) => one(`img${i}`));
      expect(validateAttachmentInputs(input)).toEqual(input);
    }
  });

  it("keeps each entry's own media type rather than normalizing them", () => {
    expect(
      validateAttachmentInputs([
        { mediaType: "image/png", data: "a" },
        { mediaType: "image/webp", data: "b" },
      ]),
    ).toEqual([
      { mediaType: "image/png", data: "a" },
      { mediaType: "image/webp", data: "b" },
    ]);
  });
});
