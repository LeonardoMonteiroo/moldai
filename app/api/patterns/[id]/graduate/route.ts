import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/body";
import { getTranslations } from "next-intl/server";
import { withPatternAndWallet } from "@/lib/db/pattern-wallet";
import { patternNotFound } from "@/lib/db/pattern";
import { recordVersion } from "@/lib/db/patternVersion";
import { addMessage, applySizes, bumpVersion } from "@/lib/editor/state";
import { debitWallet } from "@/lib/billing/wallet";
import type { LedgerEntry } from "@/lib/billing/wallet";
import { composeEditorState } from "@/lib/api/compose";
import { apiError } from "@/lib/api/errors";
import { COSTS, SizeLabel } from "@/lib/types";
import { formatList } from "@/lib/format";
import { requireUser } from "@/lib/auth/guard";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const requested = Array.isArray(body.sizes) ? body.sizes : [];
  const cost = COSTS.graduate;
  const t = await getTranslations("PatternData");
  const tFormat = await getTranslations("Format");
  const now = new Date();

  let result;
  try {
    result = await withPatternAndWallet(
      id,
      gate.id,
      async (
        state,
        wallet,
        tx,
      ): Promise<{
        result: NextResponse;
        entries: LedgerEntry[];
        dirty?: boolean;
      }> => {
        // A blank pattern still carries a seeded `sizes` list, so the size check
        // below cannot stand in for "there is something to grade". Without this,
        // grading nothing bumped the version and debited COSTS.graduate.
        if (state.pattern.pieces.length === 0) {
          return {
            result: apiError("pattern_not_drafted", 400),
            entries: [],
            dirty: false,
          };
        }
        // #60: intersect against sizesPending (minus the base size), the
        // same set PieceDetailsPanel's `gradable` computes -- filtering
        // against the full `sizes` list let a size that was already
        // applied (or the base size itself) pass validation, debit the
        // wallet, bump the version, and post a "graduated" chat message
        // for a request that changed nothing (applySizes only moves
        // labels still in sizesPending).
        const gradable = state.pattern.sizesPending.filter(
          (s) => s !== state.pattern.baseSize,
        );
        const sizes = requested.filter((s): s is SizeLabel =>
          gradable.includes(s as string),
        );
        if (sizes.length === 0) {
          return {
            result: apiError("no_gradable_sizes", 400),
            entries: [],
            dirty: false,
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
            dirty: false,
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
        // #16: recorded in the same transaction as the debit and the pattern
        // save -- see the identical comment in generate/route.ts.
        await recordVersion(tx, id, gate.id, state.pattern, "graduate", cost);
        return {
          result: NextResponse.json({
            status: "ok",
            state: composeEditorState(state, wallet, now),
          }),
          entries: [entry],
        };
      },
    );
  } catch (err) {
    // #61: same guard as generate/route.ts — a throw past this point (the
    // interactive transaction itself already closed) used to escape as a
    // bare, uncoded HTTP 500.
    console.error("[graduate] withPatternAndWallet failed:", err);
    return apiError("service_unavailable", 503);
  }
  return result ?? patternNotFound();
}
