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
  | "resend_attempt";

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
};
