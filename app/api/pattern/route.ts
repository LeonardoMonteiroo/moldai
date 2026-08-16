import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { loadMolde } from "@/lib/db/molde";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  return NextResponse.json(await loadMolde(gate.id));
}
