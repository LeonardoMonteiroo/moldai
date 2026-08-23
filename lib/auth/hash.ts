import bcrypt from "bcryptjs";

const ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// #26: a fixed hash, same cost as a real one, spent on an unknown-email
// login/resend attempt so the response doesn't finish measurably faster than
// a known-email one -- see lib/auth/authorize.ts and
// app/api/verify-email/resend/route.ts. Built once at module load
// (hashSync) rather than per-request, since it never needs to change.
export const DUMMY_HASH = bcrypt.hashSync("", ROUNDS);
