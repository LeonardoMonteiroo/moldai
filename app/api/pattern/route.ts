import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { loadMolde } from "@/lib/db/molde";
import { loadWallet } from "@/lib/db/wallet";
import { composeEditorState } from "@/lib/api/compose";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const [moldeState, wallet] = await Promise.all([
    loadMolde(gate.id),
    loadWallet(gate.id),
  ]);
  return NextResponse.json(composeEditorState(moldeState, wallet, new Date()));
}
