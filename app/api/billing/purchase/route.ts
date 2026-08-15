import { NextResponse } from "next/server";
import { applyPurchase, getState } from "@/lib/mock-data";

export async function POST(request: Request) {
  const { type } = (await request.json()) as { type: "topup" | "subscribe" };
  applyPurchase(type);
  return NextResponse.json({ status: "ok", state: getState() });
}
