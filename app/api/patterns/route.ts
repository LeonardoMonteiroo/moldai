import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth/guard";
import { readJsonObject, hasNulByte } from "@/lib/api/body";
import { MAX_PATTERN_NAME_LENGTH } from "@/lib/types";
import {
  listPatternsForUser,
  createPattern,
  createPatternFromState,
} from "@/lib/db/pattern";
import { loadSloper, sloperNotFound } from "@/lib/db/sloper";
import { patternFromSloper } from "@/lib/slopers/convert";
import { apiError } from "@/lib/api/errors";
import { consume } from "@/lib/rate-limit/consume";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const patterns = await listPatternsForUser(gate.id);
  return NextResponse.json(patterns);
}

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  // #101: the only throttle on this route before this was COSTS -- but
  // creating a pattern (blank or sloper-backed) is free, so nothing capped
  // request volume. Keyed on the account id, which can't be spoofed.
  const limited = await consume("create", gate.id);
  if (!limited.allowed) {
    return apiError("rate_limited", 429, {
      "Retry-After": String(limited.retryAfterSec),
    });
  }
  // Tolerates an unusable body -- that just means "no sloperId", i.e. a blank
  // pattern, which is exactly what api.createPattern() sends today. Same
  // deliberate tolerance as POST /api/size-charts and its sourceId.
  const body = await readJsonObject(request);
  const fields = body instanceof NextResponse ? undefined : body;
  const sloperId =
    fields && typeof fields.sloperId === "string" ? fields.sloperId : undefined;
  // The two fields are read with deliberately different strictness, which
  // looks inconsistent until you ask what each one's fallback would be. An
  // unusable `sloperId` has a well-defined one -- "no base", i.e. a blank
  // pattern, which is what the majority of this route's callers ask for
  // anyway -- so ignoring it costs the caller nothing it cannot see. An
  // unusable `name` has no safe fallback: silently creating the molde under
  // the catalog default would hide the fact that the name the user typed was
  // refused, and creating it under a truncated one would invent a name they
  // never chose. So an absent or blank name means "use the default"
  // (PFORM-04's own empty-field case), while one past the cap or carrying a
  // NUL byte is refused outright, the same pair PATCH /api/patterns/[id] and
  // POST /api/slopers already enforce.
  const name =
    fields && typeof fields.name === "string" ? fields.name.trim() : "";
  if (name.length > MAX_PATTERN_NAME_LENGTH || hasNulByte(name)) {
    return apiError("invalid_name", 400);
  }
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

  // Passed only when there is one: an absent third argument is what keeps
  // seedPatternState's own t("newPatternName") in play for every caller that
  // never sends a name.
  const id = name
    ? await createPattern(gate.id, t, name)
    : await createPattern(gate.id, t);
  return NextResponse.json({ id });
}
