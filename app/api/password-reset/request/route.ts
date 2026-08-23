import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/body";
import { getTranslations } from "next-intl/server";
import { normalizeEmail } from "@/lib/account/signup";
import type { RequestResetErrorCode } from "@/lib/auth/passwordReset";
import { getUserByEmail } from "@/lib/db/users";
import { issueResetToken } from "@/lib/db/passwordReset";
import { sendMail, passwordResetLink } from "@/lib/mail/send";
import { passwordResetEmail } from "@/lib/mail/templates";
import { consume } from "@/lib/rate-limit/consume";
import { clientIp } from "@/lib/rate-limit/ip";
import { reportError } from "@/lib/observability/report";

const STATUS: Record<RequestResetErrorCode, number> = {
  bad_body: 400,
  rate_limited: 429,
};

function fail(error: RequestResetErrorCode, headers?: HeadersInit) {
  return NextResponse.json(
    { status: "error", error },
    { status: STATUS[error], headers },
  );
}

// Unauthenticated by necessity: the visitor has forgotten their password, not
// just their session. Always answers 200 regardless of whether the address
// exists -- an "ok" body must not double as an account-existence oracle, and
// neither may a mail-send failure: both an unknown address and a broken SMTP
// server for a real one are folded into the same success response, with the
// actual cause only ever reaching stdout via reportError. (Contrast with
// /api/verify-email/resend, which CAN reveal mail_unavailable, because that
// route is credential-gated and the caller already knows the account exists.)
export async function POST(request: Request) {
  const byIp = await consume(
    "password_reset_request",
    clientIp(request.headers),
  );
  if (!byIp.allowed) {
    return fail("rate_limited", { "Retry-After": String(byIp.retryAfterSec) });
  }

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return fail("bad_body");

  const email = normalizeEmail(body.email);
  if (!email) return fail("bad_body");

  // Consumed regardless of whether the address exists -- an attacker who
  // knows a victim's email must not be able to flood their inbox just
  // because the account is unregistered and this bucket was skipped.
  const byEmail = await consume("password_reset_request_email", email);
  if (!byEmail.allowed) {
    return fail("rate_limited", {
      "Retry-After": String(byEmail.retryAfterSec),
    });
  }

  try {
    const user = await getUserByEmail(email);
    if (user) {
      const now = new Date();
      const raw = await issueResetToken(user.id, now);
      const t = await getTranslations("PasswordResetEmail");
      await sendMail(
        user.email,
        passwordResetEmail(t, passwordResetLink(raw), user.name ?? user.email),
      );
    }
  } catch (err) {
    // Swallowed on purpose -- surfacing mail_unavailable here would tell an
    // attacker the address exists (mail is only attempted for one that does).
    reportError("password-reset-request", err, { email });
  }

  return NextResponse.json({ status: "ok" });
}
