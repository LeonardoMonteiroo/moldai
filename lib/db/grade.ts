import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { buildSystemGradeData } from "@/lib/grades/seed";
import { pickGradeForGeneration } from "@/lib/grades/compute";
import type { Gender, GradeData, GradeRecord } from "@/lib/types";

function toRecord(row: {
  id: string;
  data: Prisma.JsonValue;
  updatedAt: Date;
}): GradeRecord {
  return {
    id: row.id,
    updatedAt: row.updatedAt.toISOString(),
    ...(row.data as unknown as GradeData),
  };
}

// Seeds the two system default grades for a user the first time they're
// needed — same "lazily reseeded on first access" precedent as
// lib/db/wallet.ts's seedWallet.
export async function ensureSystemGrades(userId: string): Promise<void> {
  const existing = await prisma.grade.findMany({ where: { userId } });
  const hasSystem = existing.some(
    (r) => (r.data as unknown as GradeData).isSystem,
  );
  if (hasSystem) return;
  const female = buildSystemGradeData(
    "female",
  ) as unknown as Prisma.InputJsonValue;
  const male = buildSystemGradeData("male") as unknown as Prisma.InputJsonValue;
  // updatedAt is set explicitly (not left to @updatedAt) because createMany's
  // handling of @updatedAt defaults is version-sensitive in Prisma — create()
  // can be trusted for it (see createPattern), createMany() shouldn't be.
  const now = new Date();
  await prisma.grade.createMany({
    data: [
      { userId, data: female, updatedAt: now },
      { userId, data: male, updatedAt: now },
    ],
  });
}

export async function listGradesForUser(
  userId: string,
): Promise<GradeRecord[]> {
  await ensureSystemGrades(userId);
  const rows = await prisma.grade.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toRecord);
}

export async function getActiveGradeId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { activeGradeId: true },
  });
  return user?.activeGradeId ?? null;
}

// Duplicates sourceGradeId's data (or the system female-adult default if
// omitted) into a new, always-editable (isSystem: false) grade — backs both
// "＋ Nova grade" and "Duplicar".
export async function createGrade(
  userId: string,
  sourceGradeId?: string,
): Promise<GradeRecord> {
  const grades = await listGradesForUser(userId);
  const source =
    grades.find((g) => g.id === sourceGradeId) ??
    grades.find((g) => g.isSystem && g.gender === "female") ??
    grades[0];
  const { id: _id, updatedAt: _updatedAt, ...sourceData } = source;
  const data: GradeData = {
    ...sourceData,
    name: `${sourceData.name} (cópia)`,
    isSystem: false,
  };
  const row = await prisma.grade.create({
    data: { userId, data: data as unknown as Prisma.InputJsonValue },
  });
  return toRecord(row);
}

export async function updateGrade(
  gradeId: string,
  userId: string,
  patch: Partial<GradeData>,
): Promise<GradeRecord | null> {
  const row = await prisma.grade.findUnique({ where: { id: gradeId } });
  if (!row || row.userId !== userId) return null;
  const current = row.data as unknown as GradeData;
  if (current.isSystem) return null; // system grades are read-only
  const sizes =
    Array.isArray(patch.sizes) && patch.sizes.length > 0
      ? patch.sizes
      : current.sizes;
  const baseSizeIndex =
    typeof patch.baseSizeIndex === "number" &&
    patch.baseSizeIndex >= 0 &&
    patch.baseSizeIndex < sizes.length
      ? patch.baseSizeIndex
      : Math.min(current.baseSizeIndex, sizes.length - 1);
  const next: GradeData = {
    ...current,
    ...patch,
    sizes,
    baseSizeIndex,
    isSystem: false,
  };
  const updated = await prisma.grade.update({
    where: { id: gradeId },
    data: { data: next as unknown as Prisma.InputJsonValue },
  });
  return toRecord(updated);
}

export async function deleteGrade(
  gradeId: string,
  userId: string,
): Promise<boolean> {
  const row = await prisma.grade.findUnique({ where: { id: gradeId } });
  if (!row || row.userId !== userId) return false;
  const current = row.data as unknown as GradeData;
  if (current.isSystem) return false;
  await prisma.grade.delete({ where: { id: gradeId } });
  await prisma.user.updateMany({
    where: { id: userId, activeGradeId: gradeId },
    data: { activeGradeId: null },
  });
  return true;
}

export async function setActiveGrade(
  userId: string,
  gradeId: string,
): Promise<boolean> {
  const row = await prisma.grade.findUnique({ where: { id: gradeId } });
  if (!row || row.userId !== userId) return false;
  await prisma.user.update({
    where: { id: userId },
    data: { activeGradeId: gradeId },
  });
  return true;
}

// The grade a NEW generation should draft from: the account's active grade if
// its gender matches, else the system default for that gender.
export async function getGradeForGeneration(
  userId: string,
  gender: Gender,
): Promise<GradeData> {
  const grades = await listGradesForUser(userId);
  const activeGradeId = await getActiveGradeId(userId);
  const record = pickGradeForGeneration(grades, activeGradeId, gender);
  const { id: _id, updatedAt: _updatedAt, ...data } = record;
  return data;
}
