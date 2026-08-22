import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/guard";
import { readJsonObject } from "@/lib/api/body";
import {
  listPatternsForUser,
  createPattern,
  createPatternFromState,
} from "@/lib/db/pattern";
import { loadSloper, sloperNotFound } from "@/lib/db/sloper";
import { patternFromSloper } from "@/lib/slopers/convert";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const patterns = await listPatternsForUser(gate.id);
  return NextResponse.json(patterns);
}

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  // Tolerates an unusable body -- that just means "no sloperId", i.e. a blank
  // pattern, which is exactly what api.createPattern() sends today. Same
  // deliberate tolerance as POST /api/size-charts and its sourceId.
  const body = await readJsonObject(request);
  const sloperId =
    !(body instanceof NextResponse) && typeof body.sloperId === "string"
      ? body.sloperId
      : undefined;
  const t = await getTranslations("PatternData");

  if (sloperId) {
    const sloper = await loadSloper(sloperId, gate.id);
    if (!sloper) return sloperNotFound();
    // Free: drafting is local computation, no Anthropic call -- the same
    // reason /conflict/resolve costs nothing.
    const id = await createPatternFromState(
      gate.id,
      patternFromSloper(sloper, t),
    );
    return NextResponse.json({ id });
  }

  const id = await createPattern(gate.id, t);
  return NextResponse.json({ id });
}
