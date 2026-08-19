# Measurement Grades (5i) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the app's hardcoded size tables (`SIZE_TABLE`/`SIZE_TABLE_MALE`/`ALL_SIZES`) with a real, per-account measurement-grade system — users create/edit/duplicate grids (custom size lists + a progression rule + manual per-cell overrides), and the grade they activate drives pattern generation and grading — per the approved design at `docs/superpowers/specs/2026-08-19-measurement-grades-design.md`.

**Architecture:** Bottom-up, matching the design doc's layering: types → pure grade-computation logic (`lib/grades/`) → the draft engine's decoupling from `SizeLabel` → editor-state wiring → DB repository → API routes → client (api-client/store) → UI (`/grades` screen). Every task leaves the app compiling and its tests passing — never split a module's rename/signature change from its call sites across two tasks.

**Tech Stack:** Next.js 16 (App Router), Prisma 6 / Postgres, Zustand, next-intl, Vitest.

## Global Constraints

- **UI display text (pt-BR string values) is never touched except where explicitly adding new copy for this feature** — matches CLAUDE.md's code-EN/UI-pt-BR convention.
- **No backwards-compatibility shims.** `ALL_SIZES` is deleted outright, not kept as a deprecated re-export.
- `bodyType` is descriptive metadata only — never wire it into drafting geometry.
- Grade selection is account-level (`User.activeGradeId`), not a per-pattern control.
- "Bases do ateliê" and the Audaces spreadsheet import block are inert, visibly-present, "em breve"-badged placeholders — do not implement their functionality.
- A pattern's grade snapshot (`sizes`/`baseSize`/`sizeTable`) is frozen at first generation and never retroactively changed by later edits to the account's active grade.

---

### Task 1: Prisma schema + migration (`Grade` model, `User.activeGradeId`)

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260819130000_add_grades/migration.sql`

**Interfaces:**

- Produces: Prisma model `Grade` (table `"Grade"`, columns `id`, `userId`, `data`, `updatedAt`, `createdAt`), `User.activeGradeId: String?`. Task 9 depends on this compiling (`prisma generate` must run first).

- [ ] **Step 1: Edit `prisma/schema.prisma`**

Change:

```prisma
model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String?
  createdAt    DateTime @default(now())
  patterns     Pattern[]
  wallet       Wallet?
}
```

to:

```prisma
model User {
  id            String   @id @default(cuid())
  email         String   @unique
  passwordHash  String
  name          String?
  createdAt     DateTime @default(now())
  patterns      Pattern[]
  wallet        Wallet?
  grades        Grade[]
  activeGradeId String?
}
```

Add, after the `Pattern` model:

```prisma
model Grade {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  data      Json
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  @@index([userId, updatedAt])
}
```

- [ ] **Step 2: Create the migration directory and SQL by hand**

Create `prisma/migrations/20260819130000_add_grades/migration.sql`:

```sql
-- Adds the Grade table (same JSON-blob-per-row shape as Pattern/Wallet) and
-- User.activeGradeId, for the measurement-grades feature (5i). Additive --
-- existing Pattern/User rows are untouched.
CREATE TABLE "Grade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Grade_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Grade_userId_updatedAt_idx" ON "Grade"("userId", "updatedAt");

ALTER TABLE "Grade" ADD CONSTRAINT "Grade_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "User" ADD COLUMN "activeGradeId" TEXT;
```

- [ ] **Step 3: Apply the migration and regenerate the client**

Run: `npm run db:up` (ensure local Postgres is running on host port 5433), then:

```bash
npm run db:migrate
```

Prisma finds the pending `20260819130000_add_grades` folder, applies its SQL, and reports "No schema change was detected" since the schema already matches. Then run `npx prisma generate` if not triggered automatically.

Expected: no errors; `node_modules/@prisma/client` now exposes `prisma.grade.*` and `User.activeGradeId`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260819130000_add_grades
git commit -m "feat(db): add Grade model and User.activeGradeId"
```

---

### Task 2: Types + `lib/measurements.ts` (widen `SizeLabel`, add grade types, decouple `resolveMeasurements` from size/gender lookup)

**Files:**

- Modify: `lib/types.ts`
- Modify: `lib/measurements.ts`
- Modify: `lib/measurements.test.ts`

**Interfaces:**

- Produces: `type SizeLabel = string` (was a fixed union; `ALL_SIZES` deleted), `type BodyType = "straight" | "hourglass" | "pear" | "apple"`, `interface GradeData { name, gender, bodyType, isSystem, sizes: string[], baseSizeIndex: number, baseMeasurements: Measurements, progressionRule: Partial<Record<keyof Measurements, number>>, overrides: Record<string, Partial<Measurements>> }`, `interface GradeRecord extends GradeData { id: string; updatedAt: string }`, `interface GradeListEntry extends GradeRecord { isActive: boolean }`. `Pattern` gains required `sizes: string[]` and `sizeTable: Record<string, Measurements>`. `resolveMeasurements(base: Measurements, overrides: Partial<Measurements>): Measurements` (was `(size, overrides, gender?)`, did its own table lookup — now the caller resolves the base row). Consumed by every later task in this plan.

- [ ] **Step 1: Edit `lib/types.ts`**

Change:

```typescript
export type SizeLabel = "PP" | "P" | "M" | "G" | "GG";
```

to:

```typescript
export type SizeLabel = string;

export type BodyType = "straight" | "hourglass" | "pear" | "apple";
```

Change the `Pattern` interface — add `sizes` and `sizeTable` (required, right after `sizesPending`):

```typescript
export interface Pattern {
  id: string;
  name: string;
  version: number;
  savedAgo: string;
  baseSize: SizeLabel;
  unit: string;
  sizes: string[];
  sizesApplied: SizeLabel[];
  sizesPending: SizeLabel[];
  sizeTable: Record<string, Measurements>;
  pieces: Piece[];
  spec?: GarmentSpec;
  viewBox?: { w: number; h: number };
  baseMeasurements?: Measurements;
}
```

Delete:

```typescript
export const ALL_SIZES: SizeLabel[] = ["PP", "P", "M", "G", "GG"];
```

Add, right before `export const COSTS`:

```typescript
// A grade's editable data — grid library entries + the source of truth for
// resolveGradeSize/buildSizeTable (lib/grades/compute.ts). Persisted 1:1 as a
// Grade row's `data` JSON (lib/db/grade.ts), same shape convention as
// PatternState.
export interface GradeData {
  name: string;
  gender: Gender;
  bodyType: BodyType; // descriptive metadata only — never affects drafted geometry
  isSystem: boolean; // seeded, read-only (no edit/delete), duplicable
  sizes: string[]; // ordered size labels, e.g. ["PP","P","M","G","GG"] or ["36",...,"46"]
  baseSizeIndex: number; // index into sizes[] — the highlighted/base column
  baseMeasurements: Measurements; // values at the base size
  progressionRule: Partial<Record<keyof Measurements, number>>; // cm delta per size step
  overrides: Record<string, Partial<Measurements>>; // size -> field -> manual value, wins over the rule
}

export interface GradeRecord extends GradeData {
  id: string;
  updatedAt: string;
}

// Wire shape for GET /api/grades — isActive is computed server-side by
// comparing each record's id to the account's User.activeGradeId.
export interface GradeListEntry extends GradeRecord {
  isActive: boolean;
}
```

- [ ] **Step 2: Rewrite `lib/measurements.ts`**

```typescript
import { SizeLabel, Gender } from "./types";

export interface Measurements {
  bust: number; // bust circumference (cm)
  waist: number; // waist circumference (cm)
  hip: number; // hip circumference (cm)
  hipHeight: number; // waist → hip (cm)
  backLength: number; // nape → waist (cm)
  shoulder: number; // width of one shoulder (cm)
  skirtLength: number; // default skirt length (cm)
  shortSleeveLength: number; // (cm)
  longSleeveLength: number; // (cm)
}

export const SIZE_TABLE: Record<SizeLabel, Measurements> = {
  PP: {
    bust: 84,
    waist: 66,
    hip: 92,
    hipHeight: 20.0,
    backLength: 40.0,
    shoulder: 17.5,
    skirtLength: 60,
    shortSleeveLength: 18,
    longSleeveLength: 58,
  },
  P: {
    bust: 88,
    waist: 70,
    hip: 96,
    hipHeight: 20.3,
    backLength: 40.5,
    shoulder: 18.0,
    skirtLength: 60,
    shortSleeveLength: 18,
    longSleeveLength: 58,
  },
  M: {
    bust: 92,
    waist: 74,
    hip: 100,
    hipHeight: 20.6,
    backLength: 41.0,
    shoulder: 18.5,
    skirtLength: 60,
    shortSleeveLength: 18,
    longSleeveLength: 58,
  },
  G: {
    bust: 96,
    waist: 78,
    hip: 104,
    hipHeight: 21.0,
    backLength: 41.5,
    shoulder: 19.0,
    skirtLength: 60,
    shortSleeveLength: 18,
    longSleeveLength: 58,
  },
  GG: {
    bust: 100,
    waist: 82,
    hip: 108,
    hipHeight: 21.3,
    backLength: 42.0,
    shoulder: 19.5,
    skirtLength: 60,
    shortSleeveLength: 18,
    longSleeveLength: 58,
  },
};

export const SIZE_TABLE_MALE: Record<SizeLabel, Measurements> = {
  PP: {
    bust: 92,
    waist: 80,
    hip: 92,
    hipHeight: 21.0,
    backLength: 43.0,
    shoulder: 21.0,
    skirtLength: 60,
    shortSleeveLength: 22,
    longSleeveLength: 62,
  },
  P: {
    bust: 96,
    waist: 84,
    hip: 96,
    hipHeight: 21.3,
    backLength: 43.5,
    shoulder: 21.5,
    skirtLength: 60,
    shortSleeveLength: 22,
    longSleeveLength: 62,
  },
  M: {
    bust: 100,
    waist: 88,
    hip: 100,
    hipHeight: 21.6,
    backLength: 44.0,
    shoulder: 22.0,
    skirtLength: 60,
    shortSleeveLength: 22,
    longSleeveLength: 62,
  },
  G: {
    bust: 104,
    waist: 92,
    hip: 104,
    hipHeight: 22.0,
    backLength: 44.5,
    shoulder: 22.5,
    skirtLength: 60,
    shortSleeveLength: 22,
    longSleeveLength: 62,
  },
  GG: {
    bust: 108,
    waist: 96,
    hip: 108,
    hipHeight: 22.3,
    backLength: 45.0,
    shoulder: 23.0,
    skirtLength: 60,
    shortSleeveLength: 22,
    longSleeveLength: 62,
  },
};

export const MEASUREMENT_RANGES: Record<
  keyof Measurements,
  { min: number; max: number }
> = {
  bust: { min: 70, max: 140 },
  waist: { min: 55, max: 130 },
  hip: { min: 78, max: 150 },
  hipHeight: { min: 15, max: 28 },
  backLength: { min: 34, max: 50 },
  shoulder: { min: 14, max: 26 },
  skirtLength: { min: 25, max: 120 },
  shortSleeveLength: { min: 8, max: 35 },
  longSleeveLength: { min: 40, max: 70 },
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

// Applies chat-driven overrides on top of an already-resolved base row (from
// a grade's sizeTable — see lib/grades/compute.ts's resolveGradeSize) and
// clamps to MEASUREMENT_RANGES. No longer does a size/gender table lookup
// itself — that responsibility moved to the grade layer.
export function resolveMeasurements(
  base: Measurements,
  overrides: Partial<Measurements>,
): Measurements {
  const result = { ...base };
  for (const k of Object.keys(overrides) as (keyof Measurements)[]) {
    const v = overrides[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      const r = MEASUREMENT_RANGES[k];
      result[k] = clamp(v, r.min, r.max);
    }
  }
  return result;
}
```

- [ ] **Step 3: Rewrite `lib/measurements.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import {
  SIZE_TABLE,
  SIZE_TABLE_MALE,
  MEASUREMENT_RANGES,
  resolveMeasurements,
} from "./measurements";

describe("size tables", () => {
  it("female has 5 sizes with monotonic bust/waist/hip grading", () => {
    const order = ["PP", "P", "M", "G", "GG"] as const;
    for (let i = 1; i < order.length; i++) {
      const a = SIZE_TABLE[order[i - 1]],
        b = SIZE_TABLE[order[i]];
      expect(b.bust).toBeGreaterThan(a.bust);
      expect(b.waist).toBeGreaterThan(a.waist);
      expect(b.hip).toBeGreaterThan(a.hip);
      expect(b.shoulder).toBeGreaterThan(a.shoulder);
    }
    expect(SIZE_TABLE.M.bust).toBe(92);
  });

  it("male is wider at the shoulder than female for the same size", () => {
    expect(SIZE_TABLE_MALE.M.shoulder).toBeGreaterThan(SIZE_TABLE.M.shoulder);
    expect(SIZE_TABLE_MALE.M.bust).toBe(100);
  });
});

describe("resolveMeasurements", () => {
  it("returns the base row unchanged with no overrides", () => {
    expect(resolveMeasurements(SIZE_TABLE.M, {}).waist).toBe(74);
  });

  it("applies a numeric override on top of the base row", () => {
    expect(resolveMeasurements(SIZE_TABLE.M, { waist: 68 }).waist).toBe(68);
  });

  it("leaves fields without an override untouched", () => {
    const r = resolveMeasurements(SIZE_TABLE.M, { waist: 68 });
    expect(r.bust).toBe(SIZE_TABLE.M.bust);
  });

  it("clamps the shoulder to the [14,26] range", () => {
    expect(resolveMeasurements(SIZE_TABLE.M, { shoulder: 99 }).shoulder).toBe(
      MEASUREMENT_RANGES.shoulder.max,
    );
    expect(resolveMeasurements(SIZE_TABLE.M, { shoulder: 1 }).shoulder).toBe(
      MEASUREMENT_RANGES.shoulder.min,
    );
  });

  it("ignores non-numeric override values", () => {
    const r = resolveMeasurements(SIZE_TABLE.M, {
      waist: "x" as unknown as number,
    });
    expect(r.waist).toBe(SIZE_TABLE.M.waist);
  });
});
```

