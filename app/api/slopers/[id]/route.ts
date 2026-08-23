import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { readJsonObject, hasNulByte } from "@/lib/api/body";
import { apiError } from "@/lib/api/errors";
import { renameSloper, deleteSloper, sloperNotFound } from "@/lib/db/sloper";
import { MAX_PATTERN_NAME_LENGTH } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  // #69: see the identical guard on PATCH /api/patterns/[id].
  if (!name || name.length > MAX_PATTERN_NAME_LENGTH || hasNulByte(name)) {
    return apiError("invalid_name", 400);
  }

  const renamed = await renameSloper(id, gate.id, name);
  if (!renamed) return sloperNotFound();
  return NextResponse.json({ status: "ok" });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const deleted = await deleteSloper(id, gate.id);
  if (!deleted) return sloperNotFound();
  return NextResponse.json({ status: "ok" });
}
