# Export do molde — Fase 2 (DXF geometria 1:1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um segundo formato de export — um DXF de geometria vetorial 1:1 (mm) — reusando o `ExportModel` da Fase 1.

**Architecture:** Um helper puro de achatamento de Bézier (`flattenCubic`, De Casteljau adaptativo) e um serializer puro `toDxf(model) => string` (DXF ASCII hand-written, zero-dep), ambos em `lib/export/dxf.ts`, consumindo o `ExportModel` intacto. A fachada `exportPattern` passa a despachar por `switch`/`never` e o `Footer` ganha o item DXF.

**Tech Stack:** TypeScript, Next.js 16, Vitest (env node), sem dependências novas.

## Global Constraints

- **Zero dependências novas.** DXF é string ASCII escrita à mão, espelhando o padrão puro de `lib/export/svg.ts` (sem DOM, `(ExportModel) => string`).
- **Escala física 1:1:** `MM = 10` (cm→mm), `$INSUNITS = 4` (mm). Um lado de 10 cm = 100 unidades no arquivo. Mesma convenção do `toSvg`.
- **Eixo Y invertido no DXF:** o DXF tem +Y para cima; o `ExportModel`/SVG têm +Y para baixo. `toDxf` inverte Y em torno da folha — `Y = (sheetHeightCm - (originY + y)) * MM` — pra peça abrir na orientação certa no CAD. A inversão NÃO altera a escala nem os spans horizontais.
- **Linha líquida (net line):** a folga de costura só é anotada (comentário `999`), nunca deslocada pra geometria.
- **Nomenclatura honesta:** "DXF · geometria 1:1", nunca "DXF-AAMA". Camadas nomeadas descritivas, não numéricas.
- **Núcleo intacto:** `lib/export/model.ts` (tipos `ExPt`/`ExSeg`/`ExportPiece`/`ExportModel`, `outlineSegments`, `buildExportModel`) NÃO muda. `toSvg` NÃO muda.
- **Client-side puro:** sem rota, sem custo de crédito, sem mutação de estado.
- **Tolerância de achatamento desta fase:** `TOL_CM = 0.02` (0,2 mm).
- **Layers (nesta ordem):** `CONTORNO`, `INTERNO`, `GRAINLINE`, `TEXTO`.
- Verificação: `npm run build` (checagem TS), `npm test`, lint escopado a `app lib components` (lint na raiz falso-alarma por causa de worktrees aninhados).

Referência de formas do `ExportModel` (de `lib/export/model.ts`, não alterar):

```ts
export type ExPt = { x: number; y: number };
export type ExSeg =
  { kind: "line"; to: ExPt } | { kind: "cubic"; c1: ExPt; c2: ExPt; to: ExPt };
export interface ExportPiece {
  id: string;
  name: string;
  qty: number;
  widthCm: number;
  heightCm: number;
  outline: { start: ExPt; segs: ExSeg[] };
  grainline?: [ExPt, ExPt];
  dart?: ExPt[];
  originCm: ExPt;
}
export interface ExportModel {
  patternName: string;
  size: SizeLabel;
  unit: "cm";
  seamAllowanceCm: number | null;
  sheetWidthCm: number;
  sheetHeightCm: number;
  pieces: ExportPiece[];
}
```

O contorno de `outlineSegments` é fechado: a última `seg` volta ao `outline.start` (o `to` final coincide com o `start`).

---

### Task 1: Helper de achatamento de Bézier (`flattenCubic`)

**Files:**

- Create: `lib/export/dxf.ts`
- Test: `lib/export/dxf.test.ts`

**Interfaces:**

- Consumes: `ExPt` de `./model`.
- Produces: `export function flattenCubic(p0: ExPt, c1: ExPt, c2: ExPt, p3: ExPt, tolCm: number): ExPt[]` — subdivisão adaptativa; retorna os pontos on-curve DEPOIS de `p0` (não inclui `p0`, inclui `p3`). Reta → `[p3]`. Também exporta `const TOL_CM = 0.02`.

