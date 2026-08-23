import { prisma } from "./prisma";
import { newVerificationToken, isExpired } from "@/lib/auth/verification";

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

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { passwordHash: newPasswordHash },
    }),
    prisma.passwordResetToken.deleteMany({ where: { userId: row.userId } }),
  ]);
  return { ok: true, userId: row.userId };
}
