import { NextResponse } from "next/server";
import { addMessage, applySizes, bumpVersion, debitCredits, getState } from "@/lib/mock-data";
import { ALL_SIZES, COSTS, SizeLabel } from "@/lib/types";
import { formatList } from "@/lib/format";

export async function POST(request: Request) {
  let body: { sizes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "error", error: "Corpo inválido." }, { status: 400 });
  }
  const sizes = Array.isArray(body.sizes)
    ? (body.sizes.filter((s): s is SizeLabel => (ALL_SIZES as string[]).includes(s as string)))
    : [];
  if (sizes.length === 0) {
    return NextResponse.json(
      { status: "error", error: "Nenhum tamanho válido para graduar." },
      { status: 400 },
    );
  }
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
    text: `Graduação aplicada para ${formatList(sizes)}.`,
    chips: [{ label: `−${cost} créditos`, tone: "credit" }],
    createdAt: Date.now(),
  });

  return NextResponse.json({ status: "ok", state: getState() });
}
