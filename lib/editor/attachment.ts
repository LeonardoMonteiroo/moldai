// #18: client-side preparation for a photo/sketch chat attachment. Pure
// validation (type, source size) is DOM-free and runs FIRST, before any
// decode work -- an obviously-rejected file never touches
// createImageBitmap/canvas, which is what lets that half be exercised
// without a real browser (see attachment.test.ts, the "node" project).
// Everything past validation is genuinely DOM-only: an unscaled phone photo
// is several MB, and downscaling it needs a real image decoder/canvas.

export type AttachmentErrorCode =
  "unsupported_type" | "too_large" | "decode_failed";

// The four image types the Anthropic Messages API's image content block
// accepts (Anthropic.Base64ImageSource["media_type"]) -- lib/ai/index.ts
// sends whichever one reaches it verbatim, no re-validation there.
export type ImageMediaType =
  "image/jpeg" | "image/png" | "image/webp" | "image/gif";

const ALLOWED_IMAGE_TYPES: readonly ImageMediaType[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export function isImageMediaType(value: unknown): value is ImageMediaType {
  return (
    typeof value === "string" &&
    (ALLOWED_IMAGE_TYPES as readonly string[]).includes(value)
  );
}

// Rejected before any scaling work -- a source over this is never going to
// be accepted, so there is no reason to spend a decode pass on it.
export const MAX_ATTACHMENT_SOURCE_BYTES = 10 * 1024 * 1024;

// Past this long edge the Anthropic API downsizes the image server-side
// anyway (its own documented recommendation), so sending more only spends
// bandwidth and image tokens for nothing.
export const MAX_ATTACHMENT_LONG_EDGE_PX = 1568;

const JPEG_QUALITY = 0.85;

// Bounds the base64 payload a generate request can carry. Generous headroom
// over what prepareImage() actually produces (a downscaled JPEG at
// MAX_ATTACHMENT_LONG_EDGE_PX/JPEG_QUALITY is well under 1 MB for a real
// photo), so a legitimate attachment is never rejected here -- but a request
// that skipped the browser's own preparation entirely (or lied about it)
// still hits a real ceiling at the route boundary, not just the client's own
// UX affordance. Matches MAX_BODY_BYTES's own "generous headroom, not
// arbitrary" convention (lib/api/body.ts).
export const MAX_ATTACHMENT_BASE64_CHARS = 6 * 1024 * 1024;

export interface PreparedAttachment {
  mediaType: "image/jpeg";
  base64: string;
}

export type PrepareImageResult =
  PreparedAttachment | { error: AttachmentErrorCode };

function scaledSize(
  width: number,
  height: number,
): { width: number; height: number } {
  const longEdge = Math.max(width, height);
  if (longEdge <= MAX_ATTACHMENT_LONG_EDGE_PX) return { width, height };
  const scale = MAX_ATTACHMENT_LONG_EDGE_PX / longEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

async function loadSource(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }
  // Fallback for a browser without createImageBitmap: decode via <img>.
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("image decode failed"));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function sourceSize(source: ImageBitmap | HTMLImageElement): {
  width: number;
  height: number;
} {
  return "naturalWidth" in source
    ? { width: source.naturalWidth, height: source.naturalHeight }
    : { width: source.width, height: source.height };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new Error("blob read failed"));
    reader.readAsDataURL(blob);
  });
}

async function canvasToBase64Jpeg(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): Promise<string> {
  if (
    typeof OffscreenCanvas !== "undefined" &&
    canvas instanceof OffscreenCanvas
  ) {
    const blob = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: JPEG_QUALITY,
    });
    return blobToBase64(blob);
  }
  const dataUrl = (canvas as HTMLCanvasElement).toDataURL(
    "image/jpeg",
    JPEG_QUALITY,
  );
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/**
 * Downscales `file` to at most MAX_ATTACHMENT_LONG_EDGE_PX on the long edge
 * and re-encodes it as JPEG, base64-encoded -- ready to attach to a
 * propose_garment call. Never throws: every failure comes back as a
 * `{ error }` the composer resolves through the catalog.
 */
export async function prepareImage(file: File): Promise<PrepareImageResult> {
  if (!isImageMediaType(file.type)) return { error: "unsupported_type" };
  if (file.size > MAX_ATTACHMENT_SOURCE_BYTES) return { error: "too_large" };

  try {
    const source = await loadSource(file);
    const { width: srcW, height: srcH } = sourceSize(source);
    const { width, height } = scaledSize(srcW, srcH);
    const image = source as CanvasImageSource;

    if (typeof OffscreenCanvas !== "undefined") {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d");
      if (!ctx) return { error: "decode_failed" };
      ctx.drawImage(image, 0, 0, width, height);
      return {
        mediaType: "image/jpeg",
        base64: await canvasToBase64Jpeg(canvas),
      };
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return { error: "decode_failed" };
    ctx.drawImage(image, 0, 0, width, height);
    return {
      mediaType: "image/jpeg",
      base64: await canvasToBase64Jpeg(canvas),
    };
  } catch {
    return { error: "decode_failed" };
  }
}

export interface WireAttachment {
  mediaType: ImageMediaType;
  data: string;
}

/**
 * Server-side validation of the wire-shaped `image` field on a generate
 * request -- the size-chart-patch/purchase-type precedent (lib/sizeCharts/
 * validate.ts, lib/billing/wallet.ts's isPurchaseType) applied to an
 * attachment: the browser's own prepareImage() is a UX affordance, not a
 * trust boundary, so a request that skipped it (or lied about it) is
 * re-checked here before it ever reaches proposeGarment. Returns null for
 * anything unusable -- absent/malformed shape, an unrecognized media type, an
 * empty or over-ceiling payload -- so the route can answer one clean 400
 * rather than let a bad field reach the paid Anthropic call.
 */
export function validateAttachmentInput(value: unknown): WireAttachment | null {
  if (typeof value !== "object" || value === null) return null;
  const { mediaType, data } = value as Record<string, unknown>;
  if (!isImageMediaType(mediaType)) return null;
  if (typeof data !== "string" || data.length === 0) return null;
  if (data.length > MAX_ATTACHMENT_BASE64_CHARS) return null;
  return { mediaType, data };
}
