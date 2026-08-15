import { NextResponse } from "next/server";
import { resetState } from "@/lib/mock-data";

// Resets the in-memory editor state back to the blank molde (no pieces, empty
// chat, version 0). Mirrors the seed used on server start.
export async function POST() {
  const state = resetState();
  return NextResponse.json({ status: "ok", state });
}
