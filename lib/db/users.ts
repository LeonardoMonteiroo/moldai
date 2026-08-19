import { prisma } from "./prisma";
import type { UserRecord } from "@/lib/auth/types";

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
