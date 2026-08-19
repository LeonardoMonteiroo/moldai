import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { setActiveSizeChart } from "@/lib/db/sizeChart";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const ok = await setActiveSizeChart(gate.id, id);
  if (!ok) {
    return NextResponse.json(
      { status: "not_found", error: "Grade não encontrada." },
      { status: 404 },
    );
  }
  return NextResponse.json({ status: "ok" });
}