- [ ] **Step 1: Write the failing test**

Criar `lib/export/dxf.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { flattenCubic, TOL_CM } from "./dxf";
import type { ExPt } from "./model";

// avalia a cúbica verdadeira em t
function cubicAt(p0: ExPt, c1: ExPt, c2: ExPt, p3: ExPt, t: number): ExPt {
  const u = 1 - t;
  const b0 = u * u * u,
    b1 = 3 * u * u * t,
    b2 = 3 * u * t * t,
    b3 = t * t * t;
  return {
    x: b0 * p0.x + b1 * c1.x + b2 * c2.x + b3 * p3.x,
    y: b0 * p0.y + b1 * c1.y + b2 * c2.y + b3 * p3.y,
  };
}

// distância do ponto q ao segmento a→b
function distToSegment(q: ExPt, a: ExPt, b: ExPt): number {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(q.x - a.x, q.y - a.y);
  let t = ((q.x - a.x) * dx + (q.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(q.x - (a.x + t * dx), q.y - (a.y + t * dy));
}

// maior distância da curva verdadeira (amostrada densa) à polilinha [p0, ...pts]
function maxCurveError(
  p0: ExPt,
  c1: ExPt,
  c2: ExPt,
  p3: ExPt,
  pts: ExPt[],
): number {
  const poly = [p0, ...pts];
  let worst = 0;
  for (let k = 0; k <= 400; k++) {
    const c = cubicAt(p0, c1, c2, p3, k / 400);
    let best = Infinity;
    for (let s = 0; s + 1 < poly.length; s++)
      best = Math.min(best, distToSegment(c, poly[s], poly[s + 1]));
    worst = Math.max(worst, best);
  }
  return worst;
}

describe("flattenCubic", () => {
  it("cúbica praticamente reta vira um único ponto (p3)", () => {
    const p0 = { x: 0, y: 0 },
      c1 = { x: 3, y: 0 },
      c2 = { x: 7, y: 0 },
      p3 = { x: 10, y: 0 };
    const out = flattenCubic(p0, c1, c2, p3, TOL_CM);
    expect(out).toEqual([{ x: 10, y: 0 }]);
  });

  it("cúbica curva: a polilinha aproxima a curva dentro da tolerância e termina em p3", () => {
    const p0 = { x: 0, y: 0 },
      c1 = { x: 0, y: 10 },
      c2 = { x: 10, y: 10 },
      p3 = { x: 10, y: 0 };
    const out = flattenCubic(p0, c1, c2, p3, TOL_CM);
    expect(out.length).toBeGreaterThan(1);
    // a curva verdadeira nunca se afasta da polilinha mais que a tolerância
    expect(maxCurveError(p0, c1, c2, p3, out)).toBeLessThanOrEqual(TOL_CM);
    expect(out[out.length - 1]).toEqual({ x: 10, y: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/export/dxf.test.ts`
Expected: FAIL — `flattenCubic`/`TOL_CM` não existem (erro de import/resolução).

- [ ] **Step 3: Write minimal implementation**

Criar `lib/export/dxf.ts`:

