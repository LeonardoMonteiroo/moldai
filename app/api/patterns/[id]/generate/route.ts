import { NextResponse } from "next/server";
import { readJsonObject, hasNulByte } from "@/lib/api/body";
import { getTranslations } from "next-intl/server";
import { withPatternAndWallet } from "@/lib/db/pattern-wallet";
import { patternNotFound } from "@/lib/db/pattern";
import { getSizeChartForGeneration } from "@/lib/db/sizeChart";
import { recordVersion } from "@/lib/db/patternVersion";
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
import { COSTS, MAX_CHAT_MESSAGE_LENGTH } from "@/lib/types";
import { proposeGarment } from "@/lib/ai";
import {
  validateAttachmentInput,
  MAX_ATTACHMENT_BASE64_CHARS,
} from "@/lib/editor/attachment";
import { requireUser } from "@/lib/auth/guard";
import { reportError } from "@/lib/observability/report";

type Ctx = { params: Promise<{ id: string }> };

// #18: this is the one route whose body can carry an attachment's base64
// payload -- headroom over MAX_ATTACHMENT_BASE64_CHARS for the JSON envelope
// plus the message/answering fields, not the shared MAX_BODY_BYTES every
// other (text-only) route reads through.
const MAX_GENERATE_BODY_BYTES = MAX_ATTACHMENT_BASE64_CHARS + 16 * 1024;

