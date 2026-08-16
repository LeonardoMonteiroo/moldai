import { NextResponse } from "next/server";
import { applyPurchase, getState } from "@/lib/mock-data";
import { requireUser } from "@/lib/auth/guard";

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const { type } = (await request.json()) as { type: "topup" | "subscribe" };
  applyPurchase(type);
  return NextResponse.json({ status: "ok", state: getState() });
}
