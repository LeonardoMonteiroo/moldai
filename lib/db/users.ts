import { Prisma } from "@prisma/client";
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
export async function updateUserPasswordHash(
  id: string,
  passwordHash: string,
): Promise<void> {
  await prisma.user.update({
    where: { id },
    data: { passwordHash, passwordChangedAt: new Date() },
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
