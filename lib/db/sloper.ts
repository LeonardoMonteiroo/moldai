import { Prisma } from "@prisma/client";
import type { NextResponse } from "next/server";
import { prisma } from "./prisma";
import { patternFromSloper } from "@/lib/slopers/convert";
import { buildThumbnailSvg } from "@/lib/editor/thumbnail";
import { apiError, ERROR_STATUS } from "@/lib/api/errors";
import type { SloperData, SloperListItem } from "@/lib/types";
import type { Translate } from "@/lib/i18n/translate";

type Row = { id: string; data: Prisma.JsonValue; updatedAt: Date };

function toData(data: Prisma.JsonValue): SloperData {
  return data as unknown as SloperData;
}

// The geometry is not stored, so the card's thumbnail is drafted here -- the
// same per-row work listPatternsForUser does, except the pieces come from
// draftGarment instead of the blob. Pure geometry, no AI call.
function toListItem(row: Row, t: Translate): SloperListItem {
  const data = toData(row.data);
  const { pattern } = patternFromSloper(data, t);
  return {
    id: row.id,
    name: data.name,
    garmentType: data.spec.type,
    baseSize: data.baseSize,
    ...(data.sizeChartName === undefined
      ? {}
      : { sizeChartName: data.sizeChartName }),
    updatedAt: row.updatedAt.toISOString(),
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
  return rows.map((row) => toListItem(row, t));
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
  return toListItem(row, t);
}

// Ownership-scoped read. Null when missing or not owned -- indistinguishable
// on purpose, so a 404 never confirms another account's row exists.
export async function loadSloper(
  sloperId: string,
  userId: string,
): Promise<SloperData | null> {
  const row = await prisma.sloper.findUnique({ where: { id: sloperId } });
  if (!row || row.userId !== userId) return null;
  return toData(row.data);
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
  const next: SloperData = { ...toData(row.data), name };
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
