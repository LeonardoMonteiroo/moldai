import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { listVersions } from "@/lib/db/patternVersion";
import { patternNotFound } from "@/lib/db/pattern";

type Ctx = { params: Promise<{ id: string }> };

// Read-only, ownership-scoped list -- listVersions returns null (never an
// empty array) for a pattern that doesn't exist or isn't the caller's, so
// this can't become an existence oracle for another account's pattern ids.
export async function GET(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  const versions = await listVersions(id, gate.id);
  if (!versions) return patternNotFound();
  return NextResponse.json(versions);
}
