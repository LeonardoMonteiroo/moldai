import { NextResponse } from "next/server";
import {
  addMessage,
  applyGarmentSpec,
  bumpVersion,
  debitCredits,
  getState,
  refundCredits,
} from "@/lib/mock-data";
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
    return NextResponse.json({ status: "error", error: "Corpo inválido." }, { status: 400 });
  }
  const trimmed = typeof body.message === "string" ? body.message.trim() : "";
  if (!trimmed) {
    return NextResponse.json({ status: "error", error: "Mensagem obrigatória." }, { status: 400 });
  }
  const answering = body.answering === true;
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
    const decision = await proposeGarment(getState(), answering);

    if (decision.decision === "ask") {
      addMessage({
        id: `msg-${Date.now()}-ai`,
        author: "ai",
        text: decision.assistantMessage || "Pra acertar a modelagem, me responde:",
        questions: decision.questions,
        createdAt: Date.now(),
      });
      refundCredits(cost);
      return NextResponse.json({ status: "clarify", state: getState() });
    }

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

    applyGarmentSpec(decision.spec);
    bumpVersion();
    // apply-with-warning: se as costuras divergirem, applyGarmentSpec anexou um
    // conflito — a geração aplica mesmo assim, mas a mensagem sinaliza o aviso.
    const conflict = getState().conflict;
    addMessage({
      id: `msg-${Date.now()}-ai`,
      author: "ai",
      text: conflict
        ? `${decision.assistantMessage} ⚠️ ${conflict.description}`
        : decision.assistantMessage,
      chips: [{ label: `−${cost} crédito`, tone: "credit" }],
      tone: conflict ? "conflict" : undefined,
      createdAt: Date.now(),
    });
    return NextResponse.json({ status: conflict ? "conflict" : "ok", state: getState() });
  } catch {
    refundCredits(cost);
    return NextResponse.json({ status: "error", state: getState() });
  }
}
