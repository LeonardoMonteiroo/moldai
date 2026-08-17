import { NextResponse } from "next/server";
import { resetMolde } from "@/lib/db/molde";
import { resetWallet } from "@/lib/db/wallet";
import { composeEditorState } from "@/lib/api/compose";
import { requireUser } from "@/lib/auth/guard";

// Resets the user's molde AND wallet to their defaults (matches the previous
// behavior, where seedState() bundled pattern/chat/conflict/credits together).
export async function POST() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const [moldeState, wallet] = await Promise.all([
    resetMolde(gate.id),
    resetWallet(gate.id),
  ]);
  return NextResponse.json({
    status: "ok",
    state: composeEditorState(moldeState, wallet, new Date()),
  });
}
