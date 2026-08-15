import { NextResponse } from "next/server";
import {
  addMessage,
  bumpVersion,
  buildConflict,
  debitCredits,
  getState,
  refundCredits,
  setConflict,
} from "@/lib/mock-data";
import { COSTS } from "@/lib/types";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

  addMessage({
    id: `msg-${Date.now()}-u`,
    author: "user",
    text: trimmed,
    createdAt: Date.now(),
  });
  debitCredits(cost);

  await delay(1400);

  const lower = trimmed.toLowerCase();

  if (lower.includes("forçar erro") || lower === "erro") {
    refundCredits(cost);
    addMessage({
      id: `msg-${Date.now()}-ai`,
      author: "ai",
      text: "Não consegui concluir esse ajuste — houve um erro na geração. Seus créditos foram devolvidos.",
      tone: "conflict",
      createdAt: Date.now(),
    });
    return NextResponse.json({ status: "error", state: getState() });
  }

  if (lower.includes("cava")) {
    const conflict = buildConflict();
    setConflict(conflict);
    addMessage({
      id: `msg-${Date.now()}-ai`,
      author: "ai",
      text: "A cava da frente ficou 1,8 cm maior que a da manga. As costuras não fecham.",
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
    text: "Ajuste aplicado ao molde.",
    chips: [{ label: `−${cost} crédito`, tone: "credit" }],
    createdAt: Date.now(),
  });

  return NextResponse.json({ status: "ok", state: getState() });
}
