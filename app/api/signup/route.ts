import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/body";
import { getTranslations } from "next-intl/server";
import { createAccount, normalizeEmail } from "@/lib/account/signup";
import type { SignupErrorCode } from "@/lib/account/signup";
import { hashPassword } from "@/lib/auth/hash";
import { getUserByEmail, createUser } from "@/lib/db/users";
import { issueToken } from "@/lib/db/verification";
import { sendMail, verificationLink } from "@/lib/mail/send";
import { verificationEmail } from "@/lib/mail/templates";
import { consume } from "@/lib/rate-limit/consume";
import { clientIp } from "@/lib/rate-limit/ip";

// The only unauthenticated route handler in the app besides NextAuth's own and
// the two /api/verify-email routes, so it deliberately does not call
// requireUser(). It sits at the top level rather than under /api/auth/* (which
// the [...nextauth] catch-all owns) or /api/account/* (uniformly session-gated).
const STATUS: Record<SignupErrorCode, number> = {
  invalid_name: 400,
  invalid_email: 400,
  weak_password: 400,
  email_taken: 409,
  bad_body: 400,
  rate_limited: 429,
  mail_unavailable: 503,
};

function fail(error: SignupErrorCode, headers?: HeadersInit) {
  return NextResponse.json(
    { status: "error", error },
    { status: STATUS[error], headers },
  );
}

export async function POST(request: Request) {
  // #65: consumed before readJsonObject, matching both /api/verify-email
  // routes -- no row creation, no bcrypt, no mail, and now no body parsing
  // either. readJsonObject bounds body size on its own (#55/#65's shared
  // fix), so this ordering is a consistency match with the two sibling
  // routes rather than the DoS mitigation the original report described.
  const byIp = await consume("signup", clientIp(request.headers));
  if (!byIp.allowed) {
    return fail("rate_limited", { "Retry-After": String(byIp.retryAfterSec) });
  }

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return fail("bad_body");

  // A malformed address gets no email bucket -- createAccount rejects it below.
  const email = normalizeEmail(body.email);
  if (email) {
    const byEmail = await consume("signup_email", email);
    if (!byEmail.allowed) {
      return fail("rate_limited", {
        "Retry-After": String(byEmail.retryAfterSec),
      });
    }
  }

  const result = await createAccount(
    { getUserByEmail, createUser, hash: hashPassword },
    { name: body.name, email: body.email, password: body.password },
  );
  if (!result.ok) return fail(result.error);

  // Ordering matters: the user row and token are created first, then the mail
  // is sent. A send failure leaves an unverified account the user can recover
  // with "Reenviar" -- never a silent success.
  try {
    const raw = await issueToken(result.user.id, new Date());
    const t = await getTranslations("VerificationEmail");
    await sendMail(
      result.user.email,
      verificationEmail(
        t,
        verificationLink(raw),
        result.user.name ?? result.user.email,
      ),
    );
  } catch (err) {
    console.error("[signup] verification mail failed:", err);
    return fail("mail_unavailable");
  }

  // No user fields are echoed back -- the client already has the name and email
  // it typed, and the record carries the password hash.
  return NextResponse.json({ status: "ok" });
}
