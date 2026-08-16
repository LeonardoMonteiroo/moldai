import { NextResponse } from "next/server";
import type { SessionUser } from "./types";

export function sessionUser(session: unknown): SessionUser | null {
  const u = (
    session as {
      user?: { id?: unknown; email?: unknown; name?: unknown };
    } | null
  )?.user;
  if (!u || typeof u.id !== "string" || typeof u.email !== "string")
    return null;
  return {
    id: u.id,
    email: u.email,
    name: typeof u.name === "string" ? u.name : null,
  };
}

export function unauthorized(): NextResponse {
  return NextResponse.json(
    { status: "unauthorized", error: "Login necessário." },
    { status: 401 },
  );
}

export function requireUserFrom(session: unknown): SessionUser | NextResponse {
  return sessionUser(session) ?? unauthorized();
}
