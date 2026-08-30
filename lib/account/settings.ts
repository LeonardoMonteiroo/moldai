const MAX_NAME_LENGTH = 80;
export const MIN_PASSWORD_LENGTH = 8;
// #30: bcryptjs silently truncates its input at 72 bytes (reproduced against
// this repo's own node_modules) -- two distinct passwords sharing their
// first 72 bytes verify against the same hash. #55's 200-character cap was a
// sanity/DoS bound only; it let a longer password through and had it
// silently reduced to a shorter effective secret. 72 rejects instead of
// truncating.
export const MAX_PASSWORD_LENGTH = 72;

export function validateName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) return null;
  return trimmed;
}

export function validateNewPassword(password: unknown): password is string {
  return (
    typeof password === "string" &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password.length <= MAX_PASSWORD_LENGTH
  );
}

export interface PasswordDeps {
  verify: (plain: string, hash: string) => Promise<boolean>;
  hash: (plain: string) => Promise<string>;
}

export type ChangePasswordResult =
  | { ok: true; newHash: string }
  | { ok: false; error: "wrong_password" | "weak_password" };

export async function changePassword(
  deps: PasswordDeps,
  currentPassword: unknown,
  newPassword: unknown,
  storedHash: string | null,
): Promise<ChangePasswordResult> {
  // #235: a Google-only account (storedHash null) has nothing to verify a
  // current password against -- this is the "Definir senha" flow, not
  // "Alterar senha", so the check is skipped entirely rather than treated
  // as an always-wrong comparison.
  if (storedHash !== null) {
    const currentOk =
      typeof currentPassword === "string" &&
      (await deps.verify(currentPassword, storedHash));
    if (!currentOk) return { ok: false, error: "wrong_password" };
  }

  if (!validateNewPassword(newPassword)) {
    return { ok: false, error: "weak_password" };
  }

  const newHash = await deps.hash(newPassword);
  return { ok: true, newHash };
}

export async function verifyForDeletion(
  deps: Pick<PasswordDeps, "verify">,
  password: unknown,
  storedHash: string | null,
): Promise<boolean> {
  // #235: ownership is already established by the session -- for a
  // Google-only account the password check was always the second factor,
  // never the only one, so there is nothing to verify against here.
  if (storedHash === null) return true;
  if (typeof password !== "string") return false;
  return deps.verify(password, storedHash);
}
