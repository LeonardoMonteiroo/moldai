import type { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireUserFrom } from "./session";
import type { SessionUser } from "./types";

export async function requireUser(): Promise<SessionUser | NextResponse> {
  return requireUserFrom(await auth());
}
