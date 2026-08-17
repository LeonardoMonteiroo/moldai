import { NextResponse } from "next/server";
import { resetMolde } from "@/lib/db/molde";
import { requireUser } from "@/lib/auth/guard";

// Resets the user's molde to the blank molde (no pieces, empty chat, v0).
export async function POST() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const state = await resetMolde(gate.id);
  return NextResponse.json({ status: "ok", state });
}
