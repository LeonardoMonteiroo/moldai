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
        };
        applyGarmentSpec(state, version.spec, t);
        bumpVersion(state);
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
