import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import type { UserRecord } from "@/lib/auth/types";
import type { NewUser } from "@/lib/account/signup";
import { reportError } from "@/lib/observability/report";

export function getUserByEmail(email: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      name: true,
      emailVerified: true,
    },
  });
}

export function getUserById(id: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      name: true,
      emailVerified: true,
    },
  });
}

export async function updateUserName(id: string, name: string): Promise<void> {
  await prisma.user.update({ where: { id }, data: { name } });
}

// #29: stamps passwordChangedAt in the SAME write as the hash update, so a
// successful password change can never be recorded without the hash
// actually changing (and vice versa) -- no separate audit write to fall out
// of sync with.
//
// #155: `now` and `client` are optional so every existing caller keeps
// working unchanged -- the /settings password-change route
// (app/api/account/password/route.ts) still calls this as just
// `(id, passwordHash)`, stamping `new Date()` against the module-level
// `prisma` singleton exactly as before. The forgot-password reset path
// (lib/db/passwordReset.ts's consumeResetToken) needed this same write to
// be atomic with deleting the single-use reset token, so it passes its own
// `now` plus an interactive transaction's `tx` client. A bare PrismaClient
// is structurally assignable to Prisma.TransactionClient (the
// lib/db/sizeChart.ts#ensureSystemSizeCharts precedent for exactly this
// "same function works transactionally or not" shape), so the default
// `client = prisma` needs no separate non-transactional code path.
export async function updateUserPasswordHash(
  id: string,
  passwordHash: string,
  now: Date = new Date(),
  client: PrismaClient | Prisma.TransactionClient = prisma,
): Promise<void> {
  await client.user.update({
    where: { id },
    data: { passwordHash, passwordChangedAt: now },
  });
}

// #235: retroactive verification on a Google link. An existing Credentials
// account that signed up but never clicked its own verification mail
// (emailVerified: null) gets it stamped here the moment it links a Google
// identity -- Google's own proof of ownership is strictly stronger evidence
// than an unclicked link, and this is what unblocks that account's
// Credentials login going forward too. A single updateMany with the null
// check in the WHERE clause (not a read-then-write) makes this one atomic
// statement -- it is simply a no-op for an already-verified row.
export async function stampEmailVerifiedIfMissing(
  userId: string,
  now: Date = new Date(),
): Promise<void> {
  await prisma.user.updateMany({
    where: { id: userId, emailVerified: null },
    data: { emailVerified: now },
  });
}

// #29: account deletion cascades away every Pattern/SizeChart/Sloper/Wallet/
// Transaction row (onDelete: Cascade), so nothing survives to stamp -- this
// reportError line is the only trace an operator gets that the account
// existed and was deleted. Never logs the password, hash, or a token.
export async function deleteUser(id: string): Promise<void> {
  await prisma.user.delete({ where: { id } });
  reportError("account.delete", "account deleted", { userId: id });
}

// #14: the closed set of self-described "how you work" answers from
// onboarding step 1. Stored as honest research data (User.workStyle) --
// never read by any drafting/behaviour path, so a value outside this list is
// simply rejected rather than silently accepted.
export const WORK_STYLES = ["patternmaker", "brand", "personal"] as const;
export type WorkStyle = (typeof WORK_STYLES)[number];

export function isWorkStyle(value: unknown): value is WorkStyle {
  return (
    typeof value === "string" &&
    (WORK_STYLES as readonly string[]).includes(value)
  );
}

// A narrow read, separate from getUserById's UserRecord select, so the
// onboarding gate (app/page.tsx, app/onboarding/page.tsx) doesn't widen the
// shape every other requireUser()-adjacent caller of getUserById receives. A
// null return means the account no longer exists -- the #62 precedent every
// other guard in this file already follows.
export function getOnboardingStatus(
  id: string,
): Promise<{ onboardedAt: Date | null } | null> {
  return prisma.user.findUnique({
    where: { id },
    select: { onboardedAt: true },
  });
}

// Stamps the wizard as seen. Idempotent in effect (onboardedAt only ever
// gates the redirect by null-ness, not by its exact value), so a repeat call
// -- Pular por agora after already finishing, a double click -- just moves
// the timestamp forward rather than erroring.
export async function stampOnboarded(
  id: string,
  workStyle?: WorkStyle,
): Promise<void> {
  await prisma.user.update({
    where: { id },
    data: {
      onboardedAt: new Date(),
      ...(workStyle ? { workStyle } : {}),
    },
  });
}

// Returns null when the unique constraint on email fires (P2002) — the
// read-then-insert race the pre-read in createAccount cannot close. Never
// throws for that expected failure, matching lib/db/pattern.ts's contract.
export async function createUser(input: NewUser): Promise<UserRecord | null> {
  try {
    return await prisma.user.create({
      data: input,
      select: {
        id: true,
        email: true,
        passwordHash: true,
        name: true,
        emailVerified: true,
      },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      return null;
    }
    throw e;
  }
}
