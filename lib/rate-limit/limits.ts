// The whole rate-limit policy, reviewable in one place. No logic lives here on
// purpose: changing a number must never mean reading code.
export type Bucket =
  | "signup"
  | "signup_email"
  | "login"
  | "login_email"
  | "verify"
  | "resend"
  | "resend_email"
  | "resend_attempt"
  | "create"
  | "password_reset_request"
  | "password_reset_request_email"
  | "password_reset_confirm"
  | "purchase"
  | "purchase_user";

export interface Policy {
  limit: number;
  windowSec: number;
}

// Every sensitive endpoint gets an IP-keyed bucket *and* an email-keyed one:
// x-forwarded-for is spoofable without a trusted proxy, so the email-keyed
// limit is the non-spoofable backstop.
export const LIMITS: Record<Bucket, Policy> = {
  signup: { limit: 5, windowSec: 3600 },
  signup_email: { limit: 3, windowSec: 3600 },
  login: { limit: 20, windowSec: 900 },
  login_email: { limit: 10, windowSec: 900 },
  verify: { limit: 20, windowSec: 3600 },
  resend: { limit: 10, windowSec: 3600 },
  resend_email: { limit: 5, windowSec: 3600 },
  // #23: caps password *attempts* against a known address on this endpoint,
  // the same way login_email caps them on the login path -- the IP bucket
  // above (`resend`) is spoofable without a trusted proxy and cannot do
  // this job on its own.
  resend_attempt: { limit: 10, windowSec: 900 },
  // #101: the only authenticated-write bucket. Keyed on the account id
  // (gate.id), not the IP -- every other bucket needs the IP key because it
  // guards a pre-login endpoint with no account to key on yet, but here the
  // account is already known and its id can't be spoofed the way
  // x-forwarded-for can. Covers POST /api/patterns, /api/slopers and
  // /api/size-charts, whose only cost before this was Postgres row growth
  // and (for a sloper-backed pattern) a real draftGarment call per request.
  create: { limit: 60, windowSec: 3600 },
  // #24: request has no credential gate (unlike resend, which requires the
  // password), so the email-keyed bucket alone caps how many reset mails one
  // address can be sent -- matching resend_email's role and limit.
  password_reset_request: { limit: 10, windowSec: 3600 },
  password_reset_request_email: { limit: 5, windowSec: 3600 },
  // No email-keyed pair, matching `verify`: there's no email in this
  // request, only a token, and the real backstop is the 256-bit token
  // itself, not a counter.
  password_reset_confirm: { limit: 20, windowSec: 3600 },
  // #6: POST /api/billing/purchase had no bucket at all -- under the mock
  // provider that meant unlimited free credits in a loop; under the asaas
  // provider it means creating hosted checkouts, which costs against a real
  // third party per request. IP-keyed AND user-keyed, the same dual-bucket
  // shape as signup/login: `purchase` alone (spoofable IP) can't stop one
  // account hammering from many IPs, and `purchase_user` alone can't stop
  // many accounts sharing one IP.
  purchase: { limit: 10, windowSec: 3600 },
  purchase_user: { limit: 10, windowSec: 3600 },
};
