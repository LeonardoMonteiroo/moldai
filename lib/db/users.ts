import { prisma } from "./prisma";
import type { UserRecord } from "@/lib/auth/types";

export function getUserByEmail(email: string): Promise<UserRecord | null> {
  return prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, passwordHash: true, name: true },
  });
}