```ts
import type { ExPt } from "./model";

export const TOL_CM = 0.02; // 0,2 mm
const MAX_DEPTH = 16;

const mid = (a: ExPt, b: ExPt): ExPt => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
});

// distância perpendicular de p à reta a→b (em cm); corda degenerada → distância a `a`
function distToLine(p: ExPt, a: ExPt, b: ExPt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-12) return Math.hypot(p.x - a.x, p.y - a.y);
  const cross = Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx);
  return cross / Math.sqrt(len2);
}

export function flattenCubic(
  p0: ExPt,
  c1: ExPt,
  c2: ExPt,
  p3: ExPt,
  tolCm: number,
): ExPt[] {
  const out: ExPt[] = [];
  const recurse = (a: ExPt, b: ExPt, c: ExPt, d: ExPt, depth: number): void => {
    if (
      depth >= MAX_DEPTH ||
      (distToLine(b, a, d) <= tolCm && distToLine(c, a, d) <= tolCm)
    ) {
      out.push({ x: d.x, y: d.y });
      return;
    }
    const ab = mid(a, b),
      bc = mid(b, c),
      cd = mid(c, d);
    const abc = mid(ab, bc),
      bcd = mid(bc, cd);
    const m = mid(abc, bcd);
    recurse(a, ab, abc, m, depth + 1);
    recurse(m, bcd, cd, d, depth + 1);
  };
  recurse(p0, c1, c2, p3, 0);
  return out;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/export/dxf.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/export/dxf.ts lib/export/dxf.test.ts
git commit -m "feat(export): flattenCubic (De Casteljau adaptativo) p/ DXF"
```

---

### Task 2: Serializer `toDxf`

**Files:**

- Modify: `lib/export/dxf.ts` (adicionar `toDxf` no mesmo arquivo do `flattenCubic`)
- Test: `lib/export/dxf.test.ts` (adicionar bloco `describe("toDxf")`)

**Interfaces:**

- Consumes: `flattenCubic`, `TOL_CM` (mesmo arquivo); `ExportModel`, `ExPt`, `ExSeg` de `./model`.
- Produces: `export function toDxf(model: ExportModel): string` — DXF ASCII 1:1 em mm.

- [ ] **Step 1: Write the failing test**

Adicionar ao FIM de `lib/export/dxf.test.ts`:

