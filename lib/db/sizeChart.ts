import { Prisma } from "@prisma/client";
import { validateSizeChartPatch } from "@/lib/sizeCharts/validate";
import { prisma } from "./prisma";
import { buildSystemSizeChartData } from "@/lib/sizeCharts/seed";
import { pickSizeChartForGeneration } from "@/lib/sizeCharts/compute";
import type { Gender, SizeChartData, SizeChartRecord } from "@/lib/types";

type Tx = Prisma.TransactionClient;

function toRecord(row: {
  id: string;
  data: Prisma.JsonValue;
  updatedAt: Date;
}): SizeChartRecord {
  return {
    id: row.id,
    updatedAt: row.updatedAt.toISOString(),
    ...(row.data as unknown as SizeChartData),
  };
}

// Seeds the two system default size charts for a user the first time
// they're needed — same "lazily reseeded on first access" precedent as
// lib/db/wallet.ts's seedWallet.
//
// #67: takes `tx` rather than the module-level `prisma` singleton so a
// caller already inside an interactive transaction (withPatternAndWallet)
// can pass that transaction's client — running these queries on some other
// pooled connection while a Pattern+Wallet-locking transaction holds one for
// the whole AI call risks pool exhaustion, and a createMany committing on
// its own connection would survive a rollback of the transaction it looks
// like it belongs to. A bare PrismaClient (the `prisma` singleton) is
// structurally assignable to Prisma.TransactionClient, so a non-transactional
// caller just passes `prisma` straight through.
export async function ensureSystemSizeCharts(
  tx: Tx,
  userId: string,
): Promise<void> {
  const existing = await tx.sizeChart.findMany({ where: { userId } });
  const hasSystem = existing.some(
    (r) => (r.data as unknown as SizeChartData).isSystem,
  );
  if (hasSystem) return;
  const female = buildSystemSizeChartData(
    "female",
  ) as unknown as Prisma.InputJsonValue;
  const male = buildSystemSizeChartData(
    "male",
  ) as unknown as Prisma.InputJsonValue;
  // updatedAt is set explicitly (not left to @updatedAt) because createMany's
  // handling of @updatedAt defaults is version-sensitive in Prisma — create()
  // can be trusted for it (see createPattern), createMany() shouldn't be.
  const now = new Date();
  // #68: the hasSystem check above is check-then-insert, not atomic, so two
  // overlapping requests for a brand-new account can both see zero rows and
  // both reach here. The real guarantee is the partial unique index added in
  // migration 20260823120000 (userId, gender WHERE isSystem) -- skipDuplicates
  // makes Prisma emit ON CONFLICT DO NOTHING instead of throwing, so the
  // loser of the race silently contributes zero rows rather than leaving the
  // account with two copies of each system chart.
  await tx.sizeChart.createMany({
    data: [
      { userId, data: female, updatedAt: now },
      { userId, data: male, updatedAt: now },
    ],
    skipDuplicates: true,
  });
}

export async function listSizeChartsForUser(
  tx: Tx,
  userId: string,
): Promise<SizeChartRecord[]> {
  await ensureSystemSizeCharts(tx, userId);
  const rows = await tx.sizeChart.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
  });
  return rows.map(toRecord);
}

export async function getActiveSizeChartId(
  tx: Tx,
  userId: string,
): Promise<string | null> {
  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { activeSizeChartId: true },
  });
  return user?.activeSizeChartId ?? null;
}

// Duplicates sourceSizeChartId's data (or the system female-adult default if
// omitted) into a new, always-editable (isSystem: false) chart — backs both
// "＋ Nova grade" and "Duplicar".
//
// #64: a given-but-unresolved sourceSizeChartId (a stale list, another
// account's id) used to fall through the same `??` chain as "no id given
// at all" and silently substitute the system female-adult chart -- wrong
// gender, wrong measurements, no error. Only the "no id given" case falls
// back now; an id that doesn't resolve returns null so the caller can 404.
export async function createSizeChart(
  userId: string,
  copySuffix: string,
  sourceSizeChartId?: string,
): Promise<SizeChartRecord | null> {
  const charts = await listSizeChartsForUser(prisma, userId);
  let source: SizeChartRecord | undefined;
  if (sourceSizeChartId) {
    source = charts.find((c) => c.id === sourceSizeChartId);
    if (!source) return null;
  } else {
    source =
      charts.find((c) => c.isSystem && c.gender === "female") ?? charts[0];
  }
  const { id: _id, updatedAt: _updatedAt, ...sourceData } = source;
  const data: SizeChartData = {
    ...sourceData,
    name: `${sourceData.name}${copySuffix}`,
    isSystem: false,
  };
  const row = await prisma.sizeChart.create({
    data: { userId, data: data as unknown as Prisma.InputJsonValue },
  });
  return toRecord(row);
}

