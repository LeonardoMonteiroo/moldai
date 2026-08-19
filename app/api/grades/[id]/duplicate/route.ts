import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { createGrade } from "@/lib/db/grade";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const grade = await createGrade(gate.id, id);
  return NextResponse.json(grade);
}
