import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/api/body";
import { getTranslations } from "next-intl/server";
import { withPattern, patternNotFound } from "@/lib/db/pattern";
import { loadWallet } from "@/lib/db/wallet";
import { composeEditorState } from "@/lib/api/compose";
import {
  addMessage,
  bumpVersion,
  refitSleeve,
  setConflict,
} from "@/lib/editor/state";
import { requireUser } from "@/lib/auth/guard";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const action: "fix" | "ignore" = body.action === "fix" ? "fix" : "ignore";

  const t = await getTranslations("PatternData");

  const patternState = await withPattern(id, gate.id, (state) => {
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
    } else {
      setConflict(state, null);
    }
    return state;
  });
  if (!patternState) return patternNotFound();

  const wallet = await loadWallet(gate.id);
  return NextResponse.json({
    status: "ok",
    state: composeEditorState(patternState, wallet, new Date()),
  });
}
