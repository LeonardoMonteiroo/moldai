import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import {
  listGradesForUser,
  getActiveGradeId,
  createGrade,
} from "@/lib/db/grade";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const [grades, activeGradeId] = await Promise.all([
    listGradesForUser(gate.id),
    getActiveGradeId(gate.id),
  ]);
  return NextResponse.json(
    grades.map((g) => ({ ...g, isActive: g.id === activeGradeId })),
  );
}

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  let body: { sourceId?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const sourceId =
    typeof body.sourceId === "string" ? body.sourceId : undefined;
  const grade = await createGrade(gate.id, sourceId);
  return NextResponse.json(grade);
}
