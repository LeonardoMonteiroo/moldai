import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { readJsonObject } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { stampOnboarded, isWorkStyle } from "@/lib/db/users";

// Stamps the post-signup onboarding wizard as seen -- called by both "Pular
// por agora" and step 3's successful submit. `workStyle` is optional (a skip
// carries none) and, if present, must be one of the closed set step 1
// offers -- an unrecognised value is rejected rather than silently stored,
// the same trust-boundary shape validateName/isPurchaseType already follow.
export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;

  if (body.workStyle !== undefined && !isWorkStyle(body.workStyle)) {
    return apiError("invalid_work_style", 400);
  }

  await stampOnboarded(
    gate.id,
    isWorkStyle(body.workStyle) ? body.workStyle : undefined,
  );
  return NextResponse.json({ status: "ok" });
}