```ts
import { toDxf } from "./dxf";
import type { ExportModel } from "./model";

// nº de vértices (código 90) da primeira LWPOLYLINE
function firstLwVertexCount(dxf: string): number {
  const lines = dxf.split("\n");
  const i = lines.indexOf("LWPOLYLINE");
  const j = lines.indexOf("90", i);
  return Number(lines[j + 1]);
}

// vértices (x,y) da primeira LWPOLYLINE — pares 10/20 logo após o cabeçalho da entidade
function firstLwVertices(dxf: string): { x: number; y: number }[] {
  const lines = dxf.split("\n");
  const i = lines.indexOf("LWPOLYLINE");
  const count = firstLwVertexCount(dxf);
  const verts: { x: number; y: number }[] = [];
  let k = i;
  while (verts.length < count) {
    const xi = lines.indexOf("10", k);
    verts.push({ x: Number(lines[xi + 1]), y: Number(lines[xi + 3]) });
    k = xi + 4;
  }
  return verts;
}

const squareModel: ExportModel = {
  patternName: "Camiseta & Cia",
  size: "M",
  unit: "cm",
  seamAllowanceCm: 1,
  sheetWidthCm: 20,
  sheetHeightCm: 30,
  pieces: [
    {
      id: "frente",
      name: "Frente",
      qty: 2,
      widthCm: 10,
      heightCm: 10,
      outline: {
        start: { x: 0, y: 0 },
        segs: [
          { kind: "line", to: { x: 10, y: 0 } },
          { kind: "line", to: { x: 10, y: 10 } },
          { kind: "line", to: { x: 0, y: 10 } },
          { kind: "line", to: { x: 0, y: 0 } },
        ],
      },
      grainline: [
        { x: 5, y: 1 },
        { x: 5, y: 9 },
      ],
      originCm: { x: 2, y: 2 },
    },
  ],
};

const cubicModel: ExportModel = {
  patternName: "Curva",
  size: "P",
  unit: "cm",
  seamAllowanceCm: null,
  sheetWidthCm: 20,
  sheetHeightCm: 20,
  pieces: [
    {
      id: "c",
      name: "Copa",
      qty: 1,
      widthCm: 10,
      heightCm: 10,
      outline: {
        start: { x: 0, y: 0 },
        segs: [
          {
            kind: "cubic",
            c1: { x: 0, y: 10 },
            c2: { x: 10, y: 10 },
            to: { x: 10, y: 0 },
          },
          { kind: "line", to: { x: 0, y: 0 } },
        ],
      },
      originCm: { x: 2, y: 2 },
    },
  ],
};

describe("toDxf", () => {
  it("cabeçalho: $INSUNITS = 4 (mm) e comentário 999 com tamanho/folga", () => {
    const dxf = toDxf(squareModel);
    expect(dxf).toMatch(/\$INSUNITS\n70\n4/);
    expect(dxf).toContain("999");
    expect(dxf).toContain("tam M");
    expect(dxf).toContain("folga 1cm (net line)");
  });

  it("declara as quatro layers nomeadas", () => {
    const dxf = toDxf(squareModel);
    for (const layer of ["CONTORNO", "INTERNO", "GRAINLINE", "TEXTO"]) {
      expect(dxf).toContain(layer);
    }
  });

  it("uma LWPOLYLINE de contorno por peça, com LINE (fio) e TEXT (nome)", () => {
    const dxf = toDxf(squareModel);
    expect(dxf.match(/\nLWPOLYLINE\n/g)?.length).toBe(1); // só o contorno (sem dart)
    expect(dxf).toContain("\nLINE\n");
    expect(dxf).toContain("\nTEXT\n");
    expect(dxf).toContain("FRENTE · 2x");
  });

  it("escala 1:1: contorno de 10cm de largura ocupa 100 unidades (mm)", () => {
    const verts = firstLwVertices(toDxf(squareModel));
    const xs = verts.map((v) => v.x);
    // largura 10cm -> span de X de 100 unidades (mm), independente da inversão de Y
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(100, 6);
  });

  it("achatamento insere vértices: contorno com cubic tem mais vértices que segs", () => {
    const dxf = toDxf(cubicModel);
    expect(firstLwVertexCount(dxf)).toBeGreaterThan(2); // 2 segs no model
  });

  it("folga nula vira 0cm no comentário", () => {
    const dxf = toDxf(cubicModel);
    expect(dxf).toContain("folga 0cm (net line)");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/export/dxf.test.ts`
Expected: FAIL — `toDxf` não existe.

- [ ] **Step 3: Write minimal implementation**

Primeiro, ampliar o import do topo de `lib/export/dxf.ts` (criado na Task 1) de:

```ts
import type { ExPt } from "./model";
```

para:

```ts
import type { ExPt, ExportModel } from "./model";
```

Depois, adicionar ao FIM de `lib/export/dxf.ts`:

