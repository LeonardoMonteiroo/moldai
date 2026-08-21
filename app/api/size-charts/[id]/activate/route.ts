import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { setActiveSizeChart } from "@/lib/db/sizeChart";
import { apiError, ERROR_STATUS } from "@/lib/api/errors";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const ok = await setActiveSizeChart(gate.id, id);
  if (!ok) {
    return apiError("size_chart_not_found", ERROR_STATUS.size_chart_not_found);
  }
  return NextResponse.json({ status: "ok" });
}
