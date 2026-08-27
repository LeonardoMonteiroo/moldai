import { NextResponse } from "next/server";
import { parseBody } from "@/lib/api/body";
import { ConflictResolveBodySchema } from "@/lib/schemas/pattern";
import { getTranslations } from "next-intl/server";
import { patternNotFound } from "@/lib/db/pattern";
import { withPatternVersioned, recordVersion } from "@/lib/db/patternVersion";
import { loadWallet } from "@/lib/db/wallet";
import { composeEditorState } from "@/lib/api/compose";
import {
  addMessage,
  bumpVersion,
  refitSleeve,
  setConflict,
} from "@/lib/editor/state";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  // #54: any value other than the exact two allowed actions used to fall
  // through to "ignore" -- silently clearing a real seam-conflict warning
  // and re-enabling Export with divergent armholes -- so ConflictResolveBodySchema's
  // z.enum(["fix", "ignore"]) rejects (as the shared bad_body) an
  // unrecognised or missing action instead of resolving anything.
  const body = await parseBody(request, ConflictResolveBodySchema);
  if (body instanceof NextResponse) return body;
  const action = body.action;

  const t = await getTranslations("PatternData");

  // #16: withPatternVersioned (lib/db/patternVersion.ts) -- a Pattern-only
  // transaction, never Wallet -- so "fix"'s version snapshot is written in
  // the same transaction as the pattern save without this route ever
  // locking (or even reading) the wallet through the combined-lock path.
  // This action is truly free; see withPatternVersioned's own comment for
  // why that has to stay true even at the source-text level.
  const patternState = await withPatternVersioned(
    id,
    gate.id,
    async (state, tx) => {
      if (action === "fix") {
        refitSleeve(state, t);
        bumpVersion(state);
        addMessage(state, {
          id: `msg-${Date.now()}-ai`,
          author: "ai",
          text: t("chat.sleeveRefit"),
          chips: [{ label: t("chat.freeFixChip"), tone: "neutral" }],
          createdAt: Date.now(),
        });
        await recordVersion(tx, id, gate.id, state.pattern, "conflict_fix", 0);
      } else {
        setConflict(state, null);
      }
      return state;
    },
  );
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
