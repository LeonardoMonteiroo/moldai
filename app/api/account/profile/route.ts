import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { apiError, ERROR_STATUS } from "@/lib/api/errors";
import { validateName } from "@/lib/account/settings";
import { updateUserName } from "@/lib/db/users";

export async function PATCH(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  let body: { name?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiError("bad_body", ERROR_STATUS.bad_body);
  }

  const name = validateName(body.name);
  if (!name) return apiError("invalid_name", 400);

  await updateUserName(gate.id, name);
  return NextResponse.json({ status: "ok", name, email: gate.email });
}
