import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { createSizeChart } from "@/lib/db/sizeChart";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const chart = await createSizeChart(gate.id, id);
  return NextResponse.json(chart);
}
