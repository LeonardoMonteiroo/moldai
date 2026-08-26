import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { apiError } from "@/lib/api/errors";
import { parseBody } from "@/lib/api/body";
import { AccountProfilePatchSchema } from "@/lib/schemas/account";
import { validateName } from "@/lib/account/settings";
import { updateUserName } from "@/lib/db/users";

export async function PATCH(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const body = await parseBody(request, AccountProfilePatchSchema);
  if (body instanceof NextResponse) return body;

  const name = validateName(body.name);
  if (!name) return apiError("invalid_name", 400);

  await updateUserName(gate.id, name);
  return NextResponse.json({ status: "ok", name, email: gate.email });
}
