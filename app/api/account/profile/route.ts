import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { validateName } from "@/lib/account/settings";
import { updateUserName } from "@/lib/db/users";

export async function PATCH(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", error: "Corpo inválido." },
      { status: 400 },
    );
  }

  const name = validateName(body.name);
  if (!name) {
    return NextResponse.json(
      { status: "error", error: "Nome obrigatório." },
      { status: 400 },
    );
  }

  await updateUserName(gate.id, name);
  return NextResponse.json({ status: "ok", name, email: gate.email });
}
