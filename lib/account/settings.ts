const MAX_NAME_LENGTH = 80;
const MIN_PASSWORD_LENGTH = 8;
// #55: only a minimum was ever enforced -- an unbounded password reaches
// bcrypt on both the signup and password-change paths (this function's two
// callers) with nothing capping the input size. 200 is a sanity/DoS bound,
// not a correctness fix for bcrypt's own well-known 72-byte truncation,
// which is out of scope here.
const MAX_PASSWORD_LENGTH = 200;

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
