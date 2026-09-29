import { NextResponse } from "next/server";
import { parseBody, hasNulByte } from "@/lib/api/body";
import { GenerateBodySchema } from "@/lib/schemas/pattern";
import { getTranslations } from "next-intl/server";
import { withPatternAndWallet } from "@/lib/db/pattern-wallet";
import { patternNotFound, withPattern } from "@/lib/db/pattern";
import {
  getSizeChartForGeneration,
  getSizeChartGenderForUser,
} from "@/lib/db/sizeChart";
import { measurementGradesAcrossSizes } from "@/lib/sizeCharts/compute";
import { recordVersion } from "@/lib/db/patternVersion";
import {
  addMessage,
  applyGarmentSpec,
  bumpVersion,
  diffSpec as diffSpecSummary,
  getSpec,
  seedPatternSizeSnapshot,
  setGarmentReading,
} from "@/lib/editor/state";
import { diffSpec } from "@/lib/draft/specDiff";
import { debitWallet, refundWallet } from "@/lib/billing/wallet";
import {
  engineFor,
  isEngineId,
  checkEngineSupport,
  type EngineGap,
} from "@/lib/draft/engine/capability";
import { getEngine } from "@/lib/draft/engine/registry";
import type { SpecAdjustment } from "@/lib/draft/specAdjustments";
import type { LedgerEntry } from "@/lib/billing/wallet";
import { composeEditorState } from "@/lib/api/compose";
import { apiError } from "@/lib/api/errors";
import {
  COSTS,
  MAX_CHAT_MESSAGE_LENGTH,
  type EditorState,
  type GarmentSpec,
  type Gender,
} from "@/lib/types";
import { proposeGarment, type ProposeImage } from "@/lib/ai";
import { findReferenceDisagreement } from "@/lib/ai/compareToReference";
import { validateFormSpec, mergeFormSpec } from "@/lib/ai/formSpec";
import {
  validateAttachmentInputs,
  MAX_ATTACHMENTS_TOTAL_BASE64_CHARS,
  type WireAttachment,
} from "@/lib/editor/attachment";
import { MAX_IMPORT_CONTEXT_CHARS } from "@/lib/import/reconstructMeta";
import { requireUser } from "@/lib/auth/guard";
import { reportError } from "@/lib/observability/report";

type Ctx = { params: Promise<{ id: string }> };

// #18: this is the one route whose body can carry an attachment's base64
// payload -- headroom over the combined attachment ceiling for the JSON
// envelope plus the message/answering fields, not the shared MAX_BODY_BYTES
// every other (text-only) route reads through.
//
// Derived from MAX_ATTACHMENTS_TOTAL_BASE64_CHARS rather than restating a
// byte figure, so the byte ceiling and the field ceiling cannot drift apart:
// a smaller one here would refuse a request validateAttachmentInputs would
// have allowed, and it would refuse it as the generic bad_body, before the
// attachment validator could say what was actually wrong.
const MAX_GENERATE_BODY_BYTES = MAX_ATTACHMENTS_TOTAL_BASE64_CHARS + 16 * 1024;

// The wire's `data` becomes the provider block's `base64` -- one rename at
// the one seam between the two shapes, in the order received (the order the
// model reads them in). Shared by the primary proposeGarment call (still
// run inside withPatternAndWallet's transaction) and the #264
// reference-comparison follow-up (run AFTER that transaction commits) so
// the mapping itself has exactly one definition, even though the two calls
// can no longer share one prepared array's reference.
function toProposeImages(attachments: WireAttachment[]): ProposeImage[] {
  return attachments.map((a) => ({ mediaType: a.mediaType, base64: a.data }));
}

