import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireUserFrom, unauthorized } from "./session";
import { getUserById } from "@/lib/db/users";
import type { SessionUser } from "./types";

// #62: the JWT's session/jwt callbacks never re-check that the row still
// exists, so a deleted account's cookie (valid up to the JWT's 30-day
// default) kept authenticating on any other device or copy of the cookie --
// loadWallet fabricated a free wallet for the vanished user on read paths,
// and write paths (the lazy-seed INSERT in lockWallet, createPattern) threw
// an unhandled Wallet_userId_fkey/Pattern_userId_fkey violation as an
// uncoded 500. This is the one extra DB read every requireUser() call now
// costs, deliberately placed here rather than in auth.ts's session callback
// (which runs on every server render, not just on requests that actually
// need the guard).
export async function requireUser(): Promise<SessionUser | NextResponse> {
  const gate = requireUserFrom(await auth());
  if (gate instanceof NextResponse) return gate;
  const user = await getUserById(gate.id);
  if (!user) return unauthorized();
  return gate;
}
