import type { UserRecord } from "@/lib/auth/types";
import { validateName, validateNewPassword } from "./settings";

// Deliberately permissive: one @, no whitespace, a dot in the domain. Enough to
// catch typos without adding a dependency and without rejecting valid addresses.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// `bad_body`, `rate_limited` and `mail_unavailable` are produced by the route,
// never by createAccount -- they live here because the whole wire contract is
// one union.
export type SignupErrorCode =
  | "invalid_name"
  | "invalid_email"
  | "weak_password"
  | "email_taken"
  | "bad_body"
  | "rate_limited"
  | "mail_unavailable";

export interface NewUser {
  email: string; // already normalized
  name: string;
  passwordHash: string;
}

export interface SignupDeps {
  getUserByEmail: (email: string) => Promise<UserRecord | null>;
  // Resolves null when the unique constraint on email fired — see lib/db/users.ts.
  createUser: (input: NewUser) => Promise<UserRecord | null>;
  hash: (plain: string) => Promise<string>;
}

// Distinct from lib/api-client.ts's wire-level SignupResult ({status, error}).
export type CreateAccountResult =
  { ok: true; user: UserRecord } | { ok: false; error: SignupErrorCode };

// Must match the normalization authorizeUser applies before its lookup,
// or an account created as "Foo@X.com" could never be logged into.
export function normalizeEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const normalized = email.trim().toLowerCase();
  return EMAIL_RE.test(normalized) ? normalized : null;
}

export async function createAccount(
  deps: SignupDeps,
  input: { name: unknown; email: unknown; password: unknown },
): Promise<CreateAccountResult> {
  const name = validateName(input.name);
  if (!name) return { ok: false, error: "invalid_name" };

  const email = normalizeEmail(input.email);
  if (!email) return { ok: false, error: "invalid_email" };

  if (!validateNewPassword(input.password)) {
    return { ok: false, error: "weak_password" };
  }

  // The friendly path. It does not close the read-then-insert window, which is
  // why createUser reports the constraint violation instead of throwing.
  if (await deps.getUserByEmail(email)) {
    return { ok: false, error: "email_taken" };
  }

  const passwordHash = await deps.hash(input.password);
  const user = await deps.createUser({ email, name, passwordHash });
  if (!user) return { ok: false, error: "email_taken" };

  return { ok: true, user };
}
