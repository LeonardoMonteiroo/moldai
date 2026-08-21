import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/body";
import { getTranslations } from "next-intl/server";
import { withPatternAndWallet } from "@/lib/db/pattern-wallet";
import { patternNotFound } from "@/lib/db/pattern";
import { getSizeChartForGeneration } from "@/lib/db/sizeChart";
import {
  addMessage,
  applyGarmentSpec,
  bumpVersion,
  seedPatternSizeSnapshot,
} from "@/lib/editor/state";
import { debitWallet, refundWallet } from "@/lib/billing/wallet";
import type { LedgerEntry } from "@/lib/billing/wallet";
import { composeEditorState } from "@/lib/api/compose";
import { apiError } from "@/lib/api/errors";
import { COSTS } from "@/lib/types";
import { proposeGarment } from "@/lib/ai";
import { requireUser } from "@/lib/auth/guard";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const trimmed = typeof body.message === "string" ? body.message.trim() : "";
  if (!trimmed) return apiError("missing_message", 400);
  const answering = body.answering === true;
  const cost = COSTS.adjust;
  const t = await getTranslations("PatternData");
  const now = new Date();

  const result = await withPatternAndWallet(
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
            text: decision.assistantMessage || t("chat.askFallback"),
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
              t("chat.declineFallback"),
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

        // The size chart is snapshotted once, at the first generation. That is
        // also the only moment the account's active chart can be passed over,
        // so it is the only moment there is a substitution to report.
        let substitutedFrom: string | null = null;
        if (state.pattern.pieces.length === 0) {
          const { chart, rejectedActiveName } = await getSizeChartForGeneration(
            gate.id,
            decision.spec.gender ?? "female",
          );
          seedPatternSizeSnapshot(state, chart);
          substitutedFrom = rejectedActiveName;
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
          chips: [{ label: t("chat.creditChip", { cost }), tone: "credit" }],
          tone: conflict ? "conflict" : undefined,
          createdAt: Date.now(),
        });
        // Said out loud rather than left for the user to discover: their active
        // chart's measurements are not the ones this pattern was drafted from.
        if (substitutedFrom) {
          addMessage(state, {
            id: `msg-${Date.now()}-chart`,
            author: "ai",
            text: t("chat.sizeChartSubstituted", {
              rejected: substitutedFrom,
              used: state.pattern.sizeChartName ?? "",
            }),
            tone: "notice",
            createdAt: Date.now(),
          });
        }
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
  return result ?? patternNotFound();
}
