import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { patternNotFound } from "@/lib/db/pattern";
import {
  getVersion,
  recordVersion,
  withPatternVersioned,
} from "@/lib/db/patternVersion";
import { loadWallet } from "@/lib/db/wallet";
import { addMessage, applyGarmentSpec, bumpVersion } from "@/lib/editor/state";
import { composeEditorState } from "@/lib/api/compose";
import { apiError } from "@/lib/api/errors";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { reportError } from "@/lib/observability/report";

type Ctx = { params: Promise<{ id: string; versionId: string }> };

// Free -- local re-drafting from an already-validated spec, no Anthropic
// call, the same reason "Corrigir manga" and creating a pattern from a
// Sloper are both free. Never rewrites or deletes history: restoring v3
// while at v5 produces v6 carrying v3's spec, never mutates v3 itself.
//
// #16: uses withPatternVersioned (a Pattern-only transaction), not
// withPatternAndWallet -- restore never debits, and the wallet stays
// untouched (read-only, via loadWallet, only to compose the response). See
// withPatternVersioned's own comment on why that has to be true even at the
// source-text level, not just in practice.
export async function POST(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id, versionId } = await params;

  // #10: versionId is untrusted wire input. Looked up ownership-scoped by
  // (patternId, userId) BEFORE anything touches the drafter -- same trust
  // boundary validateSpec enforces for the AI's own spec, and the same
  // "never leak whether the resource exists" shape patternNotFound already
  // gives every pattern-scoped route.
  const version = await getVersion(id, gate.id, versionId);
  if (!version) return apiError("version_not_found", 404);

  const t = await getTranslations("PatternData");

  let patternState;
  try {
    patternState = await withPatternVersioned(
      id,
      gate.id,
      async (state, tx) => {
        // Carries the OLD version's frozen size snapshot forward -- restoring
        // must reproduce what v{n} actually looked like, not re-resolve
        // against whatever size chart happens to be active today (the same
        // "snapshotted once" rule the first-ever generation already follows).
        state.pattern = {
          ...state.pattern,
          sizes: version.sizes,
          baseSize: version.baseSize,
          sizeTable: version.sizeTable,
          sizesApplied: [],
          sizesPending: version.sizes,
          ...(version.sizeChartName === null
            ? {}
            : { sizeChartName: version.sizeChartName }),
          // #267: same carry-the-OLD-version-forward rule as sizeChartName
          // above -- applyGarmentSpec below reads this, so it must already
          // be the version's own frozen engine before that call, not the
          // pattern's current one.
          ...(version.engine === null ? {} : { engine: version.engine }),
        };
        applyGarmentSpec(state, version.spec, t);
        bumpVersion(state);
        // #281: PatternVersion doesn't snapshot chat, but both sides carry a
        // timestamp -- addMessage's own Date.now() and this row's own
        // `createdAt DateTime @default(now())` -- so restoring drops every
        // chat message that can only belong to a LATER turn (the one that
        // produced v(n+1) and onward) by cutting at the restored version's
        // own createdAt, rather than snapshotting chat per version (which
        // would change PatternVersion's persisted shape). This is an
        // approximation, not an exact turn boundary: recordVersion's DB
        // insert always lands strictly before the addMessage() call for
        // that SAME turn's own AI reply (see the generate route -- the
        // reply is written after the version row, with its own fresh
        // Date.now()), so that reply (and any trailing notice messages for
        // this very turn) gets cut alongside the later turns' messages.
        // Accepted deliberately: the one thing this must never do is leave
        // behind a message that only makes sense for a version this restore
        // just discarded, and this cutoff guarantees that in every case, at
        // the cost of also losing this turn's own trailing reply -- the
        // chat.restored notice added right below is what tells the user a
        // restore happened.
        const chatCutoff = new Date(version.createdAt).getTime();
        state.chat = state.chat.filter((m) => m.createdAt <= chatCutoff);
        addMessage(state, {
          id: `msg-${Date.now()}-ai`,
          author: "ai",
          text: t("chat.restored", { version: version.version }),
          chips: [{ label: t("chat.restoreChip"), tone: "neutral" }],
          createdAt: Date.now(),
        });
        // #16: recorded in the same transaction as the pattern save.
        await recordVersion(tx, id, gate.id, state.pattern, "restore", 0);
        return state;
      },
    );
  } catch (err) {
    reportError("versions.restore", err, {
      patternId: id,
      userId: gate.id,
      versionId,
    });
    return apiError("service_unavailable", 503);
  }
  if (!patternState) return patternNotFound();

  const wallet = await loadWallet(gate.id);
  // #62: requireUser() just confirmed this account exists -- null here means
  // it was deleted in the instant between that check and this one.
  if (!wallet) return unauthorized();
  return NextResponse.json({
    status: "ok",
    state: composeEditorState(patternState, wallet, new Date()),
  });
}
