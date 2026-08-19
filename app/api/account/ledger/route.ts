import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { getLedgerHistory } from "@/lib/db/account";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const ledger = await getLedgerHistory(gate.id, 30);
  return NextResponse.json({ ledger });
}