```ts
const MM = 10; // cm -> mm (1:1)
const f = (n: number) => (Math.round(n * 100) / 100).toString();
const LAYERS = ["CONTORNO", "INTERNO", "GRAINLINE", "TEXTO"] as const;

export function toDxf(model: ExportModel): string {
  const L: (string | number)[] = [];
  const p = (code: number, value: string | number) => {
    L.push(code, value);
  };

  // comentário nativo DXF (código 999) — sem o problema do "--" do comentário XML
  p(
    999,
    `MoldAI · ${model.patternName} · tam ${model.size} · folga ${model.seamAllowanceCm ?? 0}cm (net line)`,
  );

  // HEADER
  p(0, "SECTION");
  p(2, "HEADER");
  p(9, "$INSUNITS");
  p(70, 4); // 4 = milímetros
  p(9, "$MEASUREMENT");
  p(70, 1); // 1 = métrico
  p(0, "ENDSEC");

  // TABLES / LAYER
  p(0, "SECTION");
  p(2, "TABLES");
  p(0, "TABLE");
  p(2, "LAYER");
  p(70, LAYERS.length);
  for (const name of LAYERS) {
    p(0, "LAYER");
    p(2, name);
    p(70, 0);
    p(62, 7);
    p(6, "CONTINUOUS");
  }
  p(0, "ENDTAB");
  p(0, "ENDSEC");

  // ENTITIES
  p(0, "SECTION");
  p(2, "ENTITIES");
  for (const piece of model.pieces) {
    const ox = piece.originCm.x;
    const oy = piece.originCm.y;
    const X = (x: number) => f((ox + x) * MM);
    // Y invertido: DXF tem +Y pra cima; ExportModel tem +Y pra baixo.
    const Y = (y: number) => f((model.sheetHeightCm - (oy + y)) * MM);

    // contorno -> vértices achatados
    const verts: ExPt[] = [piece.outline.start];
    let prev = piece.outline.start;
    for (const s of piece.outline.segs) {
      if (s.kind === "line") {
        verts.push(s.to);
        prev = s.to;
      } else {
        verts.push(...flattenCubic(prev, s.c1, s.c2, s.to, TOL_CM));
        prev = s.to;
      }
    }
    // a polilinha fecha via flag 70=1; remove o vértice final se coincidir com o inicial
    const first = verts[0];
    const last = verts[verts.length - 1];
    if (
      verts.length > 1 &&
      Math.abs(first.x - last.x) < 1e-6 &&
      Math.abs(first.y - last.y) < 1e-6
    ) {
      verts.pop();
    }

    p(0, "LWPOLYLINE");
    p(8, "CONTORNO");
    p(90, verts.length);
    p(70, 1);
    for (const v of verts) {
      p(10, X(v.x));
      p(20, Y(v.y));
    }

    if (piece.grainline) {
      const [a, b] = piece.grainline;
      p(0, "LINE");
      p(8, "GRAINLINE");
      p(10, X(a.x));
      p(20, Y(a.y));
      p(11, X(b.x));
      p(21, Y(b.y));
    }

    if (piece.dart && piece.dart.length >= 3) {
      p(0, "LWPOLYLINE");
      p(8, "INTERNO");
      p(90, piece.dart.length);
      p(70, 1);
      for (const d of piece.dart) {
        p(10, X(d.x));
        p(20, Y(d.y));
      }
    }

    p(0, "TEXT");
    p(8, "TEXTO");
    p(10, X(piece.outline.start.x));
    p(20, Y(piece.heightCm));
    p(40, 6); // altura do texto em mm
    p(1, `${piece.name.toUpperCase()} · ${piece.qty}x`);
  }
  p(0, "ENDSEC");

  p(0, "EOF");
  return L.join("\n");
}
```

Nota de tipos: um único `import type { ExPt, ExportModel } from "./model";` no topo cobre tudo (feito no início do Step 3). Não crie um segundo `import` no meio do arquivo — dispara `no-duplicate-imports`/`import/first`. `ExSeg` não é necessário: o `switch (s.kind)` opera sobre o tipo inferido de `outline.segs`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/export/dxf.test.ts`
Expected: PASS (todos os testes de `flattenCubic` e `toDxf`).

- [ ] **Step 5: Commit**

```bash
git add lib/export/dxf.ts lib/export/dxf.test.ts
git commit -m "feat(export): serializer toDxf (LWPOLYLINE/LINE/TEXT, 1:1 mm, Y invertido)"
```

---

### Task 3: Ligar DXF na fachada e no Footer (+ doc)

**Files:**

- Modify: `lib/export/index.ts`
- Modify: `components/editor/Footer.tsx:7-9`
- Modify: `CLAUDE.md` (parágrafo do export)

**Interfaces:**

- Consumes: `toDxf` de `./dxf`; tipo `ExportFormat` de `@/lib/export`.
- Produces: `ExportFormat = "svg" | "dxf"`; `exportPattern` despacha por `switch` exaustivo.

- [ ] **Step 1: Atualizar a fachada (`lib/export/index.ts`)**

Substituir o conteúdo INTEIRO de `lib/export/index.ts` por:

```ts
import type { Pattern } from "@/lib/types";
import { buildExportModel } from "./model";
import { toSvg } from "./svg";
import { toDxf } from "./dxf";
import { downloadFile, slug } from "./download";

