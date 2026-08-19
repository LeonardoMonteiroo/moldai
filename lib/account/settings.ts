const MAX_NAME_LENGTH = 80;
const MIN_PASSWORD_LENGTH = 8;

export function validateName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > MAX_NAME_LENGTH) return null;
  return trimmed;
}

export function validateNewPassword(password: unknown): password is string {
  return typeof password === "string" && password.length >= MIN_PASSWORD_LENGTH;
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
  storedHash: string,
): Promise<ChangePasswordResult> {
  const currentOk =
    typeof currentPassword === "string" &&
    (await deps.verify(currentPassword, storedHash));
  if (!currentOk) return { ok: false, error: "wrong_password" };

  if (!validateNewPassword(newPassword)) {
    return { ok: false, error: "weak_password" };
  }

  const newHash = await deps.hash(newPassword);
  return { ok: true, newHash };
}

export async function verifyForDeletion(
  deps: Pick<PasswordDeps, "verify">,
  password: unknown,
  storedHash: string,
): Promise<boolean> {
  if (typeof password !== "string") return false;
  return deps.verify(password, storedHash);
}
