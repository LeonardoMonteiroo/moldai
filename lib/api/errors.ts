import { NextResponse } from "next/server";

/** Codes any route can emit, independent of domain. */
export type RouteErrorCode = "bad_body" | "unauthorized";

/** One per resource kind. */
export type NotFoundCode =
  "pattern_not_found" | "size_chart_not_found" | "account_not_found";

export type SharedErrorCode = RouteErrorCode | NotFoundCode;

export const ERROR_STATUS: Record<SharedErrorCode, number> = {
  bad_body: 400,
  unauthorized: 401,
  pattern_not_found: 404,
  size_chart_not_found: 404,
  account_not_found: 404,
};

// The `status` field in the body is NOT the HTTP status — it is the wire
// discriminator clients switch on, and it differs per code today. This map
// reproduces the existing shapes exactly so swapping prose for a code is not
// also a wire change. Note the wart it preserves: /api/account/* answers its
// 404 with status "error", not "not_found".
const STATUS_WORD: Record<string, string> = {
  unauthorized: "unauthorized",
  pattern_not_found: "not_found",
  size_chart_not_found: "not_found",
};

/**
 * Builds an error response carrying a machine-readable code. `code` is a bare
 * string because domain codes (e.g. "wrong_password") live beside their own
 * pure logic; the caller has already narrowed it through its own exhaustive
 * Record.
 */
export function apiError(
  code: string,
  httpStatus: number,
  headers?: HeadersInit,
): NextResponse {
  return NextResponse.json(
    { status: STATUS_WORD[code] ?? "error", error: code },
    { status: httpStatus, headers },
  );
}