export type ExportFormat = "svg" | "dxf"; // "pdf" chega na Fase 3

export function exportPattern(pattern: Pattern, format: ExportFormat): void {
  if (!pattern.spec || pattern.pieces.length === 0) return;
  const model = buildExportModel(pattern);
  const filename = `${slug(pattern.name)}-${model.size}.${format}`;
  switch (format) {
    case "svg":
      downloadFile(filename, "image/svg+xml", toSvg(model));
      return;
    case "dxf":
      downloadFile(filename, "image/vnd.dxf", toDxf(model));
      return;
    default: {
      // exaustividade: um novo formato sem case vira erro de compilação, não no-op silencioso
      const _exhaustive: never = format;
      return _exhaustive;
    }
  }
}
```

- [ ] **Step 2: Adicionar o item DXF ao menu (`components/editor/Footer.tsx`)**

Substituir o array `FORMATS` (linhas 7-9):

```tsx
const FORMATS: { id: ExportFormat; label: string }[] = [
  { id: "svg", label: "SVG · 1:1 (plotter)" },
];
```

por:

```tsx
const FORMATS: { id: ExportFormat; label: string }[] = [
  { id: "svg", label: "SVG · 1:1 (plotter)" },
  { id: "dxf", label: "DXF · geometria 1:1 (CAD)" },
];
```

- [ ] **Step 3: Atualizar a doc (`CLAUDE.md`)**

Localizar a frase (no parágrafo "**Export is a client-side transform, not a server call.**"):

```
DXF (AAMA/ASTM) and PDF tiling are planned follow-up phases; only SVG ships in the first phase.
```

Substituir por:

```
`toDxf` (`lib/export/dxf.ts`) serializes a **geometry-only DXF** (net line, `$INSUNITS=4` mm, 1:1, Y flipped to DXF's up-axis) — hand-written ASCII, `LWPOLYLINE`/`LINE`/`TEXT` on named layers `CONTORNO`/`INTERNO`/`GRAINLINE`/`TEXTO`, cubics flattened by adaptive De Casteljau (`flattenCubic`, 0.2 mm tolerance). It is deliberately **not** the strict AAMA/ASTM D6673 layer/piece semantics (that is a later "Fase 2.5"). `exportPattern` dispatches format via an exhaustive `switch`/`never`. PDF tiling is the remaining planned phase.
```

- [ ] **Step 4: Verificar build, testes e lint**

Run: `npm run build`
Expected: build de produção passa, sem erro de TypeScript (o `switch`/`never` compila — `"svg" | "dxf"` cobertos).

Run: `npm test`
Expected: toda a suíte passa (Fase 1 + os novos testes de `dxf.test.ts`).

Run: `npm run lint -- app lib components`
Expected: sem erros de lint.

- [ ] **Step 5: Commit**

```bash
git add lib/export/index.ts components/editor/Footer.tsx CLAUDE.md
git commit -m "feat(export): liga DXF na fachada (switch/never) e no menu do Footer"
```

---

## Verificação manual (pós-implementação, não é uma task)

`npm run dev` → gerar um molde → "Exportar" → **DXF · geometria 1:1 (CAD)**. Abrir o `.dxf` no LibreCAD (ou visualizador DXF online) e conferir: todas as peças aparecem na orientação correta (não espelhadas), as curvas (decote/cava/copa) suaves, fio na layer `GRAINLINE`, dart na `INTERNO`, e um lado conhecido mede em mm o valor real em cm (1:1). Com conflito ativo ou molde em branco, o item fica desabilitado. (Import no Audaces como peça de produção fica pra Fase 2.5.)
