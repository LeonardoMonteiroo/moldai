import { NextResponse } from "next/server";
import { resetMolde } from "@/lib/db/molde";
import { requireUser } from "@/lib/auth/guard";

// Reseta o molde do usuário para o blank molde (sem peças, chat vazio, v0).
export async function POST() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const state = await resetMolde(gate.id);
  return NextResponse.json({ status: "ok", state });
}
