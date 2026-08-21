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