export async function POST(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const body = await parseBody(
    request,
    GenerateBodySchema,
    MAX_GENERATE_BODY_BYTES,
  );
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
  // the message-length/NUL checks above. One code covers every way the list
  // can be unusable (not an array, empty, over count, an entry over the
  // per-image ceiling, a combined payload over the total one), because a
  // forged request has no use for the distinction and each of them is the
  // same answer: this request's attachments cannot be trusted.
  //
  // A text-only request omits the key entirely; `images: []` is a caller
  // that meant to attach something and sent nothing, which is refused
  // rather than charged for a call that lost the reference.
  let images: WireAttachment[] | null = null;
  if (body.images !== undefined) {
    images = validateAttachmentInputs(body.images);
    if (!images) return apiError("invalid_attachment", 400);
  }
  // The user's own explicit choices, when the request came from the creation
  // form rather than free prose. Same placement and same reasoning as the
  // attachment check above: rejected before any lock, debit or Anthropic
  // call. A present-but-unusable formSpec is refused rather than ignored,
  // because validateSpec defaults an absent `type` to "blouse" -- silently
  // dropping the field would merge that default over whatever garment the
  // model correctly inferred, which is worse than answering a code for a
  // request the real UI cannot produce anyway.
  let formSpec: GarmentSpec | null = null;
  if (body.formSpec !== undefined) {
    formSpec = validateFormSpec(body.formSpec);
    if (!formSpec) return apiError("invalid_form_spec", 400);
  }
  // The chart this molde should be drafted from, chosen per molde. Read
  // tolerantly (an absent, non-string or blank value simply means "no chart
  // named") because that case has a well-defined fallback -- the account's
  // active chart, which is exactly what every generate request has always
  // done. That is the same tolerance POST /api/patterns applies to sloperId,
  // and it is why only an id that genuinely resolves to nothing is refused.
  const sizeChartId =
    typeof body.sizeChartId === "string" && body.sizeChartId
      ? body.sizeChartId
      : null;
  // #269 Fase 5: the engine the new-pattern form's own Select chose. Read
  // tolerantly when absent (undefined resolves through engineFor to the
  // account's default engine, same as every other engineFor call site), but
  // a PRESENT, unrecognized value is refused before any lock/debit -- the
  // same discipline formSpec above already follows, rather than silently
  // falling back to the default and drafting an engine the caller never
  // asked for. Only actually applied inside the transaction below, and only
  // on this pattern's first-ever draft: state.pattern.engine, once frozen,
  // never changes again (seedPatternSizeSnapshot's own contract) -- a value
  // sent on a later regenerate request is simply not read, the same
  // "unreachable from the real UI" shape sizeChartId's own isFirstDraft gate
  // already has.
  if (body.engine !== undefined && !isEngineId(body.engine)) {
    return apiError("invalid_engine", 400);
  }
  const requestedEngine = isEngineId(body.engine) ? body.engine : undefined;
  // The drafted gender comes from the chosen chart, never from a client
  // field: one source of truth, and it makes the chart/gender mismatch that
  // pickSizeChartForGeneration's substitution path exists to report
  // unreachable from this flow.
  //
  // Read here, outside the transaction, for two reasons. The 400 has to land
  // before any lock is taken or credit debited, and the gender has to be
  // known before the AI call so the prompt can state it. The authoritative
  // snapshot still comes from the in-transaction pick below, which sees the
  // same locked view as the write; if the chart is deleted in the gap,
  // pickSizeChartForGeneration simply does not find the id and falls through
  // to today's active-then-system path, so a race resolves to safe existing
  // behavior rather than an error.
  let chartGender: Gender | null = null;
  if (sizeChartId) {
    chartGender = await getSizeChartGenderForUser(sizeChartId, gate.id);
    // Unreachable from the real UI, so this is a forged or badly stale
    // request rather than a fallback case. Substituting silently would draft
    // from measurements the caller did not ask for, and a fabricated
    // substitution notice would name a chart that does not exist.
    if (!chartGender) return apiError("invalid_size_chart", 400);
  }
  // Stated to the model as the user's own decision, so it does not infer the
  // other gender and then have its answer quietly contradicted by the spec
  // the merge below produces.
  if (formSpec && chartGender) formSpec = { ...formSpec, gender: chartGender };
  const answering = body.answering === true;
  // Client-computed metadata from a DXF import reconstruction (#238
  // follow-up) -- never user-typed prose, never persisted, only used to
  // enrich THIS call's system prompt (see lib/ai/prompt.ts's "Imported
  // pattern reconstruction" section). Silently capped rather than rejected:
  // its size is bounded by how many pieces a real file has, and a truncated
  // tail still lets the model fall back to ask/decline rather than blocking
  // the whole request.
  const importContext =
    typeof body.importContext === "string"
      ? body.importContext.slice(0, MAX_IMPORT_CONTEXT_CHARS)
      : undefined;
  // #265: the piece the editor had selected when this turn was sent. Read
  // tolerantly (only a string is looked at) because there is no reject path
  // for this field -- the real trust boundary is the lookup against this
  // pattern's OWN `pieces`, by id, done below once `state` is in scope. An
  // id that doesn't resolve there (a renamed/deleted piece, a stale
  // selection left over from before a regenerate, or simply none selected)
  // must drop the scope silently rather than 400 -- see
  // lib/ai/options.ts's ProposeOptions.partScope doc.
  const selectedPieceId =
    typeof body.selectedPieceId === "string" ? body.selectedPieceId : null;
  const cost = COSTS.adjust;
  const t = await getTranslations("PatternData");
  // #3: getSizeChartForGeneration -> listSizeChartsForUser now needs its own
  // translator (for the system chart names it may lazily seed), scoped to
  // SizeCharts rather than this route's own PatternData one. Resolved here,
  // outside withPatternAndWallet -- the callback runs inside the interactive
  // transaction (30s timeout, holding the Pattern+Wallet locks for the whole
  // AI call), and getTranslations has no reason to run inside that.
  const tCharts = await getTranslations("SizeCharts");
  // #267: for checkEngineSupport's own "unsupported type" notice, which
  // names the garment type using the same catalog TechSheetTab already
  // resolves it through -- never a second, driftable label map.
  const tGarment = await getTranslations("TechSheetTab");
  const now = new Date();

  // #264: set only on a genuine, successfully-applied "apply" (after
  // applyGarmentSpec/bumpVersion/recordVersion, never on the engine's own
  // "declined" early-out further down) -- read AFTER withPatternAndWallet
  // has committed, to decide whether the reference-comparison follow-up
  // below runs at all. A plain captured value, not a call: the comparison
  // itself must never run inside this transaction (see the comment at its
  // call site for why).
  let capturedSpec: GarmentSpec | undefined;

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

        const userMessageId = `msg-${Date.now()}-u`;
        addMessage(state, {
          id: userMessageId,
          author: "user",
          text: trimmed,
          createdAt: Date.now(),
          // The count, never the bytes: the attachments travel with this
          // request only. hasImage stays written alongside imageCount so a
          // reader that predates the count keeps working.
          ...(images ? { hasImage: true, imageCount: images.length } : {}),
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

        // #16: pieces.length === 0 right here is "this is the pattern's
        // first-ever draft" -- computed before the AI call (not just before
        // applyGarmentSpec further down) because proposeGarment's own
        // engineFor(state.pattern.engine) read (lib/ai/index.ts) has to see
        // the CHOSEN engine already, or a fresh freesewing-only request
        // (e.g. "coat") would get the moldai tool schema's narrower type
        // enum. Set here, once, on first draft only -- state.pattern.engine,
        // once frozen, never changes again (seedPatternSizeSnapshot's own
        // contract) -- from the SAME requestedEngine value
        // seedPatternSizeSnapshot below freezes with a few lines later: one
        // source read twice, not two competing writes.
        const isFirstDraft = state.pattern.pieces.length === 0;
        if (isFirstDraft && requestedEngine) {
          state.pattern = { ...state.pattern, engine: requestedEngine };
        }

        // Only feeds the primary proposeGarment call below -- the #264
        // reference comparison re-derives its own copy (toProposeImages,
        // above) from `images` AFTER this transaction commits, rather than
        // reusing this one (see the capturedSpec comment above for why it
        // cannot run in here).
        const preparedImages = images ? toProposeImages(images) : undefined;
        // #265: the trust-boundary lookup -- resolved against THIS
        // pattern's own `pieces`, by id, never accepted as free text. An
        // unrecognized or stale id (undefined here) simply omits the scope
        // below, so the turn behaves exactly as an unscoped one.
        const partScope = selectedPieceId
          ? state.pattern.pieces.find((p) => p.id === selectedPieceId)?.name
          : undefined;

        try {
          const decision = await proposeGarment(state, {
            answering,
            ...(preparedImages ? { images: preparedImages } : {}),
            importContext,
            // Told to the model so its own reply text stays coherent and it
            // does not ask about an already-answered field. That is
            // necessary but it is NOT the guarantee -- the merge in the
            // apply branch below is, the same way applyGarmentSpec clamps
            // every measurement regardless of what the model claims
            // prompted the value.
            ...(formSpec ? { formSpec } : {}),
            ...(partScope ? { partScope } : {}),
          });

          // #258: patched onto the user turn the reading describes (the
          // SAME turn hasImage/imageCount above are on), not the ai turn
          // added by whichever branch runs below -- and unconditionally,
          // before the decision switch, since an image can arrive alongside
          // any of ask/decline/explain/apply, not just apply. Absent
          // whenever the model omitted it; never fatal (see
          // resolveDecision, lib/ai/decision.ts).
          if (decision.garmentReading) {
            setGarmentReading(state, userMessageId, decision.garmentReading);
          }

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
                decision: "ask",
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
                decision: "decline",
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
                // #138: tags a sewing/assembly-order answer so ChatBubble can
                // attach the catalog-sourced disclaimer -- see
                // decision.assemblyOrder's own doc (lib/ai/decision.ts).
                ...(decision.assemblyOrder ? { assembly: true } : {}),
                decision: "explain",
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
              // The structural half of "the user's explicit choice wins",
              // and the only branch it belongs in: after the model has
              // spoken, so a field the form left alone keeps its inference,
              // and before applyGarmentSpec, so the drafted geometry
              // reflects the merge. ask/decline/explain draft nothing, so
              // there is no spec of theirs to correct.
              const merged = formSpec
                ? mergeFormSpec(decision.spec, formSpec)
                : decision.spec;
              // The named chart's gender wins over the model's, whether or
              // not the request also carried a form spec: the chart IS the
              // measurements this molde is drafted from, so its gender is
              // the only one the geometry can honestly claim.
              const spec = chartGender
                ? { ...merged, gender: chartGender }
                : merged;
              // #279: state.pattern.spec as it stood before this turn
              // touches it (applyGarmentSpec below hasn't run yet), so
              // diffing it against the final `spec` tells apart a field the
              // engine gap below is ABOUT TO report because it genuinely
              // changed/was newly set this turn from one that's simply been
              // sitting there, unsupported, since an earlier turn -- the
              // model is prompted to always echo the ENTIRE updated spec
              // back (lib/ai/prompt.ts), so a style field the active engine
              // never reads keeps reappearing, byte-identical, in every
              // later turn's spec forever (nothing ever corrects it).
              //
              // chat.specAdjusted (right below) does NOT need this same
              // treatment: describeSpecAdjustments is recomputed from the
              // model's live RAW payload on every call, and the "Current
              // pattern spec" the prompt shows the model each turn
              // (lib/ai/prompt.ts) is the CORRECTED value (e.g. collar
              // "none", never the rejected "peterPan") -- so an unrelated
              // later turn that echoes it back re-validates clean and never
              // re-enters this list on its own. Filtering it the same way
              // would instead risk suppressing a genuinely new substitution
              // whose corrected value happens to coincide with the last
              // one's (e.g. two different unsupported collars both default
              // to "none").
              const previousSpec = getSpec(state);
              const turnChangedFields = new Set(
                diffSpec(previousSpec, spec).map((c) => c.field),
              );
              // #250: validateSpec (inside proposeGarment/resolveDecision)
              // already substituted a default or clamped a bound for
              // whatever the model's raw payload could not honor;
              // decision.adjustments is that diff. Filtered here against
              // the FINAL spec (after the form-spec merge and the chart's
              // own gender override above): a field the form explicitly
              // corrected, or that chartGender overrode, no longer holds
              // the value validateSpec defaulted to, so reporting it here
              // would describe a substitution that didn't actually survive
              // into the drafted geometry.
              const finalOf = (a: SpecAdjustment): unknown =>
                a.field === "type"
                  ? spec.type
                  : a.field === "gender"
                    ? spec.gender
                    : spec.style[a.field as keyof GarmentSpec["style"]];
              const specAdjustments = (decision.adjustments ?? []).filter(
                (a) => {
                  const current = finalOf(a);
                  if (a.kind === "clamped") return current === a.used;
                  return a.used === undefined
                    ? current === undefined
                    : String(current) === a.used;
                },
              );
              // The size chart is snapshotted once, at the first generation.
              // That is also the only moment the account's active chart can
              // be passed over, so it is the only moment there is a
              // substitution to report.
              let substitutedFrom: string | null = null;
              // isFirstDraft was already computed (and, if requestedEngine
              // was sent, already applied to state.pattern.engine) before
              // the AI call above -- reused here rather than recomputed,
              // since nothing between there and here can add a piece.
              if (isFirstDraft) {
                const { chart, rejectedActiveName } =
                  await getSizeChartForGeneration(
                    tx,
                    gate.id,
                    spec.gender ?? "female",
                    tCharts,
                    sizeChartId,
                  );
                // engineFor(state.pattern.engine) resolves to whatever was
                // just set above (requestedEngine) or the account default if
                // none was sent -- the SAME value the AI call already used,
                // never a second, independently-defaulted one.
                seedPatternSizeSnapshot(
                  state,
                  chart,
                  engineFor(state.pattern.engine),
                );
                substitutedFrom = rejectedActiveName;
              }
              // #267: checkEngineSupport narrows the already-validated spec
              // to what the pattern's own FROZEN engine can honestly honor
              // -- validateSpec has already rejected garbage, so anything
              // reported here is a legitimate choice the engine genuinely
              // cannot draft, never substituted for something else.
              const engineCapability = getEngine(
                engineFor(state.pattern.engine),
              ).capability;
              const engineGaps = checkEngineSupport(
                engineCapability,
                spec,
                state.pattern.sizeTable[state.pattern.baseSize],
              );
              // type/measurements: the engine cannot honestly draft this at
              // all. Refund (the debit above already happened), report why,
              // and stop -- the same shape as decision=decline, which also
              // drafts nothing.
              const blockingGap = engineGaps.find(
                (g) => g.kind === "type" || g.kind === "measurements",
              );
              if (blockingGap) {
                entries.push(
                  refundWallet(wallet, cost, "generate-unsupported"),
                );
                addMessage(state, {
                  id: `msg-${Date.now()}-ai`,
                  author: "ai",
                  text:
                    blockingGap.kind === "type"
                      ? t("chat.engineTypeUnsupported", {
                          type: tGarment(`garmentType.${blockingGap.type}`),
                        })
                      : t("chat.engineMeasurementsUnsupported", {
                          missing: blockingGap.missing
                            .map((k) => String(k))
                            .join(", "),
                        }),
                  tone: "notice",
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
              // style field/value/limit: the engine drafts anyway with the
              // field dropped (today's silent behavior) -- but says so,
              // rather than leaving the user to notice the field simply
              // didn't apply.
              const isStyleGap = (
                g: EngineGap,
              ): g is Extract<
                EngineGap,
                {
                  kind:
                    | "styleField"
                    | "styleValue"
                    | "styleLimit"
                    | "styleRequires";
                }
              > =>
                g.kind === "styleField" ||
                g.kind === "styleValue" ||
                g.kind === "styleLimit" ||
                g.kind === "styleRequires";
              const droppedStyleFields = engineGaps
                .filter(isStyleGap)
                // #279: only a field that changed/was newly set THIS turn --
                // see the comment above `turnChangedFields`. #333: a
                // styleRequires gap also counts when the SIBLING changed
                // (a cuff set long ago, the sleeve shortened now), since
                // that is the turn that stopped the field shaping anything.
                .filter(
                  (g) =>
                    turnChangedFields.has(g.field) ||
                    (g.kind === "styleRequires" &&
                      turnChangedFields.has(g.requires.field)),
                )
                .map((g) => t(`styleField.${g.field}`));
              // #257: diffed against the pattern's OWN previous spec, read
              // here (before applyGarmentSpec below overwrites
              // state.pattern.spec) -- the exact drift a full-JSON
              // re-emission can introduce that nothing else in this route
              // detects. Empty on the pattern's first-ever draft: there is
              // no real previous spec to diff against yet (getSpec's own
              // blank-blouse fallback), and every field would otherwise
              // read as "changed".
              const changedFields = isFirstDraft
                ? []
                : diffSpecSummary(getSpec(state), spec);
              applyGarmentSpec(state, spec, t);
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
                decision: "apply",
                draftVersion: state.pattern.version,
                ...(changedFields.length > 0 ? { changedFields } : {}),
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
              // Said out loud rather than left for the user to discover:
              // the model's own free-text reply may describe the requested
              // value (e.g. "gola Peter Pan") while the drafter built
              // whatever validateSpec substituted instead.
              if (specAdjustments.length > 0) {
                const fieldLabel = (field: SpecAdjustment["field"]) =>
                  field === "type" || field === "gender"
                    ? t(`specField.${field}`)
                    : t(`styleField.${field}`);
                const items = specAdjustments.map((a) =>
                  a.kind === "clamped"
                    ? t("chat.specAdjustmentClamped", {
                        field: fieldLabel(a.field),
                        requested: a.requested,
                        min: a.range.min,
                        max: a.range.max,
                        used: a.used,
                      })
                    : t("chat.specAdjustmentSubstituted", {
                        field: fieldLabel(a.field),
                        requested: a.requested,
                      }),
                );
                addMessage(state, {
                  id: `msg-${Date.now()}-spec`,
                  author: "ai",
                  text: t("chat.specAdjusted", { items: items.join("; ") }),
                  tone: "notice",
                  createdAt: Date.now(),
                });
              }
              if (droppedStyleFields.length > 0) {
                addMessage(state, {
                  id: `msg-${Date.now()}-engine`,
                  author: "ai",
                  text: t("chat.engineStyleUnsupported", {
                    fields: droppedStyleFields.join(", "),
                  }),
                  tone: "notice",
                  createdAt: Date.now(),
                });
              }
              // #326: trouserLengthCm now grades across sizes via each
              // row's own waistToFloor (lib/draft/trousers.ts) -- but a
              // chart whose waistToFloor doesn't itself vary by size (one
              // persisted before #269's promotion, one imported with an
              // unmapped column, or one whose PATCH body dropped the rule)
              // degrades to the pre-#326 flat behavior instead of throwing.
              // Said out loud rather than left for the user to discover, the
              // same "surface the limitation where the user meets it" rule
              // chat.engineStyleUnsupported above already follows -- scoped
              // to trousers turns only (isFirstDraft, or a turn that changed
              // the length itself), the same #279 turn-scoping
              // droppedStyleFields already uses, so an unrelated later turn
              // doesn't re-print it forever.
              if (
                spec.type === "trousers" &&
                (isFirstDraft || turnChangedFields.has("trouserLengthCm")) &&
                !measurementGradesAcrossSizes(
                  state.pattern.sizeTable,
                  "waistToFloor",
                )
              ) {
                addMessage(state, {
                  id: `msg-${Date.now()}-length`,
                  author: "ai",
                  text: t("chat.trouserLengthNotGraded"),
                  tone: "notice",
                  createdAt: Date.now(),
                });
              }
              // #264: an apply that came with a reference photo/sketch is
              // exactly where a wrong type/neckline/silhouette is both most
              // likely and most invisible -- the user gets a plausible
              // pattern of the wrong garment. Only CAPTURED here -- the
              // actual comparison call runs after this transaction commits
              // (see the follow-up below withPatternAndWallet), never in
              // here: proposeGarment's own worst case already spends close
              // to the full 30s TX_OPTS budget this transaction holds the
              // Pattern+Wallet locks for (20s + 8s repair -- see
              // lib/ai/provider/anthropic.ts), and this comparison's own
              // 8s ceiling on top of that could blow the transaction's
              // timeout and roll back an apply that had already succeeded --
              // exactly the failure #264 must never cause.
              if (images) {
                capturedSpec = spec;
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
  if (!result) return patternNotFound();

  // #264: runs AFTER the primary transaction above has already committed --
  // spec, version and pieces are already saved, and the credit already
  // spent, before this ever starts. `images` (re-mapped to the provider's
  // block shape, same rename as the primary call's own preparedImages)
  // stays in scope here since it was validated at the top of this function,
  // outside withPatternAndWallet entirely.
  //
  // A disagreement is persisted through a SEPARATE, Pattern-only lock
  // (withPattern -- no Wallet, so the credit this apply already correctly
  // spent is never at risk of this call's own timeout) rather than folded
  // back into the transaction above. addMessage is the only state write --
  // never a second version, never a re-drafted spec.
  //
  // Wrapped in its own try/catch: a thrown error here (a network failure, a
  // rejected provider call, a failed follow-up lock) must never turn an
  // already-successful apply into anything the caller sees as a failure --
  // it is only ever logged via reportError and otherwise swallowed.
  if (capturedSpec && images) {
    try {
      const disagreement = await findReferenceDisagreement(
        capturedSpec,
        toProposeImages(images),
      );
      if (disagreement) {
        const updated = await withPattern(id, gate.id, (followState) => {
          addMessage(followState, {
            id: `msg-${Date.now()}-refcheck`,
            author: "ai",
            text: t("chat.referenceMismatch", { note: disagreement }),
            tone: "notice",
            createdAt: Date.now(),
          });
          return followState;
        });
        // Folded into the SAME response the client already received the
        // successful apply in, rather than left for a future refetch to
        // surface -- `credits` is carried over unchanged from the original
        // body (this follow-up never touches the wallet) while every other
        // field comes from the freshly-saved state. Mirrors
        // composeEditorState's own `pattern.updatedAt` merge
        // (lib/api/compose.ts) rather than calling it directly: there is no
        // `Wallet` in scope this far past the primary transaction, and
        // `credits` has to be carried over rather than rebuilt from one.
        if (updated) {
          const original = (await result.clone().json()) as {
            status: string;
            state?: EditorState;
          };
          if (original.state) {
            result = NextResponse.json({
              ...original,
              state: {
                ...updated,
                pattern: {
                  ...updated.pattern,
                  updatedAt: new Date().toISOString(),
                },
                credits: original.state.credits,
              },
            });
          }
        }
      }
    } catch (err) {
      reportError("generate-compare", err, { patternId: id, userId: gate.id });
    }
  }
  return result;
}
