import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { listMoldesForUser, createMolde } from "@/lib/db/molde";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const moldes = await listMoldesForUser(gate.id);
  return NextResponse.json(moldes);
}

export async function POST() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const id = await createMolde(gate.id);
  return NextResponse.json({ id });
}