- [ ] **Step 4: Run the affected tests**

```bash
npm test -- lib/measurements.test.ts
```

Expected: FAIL (nothing else in the codebase compiles against the new signatures yet — this is expected; `lib/types.ts`/`lib/measurements.ts` themselves are internally consistent, but every caller elsewhere is now broken. Confirm specifically that `lib/measurements.test.ts` itself passes in isolation; the full suite is red until Task 6/7 land, same multi-task-in-flight state the rename plan tolerated).

- [ ] **Step 5: Commit**

```bash
git add lib/types.ts lib/measurements.ts lib/measurements.test.ts
git commit -m "feat(types): widen SizeLabel, add grade types, decouple resolveMeasurements from size lookup"
```

---

### Task 3: `lib/grades/compute.ts` (pure progression/override resolution)

**Files:**

- Create: `lib/grades/compute.ts`
- Create: `lib/grades/compute.test.ts`

**Interfaces:**

- Consumes: `GradeData`, `GradeRecord`, `Gender` from `lib/types.ts` (Task 2); `Measurements`, `MEASUREMENT_RANGES` from `lib/measurements.ts`.
- Produces: `resolveGradeSize(grade: GradeData, size: string): Measurements`, `buildSizeTable(grade: GradeData): Record<string, Measurements>`, `pickGradeForGeneration(grades: GradeRecord[], activeGradeId: string | null, gender: Gender): GradeRecord`. Consumed by Task 4 (seed), Task 7 (editor state), Task 9 (db/grade.ts), and the `/grades` UI (Task 14).

- [ ] **Step 1: Write the failing test — `lib/grades/compute.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import {
  resolveGradeSize,
  buildSizeTable,
  pickGradeForGeneration,
} from "./compute";
import { MEASUREMENT_RANGES } from "@/lib/measurements";
import type { GradeData, GradeRecord } from "@/lib/types";

function baseGrade(overrides: Partial<GradeData> = {}): GradeData {
  return {
    name: "Test",
    gender: "female",
    bodyType: "straight",
    isSystem: false,
    sizes: ["PP", "P", "M", "G", "GG"],
    baseSizeIndex: 2,
    baseMeasurements: {
      bust: 92,
      waist: 74,
      hip: 100,
      hipHeight: 20.6,
      backLength: 41,
      shoulder: 18.5,
      skirtLength: 60,
      shortSleeveLength: 18,
      longSleeveLength: 58,
    },
    progressionRule: { bust: 4, waist: 4, hip: 4, shoulder: 0.5 },
    overrides: {},
    ...overrides,
  };
}

describe("resolveGradeSize", () => {
  it("returns the base row unchanged at the base size", () => {
    const grade = baseGrade();
    expect(resolveGradeSize(grade, "M")).toEqual(grade.baseMeasurements);
  });

  it("applies the progression rule scaled by distance from the base", () => {
    const grade = baseGrade();
    expect(resolveGradeSize(grade, "G").bust).toBe(96); // +1 step
    expect(resolveGradeSize(grade, "PP").bust).toBe(84); // -2 steps
  });

  it("a manual override wins over the rule-derived value", () => {
    const grade = baseGrade({ overrides: { G: { bust: 99 } } });
    expect(resolveGradeSize(grade, "G").bust).toBe(99);
    expect(resolveGradeSize(grade, "G").waist).toBe(78); // unaffected field still rule-derived
  });

  it("clamps the resolved value to MEASUREMENT_RANGES", () => {
    const grade = baseGrade({ progressionRule: { shoulder: 50 } });
    expect(resolveGradeSize(grade, "GG").shoulder).toBe(
      MEASUREMENT_RANGES.shoulder.max,
    );
  });

  it("treats a size not in the grid as step 0 from the base", () => {
    const grade = baseGrade();
    expect(resolveGradeSize(grade, "XX").bust).toBe(92);
  });
});

describe("buildSizeTable", () => {
  it("resolves every size in the grade", () => {
    const table = buildSizeTable(baseGrade());
    expect(Object.keys(table)).toEqual(["PP", "P", "M", "G", "GG"]);
    expect(table.M.bust).toBe(92);
    expect(table.G.bust).toBe(96);
  });
});

describe("pickGradeForGeneration", () => {
  function record(overrides: Partial<GradeRecord> = {}): GradeRecord {
    return {
      id: "g1",
      updatedAt: "2026-08-19T00:00:00.000Z",
      ...baseGrade(),
      ...overrides,
    };
  }

  it("uses the active grade when its gender matches", () => {
    const active = record({ id: "custom", isSystem: false, gender: "female" });
    const sysFemale = record({ id: "sys-f", isSystem: true, gender: "female" });
    const out = pickGradeForGeneration([active, sysFemale], "custom", "female");
    expect(out.id).toBe("custom");
  });

  it("falls back to the system grade for the requested gender when the active grade doesn't match", () => {
    const active = record({ id: "custom", isSystem: false, gender: "female" });
    const sysMale = record({ id: "sys-m", isSystem: true, gender: "male" });
    const out = pickGradeForGeneration([active, sysMale], "custom", "male");
    expect(out.id).toBe("sys-m");
  });

  it("falls back to any grade when there's no active id and no system match", () => {
    const only = record({ id: "only" });
    const out = pickGradeForGeneration([only], null, "male");
    expect(out.id).toBe("only");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- lib/grades/compute.test.ts
```

Expected: FAIL with "Cannot find module './compute'".

- [ ] **Step 3: Write `lib/grades/compute.ts`**

```typescript
import { MEASUREMENT_RANGES, Measurements } from "@/lib/measurements";
import type { Gender, GradeData, GradeRecord } from "@/lib/types";

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

// Resolves one size's Measurements from a grade: base row + progression rule
// scaled by the size's distance from the base column, with any manual
// per-cell override winning outright, then clamped to MEASUREMENT_RANGES.
export function resolveGradeSize(grade: GradeData, size: string): Measurements {
  const idx = grade.sizes.indexOf(size);
  const step = idx === -1 ? 0 : idx - grade.baseSizeIndex;
  const override = grade.overrides[size] ?? {};
  const result = {} as Measurements;
  for (const key of Object.keys(
    grade.baseMeasurements,
  ) as (keyof Measurements)[]) {
    const ruleValue =
      grade.baseMeasurements[key] + (grade.progressionRule[key] ?? 0) * step;
    const value = override[key] ?? ruleValue;
    const range = MEASUREMENT_RANGES[key];
    result[key] = clamp(value, range.min, range.max);
  }
  return result;
}

// Every size in the grade, fully resolved — frozen onto a Pattern at first
// generation (lib/editor/state.ts's seedPatternSizeSnapshot).
export function buildSizeTable(grade: GradeData): Record<string, Measurements> {
  const table: Record<string, Measurements> = {};
  for (const size of grade.sizes) table[size] = resolveGradeSize(grade, size);
  return table;
}

// Picks which grade a NEW generation should draft from: the account's active
// grade if its gender matches the spec being drafted, else the system default
// for that gender. `grades` must contain at least one system grade per gender
// (guaranteed by lib/db/grade.ts's ensureSystemGrades) or this degrades to the
// active grade (if any) or the first grade in the list.
export function pickGradeForGeneration(
  grades: GradeRecord[],
  activeGradeId: string | null,
  gender: Gender,
): GradeRecord {
  const active = grades.find((g) => g.id === activeGradeId);
  if (active && active.gender === gender) return active;
  const systemMatch = grades.find((g) => g.isSystem && g.gender === gender);
  return systemMatch ?? active ?? grades[0];
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- lib/grades/compute.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/grades/compute.ts lib/grades/compute.test.ts
git commit -m "feat(grades): add pure progression/override resolution logic"
```

---

### Task 4: `lib/grades/seed.ts` (system default grades, derived from `SIZE_TABLE`/`SIZE_TABLE_MALE`)

**Files:**

- Create: `lib/grades/seed.ts`
- Create: `lib/grades/seed.test.ts`

**Interfaces:**

- Consumes: `SIZE_TABLE`, `SIZE_TABLE_MALE`, `Measurements` from `lib/measurements.ts`; `Gender`, `GradeData` from `lib/types.ts`; `buildSizeTable` from Task 3.
- Produces: `buildSystemGradeData(gender: Gender): GradeData`. Consumed by Task 7 (`seedPattern`'s bootstrap default) and Task 9 (`lib/db/grade.ts`'s `ensureSystemGrades`).

- [ ] **Step 1: Write the failing test — `lib/grades/seed.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { buildSystemGradeData } from "./seed";
import { buildSizeTable } from "./compute";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";

const SIZES = ["PP", "P", "M", "G", "GG"] as const;

describe("buildSystemGradeData", () => {
  it("female grade's resolved size table exactly reproduces SIZE_TABLE", () => {
    const table = buildSizeTable(buildSystemGradeData("female"));
    for (const size of SIZES) {
      expect(table[size]).toEqual(SIZE_TABLE[size]);
    }
  });

  it("male grade's resolved size table exactly reproduces SIZE_TABLE_MALE", () => {
    const table = buildSizeTable(buildSystemGradeData("male"));
    for (const size of SIZES) {
      expect(table[size]).toEqual(SIZE_TABLE_MALE[size]);
    }
  });

  it("marks the seeded grade as isSystem with the base size at index 2 (M)", () => {
    const grade = buildSystemGradeData("female");
    expect(grade.isSystem).toBe(true);
    expect(grade.sizes[grade.baseSizeIndex]).toBe("M");
  });

  it("names the female and male grades distinctly", () => {
    expect(buildSystemGradeData("female").name).not.toBe(
      buildSystemGradeData("male").name,
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- lib/grades/seed.test.ts
```

Expected: FAIL with "Cannot find module './seed'".

- [ ] **Step 3: Write `lib/grades/seed.ts`**

```typescript
import { SIZE_TABLE, SIZE_TABLE_MALE, Measurements } from "@/lib/measurements";
import type { Gender, GradeData } from "@/lib/types";

const SIZES = ["PP", "P", "M", "G", "GG"];
const BASE_INDEX = 2; // "M"

function deriveProgressionRule(
  table: Record<string, Measurements>,
): Partial<Record<keyof Measurements, number>> {
  const base = table[SIZES[BASE_INDEX]];
  const prev = table[SIZES[BASE_INDEX - 1]];
  const rule: Partial<Record<keyof Measurements, number>> = {};
  for (const key of Object.keys(base) as (keyof Measurements)[]) {
    rule[key] = Math.round((base[key] - prev[key]) * 10) / 10;
  }
  return rule;
}

// Builds the GradeData for a system-seeded default, from today's static
// SIZE_TABLE/SIZE_TABLE_MALE. The progression rule is derived from the M->P
// step; any size where that rule doesn't reproduce the original table exactly
// gets a manual override, so buildSizeTable(this) === the original table.
export function buildSystemGradeData(gender: Gender): GradeData {
  const table = gender === "male" ? SIZE_TABLE_MALE : SIZE_TABLE;
  const baseMeasurements = table[SIZES[BASE_INDEX]];
  const progressionRule = deriveProgressionRule(table);
  const overrides: Record<string, Partial<Measurements>> = {};
  for (let idx = 0; idx < SIZES.length; idx++) {
    if (idx === BASE_INDEX) continue;
    const size = SIZES[idx];
    const step = idx - BASE_INDEX;
    const diffs: Partial<Measurements> = {};
    for (const key of Object.keys(baseMeasurements) as (keyof Measurements)[]) {
      const ruleValue =
        baseMeasurements[key] + (progressionRule[key] ?? 0) * step;
      const actual = table[size][key];
      if (Math.abs(ruleValue - actual) > 1e-9) diffs[key] = actual;
    }
    if (Object.keys(diffs).length > 0) overrides[size] = diffs;
  }
  return {
    name: gender === "male" ? "Masculino adulto" : "Feminino adulto · ABNT",
    gender,
    bodyType: "straight",
    isSystem: true,
    sizes: [...SIZES],
    baseSizeIndex: BASE_INDEX,
    baseMeasurements,
    progressionRule,
    overrides,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- lib/grades/seed.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/grades/seed.ts lib/grades/seed.test.ts
git commit -m "feat(grades): derive system default grades from the legacy size tables"
```

---

### Task 5: `lib/draft/garment.ts` — decouple the draft engine from `SizeLabel`

**Files:**

- Modify: `lib/draft/garment.ts`
- Modify: `lib/draft/garment.test.ts`

**Interfaces:**

- Consumes: `resolveMeasurements(base, overrides)` from Task 2.
- Produces: `draftAll(spec, baseMeasurements: Measurements, t)`, `draftPiecesCm(spec, baseMeasurements: Measurements, t)`, `draftGarment(spec, baseMeasurements: Measurements, t)` — the second parameter changes from `size: SizeLabel` to `baseMeasurements: Measurements` in all three. Consumed by Task 7 (`applyGarmentSpec`) and Task 8 (`buildExportModel`).

- [ ] **Step 1: Edit `lib/draft/garment.ts`**

Change the imports (drop `SizeLabel`, add `Measurements`):

```typescript
import {
  MEASUREMENT_RANGES,
  Measurements,
  resolveMeasurements,
} from "@/lib/measurements";
import {
  ClarifyQuestion,
  Neckline,
  GarmentSpec,
  GarmentStyle,
  GarmentType,
  SleeveLength,
  SkirtSilhouette,
  Gender,
} from "@/lib/types";
```

Change `draftAll`'s signature and body (drop the internal `resolveMeasurements` table lookup — it's now the caller-supplied row plus chat overrides):

