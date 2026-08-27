import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/body";
import { requireUser } from "@/lib/auth/guard";
import { updateSizeChart, deleteSizeChart } from "@/lib/db/sizeChart";
import { apiError, ERROR_STATUS } from "@/lib/api/errors";

type Ctx = { params: Promise<{ id: string }> };

function notFound(): NextResponse {
  return apiError("size_chart_not_found", ERROR_STATUS.size_chart_not_found);
}

export async function PATCH(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  // #152: deliberately still readJsonObject, not parseBody -- forwarded raw
  // on purpose. updateSizeChart's own lib/sizeCharts/validate.ts
  // validateSizeChartPatch owns the trust boundary here, with
  // drop-or-clamp-never-throw merge semantics (it needs the current row to
  // merge against, which a standalone schema can't see). A parseBody schema
  // would either duplicate that logic or regress it into reject-on-invalid,
  // breaking the documented behaviour that an unusable field is ignored
  // while the rest of the patch applies.
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const updated = await updateSizeChart(id, gate.id, body);
  if (!updated) return notFound();
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const ok = await deleteSizeChart(id, gate.id);
  if (!ok) return notFound();
  return NextResponse.json({ status: "ok" });
}
