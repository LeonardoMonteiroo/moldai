import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { readJsonObject } from "@/lib/api/body";
import { getExportPreset, saveExportPreset } from "@/lib/db/exportPreset";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const preset = await getExportPreset(gate.id);
  return NextResponse.json({ preset });
}

export async function PUT(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  // #17: deliberately readJsonObject, not parseBody -- the PATCH
  // /api/size-charts/[id] precedent (CLAUDE.md's API routes section).
  // validateExportPreset (lib/export/preset.ts) already owns the trust
  // boundary end-to-end with drop-or-clamp-never-throw semantics: an
  // unknown field is dropped, an out-of-range or unrecognised enum value
  // falls back to its default, and it never throws on a hostile shape. A
  // parseBody zod schema here could only ever prove "this is an object" --
  // exactly what readJsonObject already guarantees -- so it would be dead
  // weight, not a second line of defence.
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const preset = await saveExportPreset(gate.id, body);
  return NextResponse.json({ preset });
}
