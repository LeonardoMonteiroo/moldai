import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api/body";
import { CreateSizeChartBodySchema } from "@/lib/schemas/sizeChart";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/guard";
import { prisma } from "@/lib/db/prisma";
import {
  listSizeChartsForUser,
  getActiveSizeChartId,
  createSizeChart,
  createSizeChartFromImport,
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
  // create a blank chart -- so the parse result is folded into `sourceId`
  // rather than returned: a malformed/null/non-object body, or a sourceId of
  // the wrong type, all resolve to "no sourceId" instead of a 400.
  const body = await parseBody(request, CreateSizeChartBodySchema);
  const sourceId = body instanceof NextResponse ? undefined : body.sourceId;
  // #12: an imported spreadsheet's candidate chart, alongside the existing
  // sourceId path -- createSizeChartFromImport routes it through the same
  // validateSizeChartPatch trust boundary a hand-typed PATCH body goes
  // through, so it's forwarded as-is (`unknown`) rather than shaped here.
  const importedChart =
    !(body instanceof NextResponse) &&
    typeof body.chart === "object" &&
    body.chart !== null
      ? body.chart
      : undefined;
  const t = await getTranslations("SizeCharts");
  const chart = importedChart
    ? await createSizeChartFromImport(gate.id, t, importedChart)
    : await createSizeChart(gate.id, t, sourceId);
  // #64: only reachable when an explicit sourceId was given and didn't
  // resolve -- the bodyless/no-sourceId and imported-chart paths always
  // succeed and never return null.
  if (!chart) {
    return apiError("size_chart_not_found", ERROR_STATUS.size_chart_not_found);
  }
  return NextResponse.json(chart);
}
