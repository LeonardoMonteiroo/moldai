import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { getState } from "@/lib/mock-data";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  return NextResponse.json(getState());
}
