import { NextResponse } from "next/server";
import { addMessage, applySizes, bumpVersion, debitCredits, getState } from "@/lib/mock-data";
import { COSTS } from "@/lib/types";

export async function POST(request: Request) {
  const { sizes } = (await request.json()) as { sizes: string[] };
  const state = getState();
  const cost = COSTS.graduate;

  if (state.credits.balance < cost) {
    return NextResponse.json(
      { status: "insufficient_credits", required: cost, balance: state.credits.balance },
      { status: 402 },
    );
  }

  debitCredits(cost);
  applySizes(sizes);
  bumpVersion();
  addMessage({
    id: `msg-${Date.now()}-ai`,
    author: "ai",
    text: `Graduação aplicada para ${sizes.join(" e ")}.`,
    chips: [{ label: `−${cost} créditos`, tone: "credit" }],
    createdAt: Date.now(),
  });

  return NextResponse.json({ status: "ok", state: getState() });
}
