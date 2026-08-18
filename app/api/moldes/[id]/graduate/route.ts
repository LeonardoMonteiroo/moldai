import { NextResponse } from "next/server";
import { withMoldeAndWallet } from "@/lib/db/molde-wallet";
import { moldeNotFound } from "@/lib/db/molde";
import { addMessage, applySizes, bumpVersion } from "@/lib/editor/state";
import { debitWallet } from "@/lib/billing/wallet";
import type { LedgerEntry } from "@/lib/billing/wallet";
import { composeEditorState } from "@/lib/api/compose";
import { ALL_SIZES, COSTS, SizeLabel } from "@/lib/types";
import { formatList } from "@/lib/format";
import { requireUser } from "@/lib/auth/guard";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  let body: { sizes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", error: "Corpo inválido." },
      { status: 400 },
    );
  }
  const sizes = Array.isArray(body.sizes)
    ? body.sizes.filter((s): s is SizeLabel =>
        (ALL_SIZES as string[]).includes(s as string),
      )
    : [];
  if (sizes.length === 0) {
    return NextResponse.json(
      { status: "error", error: "Nenhum tamanho válido para graduar." },
      { status: 400 },
    );
  }
  const cost = COSTS.graduate;
  const now = new Date();

  const result = await withMoldeAndWallet(
    id,
    gate.id,
    (state, wallet): { result: NextResponse; entries: LedgerEntry[] } => {
      if (wallet.balance < cost) {
        return {
          result: NextResponse.json(
            {
              status: "insufficient_credits",
              required: cost,
              balance: wallet.balance,
            },
            { status: 402 },
          ),
          entries: [],
        };
      }
      const entry = debitWallet(wallet, cost, "graduate");
      applySizes(state, sizes);
      bumpVersion(state);
      addMessage(state, {
        id: `msg-${Date.now()}-ai`,
        author: "ai",
        text: `Graduação aplicada para ${formatList(sizes)}.`,
        chips: [{ label: `−${cost} créditos`, tone: "credit" }],
        createdAt: Date.now(),
      });
      return {
        result: NextResponse.json({
          status: "ok",
          state: composeEditorState(state, wallet, now),
        }),
        entries: [entry],
      };
    },
  );
  return result ?? moldeNotFound();
}
