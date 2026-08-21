import { NextResponse } from "next/server";
import { withWallet } from "@/lib/db/wallet";
import { loadPattern, patternNotFound } from "@/lib/db/pattern";
import { applyPurchase } from "@/lib/billing/wallet";
import { buildCredits, composeEditorState } from "@/lib/api/compose";
import { requireUser } from "@/lib/auth/guard";

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const { type, patternId } = (await request.json()) as {
    type: "topup" | "subscribe";
    patternId?: string;
  };
  const now = new Date();

  const wallet = await withWallet(gate.id, (wallet) => {
    const entry = applyPurchase(wallet, type, now);
    return { result: wallet, entries: [entry] };
  });

  if (typeof patternId === "string") {
    const loaded = await loadPattern(patternId, gate.id);
    if (!loaded) return patternNotFound();
    return NextResponse.json({
      status: "ok",
      state: composeEditorState(loaded.state, wallet, now, loaded.updatedAt),
    });
  }

  return NextResponse.json({
    status: "ok",
    credits: buildCredits(wallet, now),
  });
}
