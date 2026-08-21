import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { withPatternAndWallet } from "@/lib/db/pattern-wallet";
import { patternNotFound } from "@/lib/db/pattern";
import { addMessage, applySizes, bumpVersion } from "@/lib/editor/state";
import { debitWallet } from "@/lib/billing/wallet";
import type { LedgerEntry } from "@/lib/billing/wallet";
import { composeEditorState } from "@/lib/api/compose";
import { apiError, ERROR_STATUS } from "@/lib/api/errors";
import { COSTS, SizeLabel } from "@/lib/types";
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
    return apiError("bad_body", ERROR_STATUS.bad_body);
  }
  const requested = Array.isArray(body.sizes) ? body.sizes : [];
  const cost = COSTS.graduate;
  const t = await getTranslations("PatternData");
  const tFormat = await getTranslations("Format");
  const now = new Date();

  const result = await withPatternAndWallet(
    id,
    gate.id,
    (state, wallet): { result: NextResponse; entries: LedgerEntry[] } => {
      const sizes = requested.filter((s): s is SizeLabel =>
        state.pattern.sizes.includes(s as string),
      );
      if (sizes.length === 0) {
        return {
          result: apiError("no_gradable_sizes", 400),
          entries: [],
        };
      }
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
        text: t("chat.graduated", { list: formatList(tFormat, sizes) }),
        chips: [{ label: t("chat.creditChip", { cost }), tone: "credit" }],
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
  return result ?? patternNotFound();
}
