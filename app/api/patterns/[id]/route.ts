import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import {
  loadPattern,
  renamePattern,
  deletePattern,
  patternNotFound,
} from "@/lib/db/pattern";
import { loadWallet } from "@/lib/db/wallet";
import { composeEditorState } from "@/lib/api/compose";
import { apiError, ERROR_STATUS } from "@/lib/api/errors";

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
  return NextResponse.json(
    composeEditorState(loaded.state, wallet, new Date(), loaded.updatedAt),
  );
}

export async function PATCH(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError("bad_body", ERROR_STATUS.bad_body);
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return apiError("invalid_name", 400);
  const ok = await renamePattern(id, gate.id, name);
  if (!ok) return patternNotFound();
  return NextResponse.json({ status: "ok" });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const ok = await deletePattern(id, gate.id);
  if (!ok) return patternNotFound();
  return NextResponse.json({ status: "ok" });
}
