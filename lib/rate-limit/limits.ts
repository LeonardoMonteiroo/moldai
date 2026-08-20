// The whole rate-limit policy, reviewable in one place. No logic lives here on
// purpose: changing a number must never mean reading code.
export type Bucket =
  "signup" | "signup_email" | "login" | "login_email" | "verify" | "resend";

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
};