/**
 * `patch` is deliberately `unknown`: it arrives straight off the wire, and
 * typing it as Partial<SizeChartData> was an assertion the compiler could not
 * check — which is how `gender: "banana"` and a wiped baseMeasurements got
 * persisted. validateSizeChartPatch is the trust boundary; it runs here rather
 * than in the route because the merge needs the current row.
 *
 * #21: the read stays a plain findUnique (it only needs the current row to
 * merge the patch and to check isSystem), but the write is a userId-scoped
 * updateMany — same renameSloper template as deleteSizeChart/setActiveSizeChart
 * below — so a delete racing in between answers `count: 0` instead of the old
 * single-record `update()` throwing P2025. updatedAt is set explicitly (the
 * ensureSystemSizeCharts precedent above) so the returned record doesn't need
 * a second read to pick it up.
 */
export async function updateSizeChart(
  sizeChartId: string,
  userId: string,
  patch: unknown,
): Promise<SizeChartRecord | null> {
  const row = await prisma.sizeChart.findUnique({
    where: { id: sizeChartId },
  });
  if (!row || row.userId !== userId) return null;
  const current = row.data as unknown as SizeChartData;
  if (current.isSystem) return null; // system charts are read-only
  const next: SizeChartData = {
    ...current,
    ...validateSizeChartPatch(current, patch),
    isSystem: false,
  };
  const updatedAt = new Date();
  const res = await prisma.sizeChart.updateMany({
    where: { id: sizeChartId, userId },
    data: { data: next as unknown as Prisma.InputJsonValue, updatedAt },
  });
  if (res.count === 0) return null;
  return { id: sizeChartId, updatedAt: updatedAt.toISOString(), ...next };
}

// #21: deleteMany scoped to (id, userId) instead of delete({where:{id}}) --
// delete() throws P2025 if the row is already gone (a concurrent second
// delete, or a delete racing this same read), deleteMany() just answers
// count: 0. Same renameSloper/deleteSloper template as lib/db/sloper.ts.
export async function deleteSizeChart(
  sizeChartId: string,
  userId: string,
): Promise<boolean> {
  const row = await prisma.sizeChart.findUnique({
    where: { id: sizeChartId },
  });
  if (!row || row.userId !== userId) return false;
  const current = row.data as unknown as SizeChartData;
  if (current.isSystem) return false;
  const res = await prisma.sizeChart.deleteMany({
    where: { id: sizeChartId, userId },
  });
  if (res.count === 0) return false;
  await prisma.user.updateMany({
    where: { id: userId, activeSizeChartId: sizeChartId },
    data: { activeSizeChartId: null },
  });
  return true;
}

// #21: the ownership check used to be an unscoped findUnique followed by an
// application-code `row.userId !== userId` compare -- a count() scoped to
// (id, userId) folds that check into the query itself instead. The eventual
// write is to User.activeSizeChartId, a plain string with no FK to
// SizeChart, so it was never at risk of throwing P2025 on a concurrently
// deleted chart; this brings it in line with the other two functions' query
// shape rather than fixing a throw that didn't exist here.
export async function setActiveSizeChart(
  userId: string,
  sizeChartId: string,
): Promise<boolean> {
  const owned = await prisma.sizeChart.count({
    where: { id: sizeChartId, userId },
  });
  if (owned === 0) return false;
  await prisma.user.update({
    where: { id: userId },
    data: { activeSizeChartId: sizeChartId },
  });
  return true;
}

/**
 * The size chart a NEW generation should draft from: the account's active
 * chart if its gender matches, else the system default for that gender.
 *
 * Returns the passed-over active chart's name too, so the route can tell the
 * user its measurements were not the ones used. Previously this returned only
 * the chart and the substitution was invisible.
 */
export async function getSizeChartForGeneration(
  tx: Tx,
  userId: string,
  gender: Gender,
): Promise<{ chart: SizeChartData; rejectedActiveName: string | null }> {
  const charts = await listSizeChartsForUser(tx, userId);
  const activeSizeChartId = await getActiveSizeChartId(tx, userId);
  const { chart: record, rejectedActive } = pickSizeChartForGeneration(
    charts,
    activeSizeChartId,
    gender,
  );
  const { id: _id, updatedAt: _updatedAt, ...data } = record;
  return { chart: data, rejectedActiveName: rejectedActive?.name ?? null };
}
