import { NextResponse } from "next/server";
import { withMolde } from "@/lib/db/molde";
import { addMessage, bumpVersion, refitManga, setConflict } from "@/lib/editor/state";
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

  return withMolde(gate.id, (state) => {
    if (action === "fix") {
      refitManga(state);
      bumpVersion(state);
      addMessage(state, {
        id: `msg-${Date.now()}-ai`,
        author: "ai",
        text: "Copa da manga refeita para a cava ajustada — as costuras voltaram a bater.",
        chips: [{ label: "correção gratuita", tone: "neutral" }],
        createdAt: Date.now(),
      });
    } else {
      setConflict(state, null);
    }
    return NextResponse.json({ status: "ok", state });
  });
}
