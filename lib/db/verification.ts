import { prisma } from "./prisma";
import { newVerificationToken, isExpired } from "@/lib/auth/verification";

export type ConsumeTokenResult =
  { ok: true; userId: string } | { ok: false; reason: "invalid" | "expired" };

// Issuing deletes the user's existing tokens, so only the newest link works.
// Returns the RAW token -- the caller mails it; only the digest is stored.
export async function issueToken(userId: string, now: Date): Promise<string> {
  const { raw, tokenHash, expiresAt } = newVerificationToken(now);
  await prisma.$transaction([
    prisma.emailVerificationToken.deleteMany({ where: { userId } }),
    prisma.emailVerificationToken.create({
      data: { tokenHash, userId, expiresAt },
    }),
  ]);
  return raw;
}

// Reports the reason rather than a bare null: an expired link must tell the
// user to request a new one, a bogus one must not. Single use -- the row is
// deleted whether it is accepted or rejected as expired.
export async function consumeToken(
  tokenHash: string,
  now: Date,
): Promise<ConsumeTokenResult> {
  const row = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
  });
  if (!row) return { ok: false, reason: "invalid" };

  if (isExpired(row.expiresAt, now)) {
    await prisma.emailVerificationToken.deleteMany({ where: { tokenHash } });
    return { ok: false, reason: "expired" };
  }

  await prisma.$transaction([
    prisma.user.update({
      where: { id: row.userId },
      data: { emailVerified: now },
    }),
    prisma.emailVerificationToken.deleteMany({ where: { userId: row.userId } }),
  ]);
  return { ok: true, userId: row.userId };
}

export async function lastIssuedAt(userId: string): Promise<Date | null> {
  const row = await prisma.emailVerificationToken.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return row?.createdAt ?? null;
}
