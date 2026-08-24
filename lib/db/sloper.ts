import { Prisma } from "@prisma/client";
import type { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { patternFromSloper } from "@/lib/slopers/convert";
import { buildThumbnailSvg } from "@/lib/editor/thumbnail";
import { apiError, ERROR_STATUS } from "@/lib/api/errors";
import { reportError } from "@/lib/observability/report";
import { SloperDataSchema } from "@/lib/schemas/sloper";
import type { SloperData, SloperListItem } from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";

// #58: used to be a bare assertion. A row whose baseSize has drifted out of
// its sizeTable (or any other structural drift) now fails to parse instead
// of feeding patternFromSloper an undefined base row.
function toData(sloperId: string, data: Prisma.JsonValue): SloperData | null {
  const result = SloperDataSchema.safeParse(data);
  if (!result.success) {
    reportError("db.sloper.parse", result.error, { sloperId });
    return null;
  }
  return result.data;
}

// The geometry is not stored, so the card's thumbnail is drafted here -- the
// same per-row work listPatternsForUser does, except the pieces come from
// draftGarment instead of the blob. Pure geometry, no AI call. Takes an
// already-parsed SloperData rather than a raw row, so createSloper can build
// a list item from the data it already validated at the call site instead of
// re-parsing its own freshly-written row.
function buildListItem(
  id: string,
  updatedAt: Date,
  data: SloperData,
  t: Translate,
): SloperListItem {
  const { pattern } = patternFromSloper(data, t);
  return {
    id,
    name: data.name,
    garmentType: data.spec.type,
    baseSize: data.baseSize,
    ...(data.sizeChartName === undefined
      ? {}
      : { sizeChartName: data.sizeChartName }),
    updatedAt: updatedAt.toISOString(),
    thumbnailSvg: buildThumbnailSvg(pattern),
  };
}

export async function listSlopersForUser(
  userId: string,
  t: Translate,
): Promise<SloperListItem[]> {
  const rows = await prisma.sloper.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  // #58: an unparseable row is skipped rather than thrown on -- one drifted
  // blob costs its own card, not the whole /slopers list.
  const items: SloperListItem[] = [];
  for (const row of rows) {
    const data = toData(row.id, row.data);
    if (!data) continue;
    items.push(buildListItem(row.id, row.updatedAt, data, t));
  }
  return items;
}

// Takes finished SloperData rather than a patternId: the route already owns
// the ownership-scoped loadPattern, and only the route can tell 404 (not your
// pattern) from 400 (not drafted). So this module never learns what a Pattern is.
export async function createSloper(
  userId: string,
  data: SloperData,
  t: Translate,
): Promise<SloperListItem> {
  const row = await prisma.sloper.create({
    data: { userId, data: data as unknown as Prisma.InputJsonValue },
  });
  return buildListItem(row.id, row.updatedAt, data, t);
}

// Ownership-scoped read. Null when missing, not owned, or unparseable --
// indistinguishable on purpose, so a 404 never confirms another account's
// row exists.
export async function loadSloper(
  sloperId: string,
  userId: string,
): Promise<SloperData | null> {
  const row = await prisma.sloper.findUnique({ where: { id: sloperId } });
  if (!row || row.userId !== userId) return null;
  return toData(sloperId, row.data);
}

// A sloper is immutable apart from its name, so no row lock is needed: two
// racing renames resolve to last-write-wins on the one mutable field, which is
// the same final state a lock would produce. The read exists only to merge
// `name` into the JSON blob (Prisma has no JSON-path patch without raw SQL);
// the write is a scoped updateMany so a concurrent delete answers `count: 0`
// rather than throwing P2025 — this module never throws, the same contract
// lib/db/pattern.ts holds.
export async function renameSloper(
  sloperId: string,
  userId: string,
  name: string,
): Promise<boolean> {
  const row = await prisma.sloper.findUnique({ where: { id: sloperId } });
  if (!row || row.userId !== userId) return false;
  const data = toData(sloperId, row.data);
  if (!data) return false;
  const next: SloperData = { ...data, name };
  const res = await prisma.sloper.updateMany({
    where: { id: sloperId, userId },
    data: { data: next as unknown as Prisma.InputJsonValue },
  });
  return res.count > 0;
}

export async function deleteSloper(
  sloperId: string,
  userId: string,
): Promise<boolean> {
  const res = await prisma.sloper.deleteMany({
    where: { id: sloperId, userId },
  });
  return res.count > 0;
}

export function sloperNotFound(): NextResponse {
  return apiError("sloper_not_found", ERROR_STATUS.sloper_not_found);
}
