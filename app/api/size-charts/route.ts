import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import {
  listSizeChartsForUser,
  getActiveSizeChartId,
  createSizeChart,
} from "@/lib/db/sizeChart";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const [charts, activeSizeChartId] = await Promise.all([
    listSizeChartsForUser(gate.id),
    getActiveSizeChartId(gate.id),
  ]);
  return NextResponse.json(
    charts.map((c) => ({ ...c, isActive: c.id === activeSizeChartId })),
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
  const chart = await createSizeChart(gate.id, sourceId);
  return NextResponse.json(chart);
}
