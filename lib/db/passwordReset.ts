import { prisma } from "./prisma";
import { newVerificationToken, isExpired } from "@/lib/auth/verification";
import { updateUserPasswordHash } from "./users";

export type ConsumeResetTokenResult =
  { ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" };

// Issuing deletes the user's existing reset tokens, so only the newest link
// works -- mirrors lib/db/verification.ts's issueToken. Returns the RAW
// token; only the digest is stored.
export async function issueResetToken(
  userId: string,
  now: Date,
): Promise<string> {
  const { raw, tokenHash, expiresAt } = newVerificationToken(now);
  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.create({
      data: { tokenHash, userId, expiresAt },
    }),
  ]);
  return raw;
}

// The route validates and hashes the new password before calling this, so a
// weak-password attempt never burns the single-use token -- the caller can
// retry with the same link. Consuming and persisting the new hash happen in
// one transaction, so a token is never deleted without the password actually
// changing (and vice versa).
//
// #155: goes through the SAME lib/db/users.ts#updateUserPasswordHash the
// /settings password-change path uses, rather than a second, bare
// `prisma.user.update` that only set `passwordHash` -- that duplicate write
// was never updated when #29 added the `passwordChangedAt` stamp, so a
// forgot-password reset (the flow most likely to follow an account
// compromise -- it's literally how a victim regains control after an
// attacker gets in) never recorded when the password actually changed.
// `prisma.$transaction([...])`'s array form can't run an async function
// like updateUserPasswordHash as one of its own operations, so this moves
// to the interactive `prisma.$transaction(async (tx) => ...)` form and
// passes `tx` through -- same atomicity (a token is still never deleted
// without the password actually changing, and vice versa), same
// `now` this function already receives, just routed through the shared
// function instead of a second hand-written update.
export async function consumeResetToken(
  tokenHash: string,
  newPasswordHash: string,
  now: Date,
): Promise<ConsumeResetTokenResult> {
  const row = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });
  if (!row) return { ok: false, reason: "invalid" };

  if (isExpired(row.expiresAt, now)) {
    await prisma.passwordResetToken.deleteMany({ where: { tokenHash } });
    return { ok: false, reason: "expired" };
  }

  await prisma.$transaction(async (tx) => {
    await updateUserPasswordHash(row.userId, newPasswordHash, now, tx);
    await tx.passwordResetToken.deleteMany({ where: { userId: row.userId } });
  });
  return { ok: true, userId: row.userId };
}
