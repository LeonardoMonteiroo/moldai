import { NextResponse } from "next/server";
import { resetState } from "@/lib/mock-data";
import { requireUser } from "@/lib/auth/guard";

// Resets the in-memory editor state back to the blank molde (no pieces, empty
// chat, version 0). Mirrors the seed used on server start.
export async function POST() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const state = resetState();
  return NextResponse.json({ status: "ok", state });
}
