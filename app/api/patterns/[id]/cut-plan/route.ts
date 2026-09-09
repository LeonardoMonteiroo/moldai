import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import {
  loadPattern,
  updatePatternCutQuantities,
  patternNotFound,
} from "@/lib/db/pattern";
import { validateCutQuantities } from "@/lib/export/cutQuantities";
import { CutQuantitiesBodySchema } from "@/lib/schemas/pattern";
import { parseBody } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { reportError } from "@/lib/observability/report";

type Ctx = { params: Promise<{ id: string }> };

// #280: the "Quantidade por tamanho" panel's own sub-resource, mirroring
// /graduate and /conflict/resolve rather than overloading the rename-only
// PATCH /api/patterns/[id]. Reads the pattern first (not inside
// updatePatternCutQuantities's own transaction) purely to know
// baseSize/sizesApplied for validateCutQuantities -- the write below is
// re-scoped to (id, userId) again by withPattern, so a pattern deleted or
// reassigned in the gap between the two still 404s rather than writing.
export async function PATCH(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const body = await parseBody(request, CutQuantitiesBodySchema);
  if (body instanceof NextResponse) return body;

  const loaded = await loadPattern(id, gate.id);
  if (!loaded) return patternNotFound();
  const availableSizes = Array.from(
    new Set([
      loaded.state.pattern.baseSize,
      ...loaded.state.pattern.sizesApplied,
    ]),
  );
  const cutQuantities = validateCutQuantities(
    body.cutQuantities,
    availableSizes,
  );

  let ok: boolean;
  try {
    ok = await updatePatternCutQuantities(id, gate.id, cutQuantities);
  } catch (err) {
    reportError("patterns.cutPlan", err, { patternId: id, userId: gate.id });
    return apiError("service_unavailable", 503);
  }
  if (!ok) return patternNotFound();
  return NextResponse.json({ status: "ok" });
}
