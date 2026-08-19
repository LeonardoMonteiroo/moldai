import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { listPatternsForUser, createPattern } from "@/lib/db/pattern";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const patterns = await listPatternsForUser(gate.id);
  return NextResponse.json(patterns);
}

export async function POST() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const id = await createPattern(gate.id);
  return NextResponse.json({ id });
}
