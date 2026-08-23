-- #68: ensureSystemSizeCharts (lib/db/sizeChart.ts) was check-then-insert
-- with nothing enforcing it atomically -- two overlapping requests for a
-- brand-new account (e.g. /size-charts loading while a generate is in
-- flight) could both see zero rows and both insert, leaving the account
-- with four permanently-undeletable system charts (deleteSizeChart refuses
-- isSystem rows, and the seed never re-checks once hasSystem is true).
--
-- Before the CREATE UNIQUE INDEX below can apply, any database that already
-- hit this bug needs its duplicates collapsed first, or the index creation
-- fails outright (docker-entrypoint.sh runs `prisma migrate deploy`
-- unconditionally on every container start, so a blocked migration blocks
-- startup). Both steps below are correcting bug-produced duplicate rows,
-- not real user data -- the two system charts are pre-seeded defaults, not
-- something a user authored.
--
-- Step 1: for every (userId, gender) pair with more than one isSystem row,
-- keep the oldest (first-created) as the survivor. If a user's
-- activeSizeChartId happened to point at a row about to be removed (User
-- has no FK there, so it would otherwise dangle silently -- see
-- setActiveSizeChart), repoint it at that pair's survivor first.
WITH ranked AS (
  SELECT
    "id",
    "userId",
    ("data" ->> 'gender') AS gender,
    ROW_NUMBER() OVER (
      PARTITION BY "userId", ("data" ->> 'gender')
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "SizeChart"
  WHERE ("data" ->> 'isSystem')::boolean
)
UPDATE "User" u
SET "activeSizeChartId" = survivor."id"
FROM ranked loser
JOIN ranked survivor
  ON survivor."userId" = loser."userId"
 AND survivor.gender = loser.gender
 AND survivor.rn = 1
WHERE loser.rn > 1
  AND u."activeSizeChartId" = loser."id";

-- Step 2: delete every duplicate but the survivor picked above.
WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "userId", ("data" ->> 'gender')
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS rn
  FROM "SizeChart"
  WHERE ("data" ->> 'isSystem')::boolean
)
DELETE FROM "SizeChart"
WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1);

-- Step 3: the real guarantee going forward. Not mirrored in schema.prisma --
-- Prisma cannot express a partial index over a JSON path -- see the warning
-- comment above `model SizeChart`.
CREATE UNIQUE INDEX "SizeChart_userId_systemGender_key"
ON "SizeChart" ("userId", (("data" ->> 'gender')))
WHERE (("data" ->> 'isSystem')::boolean);
