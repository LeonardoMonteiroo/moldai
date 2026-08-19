import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { changePassword } from "@/lib/account/settings";
import { verifyPassword, hashPassword } from "@/lib/auth/hash";
import { getUserById, updateUserPasswordHash } from "@/lib/db/users";

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  let body: { currentPassword?: unknown; newPassword?: unknown };
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

  const result = await changePassword(
    { verify: verifyPassword, hash: hashPassword },
    body.currentPassword,
    body.newPassword,
    user.passwordHash,
  );
  if (!result.ok) {
    const error =
      result.error === "wrong_password"
        ? "Senha atual incorreta."
        : "A nova senha deve ter pelo menos 8 caracteres.";
    return NextResponse.json({ status: "error", error }, { status: 400 });
  }

  await updateUserPasswordHash(gate.id, result.newHash);
  return NextResponse.json({ status: "ok" });
}
