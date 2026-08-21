import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/body";
import { withWallet } from "@/lib/db/wallet";
import { loadPattern, patternNotFound } from "@/lib/db/pattern";
import { applyPurchase, isPurchaseType } from "@/lib/billing/wallet";
import { buildCredits, composeEditorState } from "@/lib/api/compose";
import { apiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/guard";

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  // Validate before any wallet work: an unrecognised type must not reach
  // applyPurchase, which would otherwise grant the paid plan.
  if (!isPurchaseType(body.type)) {
    return apiError("invalid_purchase_type", 400);
  }
  const type = body.type;
  const patternId = typeof body.patternId === "string" ? body.patternId : null;
  const now = new Date();

  // The pattern is resolved *before* the wallet is touched. Charging first and
  // then 404'ing left the credits added but unreported to the client.
  const loaded = patternId ? await loadPattern(patternId, gate.id) : null;
  if (patternId && !loaded) return patternNotFound();

  const wallet = await withWallet(gate.id, (wallet) => {
    const entry = applyPurchase(wallet, type, now);
    return { result: wallet, entries: [entry] };
  });

  if (loaded) {
    return NextResponse.json({
      status: "ok",
      state: composeEditorState(loaded.state, wallet, now, loaded.updatedAt),
    });
  }

  return NextResponse.json({
    status: "ok",
    credits: buildCredits(wallet, now),
  });
}
