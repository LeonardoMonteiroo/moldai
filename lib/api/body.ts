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
export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown> | NextResponse> {
  let parsed: unknown;
  try {
    parsed = await request.json();
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