```typescript
function draftAll(
  spec: GarmentSpec,
  baseMeasurements: Measurements,
  t: Translate,
): {
  drafted: DraftedPiece[];
  measurements: Measurements;
  armholeLenCm?: number;
  sleeveArmholeCm?: number;
} {
  const gender: Gender = spec.gender ?? "female";
  const measurements: Measurements = resolveMeasurements(
    baseMeasurements,
    spec.measurementOverrides,
  );
  const drafted: DraftedPiece[] = [];
  let armholeLenCm: number | undefined;
  let sleeveArmholeCm: number | undefined;
```

(everything below that line in `draftAll` is unchanged — read the current file first, only the signature and the `resolveMeasurements` call change.)

Change `draftPiecesCm` and `draftGarment`'s signatures:

```typescript
export function draftPiecesCm(
  spec: GarmentSpec,
  baseMeasurements: Measurements,
  t: Translate,
): DraftedPiece[] {
  return draftAll(spec, baseMeasurements, t).drafted;
}

export function draftGarment(
  spec: GarmentSpec,
  baseMeasurements: Measurements,
  t: Translate,
) {
  const { drafted, measurements, armholeLenCm, sleeveArmholeCm } = draftAll(
    spec,
    baseMeasurements,
    t,
  );
  const { pieces, viewBox } = autoLayout(drafted, 8);
  return { pieces, viewBox, measurements, armholeLenCm, sleeveArmholeCm };
}
```

- [ ] **Step 2: Update `lib/draft/garment.test.ts`**

