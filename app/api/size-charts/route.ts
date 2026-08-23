import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/body";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import {
  listSizeChartsForUser,
  getActiveSizeChartId,
  createSizeChart,
} from "@/lib/db/sizeChart";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  // Not inside a transaction here, so the module-level client is passed
  // straight through — see #67's comment on ensureSystemSizeCharts.
  const [charts, activeSizeChartId] = await Promise.all([
    listSizeChartsForUser(prisma, gate.id),
    getActiveSizeChartId(prisma, gate.id),
  ]);
  return NextResponse.json(
    charts.map((c) => ({ ...c, isActive: c.id === activeSizeChartId })),
  );
}

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  // This route tolerates an unusable body -- it just means "no sourceId", i.e.
  // create a blank chart -- so the guard result is folded into `sourceId`
  // rather than returned. Only the crash on `null` is being fixed here.
  const body = await readJsonObject(request);
  const sourceId =
    !(body instanceof NextResponse) && typeof body.sourceId === "string"
      ? body.sourceId
      : undefined;
  const t = await getTranslations("SizeCharts");
  const chart = await createSizeChart(gate.id, t("copySuffix"), sourceId);
  return NextResponse.json(chart);
}
