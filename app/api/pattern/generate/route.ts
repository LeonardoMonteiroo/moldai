import { NextResponse } from "next/server";
import {
  addMessage,
  bumpVersion,
  buildConflict,
  debitCredits,
  getState,
  refundCredits,
  setConflict,
  updatePieceParams,
} from "@/lib/mock-data";
import { COSTS } from "@/lib/types";
import { proposePatternChange } from "@/lib/ai";

export async function POST(request: Request) {
  const { message } = (await request.json()) as { message: string };
  const trimmed = message.trim();
  const state = getState();
  const cost = COSTS.adjust;

  if (state.credits.balance < cost) {
    return NextResponse.json(
      { status: "insufficient_credits", required: cost, balance: state.credits.balance },
      { status: 402 },
    );
  }

  addMessage({ id: `msg-${Date.now()}-u`, author: "user", text: trimmed, createdAt: Date.now() });
  debitCredits(cost);

  try {
    const decision = await proposePatternChange(getState());

    if (decision.decision === "decline") {
      addMessage({
        id: `msg-${Date.now()}-ai`,
        author: "ai",
        text: decision.assistantMessage || decision.declineReason || "Não consegui aplicar esse pedido.",
        createdAt: Date.now(),
      });
      refundCredits(cost);
      return NextResponse.json({ status: "declined", state: getState() });
    }

    for (const change of decision.pieceChanges) {
      updatePieceParams(change.pieceId, change.params);
    }

    if (decision.decision === "conflict" && decision.conflict) {
      setConflict(buildConflict(decision.conflict));
      bumpVersion();
      addMessage({
        id: `msg-${Date.now()}-ai`,
        author: "ai",
        text: decision.assistantMessage,
        tone: "conflict",
        chips: [{ label: `−${cost} crédito`, tone: "credit" }],
        createdAt: Date.now(),
      });
      return NextResponse.json({ status: "conflict", state: getState() });
    }

    bumpVersion();
    addMessage({
      id: `msg-${Date.now()}-ai`,
      author: "ai",
      text: decision.assistantMessage,
      chips: [{ label: `−${cost} crédito`, tone: "credit" }],
      createdAt: Date.now(),
    });
    return NextResponse.json({ status: "ok", state: getState() });
  } catch {
    refundCredits(cost);
    return NextResponse.json({ status: "error", state: getState() });
  }
}