Add the import and replace every `"M"` literal passed as the second argument to `draftGarment`/`draftPiecesCm` with `SIZE_TABLE.M` (female) or `SIZE_TABLE_MALE.M` (male, per each test's `gender`):

```typescript
import { describe, it, expect } from "vitest";
import {
  validateSpec,
  draftGarment,
  validateQuestions,
  draftPiecesCm,
} from "./garment";
import { SIZE_TABLE, SIZE_TABLE_MALE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
```

In `describe("draftGarment", ...)`, every call's second argument `"M"` becomes `SIZE_TABLE.M` when `gender: "female"` and `SIZE_TABLE_MALE.M` when `gender: "male"` — e.g.:

```typescript
it("blouse generates front, back, and sleeve", () => {
  const { pieces } = draftGarment(
    {
      type: "blouse",
      gender: "female",
      measurementOverrides: {},
      style: { sleeve: "short", neckline: "V" },
    },
    SIZE_TABLE.M,
    t,
  );
  ...
```

```typescript
it("tshirt generates front/back/sleeve, no dart, round neckline", () => {
  const { pieces } = draftGarment(
    {
      type: "tshirt",
      gender: "male",
      measurementOverrides: {},
      style: {},
    },
    SIZE_TABLE_MALE.M,
    t,
  );
  ...
```

Apply the same substitution (by each test's `gender` field) to every remaining `draftGarment(...)` call in that `describe` block (skirt, dress, armholeDeepenCm, no-adjustment, sleeveRefit — all `gender: "female"` → `SIZE_TABLE.M`), and to `describe("draftPiecesCm", ...)`'s single call (`gender: "male"` → `SIZE_TABLE_MALE.M`).

- [ ] **Step 3: Run the affected tests**

```bash
npm test -- lib/draft/garment.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/draft/garment.ts lib/draft/garment.test.ts
git commit -m "refactor(draft): decouple draftGarment from SizeLabel, take a resolved measurements row"
```

---

### Task 6: `lib/export/model.ts` — draft from the pattern's own `sizeTable`

**Files:**

- Modify: `lib/export/model.ts`
- Modify: `lib/export/model.test.ts`
- Modify: `lib/export/cutplan.test.ts`

**Interfaces:**

- Consumes: `draftPiecesCm(spec, baseMeasurements, t)` from Task 5; `Pattern.sizeTable`/`baseSize` from Task 2.
- Produces: `buildExportModel(pattern, t)` unchanged externally; `ExportModel.size` stays `string`, sourced from `pattern.baseSize` as before.

- [ ] **Step 1: Edit `lib/export/model.ts`**

Change the single `draftPiecesCm` call site inside `buildExportModel`:

```typescript
export function buildExportModel(pattern: Pattern, t: Translate): ExportModel {
  const spec = pattern.spec;
  if (!spec) throw new Error("buildExportModel: pattern has no spec");
  const baseMeasurements = pattern.sizeTable[pattern.baseSize];
  const drafted: DraftedPiece[] = draftPiecesCm(spec, baseMeasurements, t);
```

(every other line in the file — `outlineSegments`, the shelf-packing, the returned `ExportModel` — is unchanged; `size: pattern.baseSize` at the bottom stays as-is.)

- [ ] **Step 2: Update `lib/export/model.test.ts`**

Add the import and the two new required `Pattern` fields to `fakePattern()`:

```typescript
import { describe, it, expect } from "vitest";
import { outlineSegments, buildExportModel } from "./model";
import type { Pt } from "@/lib/draft/core";
import type { Pattern } from "@/lib/types";
import { SIZE_TABLE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";
```

```typescript
function fakePattern(): Pattern {
  return {
    id: "p1",
    name: "Camiseta Teste",
    version: 1,
    savedAgo: "agora",
    baseSize: "M",
    unit: "cm",
    sizes: ["PP", "P", "M", "G", "GG"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: { M: SIZE_TABLE.M },
    pieces: [
      {
        id: "x",
        name: "x",
        qty: 1,
        outline: { kind: "polygon", points: "0,0" },
        label: { x: 0, y: 0 },
        detailRows: [],
      },
    ],
    spec: {
      type: "tshirt",
      gender: "male",
      measurementOverrides: {},
      style: { seamAllowanceCm: 1.5 },
    },
  };
}
```

(the rest of the file — `outlineSegments` tests and both `describe("buildExportModel", ...)` tests — is unchanged.)

- [ ] **Step 3: Update `lib/export/cutplan.test.ts`**

Add the same two fields to its `fakePattern()`:

```typescript
import { describe, it, expect } from "vitest";
import { planCutLayout } from "./cutplan";
import { buildExportModel } from "./model";
import type { Pattern } from "@/lib/types";
import { SIZE_TABLE_MALE } from "@/lib/measurements";
import { t } from "@/lib/i18n/test-translate";

function fakePattern(): Pattern {
  return {
    id: "p1",
    name: "Camiseta Teste",
    version: 1,
    savedAgo: "agora",
    baseSize: "M",
    unit: "cm",
    sizes: ["PP", "P", "M", "G", "GG"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: { M: SIZE_TABLE_MALE.M },
    pieces: [
      {
        id: "x",
        name: "x",
        qty: 1,
        outline: { kind: "polygon", points: "0,0" },
        label: { x: 0, y: 0 },
        detailRows: [],
      },
    ],
    spec: {
      type: "tshirt",
      gender: "male",
      measurementOverrides: {},
      style: { seamAllowanceCm: 1 },
    },
  };
}
```

(the rest of the file is unchanged — read it first to confirm no other `Pattern` literal needs the same treatment.)

- [ ] **Step 4: Run the affected tests**

```bash
npm test -- lib/export/model.test.ts lib/export/cutplan.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/export/model.ts lib/export/model.test.ts lib/export/cutplan.test.ts
git commit -m "refactor(export): draft from the pattern's own frozen sizeTable"
```

---

### Task 7: `lib/editor/state.ts` — bootstrap default grade, `seedPatternSizeSnapshot`

**Files:**

- Modify: `lib/editor/state.ts`
- Modify: `lib/editor/state.test.ts`
- Modify: `lib/editor/thumbnail.test.ts`
- Modify: `lib/store.test.ts`

**Interfaces:**

- Consumes: `buildSystemGradeData` (Task 4), `buildSizeTable` (Task 3), `draftGarment` (Task 5, new signature).
- Produces: `seedPatternState()` unchanged externally but now seeds `sizes`/`sizeTable` from the system female-adult default grade; new `seedPatternSizeSnapshot(state: PatternState, grade: GradeData): void`. `applyGarmentSpec`'s signature is **unchanged** (`state, spec, t`) — it now reads `state.pattern.sizeTable[state.pattern.baseSize]` internally instead of `state.pattern.baseSize` directly. Consumed by Task 10 (generate route calls `seedPatternSizeSnapshot` before the first-ever `applyGarmentSpec`).

- [ ] **Step 1: Edit `lib/editor/state.ts`**

Change the imports:

```typescript
import {
  ChatMessage,
  ConflictInfo,
  GarmentSpec,
  GradeData,
  PatternState,
  Pattern,
  Piece,
} from "@/lib/types";
import { draftGarment, seamCheck } from "@/lib/draft/garment";
import { buildSizeTable } from "@/lib/grades/compute";
import { buildSystemGradeData } from "@/lib/grades/seed";
import type { Translate } from "@/lib/i18n/translate";
```

Change `seedPattern`:

```typescript
function seedPattern(): Pattern {
  const grade = buildSystemGradeData("female");
  const sizeTable = buildSizeTable(grade);
  const baseSize = grade.sizes[grade.baseSizeIndex];
  const spec: GarmentSpec = {
    type: "blouse",
    gender: "female",
    measurementOverrides: {},
    style: {},
  };
  return {
    id: "demo",
    name: "Novo molde",
    version: 0,
    savedAgo: "ainda não salvo",
    baseSize,
    unit: "cm",
    sizes: grade.sizes,
    sizesApplied: [],
    sizesPending: grade.sizes,
    sizeTable,
    pieces: [],
    spec,
    baseMeasurements: sizeTable[baseSize],
    viewBox: { w: 620, h: 380 },
  };
}
```

Add, right after `seedPatternState`:

```typescript
// Overwrites the pattern's size snapshot from a real (account or system
// fallback) grade — called once, by the generate route, right before the
// FIRST-EVER applyGarmentSpec for a pattern (state.pattern.pieces.length ===
// 0). Every later regeneration reuses the snapshot already on the pattern;
// editing the account's active grade afterward never retroactively changes
// an in-progress pattern (same precedent as the i18n locale-snapshot
// limitation).
export function seedPatternSizeSnapshot(
  state: PatternState,
  grade: GradeData,
): void {
  const sizeTable = buildSizeTable(grade);
  const baseSize = grade.sizes[grade.baseSizeIndex];
  state.pattern = {
    ...state.pattern,
    sizes: grade.sizes,
    baseSize,
    sizeTable,
    sizesApplied: [],
    sizesPending: grade.sizes,
  };
}
```

Change `applyGarmentSpec` (the only change: how the base row is obtained):

```typescript
export function applyGarmentSpec(
  state: PatternState,
  spec: GarmentSpec,
  t: Translate,
): void {
  const baseRow = state.pattern.sizeTable[state.pattern.baseSize];
  const { pieces, viewBox, measurements, armholeLenCm, sleeveArmholeCm } =
    draftGarment(spec, baseRow, t);
  state.pattern = {
    ...state.pattern,
    pieces,
    viewBox,
    spec,
    baseMeasurements: measurements,
  };
  state.conflict = detectConflict(pieces, armholeLenCm, sleeveArmholeCm, t);
}
```

(`refitSleeve`, `getSpec`, `addMessage`, `bumpVersion`, `setConflict`, `applySizes`, `detectConflict`, `armholeMarker` are all unchanged — read the current file and leave them exactly as-is.)

- [ ] **Step 2: `lib/editor/state.test.ts` needs no changes**

Read the file to confirm: `seedPatternState()`'s assertions (`pieces` length, `chat` length, `version`, `conflict`) don't touch `sizes`/`sizeTable`/`baseMeasurements` values, and every `applyGarmentSpec(s, spec, t)` call already matches the unchanged 3-arg signature — the bootstrap grade transparently supplies a valid `sizeTable`. No edits needed.

- [ ] **Step 3: Update `lib/editor/thumbnail.test.ts`**

Add the two new required fields to its `pattern()` fixture:

```typescript
import { describe, it, expect } from "vitest";
import { buildThumbnailSvg } from "./thumbnail";
import type { Pattern } from "@/lib/types";
import { SIZE_TABLE } from "@/lib/measurements";

function pattern(overrides: Partial<Pattern> = {}): Pattern {
  return {
    id: "p",
    name: "Novo molde",
    version: 0,
    savedAgo: "",
    baseSize: "M",
    unit: "cm",
    sizes: ["PP", "P", "M", "G", "GG"],
    sizesApplied: [],
    sizesPending: [],
    sizeTable: { M: SIZE_TABLE.M },
    pieces: [],
    viewBox: { w: 620, h: 380 },
    ...overrides,
  };
}
```

(every `it(...)` block below is unchanged.)

- [ ] **Step 4: Update `lib/store.test.ts`**

Add the two new required fields to `emptyState()`'s `pattern` object:

```typescript
pattern: {
  id: "p",
  name: "Novo molde",
  version: 0,
  savedAgo: "",
  baseSize: "M",
  unit: "cm",
  sizes: ["M"],
  sizesApplied: [],
  sizesPending: [],
  sizeTable: { M: { bust: 92, waist: 74, hip: 100, hipHeight: 20.6, backLength: 41, shoulder: 18.5, skirtLength: 60, shortSleeveLength: 18, longSleeveLength: 58 } },
  pieces: [],
},
```

(read the file first to confirm there's exactly one such literal and no other `Pattern`-shaped object needs the same treatment; everything else in the file is unchanged.)

- [ ] **Step 5: Run the affected tests**

```bash
npm test -- lib/editor/state.test.ts lib/editor/thumbnail.test.ts lib/store.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/editor/state.ts lib/editor/state.test.ts lib/editor/thumbnail.test.ts lib/store.test.ts
git commit -m "feat(editor): bootstrap patterns from the system default grade, add seedPatternSizeSnapshot"
```

---

### Task 8: Retire `ALL_SIZES` from its remaining consumers (graduate route, `TabBar`, `PieceDetailsPanel`, `CanvasArea`)

**Files:**

- Modify: `app/api/patterns/[id]/graduate/route.ts`
- Modify: `components/editor/TabBar.tsx`
- Modify: `components/editor/PieceDetailsPanel.tsx`
- Modify: `components/editor/CanvasArea.tsx`

**Interfaces:**

- Consumes: `Pattern.sizes` (Task 2).
- Produces: no more references to the deleted `ALL_SIZES` anywhere in the app. `TabBar` gains a `sizes: string[]` prop.

- [ ] **Step 1: Edit `app/api/patterns/[id]/graduate/route.ts`**

Change the import and the validation line:

```typescript
import { NextResponse } from "next/server";
import { withPatternAndWallet } from "@/lib/db/pattern-wallet";
import { patternNotFound } from "@/lib/db/pattern";
import { addMessage, applySizes, bumpVersion } from "@/lib/editor/state";
import { debitWallet } from "@/lib/billing/wallet";
import type { LedgerEntry } from "@/lib/billing/wallet";
import { composeEditorState } from "@/lib/api/compose";
import { COSTS, SizeLabel } from "@/lib/types";
import { formatList } from "@/lib/format";
import { requireUser } from "@/lib/auth/guard";
```

Inside `POST`, move the size-list validation to happen against the pattern's own snapshot instead of a global constant — this has to happen after the pattern is loaded, so it moves inside the `withPatternAndWallet` callback:

```typescript
export async function POST(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;

  let body: { sizes?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", error: "Corpo inválido." },
      { status: 400 },
    );
  }
  const requested = Array.isArray(body.sizes) ? body.sizes : [];
  const cost = COSTS.graduate;
  const now = new Date();

  const result = await withPatternAndWallet(
    id,
    gate.id,
    (state, wallet): { result: NextResponse; entries: LedgerEntry[] } => {
      const sizes = requested.filter((s): s is SizeLabel =>
        state.pattern.sizes.includes(s as string),
      );
      if (sizes.length === 0) {
        return {
          result: NextResponse.json(
            { status: "error", error: "Nenhum tamanho válido para graduar." },
            { status: 400 },
          ),
          entries: [],
        };
      }
      if (wallet.balance < cost) {
        return {
          result: NextResponse.json(
            {
              status: "insufficient_credits",
              required: cost,
              balance: wallet.balance,
            },
            { status: 402 },
          ),
          entries: [],
        };
      }
      const entry = debitWallet(wallet, cost, "graduate");
      applySizes(state, sizes);
      bumpVersion(state);
      addMessage(state, {
        id: `msg-${Date.now()}-ai`,
        author: "ai",
        text: `Graduação aplicada para ${formatList(sizes)}.`,
        chips: [{ label: `−${cost} créditos`, tone: "credit" }],
        createdAt: Date.now(),
      });
      return {
        result: NextResponse.json({
          status: "ok",
          state: composeEditorState(state, wallet, now),
        }),
        entries: [entry],
      };
    },
  );
  return result ?? patternNotFound();
}
```

Note this also fixes a latent ordering quirk: the "no valid sizes" 400 now happens after loading the pattern (needed, since validity depends on the pattern's own grade), so it moves inside the transaction callback, ahead of the balance check — same relative order as before (invalid-input check before balance check), just now pattern-scoped.

- [ ] **Step 2: Update `app/api/patterns/[id]/graduate/route.test.ts`**

Read the file first. The existing "400s on no valid sizes" test (`sizes: ["XX"]`) and "debits, applies sizes, and versions" test (`sizes: ["G"]`) both still pass unmodified — `seedPatternState()`'s bootstrap grade still has `sizes: ["PP","P","M","G","GG"]`, so `"G"` is valid and `"XX"` isn't, exactly as before. No edits needed to this file.

- [ ] **Step 3: Edit `components/editor/TabBar.tsx`**

Change the import and `SizeSelector`:

```tsx
"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { EditorTab } from "@/lib/store";
import { SizeLabel } from "@/lib/types";

const TAB_IDS: EditorTab[] = ["pattern2d", "proof3d", "techsheet", "cutplan"];

const TAB_LABEL_KEYS: Record<EditorTab, string> = {
  pattern2d: "tabPattern2d",
  proof3d: "tabProof3d",
  techsheet: "tabTechsheet",
  cutplan: "tabCutplan",
};

function SizeSelector({
  baseSize,
  sizes,
}: {
  baseSize: SizeLabel;
  sizes: SizeLabel[];
}) {
  const t = useTranslations("TabBar");
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-muted-2 border-border rounded-btn bg-surface hover:bg-surface-alt border px-[11px] py-[6px] text-[12px] transition-colors"
      >
        {t("sizeButton", { size: baseSize })}
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label={t("closeSizeSelectorAriaLabel")}
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="bg-surface border-border rounded-item shadow-card absolute top-full right-0 z-20 mt-1 min-w-[190px] border p-2">
            <div className="flex gap-[5px] px-1 pb-2 text-[11.5px]">
              {sizes.map((size) => (
                <span
                  key={size}
                  className={[
                    "rounded-[6px] px-[7px] py-[3px] font-semibold",
                    size === baseSize
                      ? "bg-olive-tint text-olive"
                      : "text-placeholder",
                  ].join(" ")}
                >
                  {size}
                </span>
              ))}
            </div>
            <div className="border-line flex items-center gap-[6px] border-t px-1 pt-2">
              <span className="text-olive bg-olive-tint rounded-[5px] px-[6px] py-[2px] text-[10px] font-semibold tracking-[.6px] uppercase">
                {t("comingSoonBadge")}
              </span>
              <span className="text-muted text-[11px] leading-tight">
                {t("sizeChangeNote")}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function TabBar({
  activeTab,
  onChangeTab,
  baseSize,
  sizes,
  detailsOpen,
  onToggleDetails,
  hasSelectedPiece,
}: {
  activeTab: EditorTab;
  onChangeTab: (tab: EditorTab) => void;
  baseSize: SizeLabel;
  sizes: SizeLabel[];
  detailsOpen: boolean;
  onToggleDetails: () => void;
  hasSelectedPiece: boolean;
}) {
  const t = useTranslations("TabBar");
  return (
    <div className="bg-surface border-border flex items-center gap-2 border-b px-4 py-[11px]">
      <div className="bg-paper border-border rounded-item flex gap-[2px] border p-[3px]">
        {TAB_IDS.map((id) => (
          <button
            key={id}
            onClick={() => onChangeTab(id)}
            className={[
              "rounded-[6px] px-[11px] py-[5px] text-[12px] transition-colors",
              id === activeTab
                ? "bg-surface shadow-card font-semibold"
                : "text-muted-2 hover:text-ink",
            ].join(" ")}
          >
            {t(TAB_LABEL_KEYS[id])}
          </button>
        ))}
      </div>
      <div className="flex-1" />
      <SizeSelector baseSize={baseSize} sizes={sizes} />
      {activeTab === "pattern2d" && (
        <button
          onClick={onToggleDetails}
          disabled={!hasSelectedPiece}
          className={[
            "rounded-btn border px-[11px] py-[6px] text-[12px] font-medium transition-colors disabled:opacity-40",
            detailsOpen
              ? "border-olive text-olive bg-olive-tint"
              : "border-border bg-surface hover:bg-surface-alt",
          ].join(" ")}
        >
          {detailsOpen ? t("pieceDetailsButtonOpen") : t("pieceDetailsButton")}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Edit `components/editor/PieceDetailsPanel.tsx`**

Change the import and the one `ALL_SIZES.map` call:

```tsx
import { useTranslations } from "next-intl";
import { COSTS, Pattern, Piece } from "@/lib/types";
import { formatList } from "@/lib/format";
```

```tsx
        <div className="flex gap-[5px] text-[11.5px]">
          {pattern.sizes.map((size) => {
```

(every other line in the file is unchanged — only the import line and this one `ALL_SIZES` → `pattern.sizes` substitution.)

- [ ] **Step 5: Edit `components/editor/CanvasArea.tsx`**

Add the new `sizes` prop to the existing `<TabBar>` call:

```tsx
<TabBar
  activeTab={activeTab}
  onChangeTab={setActiveTab}
  baseSize={pattern.baseSize}
  sizes={pattern.sizes}
  detailsOpen={detailsPanelOpen}
  onToggleDetails={toggleDetailsPanel}
  hasSelectedPiece={selectedPiece !== null && !conflict}
/>
```

- [ ] **Step 6: Run the full test suite, build, and lint**

```bash
npm test
npm run build
npm run lint
```

Expected: all PASS. This is the point where every consumer of the old `ALL_SIZES`/fixed-`SizeLabel` scheme is gone.

- [ ] **Step 7: Commit**

```bash
git add app/api/patterns/[id]/graduate/route.ts components/editor/TabBar.tsx components/editor/PieceDetailsPanel.tsx components/editor/CanvasArea.tsx
git commit -m "refactor(editor): read the size list from the pattern's own grade snapshot, not ALL_SIZES"
```

---

### Task 9: `lib/db/grade.ts` (repository layer)

**Files:**

- Create: `lib/db/grade.ts`
- Create: `lib/db/grade.test.ts`

**Interfaces:**

- Consumes: `buildSystemGradeData` (Task 4), `pickGradeForGeneration` (Task 3), `GradeData`/`GradeRecord`/`Gender` (Task 2).
- Produces: `ensureSystemGrades(userId)`, `listGradesForUser(userId): Promise<GradeRecord[]>`, `getActiveGradeId(userId): Promise<string | null>`, `createGrade(userId, sourceGradeId?): Promise<GradeRecord>`, `updateGrade(gradeId, userId, patch): Promise<GradeRecord | null>`, `deleteGrade(gradeId, userId): Promise<boolean>`, `setActiveGrade(userId, gradeId): Promise<boolean>`, `getGradeForGeneration(userId, gender): Promise<GradeData>`. Consumed by Task 10 (generate route) and Task 11 (`/api/grades/*` routes).

- [ ] **Step 1: Write the failing test — `lib/db/grade.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

interface Row {
  id: string;
  userId: string;
  data: unknown;
  updatedAt: Date;
}
let rows: Row[] = [];
let users: Record<string, { activeGradeId: string | null }> = {};
let nextId = 1;

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    grade: {
      findMany: vi.fn(async ({ where }: { where: { userId: string } }) =>
        rows
          .filter((r) => r.userId === where.userId)
          .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = rows.find((r) => r.id === where.id);
        return row ?? null;
      }),
      create: vi.fn(
        async ({
          data,
        }: {
          data: { userId: string; data: unknown };
        }): Promise<Row> => {
          const row: Row = {
            id: `g${nextId++}`,
            userId: data.userId,
            data: data.data,
            updatedAt: new Date(),
          };
          rows.push(row);
          return row;
        },
      ),
      createMany: vi.fn(
        async ({
          data,
        }: {
          data: { userId: string; data: unknown }[];
        }): Promise<{ count: number }> => {
          for (const d of data) {
            rows.push({
              id: `g${nextId++}`,
              userId: d.userId,
              data: d.data,
              updatedAt: new Date(),
            });
          }
          return { count: data.length };
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { data: unknown };
        }): Promise<Row> => {
          const row = rows.find((r) => r.id === where.id)!;
          row.data = data.data;
          row.updatedAt = new Date();
          return row;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        rows = rows.filter((r) => r.id !== where.id);
      }),
    },
    user: {
      findUnique: vi.fn(
        async ({ where }: { where: { id: string } }) =>
          users[where.id] ?? { activeGradeId: null },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { activeGradeId: string | null };
        }) => {
          users[where.id] = { activeGradeId: data.activeGradeId };
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; activeGradeId: string };
          data: { activeGradeId: string | null };
        }) => {
          const u = users[where.id];
          if (u && u.activeGradeId === where.activeGradeId) {
            users[where.id] = { activeGradeId: data.activeGradeId };
          }
        },
      ),
    },
  },
}));

import {
  ensureSystemGrades,
  listGradesForUser,
  getActiveGradeId,
  createGrade,
  updateGrade,
  deleteGrade,
  setActiveGrade,
  getGradeForGeneration,
} from "./grade";

describe("ensureSystemGrades / listGradesForUser", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
  });

  it("seeds exactly two system grades (female + male) on first access", async () => {
    const grades = await listGradesForUser("u1");
    expect(grades).toHaveLength(2);
    expect(grades.every((g) => g.isSystem)).toBe(true);
    expect(grades.map((g) => g.gender).sort()).toEqual(["female", "male"]);
  });

  it("is idempotent — a second call doesn't reseed", async () => {
    await listGradesForUser("u1");
    await ensureSystemGrades("u1");
    const grades = await listGradesForUser("u1");
    expect(grades).toHaveLength(2);
  });

  it("scopes to the requesting user", async () => {
    await listGradesForUser("u1");
    const other = await listGradesForUser("u2");
    expect(other).toHaveLength(2);
    expect(rows.filter((r) => r.userId === "u1")).toHaveLength(2);
  });
});

describe("createGrade", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
  });

  it("duplicates the system female-adult grade by default", async () => {
    const created = await createGrade("u1");
    expect(created.isSystem).toBe(false);
    expect(created.gender).toBe("female");
    expect(created.name).toContain("(cópia)");
  });

  it("duplicates a given source grade", async () => {
    const grades = await listGradesForUser("u1");
    const male = grades.find((g) => g.gender === "male")!;
    const created = await createGrade("u1", male.id);
    expect(created.gender).toBe("male");
  });
});

describe("updateGrade", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
  });

  it("rejects edits to a system grade", async () => {
    const grades = await listGradesForUser("u1");
    const sys = grades.find((g) => g.isSystem)!;
    const result = await updateGrade(sys.id, "u1", { name: "hacked" });
    expect(result).toBeNull();
  });

  it("merges a partial patch into a custom grade", async () => {
    const created = await createGrade("u1");
    const updated = await updateGrade(created.id, "u1", { name: "Nova" });
    expect(updated!.name).toBe("Nova");
    expect(updated!.gender).toBe(created.gender); // untouched field preserved
  });

  it("returns null when the grade isn't owned by the caller", async () => {
    const created = await createGrade("u1");
    const result = await updateGrade(created.id, "someone-else", {
      name: "x",
    });
    expect(result).toBeNull();
  });
});

describe("deleteGrade", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
  });

  it("rejects deleting a system grade", async () => {
    const grades = await listGradesForUser("u1");
    const sys = grades.find((g) => g.isSystem)!;
    expect(await deleteGrade(sys.id, "u1")).toBe(false);
  });

  it("deletes a custom grade and clears it as the active grade", async () => {
    const created = await createGrade("u1");
    await setActiveGrade("u1", created.id);
    expect(await deleteGrade(created.id, "u1")).toBe(true);
    expect(await getActiveGradeId("u1")).toBeNull();
  });
});

describe("setActiveGrade / getGradeForGeneration", () => {
  beforeEach(() => {
    rows = [];
    users = {};
    nextId = 1;
  });

  it("sets the account's active grade", async () => {
    const created = await createGrade("u1");
    expect(await setActiveGrade("u1", created.id)).toBe(true);
    expect(await getActiveGradeId("u1")).toBe(created.id);
  });

  it("returns false when activating a grade not owned by the caller", async () => {
    const created = await createGrade("u1");
    expect(await setActiveGrade("someone-else", created.id)).toBe(false);
  });

  it("uses the active grade when its gender matches the request", async () => {
    const created = await createGrade("u1"); // female, per createGrade's default
    await setActiveGrade("u1", created.id);
    const grade = await getGradeForGeneration("u1", "female");
    expect(grade.name).toBe(created.name);
  });

  it("falls back to the system grade when the active grade's gender doesn't match", async () => {
    const created = await createGrade("u1"); // female
    await setActiveGrade("u1", created.id);
    const grade = await getGradeForGeneration("u1", "male");
    expect(grade.isSystem).toBe(true);
    expect(grade.gender).toBe("male");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- lib/db/grade.test.ts
```

Expected: FAIL with "Cannot find module './grade'".

- [ ] **Step 3: Write `lib/db/grade.ts`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- lib/db/grade.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/db/grade.ts lib/db/grade.test.ts
git commit -m "feat(db): add Grade repository layer"
```

---

### Task 10: Wire the generate route to snapshot the real account grade; simplify the AI prompt

**Files:**

- Modify: `app/api/patterns/[id]/generate/route.ts`
- Modify: `app/api/patterns/[id]/generate/route.test.ts`
- Modify: `lib/ai.ts`

**Interfaces:**

- Consumes: `getGradeForGeneration` (Task 9), `seedPatternSizeSnapshot` (Task 7).
- Produces: on a pattern's first-ever `apply` decision, the route now overwrites the bootstrap snapshot with the account's real grade before drafting. `lib/ai.ts`'s system prompt sends the pattern's own `sizeTable` instead of the static `SIZE_TABLE`/`SIZE_TABLE_MALE` constants.

- [ ] **Step 1: Edit `app/api/patterns/[id]/generate/route.ts`**

Change the imports:

```typescript
import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { withPatternAndWallet } from "@/lib/db/pattern-wallet";
import { patternNotFound } from "@/lib/db/pattern";
import { getGradeForGeneration } from "@/lib/db/grade";
import {
  addMessage,
  applyGarmentSpec,
  bumpVersion,
  seedPatternSizeSnapshot,
} from "@/lib/editor/state";
import { debitWallet, refundWallet } from "@/lib/billing/wallet";
import type { LedgerEntry } from "@/lib/billing/wallet";
import { composeEditorState } from "@/lib/api/compose";
import { COSTS } from "@/lib/types";
import { proposeGarment } from "@/lib/ai";
import { requireUser } from "@/lib/auth/guard";
```

Change the `apply` branch — right before `applyGarmentSpec(state, decision.spec, t)`, snapshot the real grade if this is the pattern's first-ever draft:

```typescript
if (state.pattern.pieces.length === 0) {
  const grade = await getGradeForGeneration(
    gate.id,
    decision.spec.gender ?? "female",
  );
  seedPatternSizeSnapshot(state, grade);
}
applyGarmentSpec(state, decision.spec, t);
bumpVersion(state);
```

(every other line — the "ask"/"decline" branches, the catch block, the debit/refund logic, the response bodies — is unchanged; read the current file and apply only this insertion.)

- [ ] **Step 2: Update `app/api/patterns/[id]/generate/route.test.ts`**

Add a mock for `@/lib/db/grade` (the "apply" test's pattern starts blank, so it now calls `getGradeForGeneration`):

```typescript
vi.mock("@/lib/db/grade", () => ({
  getGradeForGeneration: vi.fn(async () => ({
    name: "Feminino adulto · ABNT",
    gender: "female",
    bodyType: "straight",
    isSystem: true,
    sizes: ["PP", "P", "M", "G", "GG"],
    baseSizeIndex: 2,
    baseMeasurements: {
      bust: 92,
      waist: 74,
      hip: 100,
      hipHeight: 20.6,
      backLength: 41,
      shoulder: 18.5,
      skirtLength: 60,
      shortSleeveLength: 18,
      longSleeveLength: 58,
    },
    progressionRule: {},
    overrides: {},
  })),
}));
```

Add this `vi.mock` call alongside the existing ones near the top of the file (before the `import { POST } from "./route"` line — read the current file first to place it consistently with the other mocks).

- [ ] **Step 3: Run the affected tests**

```bash
npm test -- app/api/patterns/\[id\]/generate/route.test.ts
```

Expected: PASS.

- [ ] **Step 4: Simplify `lib/ai.ts`'s system prompt**

Change the imports (drop the static tables):

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { PatternState, GarmentSpec, ClarifyQuestion } from "./types";
import { validateSpec, validateQuestions } from "@/lib/draft/garment";
import { MEASUREMENT_RANGES } from "@/lib/measurements";
```

Change the two lines in `buildSystem` that send the static tables:

```typescript
    "",
    "Size table (cm) for this pattern's active measurement grade:",
    JSON.stringify(state.pattern.sizeTable),
    "",
    "Current pattern spec:",
    JSON.stringify(currentSpec ?? null),
  ].join("\n");
}
```

(replacing the previous `"Female size table (cm):"` / `SIZE_TABLE` / `"Male size table (cm):"` / `SIZE_TABLE_MALE` four lines with the two above — everything else in `buildSystem` and the rest of the file is unchanged.)

- [ ] **Step 5: Run the AI test**

```bash
npm test -- lib/ai.test.ts
```

Expected: PASS (the test never inspects the system prompt string, only decision handling — no edits needed to `lib/ai.test.ts` itself).

- [ ] **Step 6: Commit**

```bash
git add app/api/patterns/\[id\]/generate/route.ts app/api/patterns/\[id\]/generate/route.test.ts lib/ai.ts
git commit -m "feat(generate): snapshot the account's real grade on first generation, simplify the AI prompt"
```

---

### Task 11: `/api/grades/*` routes

**Files:**

- Create: `app/api/grades/route.ts`
- Create: `app/api/grades/route.test.ts`
- Create: `app/api/grades/[id]/route.ts`
- Create: `app/api/grades/[id]/route.test.ts`
- Create: `app/api/grades/[id]/duplicate/route.ts`
- Create: `app/api/grades/[id]/duplicate/route.test.ts`
- Create: `app/api/grades/[id]/activate/route.ts`
- Create: `app/api/grades/[id]/activate/route.test.ts`

**Interfaces:**

- Consumes: every `lib/db/grade.ts` export from Task 9.
- Produces: `GET/POST /api/grades`, `PATCH/DELETE /api/grades/[id]`, `POST /api/grades/[id]/duplicate`, `POST /api/grades/[id]/activate`. Consumed by Task 12 (`lib/api-client.ts`).

- [ ] **Step 1: Write `app/api/grades/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import {
  listGradesForUser,
  getActiveGradeId,
  createGrade,
} from "@/lib/db/grade";

export async function GET() {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const [grades, activeGradeId] = await Promise.all([
    listGradesForUser(gate.id),
    getActiveGradeId(gate.id),
  ]);
  return NextResponse.json(
    grades.map((g) => ({ ...g, isActive: g.id === activeGradeId })),
  );
}

export async function POST(request: Request) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  let body: { sourceId?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const sourceId =
    typeof body.sourceId === "string" ? body.sourceId : undefined;
  const grade = await createGrade(gate.id, sourceId);
  return NextResponse.json(grade);
}
```

- [ ] **Step 2: Write `app/api/grades/route.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
vi.mock("@/lib/db/grade", () => ({
  listGradesForUser: vi.fn(),
  getActiveGradeId: vi.fn(),
  createGrade: vi.fn(),
}));

import { GET, POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import {
  listGradesForUser,
  getActiveGradeId,
  createGrade,
} from "@/lib/db/grade";

function req(body?: unknown) {
  return new Request("http://test/api/grades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("GET /api/grades", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
  });

  it("marks the account's active grade in the returned list", async () => {
    vi.mocked(listGradesForUser).mockResolvedValue([
      { id: "g1", name: "A" } as never,
      { id: "g2", name: "B" } as never,
    ]);
    vi.mocked(getActiveGradeId).mockResolvedValue("g2");
    const res = await GET();
    const json = await res.json();
    expect(json.find((g: { id: string }) => g.id === "g1").isActive).toBe(
      false,
    );
    expect(json.find((g: { id: string }) => g.id === "g2").isActive).toBe(true);
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await GET();
    expect(res.status).toBe(401);
  });
});

describe("POST /api/grades", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(createGrade).mockReset();
  });

  it("creates a grade, forwarding an optional sourceId", async () => {
    vi.mocked(createGrade).mockResolvedValue({ id: "g3" } as never);
    const res = await POST(req({ sourceId: "g1" }));
    expect(createGrade).toHaveBeenCalledWith("u1", "g1");
    expect((await res.json()).id).toBe("g3");
  });

  it("creates a grade with no sourceId when the body is empty", async () => {
    vi.mocked(createGrade).mockResolvedValue({ id: "g4" } as never);
    await POST(req({}));
    expect(createGrade).toHaveBeenCalledWith("u1", undefined);
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 3: Write `app/api/grades/[id]/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { updateGrade, deleteGrade } from "@/lib/db/grade";
import type { GradeData } from "@/lib/types";

type Ctx = { params: Promise<{ id: string }> };

function notFound(): NextResponse {
  return NextResponse.json(
    { status: "not_found", error: "Grade não encontrada." },
    { status: 404 },
  );
}

export async function PATCH(request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  let body: Partial<GradeData>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { status: "error", error: "Corpo inválido." },
      { status: 400 },
    );
  }
  const updated = await updateGrade(id, gate.id, body);
  if (!updated) return notFound();
  return NextResponse.json(updated);
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const ok = await deleteGrade(id, gate.id);
  if (!ok) return notFound();
  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 4: Write `app/api/grades/[id]/route.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
vi.mock("@/lib/db/grade", () => ({
  updateGrade: vi.fn(),
  deleteGrade: vi.fn(),
}));

import { PATCH, DELETE } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { updateGrade, deleteGrade } from "@/lib/db/grade";

function req(body: unknown) {
  return new Request("http://test/api/grades/g1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function ctx(id = "g1") {
  return { params: Promise.resolve({ id }) };
}

describe("PATCH /api/grades/[id]", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(updateGrade).mockReset();
  });

  it("updates and returns the grade", async () => {
    vi.mocked(updateGrade).mockResolvedValue({
      id: "g1",
      name: "Nova",
    } as never);
    const res = await PATCH(req({ name: "Nova" }), ctx());
    expect(updateGrade).toHaveBeenCalledWith("g1", "u1", { name: "Nova" });
    expect((await res.json()).name).toBe("Nova");
  });

  it("404s when updateGrade returns null (not found, not owned, or system)", async () => {
    vi.mocked(updateGrade).mockResolvedValue(null);
    const res = await PATCH(req({ name: "Nova" }), ctx());
    expect(res.status).toBe(404);
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await PATCH(req({ name: "x" }), ctx());
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/grades/[id]", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(deleteGrade).mockReset();
  });

  it("deletes and returns ok", async () => {
    vi.mocked(deleteGrade).mockResolvedValue(true);
    const res = await DELETE(new Request("http://test"), ctx());
    expect((await res.json()).status).toBe("ok");
  });

  it("404s when deleteGrade returns false", async () => {
    vi.mocked(deleteGrade).mockResolvedValue(false);
    const res = await DELETE(new Request("http://test"), ctx());
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 5: Write `app/api/grades/[id]/duplicate/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { createGrade } from "@/lib/db/grade";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const grade = await createGrade(gate.id, id);
  return NextResponse.json(grade);
}
```

- [ ] **Step 6: Write `app/api/grades/[id]/duplicate/route.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
vi.mock("@/lib/db/grade", () => ({ createGrade: vi.fn() }));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { createGrade } from "@/lib/db/grade";

function ctx(id = "g1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/grades/[id]/duplicate", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(createGrade).mockReset();
  });

  it("duplicates the given grade id for the current user", async () => {
    vi.mocked(createGrade).mockResolvedValue({ id: "g2" } as never);
    const res = await POST(new Request("http://test"), ctx("g1"));
    expect(createGrade).toHaveBeenCalledWith("u1", "g1");
    expect((await res.json()).id).toBe("g2");
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(new Request("http://test"), ctx());
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 7: Write `app/api/grades/[id]/activate/route.ts`**

```typescript
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/guard";
import { setActiveGrade } from "@/lib/db/grade";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Ctx) {
  const gate = await requireUser();
  if (gate instanceof NextResponse) return gate;
  const { id } = await params;
  const ok = await setActiveGrade(gate.id, id);
  if (!ok) {
    return NextResponse.json(
      { status: "not_found", error: "Grade não encontrada." },
      { status: 404 },
    );
  }
  return NextResponse.json({ status: "ok" });
}
```

- [ ] **Step 8: Write `app/api/grades/[id]/activate/route.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/guard", () => ({
  requireUser: vi.fn(async () => ({
    id: "u1",
    email: "dev@moldai.local",
    name: null,
  })),
}));
vi.mock("@/lib/db/grade", () => ({ setActiveGrade: vi.fn() }));

import { POST } from "./route";
import { requireUser } from "@/lib/auth/guard";
import { unauthorized } from "@/lib/auth/session";
import { setActiveGrade } from "@/lib/db/grade";

function ctx(id = "g1") {
  return { params: Promise.resolve({ id }) };
}

describe("POST /api/grades/[id]/activate", () => {
  beforeEach(() => {
    vi.mocked(requireUser).mockResolvedValue({
      id: "u1",
      email: "dev@moldai.local",
      name: null,
    });
    vi.mocked(setActiveGrade).mockReset();
  });

  it("activates the given grade for the current user", async () => {
    vi.mocked(setActiveGrade).mockResolvedValue(true);
    const res = await POST(new Request("http://test"), ctx("g1"));
    expect(setActiveGrade).toHaveBeenCalledWith("u1", "g1");
    expect((await res.json()).status).toBe("ok");
  });

  it("404s when the grade isn't owned by the caller", async () => {
    vi.mocked(setActiveGrade).mockResolvedValue(false);
    const res = await POST(new Request("http://test"), ctx());
    expect(res.status).toBe(404);
  });

  it("no session returns 401", async () => {
    vi.mocked(requireUser).mockResolvedValueOnce(unauthorized());
    const res = await POST(new Request("http://test"), ctx());
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 9: Run the affected tests**

```bash
npm test -- app/api/grades
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add app/api/grades
git commit -m "feat(api): add /api/grades routes"
```

---

### Task 12: `lib/api-client.ts` grade functions + `lib/gradesStore.ts`

**Files:**

- Modify: `lib/api-client.ts`
- Create: `lib/gradesStore.ts`
- Create: `lib/gradesStore.test.ts`

**Interfaces:**

- Consumes: `/api/grades/*` from Task 11.
- Produces: `api.listGrades()`, `api.createGrade(sourceId?)`, `api.updateGrade(gradeId, patch)`, `api.deleteGrade(gradeId)`, `api.duplicateGrade(gradeId)`, `api.activateGrade(gradeId)`; `useGradesStore` (Zustand). Consumed by Task 14 (UI).

- [ ] **Step 1: Add to `lib/api-client.ts`**

Change the top import line to also pull in the grade types:

```typescript
import {
  Credits,
  EditorState,
  GarmentType,
  GradeData,
  GradeListEntry,
  GradeRecord,
  LedgerHistoryEntry,
} from "./types";
```

Add, at the end of the file:

```typescript
export function listGrades(): Promise<GradeListEntry[]> {
  return getJson<GradeListEntry[]>("/api/grades");
}

export async function createGrade(sourceId?: string): Promise<GradeRecord> {
  const res = await fetch("/api/grades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceId }),
  });
  return (await res.json()) as GradeRecord;
}

export async function updateGrade(
  gradeId: string,
  patch: Partial<GradeData>,
): Promise<GradeRecord> {
  const res = await fetch(`/api/grades/${gradeId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  return (await res.json()) as GradeRecord;
}

export async function deleteGrade(gradeId: string): Promise<void> {
  await fetch(`/api/grades/${gradeId}`, { method: "DELETE" });
}

export async function duplicateGrade(gradeId: string): Promise<GradeRecord> {
  const res = await fetch(`/api/grades/${gradeId}/duplicate`, {
    method: "POST",
  });
  return (await res.json()) as GradeRecord;
}

export async function activateGrade(gradeId: string): Promise<void> {
  await fetch(`/api/grades/${gradeId}/activate`, { method: "POST" });
}
```

- [ ] **Step 2: Write `lib/gradesStore.ts`**

```typescript
import { create } from "zustand";
import * as api from "./api-client";
import type { GradeData, GradeListEntry, GradeRecord } from "./types";

interface GradesStore {
  ready: boolean;
  error: boolean;
  grades: GradeListEntry[];
  selectedId: string | null;
  draft: GradeData | null;
  editingRule: boolean;
  dirty: boolean;

  init: () => Promise<void>;
  select: (id: string) => void;
  updateDraft: (patch: Partial<GradeData>) => void;
  setEditingRule: (v: boolean) => void;
  save: () => Promise<void>;
  create: () => Promise<void>;
  duplicate: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  activate: (id: string) => Promise<void>;
}

function draftFrom(g: GradeRecord): GradeData {
  const { id: _id, updatedAt: _updatedAt, ...data } = g;
  return data;
}

export const useGradesStore = create<GradesStore>((set, get) => ({
  ready: false,
  error: false,
  grades: [],
  selectedId: null,
  draft: null,
  editingRule: false,
  dirty: false,

  init: async () => {
    set({ ready: false, error: false });
    try {
      const grades = await api.listGrades();
      const active = grades.find((g) => g.isActive) ?? grades[0];
      set({
        grades,
        selectedId: active?.id ?? null,
        draft: active ? draftFrom(active) : null,
        editingRule: false,
        dirty: false,
        ready: true,
      });
    } catch {
      set({ error: true, ready: true });
    }
  },

  select: (id) => {
    const g = get().grades.find((x) => x.id === id);
    if (!g) return;
    set({
      selectedId: id,
      draft: draftFrom(g),
      editingRule: false,
      dirty: false,
    });
  },

  updateDraft: (patch) => {
    const draft = get().draft;
    if (!draft) return;
    set({ draft: { ...draft, ...patch }, dirty: true });
  },

  setEditingRule: (editingRule) => set({ editingRule }),

  save: async () => {
    const { selectedId, draft } = get();
    if (!selectedId || !draft || draft.isSystem) return;
    const updated = await api.updateGrade(selectedId, draft);
    set((s) => ({
      grades: s.grades.map((g) =>
        g.id === selectedId ? { ...updated, isActive: g.isActive } : g,
      ),
      draft: draftFrom(updated),
      dirty: false,
    }));
  },

  create: async () => {
    const created = await api.createGrade();
    set((s) => ({
      grades: [...s.grades, { ...created, isActive: false }],
      selectedId: created.id,
      draft: draftFrom(created),
      editingRule: false,
      dirty: false,
    }));
  },

  duplicate: async (id) => {
    const created = await api.duplicateGrade(id);
    set((s) => ({
      grades: [...s.grades, { ...created, isActive: false }],
      selectedId: created.id,
      draft: draftFrom(created),
      editingRule: false,
      dirty: false,
    }));
  },

  remove: async (id) => {
    await api.deleteGrade(id);
    set((s) => {
      const grades = s.grades.filter((g) => g.id !== id);
      if (s.selectedId !== id) return { grades };
      const next = grades[0];
      return {
        grades,
        selectedId: next?.id ?? null,
        draft: next ? draftFrom(next) : null,
        editingRule: false,
        dirty: false,
      };
    });
  },

  activate: async (id) => {
    await api.activateGrade(id);
    set((s) => ({
      grades: s.grades.map((g) => ({ ...g, isActive: g.id === id })),
    }));
  },
}));
```

- [ ] **Step 3: Write `lib/gradesStore.test.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { GradeListEntry } from "./types";

vi.mock("./api-client", () => ({
  listGrades: vi.fn(),
  createGrade: vi.fn(),
  updateGrade: vi.fn(),
  deleteGrade: vi.fn(),
  duplicateGrade: vi.fn(),
  activateGrade: vi.fn(),
}));

import * as api from "./api-client";
import { useGradesStore } from "./gradesStore";

function entry(overrides: Partial<GradeListEntry> = {}): GradeListEntry {
  return {
    id: "g1",
    updatedAt: "2026-08-19T00:00:00.000Z",
    name: "Feminino adulto",
    gender: "female",
    bodyType: "straight",
    isSystem: true,
    sizes: ["PP", "P", "M", "G", "GG"],
    baseSizeIndex: 2,
    baseMeasurements: {
      bust: 92,
      waist: 74,
      hip: 100,
      hipHeight: 20.6,
      backLength: 41,
      shoulder: 18.5,
      skirtLength: 60,
      shortSleeveLength: 18,
      longSleeveLength: 58,
    },
    progressionRule: {},
    overrides: {},
    isActive: false,
    ...overrides,
  };
}

function resetStore() {
  useGradesStore.setState({
    ready: false,
    error: false,
    grades: [],
    selectedId: null,
    draft: null,
    editingRule: false,
    dirty: false,
  });
}

describe("gradesStore.init", () => {
  beforeEach(() => {
    vi.mocked(api.listGrades).mockReset();
    resetStore();
  });

  it("selects the active grade and loads its draft", async () => {
    vi.mocked(api.listGrades).mockResolvedValue([
      entry({ id: "g1", isActive: false }),
      entry({ id: "g2", isActive: true, name: "Masculino" }),
    ]);
    await useGradesStore.getState().init();
    const s = useGradesStore.getState();
    expect(s.ready).toBe(true);
    expect(s.selectedId).toBe("g2");
    expect(s.draft?.name).toBe("Masculino");
  });

  it("sets error and ready on failure", async () => {
    vi.mocked(api.listGrades).mockRejectedValue(new Error("boom"));
    await useGradesStore.getState().init();
    const s = useGradesStore.getState();
    expect(s.error).toBe(true);
    expect(s.ready).toBe(true);
  });
});

describe("gradesStore.updateDraft / save", () => {
  beforeEach(() => {
    vi.mocked(api.updateGrade).mockReset();
    resetStore();
    useGradesStore.setState({
      grades: [entry({ id: "g1", isSystem: false })],
      selectedId: "g1",
      draft: { ...entry({ id: "g1", isSystem: false }) },
    });
  });

  it("updateDraft merges the patch and marks dirty", () => {
    useGradesStore.getState().updateDraft({ name: "Renomeada" });
    const s = useGradesStore.getState();
    expect(s.draft?.name).toBe("Renomeada");
    expect(s.dirty).toBe(true);
  });

  it("save calls the API and clears dirty", async () => {
    vi.mocked(api.updateGrade).mockResolvedValue(
      entry({ id: "g1", isSystem: false, name: "Renomeada" }),
    );
    useGradesStore.getState().updateDraft({ name: "Renomeada" });
    await useGradesStore.getState().save();
    expect(api.updateGrade).toHaveBeenCalledWith(
      "g1",
      expect.objectContaining({ name: "Renomeada" }),
    );
    expect(useGradesStore.getState().dirty).toBe(false);
  });

  it("save is a no-op for a system grade", async () => {
    useGradesStore.setState({
      draft: { ...entry({ id: "g1", isSystem: true }) },
    });
    await useGradesStore.getState().save();
    expect(api.updateGrade).not.toHaveBeenCalled();
  });
});

describe("gradesStore.create / duplicate / remove / activate", () => {
  beforeEach(() => {
    vi.mocked(api.createGrade).mockReset();
    vi.mocked(api.duplicateGrade).mockReset();
    vi.mocked(api.deleteGrade).mockReset();
    vi.mocked(api.activateGrade).mockReset();
    resetStore();
    useGradesStore.setState({
      grades: [entry({ id: "g1" })],
      selectedId: "g1",
      draft: entry({ id: "g1" }),
    });
  });

  it("create appends the new grade and selects it", async () => {
    vi.mocked(api.createGrade).mockResolvedValue(
      entry({ id: "g2", name: "Nova grade" }),
    );
    await useGradesStore.getState().create();
    const s = useGradesStore.getState();
    expect(s.grades.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(s.selectedId).toBe("g2");
  });

  it("duplicate appends a copy and selects it", async () => {
    vi.mocked(api.duplicateGrade).mockResolvedValue(
      entry({ id: "g3", name: "Feminino adulto (cópia)" }),
    );
    await useGradesStore.getState().duplicate("g1");
    expect(api.duplicateGrade).toHaveBeenCalledWith("g1");
    expect(useGradesStore.getState().selectedId).toBe("g3");
  });

  it("remove drops the grade and reselects another when the selected one is removed", async () => {
    useGradesStore.setState({
      grades: [entry({ id: "g1" }), entry({ id: "g2" })],
      selectedId: "g1",
    });
    vi.mocked(api.deleteGrade).mockResolvedValue(undefined);
    await useGradesStore.getState().remove("g1");
    const s = useGradesStore.getState();
    expect(s.grades.map((g) => g.id)).toEqual(["g2"]);
    expect(s.selectedId).toBe("g2");
  });

  it("activate flips isActive across the list", async () => {
    useGradesStore.setState({
      grades: [
        entry({ id: "g1", isActive: true }),
        entry({ id: "g2", isActive: false }),
      ],
    });
    vi.mocked(api.activateGrade).mockResolvedValue(undefined);
    await useGradesStore.getState().activate("g2");
    const s = useGradesStore.getState();
    expect(s.grades.find((g) => g.id === "g1")?.isActive).toBe(false);
    expect(s.grades.find((g) => g.id === "g2")?.isActive).toBe(true);
  });
});
```

- [ ] **Step 4: Run the affected tests**

```bash
npm test -- lib/gradesStore.test.ts lib/api-client.ts
```

Expected: PASS. (`lib/api-client.ts` has no dedicated test file — this just confirms the whole suite still compiles; run `npm test` if unsure.)

- [ ] **Step 5: Commit**

```bash
git add lib/api-client.ts lib/gradesStore.ts lib/gradesStore.test.ts
git commit -m "feat(client): add grade API-client functions and useGradesStore"
```

---

### Task 13: `messages/pt-BR.json` — new namespaces, Sidebar update

**Files:**

- Modify: `messages/pt-BR.json`

**Interfaces:**

- Produces: `Grades`, `GradeLibrary`, `GradeTable` namespaces. Consumed by Task 14.

- [ ] **Step 1: Insert new namespaces**

Find the `"Sidebar"` object (currently right after `"PatternGrid"`):

```json
  "Sidebar": {
    "myPatternsLabel": "Meus moldes",
    "measurementsLabel": "Medidas e grades",
    "studioBasesLabel": "Bases do ateliê",
    "comingSoonBadge": "em breve",
    "importLabel": "Importar molde · Audaces · Molde.me · .dxf",
    "newPatternButton": "＋ Novo molde"
  },
```

Insert three new namespaces immediately before it (keep `"Sidebar"` and everything after it unchanged):

```json
  "Grades": {
    "title": "Medidas e grades",
    "subtitle": "A grade escolhida vale para toda geração e graduação",
    "newGradeButton": "＋ Nova grade",
    "importLabel": "↥ Importar planilha ou tabela de medidas do Audaces",
    "loading": "Carregando grades…",
    "loadError": "Não foi possível carregar suas grades. Tente recarregar a página."
  },
  "GradeLibrary": {
    "systemBadge": "padrão do sistema",
    "customBadge": "minha grade",
    "activeBadge": "ativa"
  },
  "GradeTable": {
    "duplicateButton": "Duplicar",
    "deleteButton": "Excluir",
    "editRuleButton": "Editar regra de progressão",
    "doneEditingRuleButton": "Concluir edição da regra",
    "ruleHint": "cm por tamanho, a partir da base",
    "measurementColumnLabel": "Medida (cm)",
    "resetOverrideTitle": "Resetar para a regra",
    "addSizeButton": "＋ tamanho",
    "addSizePrompt": "Nome do novo tamanho",
    "removeSizeTitle": "Remover tamanho",
    "progressionTitle": "Progressão",
    "useGradeButton": "Usar esta grade",
    "activeGradeNote": "Grade ativa",
    "saveButton": "Salvar alterações",
    "systemReadOnlyNote": "Grades do sistema não podem ser editadas — duplique para personalizar.",
    "deleteModalTitle": "Excluir esta grade?",
    "deleteModalDescription": "Isso apaga a grade e não pode ser desfeito.",
    "deleteConfirmButton": "Excluir",
    "deleteCancelButton": "Cancelar",
    "measurement": {
      "bust": "Busto",
      "waist": "Cintura",
      "hip": "Quadril",
      "hipHeight": "Altura de cava",
      "backLength": "Comprimento de costas",
      "shoulder": "Ombro",
      "skirtLength": "Comprimento de saia",
      "shortSleeveLength": "Manga curta",
      "longSleeveLength": "Manga longa"
    },
    "bodyType": {
      "straight": "reto",
      "hourglass": "ampulheta",
      "pear": "pera",
      "apple": "maçã"
    }
  },
```

- [ ] **Step 2: Verify the JSON is well-formed**

```bash
node -e "JSON.parse(require('fs').readFileSync('messages/pt-BR.json', 'utf8')); console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add messages/pt-BR.json
git commit -m "feat(i18n): add Grades/GradeLibrary/GradeTable message catalog"
```

---

### Task 14: `/grades` screen (`GradesShell`, `GradeLibrary`, `GradeTable`), Sidebar link

**Files:**

- Create: `app/grades/page.tsx`
- Create: `components/grades/GradesShell.tsx`
- Create: `components/grades/GradeLibrary.tsx`
- Create: `components/grades/GradeTable.tsx`
- Modify: `components/dashboard/Sidebar.tsx`

**Interfaces:**

- Consumes: `useGradesStore` (Task 12), `PageHeader` (existing), `resolveGradeSize` (Task 3).
- Produces: a real, reachable `/grades` route.

- [ ] **Step 1: Write `components/grades/GradeLibrary.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useGradesStore } from "@/lib/gradesStore";

export function GradeLibrary() {
  const t = useTranslations("Grades");
  const tLib = useTranslations("GradeLibrary");
  const grades = useGradesStore((s) => s.grades);
  const selectedId = useGradesStore((s) => s.selectedId);
  const select = useGradesStore((s) => s.select);
  const create = useGradesStore((s) => s.create);

  return (
    <div className="flex w-[230px] shrink-0 flex-col gap-[9px]">
      {grades.map((g) => (
        <button
          key={g.id}
          type="button"
          onClick={() => select(g.id)}
          className={[
            "rounded-item flex flex-col gap-px border p-[11px] text-left transition-colors",
            g.id === selectedId
              ? "border-olive bg-olive-tint"
              : "border-border bg-surface hover:bg-surface-alt",
          ].join(" ")}
        >
          <span className="text-[12.5px] font-semibold">
            {g.name}
            {g.isActive && (
              <span className="text-olive ml-[6px] text-[10px] font-semibold tracking-[.6px] uppercase">
                {tLib("activeBadge")}
              </span>
            )}
          </span>
          <span className="text-muted-2 text-[11.5px]">
            {g.sizes[0]}–{g.sizes[g.sizes.length - 1]} ·{" "}
            {g.isSystem ? tLib("systemBadge") : tLib("customBadge")}
          </span>
        </button>
      ))}

      <div className="flex-1" />

      <div className="border-border rounded-card bg-paper text-muted border border-dashed p-3 text-[12px] leading-relaxed">
        {t("importLabel")}
      </div>

      <button
        type="button"
        onClick={() => create()}
        className="bg-ink rounded-btn px-[13px] py-[9px] text-center text-[12.5px] font-medium text-white transition-[filter] hover:brightness-[0.95]"
      >
        {t("newGradeButton")}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write `components/grades/GradeTable.tsx`**

```tsx
"use client";

import { useTranslations } from "next-intl";
import { useGradesStore } from "@/lib/gradesStore";
import { resolveGradeSize } from "@/lib/grades/compute";
import type { Measurements } from "@/lib/measurements";
import type { BodyType } from "@/lib/types";

const MEASUREMENT_KEYS: (keyof Measurements)[] = [
  "bust",
  "waist",
  "hip",
  "hipHeight",
  "backLength",
  "shoulder",
  "skirtLength",
  "shortSleeveLength",
  "longSleeveLength",
];

const BODY_TYPES: BodyType[] = ["straight", "hourglass", "pear", "apple"];

export function GradeTable() {
  const t = useTranslations("GradeTable");
  const draft = useGradesStore((s) => s.draft);
  const editingRule = useGradesStore((s) => s.editingRule);
  const dirty = useGradesStore((s) => s.dirty);
  const selectedId = useGradesStore((s) => s.selectedId);
  const grades = useGradesStore((s) => s.grades);
  const updateDraft = useGradesStore((s) => s.updateDraft);
  const setEditingRule = useGradesStore((s) => s.setEditingRule);
  const save = useGradesStore((s) => s.save);
  const duplicate = useGradesStore((s) => s.duplicate);
  const remove = useGradesStore((s) => s.remove);
  const activate = useGradesStore((s) => s.activate);

  if (!draft || !selectedId) return null;
  const isActive = grades.find((g) => g.id === selectedId)?.isActive ?? false;
  const readOnly = draft.isSystem;

  const setCell = (size: string, key: keyof Measurements, value: number) => {
    if (size === draft.sizes[draft.baseSizeIndex]) {
      updateDraft({
        baseMeasurements: { ...draft.baseMeasurements, [key]: value },
      });
      return;
    }
    const overrides = { ...draft.overrides };
    overrides[size] = { ...overrides[size], [key]: value };
    updateDraft({ overrides });
  };

  const clearOverride = (size: string, key: keyof Measurements) => {
    const overrides = { ...draft.overrides };
    const row = { ...overrides[size] };
    delete row[key];
    if (Object.keys(row).length === 0) delete overrides[size];
    else overrides[size] = row;
    updateDraft({ overrides });
  };

  const setRule = (key: keyof Measurements, value: number) => {
    updateDraft({
      progressionRule: { ...draft.progressionRule, [key]: value },
    });
  };

  const addSize = () => {
    const label = window.prompt(t("addSizePrompt"))?.trim();
    if (!label || draft.sizes.includes(label)) return;
    updateDraft({ sizes: [...draft.sizes, label] });
  };

  const removeSize = (size: string) => {
    if (draft.sizes.length <= 1) return;
    const idx = draft.sizes.indexOf(size);
    const sizes = draft.sizes.filter((s) => s !== size);
    const overrides = { ...draft.overrides };
    delete overrides[size];
    const baseSizeIndex =
      idx < draft.baseSizeIndex
        ? draft.baseSizeIndex - 1
        : Math.min(draft.baseSizeIndex, sizes.length - 1);
    updateDraft({ sizes, overrides, baseSizeIndex });
  };

  return (
    <div className="flex flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-[10px]">
        {readOnly ? (
          <span className="font-display text-[16px] font-semibold">
            {draft.name}
          </span>
        ) : (
          <input
            value={draft.name}
            onChange={(e) => updateDraft({ name: e.target.value })}
            className="font-display border-border rounded-btn border px-2 py-1 text-[16px] font-semibold"
          />
        )}
        <select
          value={draft.bodyType}
          disabled={readOnly}
          onChange={(e) =>
            updateDraft({ bodyType: e.target.value as BodyType })
          }
          className="border-border rounded-pill bg-surface border px-[10px] py-[5px] text-[11.5px] disabled:opacity-60"
        >
          {BODY_TYPES.map((bt) => (
            <option key={bt} value={bt}>
              {t(`bodyType.${bt}`)}
            </option>
          ))}
        </select>
        <div className="flex-1" />
        {!readOnly && (
          <button
            type="button"
            onClick={() => setEditingRule(!editingRule)}
            className="border-border rounded-btn bg-surface hover:bg-surface-alt border px-[11px] py-[6px] text-[12px]"
          >
            {editingRule ? t("doneEditingRuleButton") : t("editRuleButton")}
          </button>
        )}
        <button
          type="button"
          onClick={() => duplicate(selectedId)}
          className="border-border rounded-btn bg-surface hover:bg-surface-alt border px-[11px] py-[6px] text-[12px]"
        >
          {t("duplicateButton")}
        </button>
        {!readOnly && (
          <button
            type="button"
            onClick={() => remove(selectedId)}
            className="border-border rounded-btn bg-surface hover:bg-surface-alt text-alert border px-[11px] py-[6px] text-[12px]"
          >
            {t("deleteButton")}
          </button>
        )}
      </div>

      {readOnly && (
        <span className="text-muted text-[11.5px]">
          {t("systemReadOnlyNote")}
        </span>
      )}

      <div className="border-border rounded-card bg-surface overflow-x-auto border">
        <div className="bg-surface-alt border-border text-muted flex border-b px-[14px] py-[10px] text-[11px] font-semibold tracking-[.6px] uppercase">
          <span className="flex-[2]">{t("measurementColumnLabel")}</span>
          {draft.sizes.map((size) => (
            <span
              key={size}
              className="flex flex-1 items-center justify-end gap-1"
            >
              {size}
              {!readOnly && draft.sizes.length > 1 && (
                <button
                  type="button"
                  title={t("removeSizeTitle")}
                  onClick={() => removeSize(size)}
                  className="text-placeholder hover:text-alert text-[10px]"
                >
                  ✕
                </button>
              )}
            </span>
          ))}
        </div>
        {MEASUREMENT_KEYS.map((key, i) => (
          <div
            key={key}
            className={[
              "flex items-center px-[14px] py-[9px] text-[12.5px]",
              i < MEASUREMENT_KEYS.length - 1 ? "border-line border-b" : "",
            ].join(" ")}
          >
            <span className="text-muted flex-[2]">
              {t(`measurement.${key}`)}
            </span>
            {editingRule ? (
              <input
                type="number"
                step="0.1"
                value={draft.progressionRule[key] ?? 0}
                onChange={(e) => setRule(key, Number(e.target.value))}
                className="border-border rounded-btn ml-auto w-[70px] border px-2 py-1 text-right text-[12px]"
              />
            ) : (
              draft.sizes.map((size, idx) => {
                const isBase = idx === draft.baseSizeIndex;
                const overridden = draft.overrides[size]?.[key] !== undefined;
                const value = resolveGradeSize(draft, size)[key];
                return (
                  <span
                    key={size}
                    className="flex flex-1 items-center justify-end gap-1"
                  >
                    {overridden && !isBase && !readOnly && (
                      <button
                        type="button"
                        title={t("resetOverrideTitle")}
                        onClick={() => clearOverride(size, key)}
                        className="bg-olive h-[5px] w-[5px] rounded-full"
                      />
                    )}
                    <input
                      type="number"
                      step="0.1"
                      value={value}
                      disabled={readOnly}
                      onChange={(e) =>
                        setCell(size, key, Number(e.target.value))
                      }
                      className={[
                        "w-[56px] rounded-[6px] border px-1 py-[3px] text-right text-[12px]",
                        isBase
                          ? "border-olive-border bg-olive-tint font-semibold"
                          : "border-transparent bg-transparent",
                      ].join(" ")}
                    />
                  </span>
                );
              })
            )}
          </div>
        ))}
      </div>

      {!readOnly && (
        <button
          type="button"
          onClick={addSize}
          className="border-border rounded-btn bg-surface hover:bg-surface-alt self-start border px-[11px] py-[6px] text-[12px]"
        >
          {t("addSizeButton")}
        </button>
      )}

      <div className="flex gap-3">
        <div className="border-border rounded-card bg-surface flex-1 border p-[14px]">
          <span className="text-muted text-[11px] font-semibold tracking-[.8px] uppercase">
            {t("progressionTitle")}
          </span>
          <div className="mt-2 flex flex-col gap-[6px]">
            {MEASUREMENT_KEYS.filter((k) => draft.progressionRule[k]).map(
              (key) => (
                <div key={key} className="flex justify-between text-[12.5px]">
                  <span className="text-muted">{t(`measurement.${key}`)}</span>
                  <span className="font-semibold">
                    {draft.progressionRule[key]} cm
                  </span>
                </div>
              ),
            )}
          </div>
        </div>
        <div className="flex w-[220px] flex-col justify-end gap-2">
          {dirty && !readOnly && (
            <button
              type="button"
              onClick={() => save()}
              className="border-olive text-olive bg-olive-tint rounded-btn border py-[9px] text-center text-[12.5px] font-semibold"
            >
              {t("saveButton")}
            </button>
          )}
          <button
            type="button"
            disabled={isActive}
            onClick={() => activate(selectedId)}
            className="bg-olive rounded-btn py-[9px] text-center text-[12.5px] font-semibold text-white transition-[filter] hover:brightness-[0.95] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isActive ? t("activeGradeNote") : t("useGradeButton")}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Write `components/grades/GradesShell.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/components/shared/PageHeader";
import { GradeLibrary } from "./GradeLibrary";
import { GradeTable } from "./GradeTable";
import { useGradesStore } from "@/lib/gradesStore";
import type { Credits } from "@/lib/types";

export function GradesShell({
  userEmail,
  credits,
}: {
  userEmail: string;
  credits: Credits;
}) {
  const t = useTranslations("Grades");
  const init = useGradesStore((s) => s.init);
  const ready = useGradesStore((s) => s.ready);
  const error = useGradesStore((s) => s.error);
  const draft = useGradesStore((s) => s.draft);

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        credits={credits}
        userEmail={userEmail}
      />
      {!ready && (
        <div className="text-muted flex flex-1 items-center justify-center text-[13px]">
          {t("loading")}
        </div>
      )}
      {ready && error && (
        <div className="text-muted flex flex-1 items-center justify-center text-[13px]">
          {t("loadError")}
        </div>
      )}
      {ready && !error && (
        <div className="flex flex-1 gap-4 overflow-y-auto p-[22px]">
          <GradeLibrary />
          {draft && <GradeTable />}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write `app/grades/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadWallet } from "@/lib/db/wallet";
import { buildCredits } from "@/lib/api/compose";
import { GradesShell } from "@/components/grades/GradesShell";

export default async function GradesPage() {
  const session = await auth();
  if (!session?.user?.email || !session.user.id) redirect("/login");

  const wallet = await loadWallet(session.user.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <GradesShell
        userEmail={session.user.email}
        credits={buildCredits(wallet, new Date())}
      />
    </div>
  );
}
```

- [ ] **Step 5: Update `components/dashboard/Sidebar.tsx`** — enable the "Medidas e grades" link

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useDashboardStore } from "@/lib/dashboardStore";

export function Sidebar({ onCreate }: { onCreate: (id: string) => void }) {
  const t = useTranslations("Sidebar");
  const router = useRouter();
  const create = useDashboardStore((s) => s.create);

  const handleCreate = async () => {
    const id = await create();
    onCreate(id);
  };

  return (
    <div className="border-border bg-surface flex w-[186px] flex-col border-r p-[14px]">
      <nav className="flex flex-col gap-1">
        <span className="bg-olive-tint text-olive rounded-item px-[10px] py-[7px] text-[12.5px] font-medium">
          {t("myPatternsLabel")}
        </span>
        <button
          type="button"
          onClick={() => router.push("/grades")}
          className="text-muted-2 hover:bg-surface-alt rounded-item flex items-center px-[10px] py-[7px] text-left text-[12.5px]"
        >
          {t("measurementsLabel")}
        </button>
        <span className="text-disabled rounded-item flex items-center justify-between px-[10px] py-[7px] text-[12.5px]">
          {t("studioBasesLabel")}
          <span className="bg-amber-bg border-amber-border text-amber-text rounded-pill border px-[6px] py-px text-[10px] font-semibold">
            {t("comingSoonBadge")}
          </span>
        </span>
      </nav>
      <div className="flex-1" />
      <div className="border-border rounded-card text-disabled mb-3 border border-dashed p-[10px] text-center text-[11px]">
        {t("importLabel")}
      </div>
      <button
        onClick={handleCreate}
        className="bg-olive rounded-btn px-[13px] py-[9px] text-[12.5px] font-medium text-white transition-[filter] hover:brightness-[0.95]"
      >
        {t("newPatternButton")}
      </button>
    </div>
  );
}
```

- [ ] **Step 6: Run the full test suite, build, and lint**

```bash
npm test
npm run build
npm run lint
```

Expected: all PASS.

- [ ] **Step 7: Manual smoke check**

```bash
npm run db:up
npm run dev
```

In a browser: log in (`dev@moldai.local` / `moldai-dev`), from the dashboard click "Medidas e grades" in the sidebar, confirm it navigates to `/grades` and shows two system grades ("Feminino adulto · ABNT", "Masculino adulto"). Click "＋ Nova grade", confirm a custom copy appears and is editable (base row, progression rule via "Editar regra de progressão", a manual cell override, add/remove a size column). Click "Usar esta grade", confirm it's marked active. Go back to `/`, generate a new pattern via chat, confirm generation still succeeds (exercises `getGradeForGeneration`/`seedPatternSizeSnapshot`).

- [ ] **Step 8: Commit**

```bash
git add app/grades components/grades components/dashboard/Sidebar.tsx
git commit -m "feat(grades): add the /grades screen (library, table, progression rule editor)"
```

---

### Task 15: Update `CLAUDE.md`

**Files:**

- Modify: `C:\Users\leona\Projects\moldai\CLAUDE.md`

**Interfaces:**

- None — documentation only. Per CLAUDE.md's own "Project stage" section, it's the source of truth for documented architecture and currently lists "Medidas e grades (5i)" as roadmap-not-yet-built; that has to be corrected in the same change.

- [ ] **Step 1: Update the MVP scope paragraph**

Find:

> "**MVP scope (small-scale/personal-use production) is five subsystems.** Shipped: the pattern editor (`4a`), the dashboard (`4b`), and **Configurações do usuário / Gerenciamento de crédito** (one unified `/settings` shell — see below; `4b`'s `CreditsCard`/`RecentUsageCard` still back the dashboard's own summary cards, unchanged). Roadmap, not yet built: **Medidas e grades** (`5i`, has a high-fidelity design already); and **Moldes bases** (not its own screen — a sub-section of `5i`'s design, "Bases do ateliê"). This reverses the earlier call to keep measurement-grid screens and "Bases do ateliê" out of scope — they're now roadmap items, just not yet implemented."

Replace with:

> "**MVP scope (small-scale/personal-use production) is five subsystems.** Shipped: the pattern editor (`4a`), the dashboard (`4b`), **Configurações do usuário / Gerenciamento de crédito** (one unified `/settings` shell — see below; `4b`'s `CreditsCard`/`RecentUsageCard` still back the dashboard's own summary cards, unchanged), and **Medidas e grades** (`5i`, `/grades`, reached from the dashboard sidebar's now-enabled "Medidas e grades" entry) — scoped down from the full `5i` design: grade library, per-size measurement table (progression rule + manual overrides), and an account-level active grade that drives generation/grading are real; "Bases do ateliê" and the Audaces spreadsheet import block are shown on the same screen but remain inert "em breve" placeholders, not yet functional. Roadmap, not yet built: **Moldes bases** (the functional version of "Bases do ateliê" — saving a drafted pattern's pieces as a reusable base)."

- [ ] **Step 2: Update the "Pieces are drafted from measurements, not deltas" paragraph**

Find (in the paragraph starting "**Pieces are drafted from measurements, not deltas.**"):

> "`lib/measurements.ts` defines `Measurements` (bust, waist, shoulder, etc.) — `shoulder` is the half-width from the body's center line to the shoulder tip, not the full shoulder seam — and two base tables per `SizeLabel` (PP–GG): `SIZE_TABLE` (female) and `SIZE_TABLE_MALE` (male). `resolveMeasurements(size, overrides, gender)` picks the table for `gender` (default `"female"`), then applies chat-driven `measurementOverrides`, clamped to `MEASUREMENT_RANGES`. `GarmentType` is `"blouse" | "dress" | "skirt" | "tshirt"`; a `GarmentSpec` (`type` + `gender` (`"female" | "male"`, selects which size table `resolveMeasurements`/`draftGarment` use) + `measurementOverrides` + `style`) plus a size flow into `draftGarment` (`lib/draft/garment.ts`), which calls the per-block drafters in `lib/draft/*` (`body.ts`, `sleeve.ts`, `skirt.ts`, shared helpers in `core.ts`) to build each `Piece`'s outline/guide/grainline/dart in cm and lay them out into a single computed `viewBox` (`autoLayout`)."

Replace with:

> "`lib/measurements.ts` defines `Measurements` (bust, waist, shoulder, etc.) — `shoulder` is the half-width from the body's center line to the shoulder tip, not the full shoulder seam — and two legacy base tables, `SIZE_TABLE` (female) and `SIZE_TABLE_MALE` (male), now used only as the seed data for the two system default **grades** (see the Measurement Grades paragraph below) and the pre-account-grade bootstrap default a brand-new pattern starts from. `resolveMeasurements(base: Measurements, overrides: Partial<Measurements>)` no longer does a size/gender table lookup itself — it just applies chat-driven `measurementOverrides` on top of an already-resolved base row (clamped to `MEASUREMENT_RANGES`); that base row comes from the pattern's own frozen `sizeTable` (its grade snapshot, see below). `GarmentType` is `"blouse" | "dress" | "skirt" | "tshirt"`; a `GarmentSpec` (`type` + `gender` (`"female" | "male"`) + `measurementOverrides` + `style`) plus a resolved `Measurements` row flow into `draftGarment` (`lib/draft/garment.ts`, second parameter is now `baseMeasurements: Measurements`, not a `SizeLabel`), which calls the per-block drafters in `lib/draft/*` (`body.ts`, `sleeve.ts`, `skirt.ts`, shared helpers in `core.ts`) to build each `Piece`'s outline/guide/grainline/dart in cm and lay them out into a single computed `viewBox` (`autoLayout`). The draft engine itself no longer knows what `SizeLabel` even means — `SizeLabel` is now a plain `string`, per-grade dynamic, not the old fixed `"PP"|"P"|"M"|"G"|"GG"` union."

- [ ] **Step 3: Add a new "Measurement grades" paragraph**

Insert, right after the "Pieces are drafted from measurements, not deltas" paragraph (before the "Code identifiers, wire keys, and enum values" paragraph):

> "**Measurement grades (`/grades`) are real, per-account, and drive generation/grading.** `Grade` (Prisma, same JSON-blob-per-row shape as `Pattern`/`Wallet`) holds a `GradeData`: `name`, `gender`, `bodyType` (descriptive metadata only — never affects drafted geometry, a known/honest limitation), `isSystem`, an ordered `sizes: string[]`, `baseSizeIndex`, `baseMeasurements`, a `progressionRule` (cm delta per size step from the base), and per-cell `overrides` that win over the rule. Every account gets two seeded `isSystem: true` grades lazily on first access (`lib/db/grade.ts`'s `ensureSystemGrades`, same "reseed on first access" precedent as `Wallet`) — "Feminino adulto · ABNT" and "Masculino adulto," derived losslessly from the legacy `SIZE_TABLE`/`SIZE_TABLE_MALE` (`lib/grades/seed.ts`'s `buildSystemGradeData`, `resolveGradeSize`'s rule+override reconstruction exactly reproduces the original tables). System grades can be duplicated but not edited or deleted. `User.activeGradeId` is the account-level "grade in use." A pattern **snapshots** its grade — `sizes`/`baseSize`/a fully resolved `sizeTable: Record<string, Measurements>` — once, at its first-ever generation (`app/api/patterns/[id]/generate/route.ts` calls `lib/db/grade.ts`'s `getGradeForGeneration(userId, spec.gender)`, which picks the active grade if its gender matches the spec being drafted, else the system default for that gender, then `lib/editor/state.ts`'s `seedPatternSizeSnapshot` freezes it onto the pattern). Every later regeneration reuses that frozen snapshot — editing or reassigning the account's active grade afterward never retroactively changes an in-progress pattern, same precedent as the existing i18n locale-snapshot limitation. A brand-new blank pattern (before any generation) bootstraps from the system female-adult grade via the same `buildSystemGradeData`/`buildSizeTable` pair, so `Pattern.sizeTable`/`sizes` are always populated, never optional. The `/grades` screen (`components/grades/GradesShell.tsx` + `GradeLibrary.tsx` + `GradeTable.tsx`, its own `useGradesStore`) lets users browse the grade library, edit a custom grade's base row/progression rule/per-cell overrides/size list, duplicate any grade (system or custom), and mark one active (`POST /api/grades/[id]/activate`). "Bases do ateliê" and the Audaces spreadsheet-import block are shown on the same screen, per the `5i` design, but remain inert "em breve" placeholders — not yet functional."

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude): document the measurement-grades feature"
```

---

### Task 16: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full clean verification**

```bash
npm run build
npm test
npm run lint
```

Expected: all PASS with zero errors/warnings introduced by this feature.

- [ ] **Step 2: Confirm no stray `ALL_SIZES` references remain**

```bash
grep -rn "ALL_SIZES" --include='*.ts' --include='*.tsx' app lib components
```

Expected: no output.

- [ ] **Step 3: Manual smoke check (grade → generation → export round trip)**

```bash
npm run db:up
npm run dev
```

In a browser: log in, go to `/grades`, duplicate the system female-adult grade, edit its bust progression rule to `5` cm/size and its `M` base bust to `94`, click "Usar esta grade". Go to `/`, create a new pattern, generate a blouse via chat — confirm the drafted piece reflects the custom base measurement (94 cm bust region, not 92). Open the piece details panel and confirm the size chips shown match the custom grade's `sizes` list. Export the pattern as SVG and confirm the download succeeds without error (exercises `buildExportModel`'s `pattern.sizeTable[pattern.baseSize]` path).

- [ ] **Step 4: Confirm the design doc's Known Limitations still hold**

Spot-check: (a) editing a grade after a pattern already exists does NOT change that pattern's already-drafted geometry until its next regeneration triggers a fresh `applyGarmentSpec` call (snapshot only refreshes on first-ever generation, never again); (b) a male-gender chat request on an account whose active grade is female-only falls back to the system male grade without erroring.
