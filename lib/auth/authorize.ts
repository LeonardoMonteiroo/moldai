import { DUMMY_HASH } from "./hash";
import type { UserRecord } from "./types";

export type AuthorizeFailure = "invalid" | "unverified" | "rate_limited";

// Written once with all three reasons. auth.ts maps `invalid` to Auth.js's
// generic null and the other two to coded CredentialsSignin subclasses, so
// /login can distinguish them.
export type AuthorizeResult =
  | { ok: true; user: { id: string; email: string; name: string | null } }
  | { ok: false; reason: AuthorizeFailure };

export interface AuthorizeDeps {
  getUserByEmail: (email: string) => Promise<UserRecord | null>;
  verify: (plain: string, hash: string) => Promise<boolean>;
  // The limiter reaches this module through DI rather than an import, so the
  // module stays DB-free, Redis-free and testable with fakes.
  consume: (
    bucket: "login" | "login_email",
    key: string,
  ) => Promise<{ allowed: boolean }>;
  reset: (bucket: "login_email", key: string) => Promise<void>;
}

export async function authorizeUser(
  creds: Record<string, unknown> | undefined,
  deps: AuthorizeDeps,
): Promise<AuthorizeResult> {
  const email =
    typeof creds?.email === "string" ? creds.email.trim().toLowerCase() : "";
  const password = typeof creds?.password === "string" ? creds.password : "";
  const ip = typeof creds?.ip === "string" && creds.ip ? creds.ip : "unknown";
  if (!email || !password) return { ok: false, reason: "invalid" };

  // Both buckets are consumed before any bcrypt work, so a throttled attacker
  // never costs us a hash.
  if (!(await deps.consume("login", ip)).allowed) {
    return { ok: false, reason: "rate_limited" };
  }
  if (!(await deps.consume("login_email", email)).allowed) {
    return { ok: false, reason: "rate_limited" };
  }

  const user = await deps.getUserByEmail(email);
  // An unknown email reports `invalid`, never `unverified` -- the gate must not
  // become an account-existence oracle beyond what /signup already reveals.
  //
  // #26: it also must not respond measurably *faster* than a known email --
  // bcrypt's compare below is the slow step, so an unknown email spends the
  // same cost against a fixed dummy hash before returning. deps.verify is
  // called exactly once either way (asserted in the test), which is the
  // testable form of the property; a wall-clock timing assertion would flake
  // in CI.
  if (!user) {
    await deps.verify(password, DUMMY_HASH);
    return { ok: false, reason: "invalid" };
  }

  if (!(await deps.verify(password, user.passwordHash))) {
    return { ok: false, reason: "invalid" };
  }

  // The password was right, so this is not a brute-force run: clear the counter
  // before the verification gate, or a legitimate unverified user retrying would
  // lock themselves out and see "muitas tentativas" instead of "confirme seu email".
  await deps.reset("login_email", email);

  if (!user.emailVerified) return { ok: false, reason: "unverified" };

  return {
    ok: true,
    user: { id: user.id, email: user.email, name: user.name },
  };
}
