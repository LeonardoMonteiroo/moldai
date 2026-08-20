import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import type { UserRecord } from "@/lib/auth/types";
import type { NewUser } from "@/lib/account/signup";

export function getUserByEmail(email: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, passwordHash: true, name: true },
  });
}

export function getUserById(id: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, passwordHash: true, name: true },
  });
}

export async function updateUserName(id: string, name: string): Promise<void> {
  await prisma.user.update({ where: { id }, data: { name } });
}

export async function updateUserPasswordHash(
  id: string,
  passwordHash: string,
): Promise<void> {
  await prisma.user.update({ where: { id }, data: { passwordHash } });
}

export async function deleteUser(id: string): Promise<void> {
  await prisma.user.delete({ where: { id } });
}

// Returns null when the unique constraint on email fires (P2002) — the
// read-then-insert race the pre-read in createAccount cannot close. Never
// throws for that expected failure, matching lib/db/pattern.ts's contract.
export async function createUser(input: NewUser): Promise<UserRecord | null> {
  try {
    return await prisma.user.create({
      data: input,
      select: { id: true, email: true, passwordHash: true, name: true },
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
