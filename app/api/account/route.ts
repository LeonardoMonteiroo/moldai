import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/body";
import { requireUser } from "@/lib/auth/guard";
import { apiError, ERROR_STATUS } from "@/lib/api/errors";
import { verifyForDeletion } from "@/lib/account/settings";
import { verifyPassword } from "@/lib/auth/hash";
import { getUserById, deleteUser } from "@/lib/db/users";

export async function DELETE(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;

  const user = await getUserById(gate.id);
  if (!user) {
    return apiError("account_not_found", ERROR_STATUS.account_not_found);
  }

  const ok = await verifyForDeletion(
    { verify: verifyPassword },
    body.password,
    user.passwordHash,
  );
  if (!ok) return apiError("wrong_password", 400);

  await deleteUser(gate.id);
  return NextResponse.json({ status: "ok" });
}
