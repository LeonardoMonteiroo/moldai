import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import {
  loadPattern,
  renamePattern,
  deletePattern,
  patternNotFound,
} from "@/lib/db/pattern";
import { loadWallet } from "@/lib/db/wallet";
import { composeEditorState } from "@/lib/api/compose";
import { apiError } from "@/lib/api/errors";
import { MAX_PATTERN_NAME_LENGTH } from "@/lib/types";
import { readJsonObject, hasNulByte } from "@/lib/api/body";
import { reportError } from "@/lib/observability/report";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const [loaded, wallet] = await Promise.all([
    loadPattern(id, gate.id),
    loadWallet(gate.id),
  ]);
  if (!loaded) return patternNotFound();
  // #62: requireUser() just confirmed this account exists -- null here means
  // it was deleted in the instant between that check and this one.
  if (!wallet) return unauthorized();
  return NextResponse.json(
    composeEditorState(loaded.state, wallet, new Date(), loaded.updatedAt),
  );
}

export async function PATCH(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  // #69: a NUL byte survives .trim() and .length, then aborts the jsonb
  // write with no coded error -- reject it here, at the boundary, rather
  // than where it lands.
  if (!name || name.length > MAX_PATTERN_NAME_LENGTH || hasNulByte(name)) {
    return apiError("invalid_name", 400);
  }
  // #69: belt-and-braces alongside the intake guard above -- this route had
  // no catch at all, unlike generate/graduate (#61), so any other write
  // failure inside withPattern (a dropped connection, a future jsonb-hostile
  // value the intake guard doesn't yet know about) escaped as a bare,
  // uncoded HTTP 500 instead of a coded response.
  let ok: boolean;
  try {
    ok = await renamePattern(id, gate.id, name);
  } catch (err) {
    reportError("patterns.rename", err, { patternId: id, userId: gate.id });
    return apiError("service_unavailable", 503);
  }
  if (!ok) return patternNotFound();
  return NextResponse.json({ status: "ok" });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  let ok: boolean;
  try {
    ok = await deletePattern(id, gate.id);
  } catch (err) {
    reportError("patterns.delete", err, { patternId: id, userId: gate.id });
    return apiError("service_unavailable", 503);
  }
  if (!ok) return patternNotFound();
  return NextResponse.json({ status: "ok" });
}
