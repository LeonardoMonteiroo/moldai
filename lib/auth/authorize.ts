import type { UserRecord } from "./types";

export interface AuthorizeDeps {
  getUserByEmail: (email: string) => Promise<UserRecord | null>;
  verify: (plain: string, hash: string) => Promise<boolean>;
}

export async function authorizeUser(
  creds: Record<string, unknown> | undefined,
  deps: AuthorizeDeps,
): Promise<{ id: string; email: string; name: string | null } | null> {
  const email = typeof creds?.email === "string" ? creds.email.trim().toLowerCase() : "";
  const password = typeof creds?.password === "string" ? creds.password : "";
  if (!email || !password) return null;

  const user = await deps.getUserByEmail(email);
  if (!user) return null;

  const ok = await deps.verify(password, user.passwordHash);
  if (!ok) return null;

  return { id: user.id, email: user.email, name: user.name };
}
