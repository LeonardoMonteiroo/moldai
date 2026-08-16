# AI-Driven Pattern Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the editor chat actually alter the rendered molde — `POST /api/pattern/generate` calls the Anthropic API, which proposes parameter changes to the pattern pieces; deterministic code clamps and re-renders them.

**Architecture:** Piece geometry becomes _parametric_: every piece stores a `params` map of numeric deltas (all zero at seed → visually identical to today), and a pure `computeGeometry(pieceId, params)` derives the SVG outline/guide/grainline/dart/label + human-readable details. The generate route sends the current params + a param schema + recent chat to Claude via forced tool-use; the model returns `{ decision, pieceChanges, conflict?, declineReason?, assistantMessage }`. The server clamps every returned value to each param's `[min, max]`, recomputes geometry, and mutates the in-memory mock store. Conflict marker coordinates are computed server-side from fixed per-piece landmarks, never trusted from the model.

**Tech Stack:** Next.js 16 (App Router, Node route handlers), TypeScript, Zustand (unchanged), `@anthropic-ai/sdk`, model `claude-sonnet-5`.

## Global Constraints

- **No secrets in git.** The API key lives only in `.env.local` (already covered by the repo's `.env*` gitignore entry). Never hardcode it or commit it.
- **Idle state must not change.** At all-zero params, `computeGeometry` must reproduce the exact base SVG strings currently in `lib/mock-data.ts`. This is a hard requirement verified in Task 1 and Task 2.
- **Only `generate` changes behavior.** Do not touch `graduate`, `conflict/resolve`, or `billing/purchase` route logic, nor the paywall retry-thunk mechanism in `lib/store.ts`.
- **Model ID is exactly `claude-sonnet-5`.**
- **Marker coordinates are code-computed**, from `LANDMARKS`, using only `pieceAId`/`pieceBId` from the model. The model never supplies pixel coordinates.
- **All params are deltas** (relative to base), default `0`, in SVG pixels. Clamp everything.

## Testing note

This repo has no test framework (per CLAUDE.md, "There is no test suite configured"). Per the user's standing instruction that instructions override skill defaults, we do **not** introduce a test runner. The TDD cycle is adapted: where the skill says "write the failing test," we instead **define the exact expected output up front** and verify against it via (a) `npm run build` (the TypeScript typecheck), (b) inspecting the live `GET /api/pattern` JSON for exact base-geometry reproduction, and (c) a Playwright browser walkthrough. Each task's verification steps spell out the exact expected values.

---

### Task 1: Parametric geometry module

**Files:**

- Create: `lib/geometry.ts`
- Modify: `lib/types.ts` (add `PieceParams` type + `params` field on `Piece`)

**Interfaces:**

- Consumes: `PieceOutline`, `PieceDetails` from `lib/types.ts`.
- Produces:
  - `type PieceParams = Record<string, number>` (declared in `lib/types.ts`)
  - `PIECE_PARAM_SCHEMA: Record<string, ParamSpec[]>` where `ParamSpec = { name: string; label: string; unit: "px"; min: number; max: number }`
  - `defaultParams(pieceId: string): PieceParams`
  - `clampParams(pieceId: string, params: PieceParams): PieceParams`
  - `computeGeometry(pieceId: string, raw: PieceParams): ComputedGeometry` where `ComputedGeometry = { outline: PieceOutline; guideOutline?: PieceOutline; grainline?: { x1: number; y1: number; x2: number; y2: number }; dart?: { d: string }; label: { x: number; y: number } }`
  - `deriveDetails(pieceId: string, raw: PieceParams): PieceDetails`

- [ ] **Step 1: Add `PieceParams` and the `params` field to `lib/types.ts`**

In `lib/types.ts`, add the type near the top (after the `PieceOutline` union) and add `params` to `Piece`:

```ts
export type PieceParams = Record<string, number>;
```

Then in the `Piece` interface add the field (keep every existing field):

```ts
export interface Piece {
  id: string;
  name: string;
  qty: number;
  params: PieceParams;
  outline: PieceOutline;
  guideOutline?: PieceOutline;
  grainline?: { x1: number; y1: number; x2: number; y2: number };
  dart?: { d: string };
  label: { x: number; y: number };
  details: PieceDetails;
}
```

- [ ] **Step 2: Create `lib/geometry.ts` with the full module**

```ts
import { PieceDetails, PieceOutline, PieceParams } from "./types";

export interface ParamSpec {
  name: string;
  label: string;
  unit: "px";
  min: number;
  max: number;
}

// All params are DELTAS from the base shape, in SVG pixels. Default 0 => base shape.
export const PIECE_PARAM_SCHEMA: Record<string, ParamSpec[]> = {
  frente: [
    {
      name: "length",
      label: "comprimento (barra para baixo)",
      unit: "px",
      min: -120,
      max: 160,
    },
    {
      name: "hemWidth",
      label: "largura da barra",
      unit: "px",
      min: -40,
      max: 90,
    },
    {
      name: "shoulderWidth",
      label: "largura do ombro",
      unit: "px",
      min: -30,
      max: 50,
    },
    {
      name: "caseDepth",
      label: "profundidade da cava",
      unit: "px",
      min: -40,
      max: 70,
    },
    {
      name: "necklineDepth",
      label: "profundidade do decote em V",
      unit: "px",
      min: 0,
      max: 90,
    },
    {
      name: "dartSize",
      label: "tamanho da pence",
      unit: "px",
      min: -10,
      max: 30,
    },
    {
      name: "seamAllowance",
      label: "folga de costura",
      unit: "px",
      min: -3,
      max: 20,
    },
  ],
  costas: [
    {
      name: "length",
      label: "comprimento (barra para baixo)",
      unit: "px",
      min: -120,
      max: 160,
    },
    {
      name: "hemWidth",
      label: "largura da barra",
      unit: "px",
      min: -40,
      max: 90,
    },
    {
      name: "shoulderWidth",
      label: "largura do ombro",
      unit: "px",
      min: -30,
      max: 50,
    },
    {
      name: "caseDepth",
      label: "profundidade da cava",
      unit: "px",
      min: -40,
      max: 70,
    },
    {
      name: "seamAllowance",
      label: "folga de costura",
      unit: "px",
      min: -3,
      max: 20,
    },
  ],
  manga: [
    {
      name: "sleeveLength",
      label: "comprimento da manga",
      unit: "px",
      min: -80,
      max: 260,
    },
    {
      name: "sleeveWidth",
      label: "largura da manga",
      unit: "px",
      min: -40,
      max: 80,
    },
    {
      name: "caseDepth",
      label: "profundidade da copa/cava",
      unit: "px",
      min: -40,
      max: 70,
    },
    {
      name: "seamAllowance",
      label: "folga de costura",
      unit: "px",
      min: -3,
      max: 20,
    },
  ],
};

export function defaultParams(pieceId: string): PieceParams {
  const specs = PIECE_PARAM_SCHEMA[pieceId] ?? [];
  const p: PieceParams = {};
  for (const s of specs) p[s.name] = 0;
  return p;
}

export function clampParams(pieceId: string, params: PieceParams): PieceParams {
  const specs = PIECE_PARAM_SCHEMA[pieceId] ?? [];
  const out = defaultParams(pieceId);
  for (const s of specs) {
    const v = params[s.name];
    if (typeof v === "number" && Number.isFinite(v)) {
      out[s.name] = Math.min(s.max, Math.max(s.min, v));
    }
  }
  return out;
}

export interface ComputedGeometry {
  outline: PieceOutline;
  guideOutline?: PieceOutline;
  grainline?: { x1: number; y1: number; x2: number; y2: number };
  dart?: { d: string };
  label: { x: number; y: number };
}

function round(n: number): number {
  return Math.round(n * 10) / 10;
}

function poly(points: number[][]): PieceOutline {
  return {
    kind: "polygon",
    points: points.map(([x, y]) => `${round(x)},${round(y)}`).join(" "),
  };
}

function frenteGeometry(p: PieceParams): ComputedGeometry {
  const cx = 110;
  const shoulderL = [55 - p.shoulderWidth, 30];
  const shoulderR = [165 + p.shoulderWidth, 30];
  const waistR = [182, 180 + p.caseDepth];
  const hemR = [150 + p.hemWidth, 350 + p.length];
  const hemL = [48 - p.hemWidth, 350 + p.length];
  const waistL = [34, 180 + p.caseDepth];

  const top: number[][] = [shoulderL];
  if (p.necklineDepth > 0) {
    top.push([cx - 22, 30], [cx, 30 + p.necklineDepth], [cx + 22, 30]);
  }
  top.push(shoulderR);

  const outline = poly([...top, waistR, hemR, hemL, waistL]);
  const guideOutline = poly([
    [46 - p.shoulderWidth, 22],
    [174 + p.shoulderWidth, 22],
    [191, 182 + p.caseDepth],
    [158 + p.hemWidth, 360 + p.length],
    [39 - p.hemWidth, 360 + p.length],
    [24, 182 + p.caseDepth],
  ]);
  const grainline = { x1: 105, y1: 34, x2: 97, y2: 346 + p.length };
  const halfDart = 18 + p.dartSize;
  const dart = {
    d: `M110 30 L${round(110 + halfDart)} 96 L${round(110 - halfDart)} 96 Z`,
  };
  const label = { x: 55, y: 368 + p.length };
  return { outline, guideOutline, grainline, dart, label };
}

function costasGeometry(p: PieceParams): ComputedGeometry {
  const shoulderL = [215 - p.shoulderWidth, 30];
  const shoulderR = [325 + p.shoulderWidth, 30];
  const waistR = [342, 180 + p.caseDepth];
  const hemR = [310 + p.hemWidth, 350 + p.length];
  const hemL = [208 - p.hemWidth, 350 + p.length];
  const waistL = [194, 180 + p.caseDepth];

  const outline = poly([shoulderL, shoulderR, waistR, hemR, hemL, waistL]);
  const guideOutline = poly([
    [206 - p.shoulderWidth, 22],
    [334 + p.shoulderWidth, 22],
    [351, 182 + p.caseDepth],
    [318 + p.hemWidth, 360 + p.length],
    [199 - p.hemWidth, 360 + p.length],
    [184, 182 + p.caseDepth],
  ]);
  const grainline = { x1: 265, y1: 34, x2: 257, y2: 346 + p.length };
  const label = { x: 215, y: 368 + p.length };
  return { outline, guideOutline, grainline, label };
}

function mangaGeometry(p: PieceParams): ComputedGeometry {
  const capW = 82;
  const capH = 72 + p.caseDepth;
  const sideDrop = 186 + p.sleeveLength;
  const hemW = 108 + p.sleeveWidth;

  const A = [395, 42];
  const B = [A[0] + capW, A[1] + capH];
  const C = [B[0] - 18, B[1] + sideDrop];
  const D = [C[0] - hemW, C[1]];
  const E = [D[0] - 18, D[1] - sideDrop];

  const d =
    `M${round(A[0])} ${round(A[1])} ` +
    `Q${round(A[0] + 72)} ${round(A[1] + 12)} ${round(B[0])} ${round(B[1])} ` +
    `L${round(C[0])} ${round(C[1])} ` +
    `L${round(D[0])} ${round(D[1])} ` +
    `L${round(E[0])} ${round(E[1])} ` +
    `Q${round(E[0] + 12)} ${round(E[1] - (capH - 12))} ${round(A[0])} ${round(A[1])} Z`;

  const label = { x: 368, y: 368 + p.sleeveLength };
  return { outline: { kind: "path", d }, label };
}

export function computeGeometry(
  pieceId: string,
  raw: PieceParams,
): ComputedGeometry {
  const p = clampParams(pieceId, raw);
  if (pieceId === "frente") return frenteGeometry(p);
  if (pieceId === "costas") return costasGeometry(p);
  if (pieceId === "manga") return mangaGeometry(p);
  throw new Error(`Unknown piece: ${pieceId}`);
}

const PX_PER_CM = 5;
const cm = (v: number) => v.toFixed(1).replace(".", ",");
const meters = (v: number) => v.toFixed(2).replace(".", ",");

export function deriveDetails(pieceId: string, raw: PieceParams): PieceDetails {
  const p = clampParams(pieceId, raw);
  if (pieceId === "frente") {
    return {
      folgaCostura: `${cm(1.0 + p.seamAllowance / PX_PER_CM)} cm`,
      penceBusto: `${cm(2.5 + p.dartSize / PX_PER_CM)} cm`,
      cava: `${cm(21.4 + p.caseDepth / PX_PER_CM)} cm`,
      fio: "reto",
      consumo: `${meters(1.85 + Math.max(0, p.length) * 0.004 + Math.max(0, p.hemWidth) * 0.002)} m`,
    };
  }
  if (pieceId === "costas") {
    return {
      folgaCostura: `${cm(1.0 + p.seamAllowance / PX_PER_CM)} cm`,
      penceBusto: "—",
      cava: `${cm(20.1 + p.caseDepth / PX_PER_CM)} cm`,
      fio: "reto",
      consumo: `${meters(1.6 + Math.max(0, p.length) * 0.004 + Math.max(0, p.hemWidth) * 0.002)} m`,
    };
  }
  if (pieceId === "manga") {
    return {
      folgaCostura: `${cm(1.0 + p.seamAllowance / PX_PER_CM)} cm`,
      penceBusto: "—",
      cava: `${cm(19.6 + p.caseDepth / PX_PER_CM)} cm`,
      fio: "reto",
      consumo: `${meters(0.45 + Math.max(0, p.sleeveLength) * 0.004 + Math.max(0, p.sleeveWidth) * 0.002)} m`,
    };
  }
  throw new Error(`Unknown piece: ${pieceId}`);
}
```

- [ ] **Step 3: Verify the module typechecks**

Run: `npm run build`
Expected: build succeeds. (The module isn't imported anywhere yet, but `tsc` compiles all files — a type error here fails the build.)

- [ ] **Step 4: Verify base reproduction by reasoning through zero-params (documented expected values)**

These are the exact strings `computeGeometry(id, defaultParams(id))` MUST produce — they equal the current hand-authored geometry in `lib/mock-data.ts`. Confirm by tracing the code (they are re-verified live in Task 2):

- `frente.outline.points` → `"55,30 165,30 182,180 150,350 48,350 34,180"`
- `frente.guideOutline.points` → `"46,22 174,22 191,182 158,360 39,360 24,182"`
- `frente.grainline` → `{ x1: 105, y1: 34, x2: 97, y2: 346 }`
- `frente.dart.d` → `"M110 30 L128 96 L92 96 Z"`
- `frente.label` → `{ x: 55, y: 368 }`
- `costas.outline.points` → `"215,30 325,30 342,180 310,350 208,350 194,180"`
- `costas.guideOutline.points` → `"206,22 334,22 351,182 318,360 199,360 184,182"`
- `manga.outline.d` → `"M395 42 Q467 54 477 114 L459 300 L351 300 L333 114 Q345 54 395 42 Z"` (absolute form of the original relative path; traces identical points)
- `deriveDetails("frente", {})` → `{ folgaCostura: "1,0 cm", penceBusto: "2,5 cm", cava: "21,4 cm", fio: "reto", consumo: "1,85 m" }`

- [ ] **Step 5: Commit**

```bash
git add lib/geometry.ts lib/types.ts
git commit -m "feat: add parametric piece geometry module

Adds computeGeometry/deriveDetails deriving SVG + specs from per-piece
numeric params (deltas). At zero params, output equals the existing
hand-authored geometry exactly."
```

---

### Task 2: Wire the mock store to computed geometry

**Files:**

- Modify: `lib/mock-data.ts`

**Interfaces:**

- Consumes: `computeGeometry`, `deriveDetails`, `defaultParams`, `clampParams` from `lib/geometry.ts`; `PieceParams` from `lib/types.ts`.
- Produces:
  - `updatePieceParams(pieceId: string, partial: PieceParams): void` — merges deltas onto a piece, clamps, recomputes geometry + details.
  - `interface ConflictInput { pieceAId: string; pieceBId: string; diffCm: number; title: string; description: string; suggestion: string }`
  - `buildConflict(input: ConflictInput): ConflictInfo` — **signature changed** (was zero-arg). Markers computed from `LANDMARKS`.

- [ ] **Step 1: Replace the three hardcoded `Piece` literals with param-built pieces**

At the top of `lib/mock-data.ts`, update imports and replace the `frente`/`costas`/`manga` constants. Delete the old inline `outline`/`guideOutline`/`grainline`/`dart`/`label`/`details` literals for all three.

```ts
import {
  ChatMessage,
  ConflictInfo,
  Credits,
  EditorState,
  Pattern,
  Piece,
  PieceParams,
} from "./types";
import {
  clampParams,
  computeGeometry,
  defaultParams,
  deriveDetails,
} from "./geometry";

function makePiece(
  id: string,
  name: string,
  qty: number,
  params: PieceParams,
): Piece {
  const g = computeGeometry(id, params);
  return {
    id,
    name,
    qty,
    params,
    outline: g.outline,
    guideOutline: g.guideOutline,
    grainline: g.grainline,
    dart: g.dart,
    label: g.label,
    details: deriveDetails(id, params),
  };
}

const frente = makePiece("frente", "Frente", 1, defaultParams("frente"));
const costas = makePiece("costas", "Costas", 1, defaultParams("costas"));
const manga = makePiece("manga", "Manga", 2, defaultParams("manga"));
```

- [ ] **Step 2: Add `updatePieceParams` (place it near `applySizes`)**

```ts
export function updatePieceParams(pieceId: string, partial: PieceParams) {
  state.pattern = {
    ...state.pattern,
    pieces: state.pattern.pieces.map((pc) => {
      if (pc.id !== pieceId) return pc;
      const merged = clampParams(pieceId, { ...pc.params, ...partial });
      const g = computeGeometry(pieceId, merged);
      return {
        ...pc,
        params: merged,
        outline: g.outline,
        guideOutline: g.guideOutline,
        grainline: g.grainline,
        dart: g.dart,
        label: g.label,
        details: deriveDetails(pieceId, merged),
      };
    }),
  };
}
```

- [ ] **Step 3: Replace `buildConflict` with the landmark-based version**

Delete the existing zero-arg `buildConflict` and replace with:

```ts
const LANDMARKS: Record<string, { cx: number; cy: number }> = {
  frente: { cx: 110, cy: 60 },
  costas: { cx: 270, cy: 60 },
  manga: { cx: 430, cy: 78 },
};

export interface ConflictInput {
  pieceAId: string;
  pieceBId: string;
  diffCm: number;
  title: string;
  description: string;
  suggestion: string;
}

export function buildConflict(input: ConflictInput): ConflictInfo {
  const a = LANDMARKS[input.pieceAId] ?? { cx: 110, cy: 60 };
  const b = LANDMARKS[input.pieceBId] ?? { cx: 430, cy: 78 };
  return {
    id: `conflict-${Date.now()}`,
    title: input.title,
    description: input.description,
    diffCm: input.diffCm,
    suggestion: input.suggestion,
    pieceAId: input.pieceAId,
    pieceBId: input.pieceBId,
    markers: [
      { cx: a.cx, cy: a.cy, r: 20 },
      { cx: b.cx, cy: b.cy, r: 20 },
    ],
  };
}
```

Note: `generate/route.ts` currently calls `buildConflict()` with no args and won't compile until Task 4 updates it. That's expected — `npm run build` is deferred to Task 4's verification. Between now and then the tree won't typecheck; commit anyway (the two tasks are a unit but split for review).

- [ ] **Step 4: Verify base reproduction live**

Run the dev server (`npm run dev`), then in a browser or via fetch inspect `http://localhost:3000/api/pattern`. Confirm the JSON matches the documented base values exactly:

- `pattern.pieces[0].outline.points === "55,30 165,30 182,180 150,350 48,350 34,180"`
- `pattern.pieces[0].details.cava === "21,4 cm"`
- `pattern.pieces[2].outline.d === "M395 42 Q467 54 477 114 L459 300 L351 300 L333 114 Q345 54 395 42 Z"`

Also load `http://localhost:3000` and confirm the molde renders identically to before (three pieces, dashed guides, grainlines, dart, labels — no visual change).

- [ ] **Step 5: Commit**

```bash
git add lib/mock-data.ts
git commit -m "feat: build seeded pieces from params, add updatePieceParams

Pieces now derive geometry/details from computeGeometry at seed and on
mutation. buildConflict computes markers from fixed per-piece landmarks."
```

---

### Task 3: Anthropic AI proposal module

**Files:**

- Create: `lib/ai.ts`
- Create: `.env.local` (not committed)
- Modify: `package.json` (adds `@anthropic-ai/sdk` dependency)

**Interfaces:**

- Consumes: `EditorState` from `lib/types.ts`; `PIECE_PARAM_SCHEMA` from `lib/geometry.ts`.
- Produces:
  - `interface AiDecision { decision: "apply" | "conflict" | "decline"; pieceChanges: { pieceId: string; params: Record<string, number> }[]; conflict?: { pieceAId: string; pieceBId: string; diffCm: number; title: string; description: string; suggestion: string }; declineReason?: string; assistantMessage: string }`
  - `proposePatternChange(state: EditorState, message: string): Promise<AiDecision>` — throws on API/network error or missing tool_use block.

- [ ] **Step 1: Install the SDK**

Run: `npm install @anthropic-ai/sdk`
Expected: `package.json` `dependencies` gains `@anthropic-ai/sdk`.

- [ ] **Step 2: Create `.env.local` with the API key**

Create `.env.local` in the repo root:

```
ANTHROPIC_API_KEY=sk-ant-...your-key...
```

Confirm it is ignored: `git status` must NOT list `.env.local`. (The `.env*` rule in `.gitignore` already covers it.)

- [ ] **Step 3: Create `lib/ai.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";
import { EditorState } from "./types";
import { PIECE_PARAM_SCHEMA } from "./geometry";

export interface PieceChange {
  pieceId: string;
  params: Record<string, number>;
}

export interface AiConflict {
  pieceAId: string;
  pieceBId: string;
  diffCm: number;
  title: string;
  description: string;
  suggestion: string;
}

export interface AiDecision {
  decision: "apply" | "conflict" | "decline";
  pieceChanges: PieceChange[];
  conflict?: AiConflict;
  declineReason?: string;
  assistantMessage: string;
}

const client = new Anthropic();

const TOOL: Anthropic.Tool = {
  name: "propose_pattern_change",
  description:
    "Decide como o pedido do usuário altera o molde. Escolha SEMPRE uma decisão e escreva assistantMessage em português do Brasil.",
  input_schema: {
    type: "object",
    properties: {
      decision: {
        type: "string",
        enum: ["apply", "conflict", "decline"],
        description:
          "apply = ajuste válido sem conflito; conflict = o ajuste faz duas peças não fecharem na costura; decline = o pedido não é um ajuste de molde mapeável.",
      },
      pieceChanges: {
        type: "array",
        description:
          "Peças a alterar e os DELTAS de parâmetros (em px, relativos ao valor atual). Vazio se decision=decline.",
        items: {
          type: "object",
          properties: {
            pieceId: { type: "string", enum: ["frente", "costas", "manga"] },
            params: {
              type: "object",
              additionalProperties: { type: "number" },
            },
          },
          required: ["pieceId", "params"],
        },
      },
      conflict: {
        type: "object",
        description: "Preencha SOMENTE quando decision=conflict.",
        properties: {
          pieceAId: { type: "string", enum: ["frente", "costas", "manga"] },
          pieceBId: { type: "string", enum: ["frente", "costas", "manga"] },
          diffCm: { type: "number" },
          title: { type: "string" },
          description: { type: "string" },
          suggestion: { type: "string" },
        },
        required: [
          "pieceAId",
          "pieceBId",
          "diffCm",
          "title",
          "description",
          "suggestion",
        ],
      },
      declineReason: {
        type: "string",
        description: "Preencha SOMENTE quando decision=decline.",
      },
      assistantMessage: {
        type: "string",
        description:
          "Resposta curta ao usuário no chat, em português, descrevendo o que foi feito ou por que não.",
      },
    },
    required: ["decision", "pieceChanges", "assistantMessage"],
  },
};

function buildSystem(state: EditorState): string {
  const current = state.pattern.pieces.map((p) => ({
    pieceId: p.id,
    name: p.name,
    params: p.params,
  }));
  return [
    "Você é o motor de modelagem da MoldAI. Recebe pedidos em linguagem natural sobre um molde de vestuário e traduz em ALTERAÇÕES DE PARÂMETROS das peças.",
    "Todos os parâmetros são DELTAS em pixels, relativos ao valor ATUAL da peça (positivo aumenta, negativo diminui). Devolva apenas os parâmetros que mudam.",
    "Convenções: caseDepth = profundidade da cava; necklineDepth (só frente) = decote em V (0 = sem decote); length = comprimento; sleeveLength = comprimento da manga; seamAllowance = folga de costura; dartSize = pence; shoulderWidth/hemWidth/sleeveWidth = larguras.",
    "Regra de conflito: a cava (caseDepth) da frente e da manga precisam casar. Se um ajuste fizer a diferença passar de ~1 cm entre as peças que se costuram, use decision=conflict, explique e sugira a correção. 1 cm ≈ 5 px.",
    "Se o pedido não for um ajuste de molde mapeável nesses parâmetros (ex.: pergunta genérica, pedido impossível), use decision=decline e explique gentilmente em assistantMessage.",
    "",
    "Esquema de parâmetros (name, min, max em px) por peça:",
    JSON.stringify(PIECE_PARAM_SCHEMA),
    "",
    "Estado atual das peças (params atuais):",
    JSON.stringify(current),
  ].join("\n");
}

export async function proposePatternChange(
  state: EditorState,
  message: string,
): Promise<AiDecision> {
  const history = state.chat.slice(-10).map((m) => ({
    role: m.author === "user" ? ("user" as const) : ("assistant" as const),
    content: m.text,
  }));

  const resp = await client.messages.create({
    model: "claude-sonnet-5",
    max_tokens: 1024,
    system: buildSystem(state),
    tools: [TOOL],
    tool_choice: { type: "tool", name: "propose_pattern_change" },
    messages: [...history, { role: "user", content: message }],
  });

  const block = resp.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error("Model did not return a tool_use block");
  }
  return block.input as AiDecision;
}
```

- [ ] **Step 4: Verify it typechecks**

Run: `npm run build`
Expected: `lib/ai.ts` compiles. (The build still fails overall if Task 2's `buildConflict` call in `generate/route.ts` is unfixed — that's fine and resolved in Task 4. Confirm any error is ONLY the `buildConflict` arg mismatch in `generate/route.ts`, not anything in `lib/ai.ts`.)

- [ ] **Step 5: Commit**

```bash
git add lib/ai.ts package.json package-lock.json
git commit -m "feat: add Anthropic proposal module for pattern changes

proposePatternChange sends current params + schema + recent chat to
claude-sonnet-5 via forced tool-use and returns a validated decision."
```

---

### Task 4: Rewrite the generate route to use the AI

**Files:**

- Modify: `app/api/pattern/generate/route.ts` (full rewrite)
- Modify: `lib/api-client.ts` (add `"declined"` to the status union)

**Interfaces:**

- Consumes: `proposePatternChange` from `lib/ai.ts`; `updatePieceParams`, `buildConflict` (new signature) from `lib/mock-data.ts`.
- Produces: `POST /api/pattern/generate` returning one of `{ status: "ok" | "conflict" | "error" | "declined", state }` or `{ status: "insufficient_credits", required, balance }` (402).

- [ ] **Step 1: Replace `app/api/pattern/generate/route.ts` entirely**

```ts
import { NextResponse } from "next/server";
import {
  addMessage,
  bumpVersion,
  buildConflict,
  debitCredits,
  getState,
  refundCredits,
  setConflict,
  updatePieceParams,
} from "@/lib/mock-data";
import { COSTS } from "@/lib/types";
import { proposePatternChange, AiDecision } from "@/lib/ai";

export async function POST(request: Request) {
  const { message } = (await request.json()) as { message: string };
  const trimmed = message.trim();
  const state = getState();
  const cost = COSTS.adjust;

  if (state.credits.balance < cost) {
    return NextResponse.json(
      {
        status: "insufficient_credits",
        required: cost,
        balance: state.credits.balance,
      },
      { status: 402 },
    );
  }

  addMessage({
    id: `msg-${Date.now()}-u`,
    author: "user",
    text: trimmed,
    createdAt: Date.now(),
  });
  debitCredits(cost);

  let decision: AiDecision;
  try {
    decision = await proposePatternChange(getState(), trimmed);
  } catch {
    refundCredits(cost);
    return NextResponse.json({ status: "error", state: getState() });
  }

  if (decision.decision === "decline") {
    refundCredits(cost);
    addMessage({
      id: `msg-${Date.now()}-ai`,
      author: "ai",
      text:
        decision.assistantMessage ||
        decision.declineReason ||
        "Não consegui aplicar esse pedido.",
      createdAt: Date.now(),
    });
    return NextResponse.json({ status: "declined", state: getState() });
  }

  for (const change of decision.pieceChanges) {
    updatePieceParams(change.pieceId, change.params);
  }

  if (decision.decision === "conflict" && decision.conflict) {
    setConflict(buildConflict(decision.conflict));
    bumpVersion();
    addMessage({
      id: `msg-${Date.now()}-ai`,
      author: "ai",
      text: decision.assistantMessage,
      tone: "conflict",
      chips: [{ label: `−${cost} crédito`, tone: "credit" }],
      createdAt: Date.now(),
    });
    return NextResponse.json({ status: "conflict", state: getState() });
  }

  bumpVersion();
  addMessage({
    id: `msg-${Date.now()}-ai`,
    author: "ai",
    text: decision.assistantMessage,
    chips: [{ label: `−${cost} crédito`, tone: "credit" }],
    createdAt: Date.now(),
  });
  return NextResponse.json({ status: "ok", state: getState() });
}
```

- [ ] **Step 2: Add `"declined"` to the api-client status union**

In `lib/api-client.ts`, update the `GenerateResult` type:

```ts
export type GenerateResult =
  | { status: "ok" | "conflict" | "error" | "declined"; state: EditorState }
  | { status: "insufficient_credits"; required: number; balance: number };
```

No other client change is needed: `lib/store.ts`'s `sendMessage` already calls `applyState` and sets `generationStatus` to `"error"` only when `status === "error"`, `"idle"` otherwise — so `"declined"` correctly resolves to idle with the AI's message already in the returned `state.chat`.

- [ ] **Step 3: Verify the full build is clean**

Run: `npm run build`
Expected: PASS with no type errors (the `buildConflict` signature mismatch from Task 2 is now resolved).

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/pattern/generate/route.ts lib/api-client.ts
git commit -m "feat: drive pattern generation through the AI

generate now calls proposePatternChange, clamps + applies param deltas,
builds conflicts from the model's decision, and refunds on decline/error.
Removes the old keyword-scripted (cava/erro) branches."
```

---

### Task 5: Update CLAUDE.md to reflect real AI + computed geometry

**Files:**

- Modify: `CLAUDE.md`

The user confirmed CLAUDE.md should be updated. Two claims are now false and must be corrected: "There is no real AI, no real pattern-geometry engine" and "Pieces are illustrative, not computed."

- [ ] **Step 1: Update the "What this is" paragraph**

Replace the sentence:

> There is no real AI, no real pattern-geometry engine, and no auth; everything is simulated to make the UI/UX flow demonstrable end-to-end.

with:

> The chat is backed by a **real Anthropic API call** (`claude-sonnet-5`) that interprets requests and proposes parameter changes to the pattern pieces; piece geometry is **computed** from those parameters. The rest of the backend (credits, grading, billing, conflict persistence) is still a mock in-memory store, and there is no auth. Requires `ANTHROPIC_API_KEY` in `.env.local`.

- [ ] **Step 2: Replace the "Pieces are illustrative, not computed" paragraph**

Replace that entire final paragraph with:

```markdown
**Pieces are parametric and computed.** Each `Piece` in `lib/mock-data.ts` stores a `params` map of numeric deltas (SVG px, default 0). `lib/geometry.ts` (`computeGeometry`, `deriveDetails`) derives the SVG outline/guide/grainline/dart/label and the human-readable spec strings from those params — at all-zero params the output reproduces the original hand-authored shapes exactly. `updatePieceParams` in `lib/mock-data.ts` is the single place that merges deltas, clamps to each param's `[min, max]` (from `PIECE_PARAM_SCHEMA`), and recomputes geometry. The AI never emits SVG or pixel coordinates — it only proposes param deltas, which the server clamps before rendering.
```

- [ ] **Step 3: Update the `POST /api/pattern/generate` bullet in Architecture**

Replace that bullet with:

```markdown
- `POST /api/pattern/generate` — debits `COSTS.adjust` immediately, then calls `proposePatternChange` (`lib/ai.ts`) which asks `claude-sonnet-5`, via forced tool-use, for a `{ decision: "apply" | "conflict" | "decline", pieceChanges, conflict?, assistantMessage }`. `apply`/`conflict` clamp + apply the param deltas via `updatePieceParams` and bump the version; `conflict` also sets the active conflict (markers computed server-side from fixed per-piece `LANDMARKS`, never from the model); `decline` and any API/parse error refund the credit. Insufficient balance returns HTTP 402 (no debit, no AI call).
```

- [ ] **Step 4: Verify and commit**

Read the file back to confirm no stale "illustrative"/"no real AI" wording remains.

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for real AI + parametric geometry"
```

---

### Task 6: End-to-end verification

**Files:** none (verification only)

- [ ] **Step 1: Start the dev server with a valid key**

Ensure `.env.local` has a working `ANTHROPIC_API_KEY`, then run `npm run dev`.

- [ ] **Step 2: Idle-state check**

Load `http://localhost:3000`. Confirm the molde looks identical to before this change (three pieces, guides, grainlines, dart, labels; details panel shows Cava 21,4 cm for Frente).

- [ ] **Step 3: Apply flow (geometry actually changes)**

In the chat, send: `deixa a manga bem curta`. Expect: generating overlay → an AI bubble with a `−1 crédito` chip → the **manga piece visibly shortens** on the canvas, and its Consumo/Cava in the details panel update. Credit balance drops by 1.

- [ ] **Step 4: Neckline flow**

Send: `faz um decote em V mais fundo na frente`. Expect: the frente top gains a V notch (the neckline dips at center).

- [ ] **Step 5: Conflict flow**

Send: `aumenta muito a cava da frente, uns 4 cm`. Expect the model to return `conflict`: an amber AI bubble, dashed alert circles on the canvas at the frente + manga landmarks, the `ConflictInfoCard` top-right, and the footer Export disabled. Resolve for free via "Corrigir manga" and confirm the conflict clears and Export re-enables.

- [ ] **Step 6: Decline + refund flow**

Note the current balance. Send an off-scope request: `qual a capital da França?`. Expect: a normal (non-amber) AI bubble declining, no geometry change, no version bump, and the balance **unchanged** (credit refunded).

- [ ] **Step 7: Error/refund resilience**

Temporarily set an invalid `ANTHROPIC_API_KEY`, restart `npm run dev`, note balance, send any message. Expect: the red "A geração falhou..." bubble and the balance unchanged (refunded). Restore the real key afterward.

- [ ] **Step 8: Console + build sanity**

Confirm no browser console errors during the flows, and that `npm run build` and `npm run lint` are clean.

---

## Self-Review

**Spec coverage:**

- Parametric geometry model (spec §1) → Task 1 (params, schema, computeGeometry, deriveDetails) + Task 2 (seed/update wiring). ✓ Per-piece param lists match the spec exactly.
- AI request/response contract (spec §2) → Task 3 (`lib/ai.ts`, tool schema, `@anthropic-ai/sdk`, `claude-sonnet-5`, last ~10 messages, clamp) + Task 4 (route applies + clamps). ✓
- Conflict handling & rendering (spec §3) → Task 2 (`LANDMARKS`, `buildConflict`) + Task 4 (model decides conflict; markers code-computed). Old `"cava"` keyword branch removed. ✓
- Error & credit flow (spec §4) → Task 4 (decline refund + `"declined"` status; API error refund + `"error"`; 402 unchanged). Old `"forçar erro"` branch removed. ✓
- Unchanged surfaces (spec "Explicitly unchanged") → graduate/resolve/purchase/paywall/overlay/store untouched except the api-client type union. ✓
- CLAUDE.md follow-up (spec "Follow-up") → Task 5. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code; verification steps have exact expected values.

**Type consistency:** `PieceParams` declared once in `lib/types.ts`, imported by geometry/mock-data. `computeGeometry`/`deriveDetails`/`clampParams`/`defaultParams` signatures identical across Tasks 1–2. `buildConflict(ConflictInput)` new signature defined in Task 2 and called with a matching object in Task 4. `AiDecision` shape defined in Task 3 matches the tool `input_schema` and the route's usage in Task 4. `GenerateResult` union extended with `"declined"` in Task 4 and consumed by the existing store logic unchanged.
