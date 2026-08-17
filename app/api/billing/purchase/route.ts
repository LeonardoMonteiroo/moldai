import { NextResponse } from "next/server";
import { withWallet } from "@/lib/db/wallet";
import { loadMolde } from "@/lib/db/molde";
import { applyPurchase } from "@/lib/billing/wallet";
import { composeEditorState } from "@/lib/api/compose";
import { requireUser } from "@/lib/auth/guard";

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const { type } = (await request.json()) as { type: "topup" | "subscribe" };
  const now = new Date();

  const wallet = await withWallet(gate.id, (wallet) => {
    const entry = applyPurchase(wallet, type, now);
    return { result: wallet, entries: [entry] };
  });
  const moldeState = await loadMolde(gate.id);
  return NextResponse.json({
    status: "ok",
    state: composeEditorState(moldeState, wallet, now),
  });
}
