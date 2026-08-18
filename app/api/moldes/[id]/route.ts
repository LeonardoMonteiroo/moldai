import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import {
  loadMolde,
  renameMolde,
  deleteMolde,
  moldeNotFound,
} from "@/lib/db/molde";
import { loadWallet } from "@/lib/db/wallet";
import { composeEditorState } from "@/lib/api/compose";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const [moldeState, wallet] = await Promise.all([
    loadMolde(id, gate.id),
    loadWallet(gate.id),
  ]);
  if (!moldeState) return moldeNotFound();
  return NextResponse.json(composeEditorState(moldeState, wallet, new Date()));
}

export async function PATCH(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", error: "Corpo inválido." },
      { status: 400 },
    );
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json(
      { status: "error", error: "Nome obrigatório." },
      { status: 400 },
    );
  }
  const ok = await renameMolde(id, gate.id, name);
  if (!ok) return moldeNotFound();
  return NextResponse.json({ status: "ok" });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const ok = await deleteMolde(id, gate.id);
  if (!ok) return moldeNotFound();
  return NextResponse.json({ status: "ok" });
}
