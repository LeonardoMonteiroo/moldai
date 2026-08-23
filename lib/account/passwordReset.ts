import { validateNewPassword, type PasswordDeps } from "./settings";

export type ResetPasswordResult =
  { ok: true; newHash: string } | { ok: false; error: "weak_password" };

// DB-free and DI'd, the same shape as changePassword (lib/account/settings.ts)
// -- but there is no current password to check here: proof of identity is the
// token itself, verified by the caller (lib/db/passwordReset.ts's
// consumeResetToken) before this hash is persisted.
export async function resetPassword(
  deps: Pick<PasswordDeps, "hash">,
  newPassword: unknown,
): Promise<ResetPasswordResult> {
  if (!validateNewPassword(newPassword)) {
    return { ok: false, error: "weak_password" };
  }
  const newHash = await deps.hash(newPassword);
  return { ok: true, newHash };
}