export async function POST(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const body = await readJsonObject(request, MAX_GENERATE_BODY_BYTES);
  if (body instanceof NextResponse) return body;
  const trimmed = typeof body.message === "string" ? body.message.trim() : "";
  // #69: a NUL byte survives .trim() and would otherwise only abort the
  // jsonb write inside savePattern -- by then the paid Anthropic call has
  // already run and billed. Reject it here, before any of that happens.
  if (!trimmed || hasNulByte(trimmed)) return apiError("missing_message", 400);
  // #55: presence was checked, length never was -- a large paste gets
  // appended to the pattern's chat, re-serialised on every subsequent save,
  // shipped in full on every load, and eventually rejected by Anthropic on
  // context length, bricking the pattern until it rolls out of
  // HISTORY_WINDOW. A new code is safe without a catalog entry: sendMessage's
  // catch (lib/store.ts) only ever sets generationStatus:"error", and
  // ChatPanel renders one fixed t("generationError") bubble for it -- the
  // wire code lands in store state but is never resolved through a catalog
  // lookup here, unlike the dashboard/size-charts/slopers stores' actionError
  // + ActionErrorNotice (see #56).
  if (trimmed.length > MAX_CHAT_MESSAGE_LENGTH) {
    return apiError("message_too_long", 400);
  }
  // #18: re-validated here regardless of what the browser's own
  // prepareImage() already enforced -- that is a UX affordance, not the
  // trust boundary. Rejected before any debit or Anthropic call, same as
  // the message-length/NUL checks above.
  let image: ReturnType<typeof validateAttachmentInput> = null;
  if (body.image !== undefined) {
    image = validateAttachmentInput(body.image);
    if (!image) return apiError("invalid_attachment", 400);
  }
  const answering = body.answering === true;
  const cost = COSTS.adjust;
  const t = await getTranslations("PatternData");
  // #3: getSizeChartForGeneration -> listSizeChartsForUser now needs its own
  // translator (for the system chart names it may lazily seed), scoped to
  // SizeCharts rather than this route's own PatternData one. Resolved here,
  // outside withPatternAndWallet -- the callback runs inside the interactive
  // transaction (30s timeout, holding the Pattern+Wallet locks for the whole
  // AI call), and getTranslations has no reason to run inside that.
  const tCharts = await getTranslations("SizeCharts");
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

        addMessage(state, {
          id: `msg-${Date.now()}-u`,
          author: "user",
          text: trimmed,
          createdAt: Date.now(),
          ...(image ? { hasImage: true } : {}),
        });
        // #39: this used to debit unconditionally here, then refund it in
        // the ask/decline/error branches below -- a debit+refund pair, not
        // a no-op, on an append-only ledger. getRecentUsage's "Uso recente"
        // card selects the last N `debit`-type rows and renders every
        // surviving one as spend; the paired refund never gets excluded
        // alongside it, so three vague prompts in a row (each `ask`,
        // balance unchanged) show as three real charges and push actual
        // spend off the card. The balance precondition above stays before
        // the AI call; only the chargeable branches (explain, apply) below
        // now debit at all -- no ledger rows are written for ask/decline.
        const entries: LedgerEntry[] = [];

        try {
          const decision = await proposeGarment(
            state,
            answering,
            image
              ? { mediaType: image.mediaType, base64: image.data }
              : undefined,
          );

          // #99: this used to be three positive `if`s (ask/decline/explain)
          // with an implicit else that applied — so any decision value the
          // three checks missed (there was one: resolveDecision could return
          // an unvalidated value straight from a truncated/malformed model
          // response) silently drafted and charged for a fabricated default
          // blouse. An exhaustive switch with a `never` binding in `default`
          // makes a future fifth decision value a compile error here too,
          // matching applyPurchase/exportPattern's existing precedent.
          switch (decision.decision) {
            case "ask": {
              addMessage(state, {
                id: `msg-${Date.now()}-ai`,
                author: "ai",
                text: decision.assistantMessage || t("chat.askFallback"),
                questions: decision.questions,
                createdAt: Date.now(),
              });
              return {
                result: NextResponse.json({
                  status: "clarify",
                  state: composeEditorState(state, wallet, now),
                }),
                entries,
              };
            }
            case "decline": {
              addMessage(state, {
                id: `msg-${Date.now()}-ai`,
                author: "ai",
                text:
                  decision.assistantMessage ||
                  decision.declineReason ||
                  t("chat.declineFallback"),
                createdAt: Date.now(),
              });
              return {
                result: NextResponse.json({
                  status: "declined",
                  state: composeEditorState(state, wallet, now),
                }),
                entries,
              };
            }
            // The one non-drafting decision that keeps its debit: the user
            // asked a question and got the answer, and the AI call is as real
            // as a draft's. The chip makes the charge visible in the bubble,
            // as it is for apply.
            case "explain": {
              entries.push(debitWallet(wallet, cost, "generate"));
              addMessage(state, {
                id: `msg-${Date.now()}-ai`,
                author: "ai",
                text: decision.assistantMessage,
                chips: [
                  { label: t("chat.creditChip", { cost }), tone: "credit" },
                ],
                createdAt: Date.now(),
              });
              return {
                result: NextResponse.json({
                  status: "answered",
                  state: composeEditorState(state, wallet, now),
                }),
                entries,
              };
            }
            case "apply": {
              entries.push(debitWallet(wallet, cost, "generate"));
              // The size chart is snapshotted once, at the first generation.
              // That is also the only moment the account's active chart can
              // be passed over, so it is the only moment there is a
              // substitution to report.
              let substitutedFrom: string | null = null;
              // #16: pieces.length === 0 right here is also "this is the
              // pattern's first-ever draft" -- captured before
              // applyGarmentSpec mutates it, so the version snapshot below
              // gets the right reason code.
              const isFirstDraft = state.pattern.pieces.length === 0;
              if (isFirstDraft) {
                const { chart, rejectedActiveName } =
                  await getSizeChartForGeneration(
                    tx,
                    gate.id,
                    decision.spec.gender ?? "female",
                    tCharts,
                  );
                seedPatternSizeSnapshot(state, chart);
                substitutedFrom = rejectedActiveName;
              }
              applyGarmentSpec(state, decision.spec, t);
              bumpVersion(state);
              // #16: recorded in the SAME transaction as the debit and the
              // pattern save -- a version row can never exist without the
              // state that produced it, and a rolled-back mutation (the
              // catch below, or the transaction itself timing out) leaves no
              // orphan snapshot.
              await recordVersion(
                tx,
                id,
                gate.id,
                state.pattern,
                isFirstDraft ? "generate" : "adjust",
                cost,
              );
              const conflict = state.conflict;
              addMessage(state, {
                id: `msg-${Date.now()}-ai`,
                author: "ai",
                text: conflict
                  ? `${decision.assistantMessage} ⚠️ ${conflict.description}`
                  : decision.assistantMessage,
                chips: [
                  { label: t("chat.creditChip", { cost }), tone: "credit" },
                ],
                tone: conflict ? "conflict" : undefined,
                createdAt: Date.now(),
              });
              // Said out loud rather than left for the user to discover:
              // their active chart's measurements are not the ones this
              // pattern was drafted from.
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
            }
            default: {
              const exhaustive: never = decision.decision;
              throw new Error(`unhandled decision: ${String(exhaustive)}`);
            }
          }
        } catch (err) {
          // #100: this had no error binding at all, so an Anthropic 401/429
          // (a rotated key, a spend cap) was structurally unloggable -- the
          // credit was refunded, the user saw a generic failure and retried
          // in a loop, and the operator's stdout held nothing at all: not
          // the cause, not even a line saying a generation was attempted.
          reportError("generate", err, { patternId: id, userId: gate.id });
          // #39: only refund if this attempt actually debited -- ask/decline
          // never do, and proposeGarment throwing before the decision is
          // known (the common case: a rotated key, a spend cap) never
          // touched the wallet at all, so there is nothing to undo.
          if (entries.length > 0) {
            entries.push(refundWallet(wallet, cost, "generate-error"));
          }
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
  } catch (err) {
    // #61: a throw past this point (e.g. the interactive transaction
    // itself already timed out — TX_OPTS.timeout is 30s and holds the
    // Pattern+Wallet locks for the whole AI call) used to escape as a
    // bare, uncoded HTTP 500 with the user's message and optimistic
    // bubble gone.
    console.error("[generate] withPatternAndWallet failed:", err);
    return apiError("service_unavailable", 503);
  }
  return result ?? patternNotFound();
}
