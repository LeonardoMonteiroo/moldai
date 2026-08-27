import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api/body";
import { AccountPasswordBodySchema } from "@/lib/schemas/account";
import { requireUser } from "@/lib/auth/guard";
import { apiError, ERROR_STATUS } from "@/lib/api/errors";
import { changePassword } from "@/lib/account/settings";
import type { ChangePasswordResult } from "@/lib/account/settings";
import { verifyPassword, hashPassword } from "@/lib/auth/hash";
import { getUserById, updateUserPasswordHash } from "@/lib/db/users";

// Domain codes carry their own status here, mirroring app/api/signup/route.ts's
// local STATUS map. Both are client-fixable input errors, so both are 400.
const DOMAIN_STATUS: Record<
  Extract<ChangePasswordResult, { ok: false }>["error"],
  number
> = { wrong_password: 400, weak_password: 400 };

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const body = await parseBody(request, AccountPasswordBodySchema);
  if (body instanceof NextResponse) return body;

  const user = await getUserById(gate.id);
  if (!user) {
    return apiError("account_not_found", ERROR_STATUS.account_not_found);
  }

  const result = await changePassword(
    { verify: verifyPassword, hash: hashPassword },
    body.currentPassword,
    body.newPassword,
    user.passwordHash,
  );
  if (!result.ok) {
    return apiError(result.error, DOMAIN_STATUS[result.error]);
  }

  await updateUserPasswordHash(gate.id, result.newHash);
  return NextResponse.json({ status: "ok" });
}
