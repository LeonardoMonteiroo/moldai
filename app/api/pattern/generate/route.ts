import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { withMolde } from "@/lib/db/molde";
import {
  addMessage,
  applyGarmentSpec,
  bumpVersion,
  debitCredits,
  refundCredits,
} from "@/lib/editor/state";
import { COSTS } from "@/lib/types";
import { proposeGarment } from "@/lib/ai";
import { requireUser } from "@/lib/auth/guard";

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  let body: { message?: unknown; answering?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", error: "Corpo inválido." },
      { status: 400 },
    );
  }
  const trimmed = typeof body.message === "string" ? body.message.trim() : "";
  if (!trimmed) {
    return NextResponse.json(
      { status: "error", error: "Mensagem obrigatória." },
      { status: 400 },
    );
  }
  const answering = body.answering === true;
  const cost = COSTS.adjust;
  const t = await getTranslations("PatternData");

  return withMolde(gate.id, async (state) => {
    if (state.credits.balance < cost) {
      return NextResponse.json(
        {
          status: "insufficient_credits",
          required: cost,
          balance: state.credits.balance,
        },
        { status: 402 },
      );
    }

    addMessage(state, {
      id: `msg-${Date.now()}-u`,
      author: "user",
      text: trimmed,
      createdAt: Date.now(),
    });
    debitCredits(state, cost);

    try {
      const decision = await proposeGarment(state, answering);

      if (decision.decision === "ask") {
        addMessage(state, {
          id: `msg-${Date.now()}-ai`,
          author: "ai",
          text:
            decision.assistantMessage ||
            "Pra acertar a modelagem, me responde:",
          questions: decision.questions,
          createdAt: Date.now(),
        });
        refundCredits(state, cost);
        return NextResponse.json({ status: "clarify", state });
      }

      if (decision.decision === "decline") {
        addMessage(state, {
          id: `msg-${Date.now()}-ai`,
          author: "ai",
          text:
            decision.assistantMessage ||
            decision.declineReason ||
            "Não consegui aplicar esse pedido.",
          createdAt: Date.now(),
        });
        refundCredits(state, cost);
        return NextResponse.json({ status: "declined", state });
      }

      applyGarmentSpec(state, decision.spec, t);
      bumpVersion(state);
      const conflict = state.conflict;
      addMessage(state, {
        id: `msg-${Date.now()}-ai`,
        author: "ai",
        text: conflict
          ? `${decision.assistantMessage} ⚠️ ${conflict.description}`
          : decision.assistantMessage,
        chips: [{ label: `−${cost} crédito`, tone: "credit" }],
        tone: conflict ? "conflict" : undefined,
        createdAt: Date.now(),
      });
      return NextResponse.json({ status: conflict ? "conflict" : "ok", state });
    } catch {
      refundCredits(state, cost);
      return NextResponse.json({ status: "error", state });
    }
  });
}
