import { NextResponse } from "next/server";
import { apiError, ERROR_STATUS } from "./errors";

/**
 * Reads a JSON *object* body, or the 400 response to return instead.
 *
 * Shaped like requireUser() on purpose -- `if (x instanceof NextResponse)
 * return x;` is already this repo's guard idiom, and a route that forgets the
 * check gets a type error on the next property access rather than a 500.
 *
 * `null` is the case worth spelling out: it is valid JSON, so it survives
 * request.json() and only blows up on the first `body.field` read, which in
 * six routes happened *outside* their try/catch. Scalars and arrays are
 * rejected for the same reason -- a route asking for an object should say so
 * once, here, rather than defending every field access.
 */
// #65/#55: this used to read and JSON.parse an unbounded body for EVERY
// route -- no Content-Length check, no bodySizeLimit in next.config.ts, no
// middleware.ts. A handful of concurrent oversized POSTs (e.g. a 200 MB
// body to the unauthenticated /api/signup, buffered and parsed before the
// rate limiter's 5/h bucket is even touched) OOM the single app container.
// Bounded against the largest legitimate body this app actually sends -- a
// full SizeChartData PATCH (lib/sizeChartsStore.ts, up to
// MAX_SIZE_CHART_SIZES rows of measurements) -- with generous headroom,
// not an arbitrary 1 KB.
export const MAX_BODY_BYTES = 64 * 1024;

// Reads the stream incrementally and aborts the moment the ceiling is
// crossed, so a chunked/absent-Content-Length body (which a client fully
// controls and can lie about) is bounded exactly like one that honestly
// declares its own size -- checking only the header would leave that case
// unbounded.
async function readBoundedText(
  request: Request,
  maxBytes: number,
): Promise<string | null> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > maxBytes) return null;

  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

/**
 * `maxBytes` defaults to MAX_BODY_BYTES, generous for every route that sends
 * plain form fields. The one exception is the generate route, whose body can
 * carry an attachment's base64 payload (#18) -- it passes its own larger
 * ceiling (lib/editor/attachment.ts's MAX_ATTACHMENT_BASE64_CHARS plus
 * headroom), still a real bound, just not this one.
 */
export async function readJsonObject(
  request: Request,
  maxBytes: number = MAX_BODY_BYTES,
): Promise<Record<string, unknown> | NextResponse> {
  const text = await readBoundedText(request, maxBytes);
  if (text === null) return apiError("bad_body", ERROR_STATUS.bad_body);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return apiError("bad_body", ERROR_STATUS.bad_body);
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return apiError("bad_body", ERROR_STATUS.bad_body);
  }
  return parsed as Record<string, unknown>;
}

/**
 * #69: JSON allows a NUL code point (Unicode code point zero) inside a
 * string, but Postgres's jsonb type does not accept one embedded in text --
 * JSON.stringify re-emits it verbatim, and the ::jsonb cast then throws
 * "unsupported Unicode escape sequence" past every existing validation
 * (trim() doesn't strip it, length still counts it). That throw had no
 * try/catch on some callers, so it escaped as a raw HTTP 500 -- worse, on
 * the generate route, only *after* the paid Anthropic call had already
 * billed and drafted.
 *
 * Deliberately scoped to the NUL code point alone, not the wider C0 control
 * range the original report suggested: verified live against Postgres 16
 * that every other C0 control character and DEL round-trips through a
 * ::jsonb cast fine -- Postgres rejects that one code point specifically.
 * Chat messages support a real newline via Shift+Enter (MessageInput), so
 * rejecting the whole control range here would break that feature instead
 * of fixing anything.
 */
const NUL = String.fromCharCode(0);

export function hasNulByte(s: string): boolean {
  return s.indexOf(NUL) !== -1;
}
