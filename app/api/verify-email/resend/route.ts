import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/body";
import { getTranslations } from "next-intl/server";
import { normalizeEmail } from "@/lib/account/signup";
import { verifyPassword } from "@/lib/auth/hash";
import {
  RESEND_COOLDOWN_MS,
  type ResendErrorCode,
} from "@/lib/auth/verification";
import { getUserByEmail } from "@/lib/db/users";
import { issueToken, lastIssuedAt } from "@/lib/db/verification";
import { sendMail, verificationLink } from "@/lib/mail/send";
import { verificationEmail } from "@/lib/mail/templates";
import { consume } from "@/lib/rate-limit/consume";
import { clientIp } from "@/lib/rate-limit/ip";

const STATUS: Record<ResendErrorCode, number> = {
  invalid_credentials: 401,
  already_verified: 409,
  cooldown: 429,
  bad_body: 400,
  rate_limited: 429,
  mail_unavailable: 503,
};

function fail(error: ResendErrorCode, headers?: HeadersInit) {
  return NextResponse.json(
    { status: "error", error },
    { status: STATUS[error], headers },
  );
}

// Credentials are verified before resending. That single decision removes the
// account-enumeration oracle, stops the endpoint being a spam relay against
// arbitrary addresses, and costs nothing: both callers (the sign-up success
// card and the login error) already hold the values.
export async function POST(request: Request) {
  const gate = await consume("resend", clientIp(request.headers));
  if (!gate.allowed) {
    return fail("rate_limited", { "Retry-After": String(gate.retryAfterSec) });
  }

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return fail("bad_body");

  const email = normalizeEmail(body.email);
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) return fail("invalid_credentials");

  const user = await getUserByEmail(email);
  if (!user) return fail("invalid_credentials");
  if (!(await verifyPassword(password, user.passwordHash))) {
    return fail("invalid_credentials");
  }

  if (user.emailVerified) return fail("already_verified");

  const now = new Date();
  const last = await lastIssuedAt(user.id);
  if (last) {
    const elapsed = now.getTime() - last.getTime();
    if (elapsed < RESEND_COOLDOWN_MS) {
      return fail("cooldown", {
        "Retry-After": String(Math.ceil((RESEND_COOLDOWN_MS - elapsed) / 1000)),
      });
    }
  }

  // The IP bucket above is spoofable without a trusted proxy, so this
  // email-keyed bucket is the non-spoofable backstop -- it sits after the
  // credential check (so it can't be used to exhaust a victim's quota
  // without their password) and after the already-verified and cooldown
  // checks (so a legitimate user retrying "Reenviar" within the cooldown,
  // which sent no mail, is not punished for it). It counts mails actually
  // attempted per address.
  const byEmail = await consume("resend_email", email);
  if (!byEmail.allowed) {
    return fail("rate_limited", {
      "Retry-After": String(byEmail.retryAfterSec),
    });
  }

  try {
    // Reissuing invalidates the previous token, so only the newest link works.
    const raw = await issueToken(user.id, now);
    const t = await getTranslations("VerificationEmail");
    await sendMail(
      user.email,
      verificationEmail(t, verificationLink(raw), user.name ?? user.email),
    );
  } catch (err) {
    console.error("[resend] verification mail failed:", err);
    return fail("mail_unavailable");
  }

  return NextResponse.json({ status: "ok" });
}
