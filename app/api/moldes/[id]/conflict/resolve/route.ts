import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { withMolde, moldeNotFound } from "@/lib/db/molde";
import { loadWallet } from "@/lib/db/wallet";
import { composeEditorState } from "@/lib/api/compose";
import {
  addMessage,
  bumpVersion,
  refitSleeve,
  setConflict,
} from "@/lib/editor/state";
import { requireUser } from "@/lib/auth/guard";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  let action: "fix" | "ignore" = "ignore";
  try {
    const body = (await request.json()) as { action?: unknown };
    if (body.action === "fix") action = "fix";
  } catch {
    return NextResponse.json(
      { status: "error", error: "Corpo inválido." },
      { status: 400 },
    );
  }

  const t = await getTranslations("PatternData");

  const moldeState = await withMolde(id, gate.id, (state) => {
    if (action === "fix") {
      refitSleeve(state, t);
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
    return state;
  });
  if (!moldeState) return moldeNotFound();

  const wallet = await loadWallet(gate.id);
  return NextResponse.json({
    status: "ok",
    state: composeEditorState(moldeState, wallet, new Date()),
  });
}
