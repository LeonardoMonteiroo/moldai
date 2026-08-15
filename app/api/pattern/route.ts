import { NextResponse } from "next/server";
import { getState } from "@/lib/mock-data";

export async function GET() {
  return NextResponse.json(getState());
}
