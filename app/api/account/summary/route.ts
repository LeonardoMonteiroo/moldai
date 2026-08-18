import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
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
  return NextResponse.json({
    credits: buildCredits(wallet, new Date()),
    recentUsage,
  });
}
