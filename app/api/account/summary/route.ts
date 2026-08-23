import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { loadWallet } from "@/lib/db/wallet";
import { getRecentUsage } from "@/lib/db/account";
import { buildCredits } from "@/lib/api/compose";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const [wallet, recentUsage] = await Promise.all([
    loadWallet(gate.id),
    getRecentUsage(gate.id, 3),
  ]);
  // #62: requireUser() just confirmed this account exists -- null here means
  // it was deleted in the instant between that check and this one. Treat it
  // the same as never having authenticated at all.
  if (!wallet) return unauthorized();
  return NextResponse.json({
    credits: buildCredits(wallet, new Date()),
    recentUsage,
  });
}
