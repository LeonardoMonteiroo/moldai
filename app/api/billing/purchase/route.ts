import { NextResponse } from "next/server";
import { withMolde } from "@/lib/db/molde";
import { applyPurchase } from "@/lib/editor/state";
import { requireUser } from "@/lib/auth/guard";

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const { type } = (await request.json()) as { type: "topup" | "subscribe" };
  return withMolde(gate.id, (state) => {
    applyPurchase(state, type);
    return NextResponse.json({ status: "ok", state });
  });
}
