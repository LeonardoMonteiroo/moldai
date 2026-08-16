import { NextResponse } from "next/server";
import { addMessage, bumpVersion, getState, refitManga, setConflict } from "@/lib/mock-data";
import { requireUser } from "@/lib/auth/guard";

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  let action: "fix" | "ignore" = "ignore";
  try {
    const body = (await request.json()) as { action?: unknown };
    if (body.action === "fix") action = "fix";
  } catch {
    return NextResponse.json({ status: "error", error: "Corpo inválido." }, { status: 400 });
  }

  if (action === "fix") {
    // Refaz a copa da manga para a cava ajustada e re-drafta; o conflito some
    // porque as costuras voltam a bater (correção gratuita, sem debitar).
    refitManga();
    bumpVersion();
    addMessage({
      id: `msg-${Date.now()}-ai`,
      author: "ai",
      text: "Copa da manga refeita para a cava ajustada — as costuras voltaram a bater.",
      chips: [{ label: "correção gratuita", tone: "neutral" }],
      createdAt: Date.now(),
    });
  } else {
    // Ignorar: mantém as peças divergentes, só remove o aviso.
    setConflict(null);
  }

  return NextResponse.json({ status: "ok", state: getState() });
}
