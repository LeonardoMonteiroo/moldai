import { createHash, randomBytes } from "node:crypto";

export const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours, single use
export const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds between reissues

// The wire contracts for the two verification routes, kept beside the logic
// they describe -- the same placement as SignupErrorCode in lib/account/signup.ts.
export type VerifyErrorCode =
  "invalid_token" | "expired_token" | "bad_body" | "rate_limited";

export type ResendErrorCode =
  | "invalid_credentials"
  | "already_verified"
  | "cooldown"
  | "bad_body"
  | "rate_limited"
  | "mail_unavailable";

export interface NewToken {
  raw: string;
  tokenHash: string;
  expiresAt: Date;
}

// SHA-256 rather than bcrypt: the token is 32 random bytes, so a slow hash buys
// nothing, and a fast digest can serve as the table's primary key. Storing only
// the digest means a database leak does not yield usable links.
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function newVerificationToken(now: Date): NewToken {
  const raw = randomBytes(32).toString("base64url");
  return {
    raw,
    tokenHash: hashToken(raw),
    expiresAt: new Date(now.getTime() + TOKEN_TTL_MS),
  };
}

export function isExpired(expiresAt: Date, now: Date): boolean {
  return expiresAt.getTime() <= now.getTime();
}
