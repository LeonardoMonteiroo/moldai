import { NextResponse } from "next/server";
import { createAccount } from "@/lib/account/signup";
import type { SignupErrorCode } from "@/lib/account/signup";
import { hashPassword } from "@/lib/auth/hash";
import { getUserByEmail, createUser } from "@/lib/db/users";

// The only unauthenticated route handler in the app besides NextAuth's own, so
// it deliberately does not call requireUser(). It sits at the top level rather
// than under /api/auth/* (which the [...nextauth] catch-all owns) or
// /api/account/* (uniformly session-gated).
const STATUS: Record<SignupErrorCode, number> = {
  invalid_name: 400,
  invalid_email: 400,
  weak_password: 400,
  email_taken: 409,
  bad_body: 400,
};

export async function POST(request: Request) {
  let body: { name?: unknown; email?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", error: "bad_body" },
      { status: STATUS.bad_body },
    );
  }

  const result = await createAccount(
    { getUserByEmail, createUser, hash: hashPassword },
    { name: body.name, email: body.email, password: body.password },
  );
  if (!result.ok) {
    return NextResponse.json(
      { status: "error", error: result.error },
      { status: STATUS[result.error] },
    );
  }

  // No user fields are echoed back — the client already has the name and email
  // it typed, and the record carries the password hash.
  return NextResponse.json({ status: "ok" });
}
