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
import { apiError, ERROR_STATUS } from "@/lib/api/errors";
import { consume } from "@/lib/rate-limit/consume";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const t = await getTranslations("SizeCharts");
  // Not inside a transaction here, so the module-level client is passed
  // straight through — see #67's comment on ensureSystemSizeCharts.
  const [charts, activeSizeChartId] = await Promise.all([
    listSizeChartsForUser(prisma, gate.id, t),
    getActiveSizeChartId(prisma, gate.id),
  ]);
  return NextResponse.json(
    charts.map((c) => ({ ...c, isActive: c.id === activeSizeChartId })),
  );
}

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  // #101: see the identical guard on POST /api/patterns.
  const limited = await consume("create", gate.id);
  if (!limited.allowed) {
    return apiError("rate_limited", 429, {
      "Retry-After": String(limited.retryAfterSec),
    });
  }
  // This route tolerates an unusable body -- it just means "no sourceId", i.e.
  // create a blank chart -- so the guard result is folded into `sourceId`
  // rather than returned. Only the crash on `null` is being fixed here.
  const body = await readJsonObject(request);
  const sourceId =
    !(body instanceof NextResponse) && typeof body.sourceId === "string"
      ? body.sourceId
      : undefined;
  const t = await getTranslations("SizeCharts");
  const chart = await createSizeChart(gate.id, t, sourceId);
  // #64: only reachable when an explicit sourceId was given and didn't
  // resolve -- the bodyless/no-sourceId path always falls back to the
  // system chart and never returns null.
  if (!chart) {
    return apiError("size_chart_not_found", ERROR_STATUS.size_chart_not_found);
  }
  return NextResponse.json(chart);
}
