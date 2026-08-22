import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/guard";
import { readJsonObject } from "@/lib/api/body";
import { apiError, ERROR_STATUS } from "@/lib/api/errors";
import { loadPattern, patternNotFound } from "@/lib/db/pattern";
import { listSlopersForUser, createSloper } from "@/lib/db/sloper";
import { sloperFromPattern } from "@/lib/slopers/convert";
import { MAX_PATTERN_NAME_LENGTH } from "@/lib/types";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const t = await getTranslations("PatternData");
  return NextResponse.json(await listSlopersForUser(gate.id, t));
}

// Creates a sloper FROM a pattern: the client sends an id and a name, never a
// spec, so the only new validation surface is the name. The route composes
// (validate -> loadPattern -> drafted check -> conflict check -> createSloper)
// rather than delegating, because only it can tell 404 from 400. The conflict
// check re-checks server-side what the "Salvar como base" button already
// disables client-side: founding a future garment on divergent seams is the
// same mistake as cutting fabric from them.
export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;

  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const patternId = typeof body.patternId === "string" ? body.patternId : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > MAX_PATTERN_NAME_LENGTH) {
    return apiError("invalid_name", 400);
  }
  if (!patternId) return apiError("bad_body", ERROR_STATUS.bad_body);

  const loaded = await loadPattern(patternId, gate.id);
  if (!loaded) return patternNotFound();
  const { pattern, conflict } = loaded.state;
  if (pattern.pieces.length === 0 || !pattern.spec) {
    return apiError("pattern_not_drafted", 400);
  }
  if (conflict) {
    return apiError("pattern_has_conflict", 400);
  }

  const t = await getTranslations("PatternData");
  const sloper = await createSloper(
    gate.id,
    sloperFromPattern(pattern, name),
    t,
  );
  return NextResponse.json(sloper);
}
