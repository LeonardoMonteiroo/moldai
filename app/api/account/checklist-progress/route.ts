import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { readJsonObject } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { isChecklistEvent, recordChecklistEvent } from "@/lib/db/account";

// #232: fired best-effort from the export and import flows (lib/export/
// index.ts, lib/importStore.ts) to back the two dashboard onboarding
// checklist steps neither flow otherwise leaves any server-side trace for.
export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;

  if (!isChecklistEvent(body.event)) {
    return apiError("invalid_checklist_event", 400);
  }

  await recordChecklistEvent(gate.id, body.event);
  return NextResponse.json({ status: "ok" });
}
