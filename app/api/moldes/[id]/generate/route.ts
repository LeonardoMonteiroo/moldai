import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { withMoldeAndWallet } from "@/lib/db/molde-wallet";
import { moldeNotFound } from "@/lib/db/molde";
import { addMessage, applyGarmentSpec, bumpVersion } from "@/lib/editor/state";
import { debitWallet, refundWallet } from "@/lib/billing/wallet";
import type { LedgerEntry } from "@/lib/billing/wallet";
import { composeEditorState } from "@/lib/api/compose";
import { COSTS } from "@/lib/types";
import { proposeGarment } from "@/lib/ai";
import { requireUser } from "@/lib/auth/guard";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

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
  const now = new Date();

  const result = await withMoldeAndWallet(
    id,
    gate.id,
    async (
      state,
      wallet,
    ): Promise<{ result: NextResponse; entries: LedgerEntry[] }> => {
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

      addMessage(state, {
        id: `msg-${Date.now()}-u`,
        author: "user",
        text: trimmed,
        createdAt: Date.now(),
      });
      const entries: LedgerEntry[] = [debitWallet(wallet, cost, "generate")];

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
          entries.push(refundWallet(wallet, cost, "generate-ask"));
          return {
            result: NextResponse.json({
              status: "clarify",
              state: composeEditorState(state, wallet, now),
            }),
            entries,
          };
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
          entries.push(refundWallet(wallet, cost, "generate-declined"));
          return {
            result: NextResponse.json({
              status: "declined",
              state: composeEditorState(state, wallet, now),
            }),
            entries,
          };
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
        return {
          result: NextResponse.json({
            status: conflict ? "conflict" : "ok",
            state: composeEditorState(state, wallet, now),
          }),
          entries,
        };
      } catch {
        entries.push(refundWallet(wallet, cost, "generate-error"));
        return {
          result: NextResponse.json({
            status: "error",
            state: composeEditorState(state, wallet, now),
          }),
          entries,
        };
      }
    },
  );
  return result ?? moldeNotFound();
}
