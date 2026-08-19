import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { verifyForDeletion } from "@/lib/account/settings";
import { verifyPassword } from "@/lib/auth/hash";
import { getUserById, deleteUser } from "@/lib/db/users";

export async function DELETE(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", error: "Corpo inválido." },
      { status: 400 },
    );
  }

  const user = await getUserById(gate.id);
  if (!user) {
    return NextResponse.json(
      { status: "error", error: "Conta não encontrada." },
      { status: 404 },
    );
  }

  const ok = await verifyForDeletion(
    { verify: verifyPassword },
    body.password,
    user.passwordHash,
  );
  if (!ok) {
    return NextResponse.json(
      { status: "error", error: "Senha incorreta." },
      { status: 400 },
    );
  }

  await deleteUser(gate.id);
  return NextResponse.json({ status: "ok" });
}
