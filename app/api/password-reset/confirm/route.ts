import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/body";
import { hashToken } from "@/lib/auth/verification";
import type { ConfirmResetErrorCode } from "@/lib/auth/passwordReset";
import { hashPassword } from "@/lib/auth/hash";
import { resetPassword } from "@/lib/account/passwordReset";
import { consumeResetToken } from "@/lib/db/passwordReset";
import { consume } from "@/lib/rate-limit/consume";
import { clientIp } from "@/lib/rate-limit/ip";

const STATUS: Record<ConfirmResetErrorCode, number> = {
  invalid_token: 400,
  expired_token: 400,
  weak_password: 400,
  bad_body: 400,
  rate_limited: 429,
};

function fail(error: ConfirmResetErrorCode, headers?: HeadersInit) {
  return NextResponse.json(
    { status: "error", error },
    { status: STATUS[error], headers },
  );
}

// Unauthenticated by necessity, and IP-keyed only -- there's no email in this
// request, only a token (mirrors the `verify` bucket precedent: the real
// backstop against brute force here is the 256-bit token, not a counter).
export async function POST(request: Request) {
  const gate = await consume(
    "password_reset_confirm",
    clientIp(request.headers),
  );
  if (!gate.allowed) {
    return fail("rate_limited", { "Retry-After": String(gate.retryAfterSec) });
  }

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return fail("bad_body");

  const token = typeof body.token === "string" ? body.token : "";
  if (!token) return fail("invalid_token");

  // Validated and hashed before the token is touched, so a weak-password
  // attempt never burns the single-use link -- the user can retry with the
  // same one.
  const validated = await resetPassword(
    { hash: hashPassword },
    body.newPassword,
  );
  if (!validated.ok) return fail(validated.error);

  const result = await consumeResetToken(
    hashToken(token),
    validated.newHash,
    new Date(),
  );
  if (!result.ok) {
    return fail(
      result.reason === "expired" ? "expired_token" : "invalid_token",
    );
  }

  // Deliberately no session is minted, matching /api/verify-email -- proof of
  // a mailbox is not proof the visitor now sitting at the keyboard should be
  // signed in. They log in with the new password from here.
  return NextResponse.json({ status: "ok" });
}
