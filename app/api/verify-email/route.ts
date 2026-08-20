import { NextResponse } from "next/server";
import { hashToken, type VerifyErrorCode } from "@/lib/auth/verification";
import { consumeToken } from "@/lib/db/verification";
import { consume } from "@/lib/rate-limit/consume";
import { clientIp } from "@/lib/rate-limit/ip";

// Unauthenticated by necessity: the visitor has a link, not a session.
const STATUS: Record<VerifyErrorCode, number> = {
  invalid_token: 400,
  expired_token: 400,
  bad_body: 400,
  rate_limited: 429,
};

function fail(error: VerifyErrorCode, headers?: HeadersInit) {
  return NextResponse.json(
    { status: "error", error },
    { status: STATUS[error], headers },
  );
}

export async function POST(request: Request) {
  const gate = await consume("verify", clientIp(request.headers));
  if (!gate.allowed) {
    return fail("rate_limited", { "Retry-After": String(gate.retryAfterSec) });
  }

  let body: { token?: unknown };
  try {
    body = await request.json();
  } catch {
    return fail("bad_body");
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return fail("invalid_token");

  const result = await consumeToken(hashToken(token), new Date());
  if (!result.ok) {
    return fail(
      result.reason === "expired" ? "expired_token" : "invalid_token",
    );
  }

  // Deliberately no session is minted: at this point the server has proof of
  // email ownership but not of the password, and signing in straight from a
  // link would turn the email into a bearer credential.
  return NextResponse.json({ status: "ok" });
}
