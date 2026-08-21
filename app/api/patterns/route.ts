import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations("PatternData");
  const id = await createPattern(gate.id, t);
  return NextResponse.json({ id });
}
