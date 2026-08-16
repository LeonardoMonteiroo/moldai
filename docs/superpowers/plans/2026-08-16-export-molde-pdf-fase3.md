# Export do molde — Fase 3 (PDF tiling A4 + folha única) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar o terceiro formato de export — PDF em escala 1:1, em dois modos (A4 fatiado com colagem, e folha única do tamanho do molde) — reusando o `ExportModel`.

**Architecture:** Dois helpers puros (`planTiles`, `rulerTicksCm`) e um helper de geometria compartilhado com o DXF (`flattenOutlineCm`, extraído de `toDxf`), consumidos por um serializer assíncrono `toPdf(model, mode)` que usa `pdf-lib` via `import()` dinâmico (code-split). A fachada `exportPattern` ganha dois cases PDF fire-and-forget; o `Footer` ganha dois itens.

**Tech Stack:** TypeScript, Next.js 16, Vitest (env node), **`pdf-lib`** (única dep runtime nova do feature inteiro).

## Global Constraints

- **`pdf-lib` é a única dependência runtime nova.** Carregada via `await import("pdf-lib")` DENTRO de `toPdf`, para ficar em chunk separado (não entra no bundle principal). Só imports `import type` de `pdf-lib` podem aparecer no topo (são elididos em runtime) — e nem esses são necessários aqui.
- **Escala física 1:1:** `PT_POR_CM = 72 / 2.54` (pontos PDF por cm). Um lado de 10 cm mede 10 cm no papel. A régua de calibração de 10 cm existe pra conferir isso na impressão.
- **Eixo Y invertido:** PDF tem origem inferior-esquerda, +Y pra cima; o `ExportModel` tem +Y pra baixo. `toPdf` inverte Y (como o DXF já faz).
- **Linha líquida (net line):** folga de costura não é deslocada pra geometria.
- **Núcleo intacto:** `lib/export/model.ts` e `lib/export/svg.ts` NÃO mudam. `flattenCubic`/`TOL_CM` seguem em `lib/export/dxf.ts`. `toDxf` só muda pra delegar ao novo `flattenOutlineCm` (comportamento idêntico — os testes de vértice código 90 do DXF guardam a paridade).
- **`toPdf` é assíncrono** (`Promise<Uint8Array>`) — `pdf-lib.save()` é async. `exportPattern` continua `void`: os cases PDF são fire-and-forget com `.catch(() => {})`.
- **Dois modos / dois itens de menu:** `"pdf-a4"` (`PDF · A4 (colar em casa)`) e `"pdf-single"` (`PDF · folha única (plotter)`). O `switch` de `exportPattern` cobre os quatro formatos com `default: never`.
- **A4:** página 21×29,7 cm, margem 0,8 cm, sobreposição de colagem 1 cm. **Folha única:** uma página de `(sheetW+1,6) × (sheetH+1,6)` cm.
- Verificação: `npm run build`, `npm test`, lint escopado a `app lib components` (lint na raiz falso-alarma por worktrees aninhados).

Formas do `ExportModel` (de `lib/export/model.ts`, não alterar):

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

Coords das peças: `outline`/`grainline`/`dart` são LOCAIS ao bbox da peça; `piece.originCm` posiciona a peça no sheet. Coord de sheet = `piece.originCm + ponto_local`.

---

### Task 1: Extrair `flattenOutlineCm` (DRY com o DXF)

**Files:**

- Modify: `lib/export/dxf.ts` (extrair helper + refatorar `toDxf`)
- Test: `lib/export/dxf.test.ts` (adicionar `describe("flattenOutlineCm")`)

**Interfaces:**

- Consumes: `flattenCubic`, `TOL_CM` (mesmo arquivo); `ExPt`, `ExSeg` de `./model`.
- Produces: `export function flattenOutlineCm(outline: { start: ExPt; segs: ExSeg[] }, tolCm: number): ExPt[]` — contorno achatado em cm, fechado, com o vértice final duplicado (== inicial) removido.

- [ ] **Step 1: Write the failing test**

Adicionar ao FIM de `lib/export/dxf.test.ts` (o `import type { ExPt }` já existe no arquivo; adicione `flattenOutlineCm` ao import de `./dxf` que já traz `flattenCubic`/`TOL_CM`, ou um novo import):

```ts
import { flattenOutlineCm } from "./dxf";

describe("flattenOutlineCm", () => {
  it("contorno só de retas: vértices dos cantos, sem duplicar o de fechamento", () => {
    const out = flattenOutlineCm(
      {
        start: { x: 0, y: 0 },
        segs: [
          { kind: "line", to: { x: 10, y: 0 } },
          { kind: "line", to: { x: 10, y: 10 } },
          { kind: "line", to: { x: 0, y: 10 } },
          { kind: "line", to: { x: 0, y: 0 } },
        ],
      },
      TOL_CM,
    );
    expect(out).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
  });

  it("contorno com cubic: achatamento insere vértices (mais que o nº de segs)", () => {
    const out = flattenOutlineCm(
      {
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
      TOL_CM,
    );
    expect(out.length).toBeGreaterThan(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/export/dxf.test.ts`
Expected: FAIL — `flattenOutlineCm` não existe (erro de import).

- [ ] **Step 3: Write minimal implementation**

Em `lib/export/dxf.ts`, primeiro ampliar o import do topo de:

```ts
import type { ExPt, ExportModel } from "./model";
```

para:

```ts
import type { ExPt, ExSeg, ExportModel } from "./model";
```

Depois, adicionar esta função logo APÓS `flattenCubic` (antes de `const MM = 10;`):

```ts
// Contorno achatado em cm: line -> 1 vértice, cubic -> pontos de flattenCubic.
// Fechado; remove o vértice final se coincidir com o inicial (dedup).
export function flattenOutlineCm(
  outline: { start: ExPt; segs: ExSeg[] },
  tolCm: number,
): ExPt[] {
  const verts: ExPt[] = [outline.start];
  let prev = outline.start;
  for (const s of outline.segs) {
    if (s.kind === "line") {
      verts.push(s.to);
      prev = s.to;
    } else {
      verts.push(...flattenCubic(prev, s.c1, s.c2, s.to, tolCm));
      prev = s.to;
    }
  }
  const first = verts[0];
  const last = verts[verts.length - 1];
  if (
    verts.length > 1 &&
    Math.abs(first.x - last.x) < 1e-6 &&
    Math.abs(first.y - last.y) < 1e-6
  ) {
    verts.pop();
  }
  return verts;
}
```

Agora refatorar `toDxf` pra usar o helper: substituir o bloco (linhas ~79-96 do arquivo atual)

```ts
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
```

por:

```ts
// contorno -> vértices achatados (helper compartilhado com o PDF)
const verts = flattenOutlineCm(piece.outline, TOL_CM);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- lib/export/dxf.test.ts`
Expected: PASS — os 2 novos testes de `flattenOutlineCm` E os testes de `toDxf` da Fase 2 seguem verdes (a contagem de vértices código 90 é idêntica, provando que a refatoração não mudou comportamento).

- [ ] **Step 5: Commit**

```bash
git add lib/export/dxf.ts lib/export/dxf.test.ts
git commit -m "refactor(export): extrai flattenOutlineCm de toDxf (DRY p/ o PDF)"
```

---

### Task 2: Helpers puros `planTiles` + `rulerTicksCm`

**Files:**

- Create: `lib/export/pdf.ts`
- Test: `lib/export/pdf.test.ts`

**Interfaces:**

- Consumes: `ExPt` de `./model`.
- Produces:
  - `export type PdfMode = "a4" | "single";`
  - `export interface TilePlan { pageWcm; pageHcm; marginCm; overlapCm; cols; rows; pages: { row: number; col: number; originCm: ExPt }[]; }`
  - `export function planTiles(sheetWcm: number, sheetHcm: number, mode: PdfMode): TilePlan`
  - `export function rulerTicksCm(lengthCm: number): number[]`

- [ ] **Step 1: Write the failing test**

Criar `lib/export/pdf.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { planTiles, rulerTicksCm } from "./pdf";

describe("planTiles", () => {
  it("single: uma página do tamanho do molde + margem", () => {
    const t = planTiles(20, 30, "single");
    expect(t.cols).toBe(1);
    expect(t.rows).toBe(1);
    expect(t.pages).toHaveLength(1);
    expect(t.pageWcm).toBeCloseTo(21.6, 6); // 20 + 2*0.8
    expect(t.pageHcm).toBeCloseTo(31.6, 6);
    expect(t.overlapCm).toBe(0);
  });

  it("a4: molde pequeno cabe em uma folha", () => {
    const t = planTiles(15, 20, "a4");
    expect(t.cols).toBe(1);
    expect(t.rows).toBe(1);
    expect(t.pages).toHaveLength(1);
  });

  it("a4: molde grande fatia em grade com sobreposição", () => {
    const t = planTiles(50, 40, "a4");
    // printableW=19.4, stepW=18.4 -> cols=ceil((50-1)/18.4)=3
    // printableH=28.1, stepH=27.1 -> rows=ceil((40-1)/27.1)=2
    expect(t.cols).toBe(3);
    expect(t.rows).toBe(2);
    expect(t.pages).toHaveLength(6);
    // origem avança pelo passo (printable - overlap)
    expect(t.pages[1].originCm.x).toBeCloseTo(18.4, 6);
    expect(t.pages[3].originCm.y).toBeCloseTo(27.1, 6);
  });
});

describe("rulerTicksCm", () => {
  it("10 cm -> 11 ticks de 0 a 10", () => {
    expect(rulerTicksCm(10)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- lib/export/pdf.test.ts`
Expected: FAIL — `./pdf` não existe.

- [ ] **Step 3: Write minimal implementation**

Criar `lib/export/pdf.ts`:

```ts
import type { ExPt } from "./model";

export type PdfMode = "a4" | "single";

const A4 = { pageWcm: 21, pageHcm: 29.7, marginCm: 0.8 };
const OVERLAP_A4_CM = 1;

export interface TilePlan {
  pageWcm: number;
  pageHcm: number;
  marginCm: number;
  overlapCm: number;
  cols: number;
  rows: number;
  pages: { row: number; col: number; originCm: ExPt }[];
}

export function planTiles(
  sheetWcm: number,
  sheetHcm: number,
  mode: PdfMode,
): TilePlan {
  if (mode === "single") {
    const marginCm = A4.marginCm;
    return {
      pageWcm: sheetWcm + 2 * marginCm,
      pageHcm: sheetHcm + 2 * marginCm,
      marginCm,
      overlapCm: 0,
      cols: 1,
      rows: 1,
      pages: [{ row: 0, col: 0, originCm: { x: 0, y: 0 } }],
    };
  }
  const { pageWcm, pageHcm, marginCm } = A4;
  const overlapCm = OVERLAP_A4_CM;
  const stepW = pageWcm - 2 * marginCm - overlapCm;
  const stepH = pageHcm - 2 * marginCm - overlapCm;
  const cols = Math.max(1, Math.ceil((sheetWcm - overlapCm) / stepW));
  const rows = Math.max(1, Math.ceil((sheetHcm - overlapCm) / stepH));
  const pages: { row: number; col: number; originCm: ExPt }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      pages.push({ row, col, originCm: { x: col * stepW, y: row * stepH } });
    }
  }
  return { pageWcm, pageHcm, marginCm, overlapCm, cols, rows, pages };
}

export function rulerTicksCm(lengthCm: number): number[] {
  const ticks: number[] = [];
  for (let i = 0; i <= Math.round(lengthCm); i++) ticks.push(i);
  return ticks;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- lib/export/pdf.test.ts`
Expected: PASS (4 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/export/pdf.ts lib/export/pdf.test.ts
git commit -m "feat(export): planTiles + rulerTicksCm (grade de páginas do PDF)"
```

---

### Task 3: Serializer `toPdf` (pdf-lib, dynamic import)

**Files:**

- Modify: `package.json` (adicionar dep `pdf-lib`)
- Modify: `lib/export/pdf.ts` (adicionar `toPdf`)
- Test: `lib/export/pdf.test.ts` (adicionar `describe("toPdf")`)

**Interfaces:**

- Consumes: `planTiles`, `rulerTicksCm`, `PdfMode` (mesmo arquivo); `flattenOutlineCm` de `./dxf`; `ExportModel` de `./model`; `pdf-lib` via `import()` dinâmico.
- Produces: `export async function toPdf(model: ExportModel, mode: PdfMode): Promise<Uint8Array>`

- [ ] **Step 1: Adicionar a dependência**

Run: `npm install pdf-lib`
Expected: `pdf-lib` aparece em `dependencies` do `package.json` (versão ^1.17.x) e instala sem erro.

- [ ] **Step 2: Write the failing test**

Adicionar ao FIM de `lib/export/pdf.test.ts`:

```ts
import { toPdf } from "./pdf";
import type { ExportModel } from "./model";
import { PDFDocument } from "pdf-lib";

function modelOf(sheetWcm: number, sheetHcm: number): ExportModel {
  return {
    patternName: "Camiseta",
    size: "M",
    unit: "cm",
    seamAllowanceCm: 1,
    sheetWidthCm: sheetWcm,
    sheetHeightCm: sheetHcm,
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
            {
              kind: "cubic",
              c1: { x: 10, y: 5 },
              c2: { x: 5, y: 10 },
              to: { x: 0, y: 10 },
            },
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
}

const PT_POR_CM = 72 / 2.54;

describe("toPdf", () => {
  it("a4: PDF válido (%PDF) e nº de páginas = planTiles", async () => {
    const model = modelOf(50, 40);
    const bytes = await toPdf(model, "a4");
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(6); // planTiles(50,40,"a4") = 6
  });

  it("single: 1 página do tamanho do molde (1:1)", async () => {
    const model = modelOf(20, 30);
    const bytes = await toPdf(model, "single");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    const { width, height } = doc.getPage(0).getSize();
    expect(width).toBeCloseTo(21.6 * PT_POR_CM, 1); // (20+1.6) cm em pt
    expect(height).toBeCloseTo(31.6 * PT_POR_CM, 1); // (30+1.6) cm em pt
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- lib/export/pdf.test.ts`
Expected: FAIL — `toPdf` não existe.

- [ ] **Step 4: Write minimal implementation**

Adicionar ao FIM de `lib/export/pdf.ts` (o `import type { ExPt } from "./model";` já está no topo; adicione `ExportModel` a esse import e um novo import de `flattenOutlineCm`):

Ampliar o import do topo de:

```ts
import type { ExPt } from "./model";
```

para:

```ts
import type { ExPt, ExportModel } from "./model";
import { flattenOutlineCm } from "./dxf";
```

E adicionar:

```ts
const PT_POR_CM = 72 / 2.54; // pontos PDF por cm (1:1 físico)
const TOL_CM = 0.02; // achatamento de curvas (mesma tolerância do DXF)

export async function toPdf(
  model: ExportModel,
  mode: PdfMode,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const plan = planTiles(model.sheetWidthCm, model.sheetHeightCm, mode);
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  const INK = rgb(0, 0, 0);
  const OLIVE = rgb(0.29, 0.35, 0.23);
  const GRAY = rgb(0.6, 0.6, 0.6);
  const TXT = rgb(0.35, 0.34, 0.29);

  // achata cada contorno uma vez (reusado em todas as páginas/tiles)
  const outlines = model.pieces.map((pc) => ({
    pc,
    pts: flattenOutlineCm(pc.outline, TOL_CM),
  }));

  plan.pages.forEach((tile, pageIndex) => {
    const page = doc.addPage([
      plan.pageWcm * PT_POR_CM,
      plan.pageHcm * PT_POR_CM,
    ]);

    // coord de sheet (cm, +Y p/ baixo) -> ponto de página (pt, +Y p/ cima), transladada pela janela do tile
    const map = (sx: number, sy: number) => ({
      x: (plan.marginCm + sx - tile.originCm.x) * PT_POR_CM,
      y: (plan.pageHcm - plan.marginCm - (sy - tile.originCm.y)) * PT_POR_CM,
    });

    for (const { pc, pts } of outlines) {
      const P = (lx: number, ly: number) =>
        map(pc.originCm.x + lx, pc.originCm.y + ly);

      // contorno (polilinha fechada)
      for (let i = 0; i < pts.length; i++) {
        const a = P(pts[i].x, pts[i].y);
        const b = P(pts[(i + 1) % pts.length].x, pts[(i + 1) % pts.length].y);
        page.drawLine({ start: a, end: b, thickness: 0.75, color: INK });
      }
      // fio (tracejado)
      if (pc.grainline) {
        const [g1, g2] = pc.grainline;
        page.drawLine({
          start: P(g1.x, g1.y),
          end: P(g2.x, g2.y),
          thickness: 0.5,
          color: OLIVE,
          dashArray: [4, 3],
        });
      }
      // dart (polilinha fechada)
      if (pc.dart && pc.dart.length >= 3) {
        for (let i = 0; i < pc.dart.length; i++) {
          const a = P(pc.dart[i].x, pc.dart[i].y);
          const b = P(
            pc.dart[(i + 1) % pc.dart.length].x,
            pc.dart[(i + 1) % pc.dart.length].y,
          );
          page.drawLine({ start: a, end: b, thickness: 0.5, color: OLIVE });
        }
      }
      // rótulo
      const lbl = P(0, pc.heightCm);
      page.drawText(`${pc.name.toUpperCase()} · ${pc.qty}x`, {
        x: lbl.x,
        y: lbl.y,
        size: 8,
        font,
        color: TXT,
      });
    }

    if (mode === "a4") {
      // retângulo da área útil (linha de corte/colagem)
      page.drawRectangle({
        x: plan.marginCm * PT_POR_CM,
        y: plan.marginCm * PT_POR_CM,
        width: (plan.pageWcm - 2 * plan.marginCm) * PT_POR_CM,
        height: (plan.pageHcm - 2 * plan.marginCm) * PT_POR_CM,
        borderColor: GRAY,
        borderWidth: 0.5,
        borderDashArray: [3, 2],
      });
      page.drawText(
        `Linha ${tile.row + 1} · Coluna ${tile.col + 1} de ${plan.rows}x${plan.cols}`,
        {
          x: plan.marginCm * PT_POR_CM,
          y: plan.marginCm * 0.3 * PT_POR_CM,
          size: 7,
          font,
          color: TXT,
        },
      );
    }

    // régua de calibração de 10 cm — 1ª página (a4) ou a página única (single)
    if (pageIndex === 0) {
      const baseXcm = plan.marginCm + 0.3;
      const boxYcm = plan.pageHcm - plan.marginCm - 1.2;
      page.drawRectangle({
        x: (baseXcm - 0.2) * PT_POR_CM,
        y: boxYcm * PT_POR_CM,
        width: 10.6 * PT_POR_CM,
        height: 1.1 * PT_POR_CM,
        color: rgb(1, 1, 1),
        opacity: 0.85,
      });
      const y0 = (boxYcm + 0.2) * PT_POR_CM;
      page.drawLine({
        start: { x: baseXcm * PT_POR_CM, y: y0 },
        end: { x: (baseXcm + 10) * PT_POR_CM, y: y0 },
        thickness: 0.75,
        color: INK,
      });
      for (const t of rulerTicksCm(10)) {
        const x = (baseXcm + t) * PT_POR_CM;
        page.drawLine({
          start: { x, y: y0 },
          end: { x, y: y0 + 0.35 * PT_POR_CM },
          thickness: 0.75,
          color: INK,
        });
      }
      page.drawText("10 cm - confira a escala", {
        x: baseXcm * PT_POR_CM,
        y: (boxYcm + 0.7) * PT_POR_CM,
        size: 7,
        font,
        color: TXT,
      });
    }
  });

  return await doc.save();
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- lib/export/pdf.test.ts`
Expected: PASS (6 testes: 4 dos helpers + 2 de `toPdf`).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/export/pdf.ts lib/export/pdf.test.ts
git commit -m "feat(export): serializer toPdf (tiling A4 + folha única, pdf-lib, 1:1)"
```

---

### Task 4: Ligar PDF na fachada e no Footer (+ doc)

**Files:**

- Modify: `lib/export/index.ts`
- Modify: `components/editor/Footer.tsx:7-10`
- Modify: `CLAUDE.md` (parágrafo do export)

**Interfaces:**

- Consumes: `toPdf` de `./pdf`; tipo `ExportFormat` de `@/lib/export`.
- Produces: `ExportFormat = "svg" | "dxf" | "pdf-a4" | "pdf-single"`; `exportPattern` despacha por `switch` exaustivo, cases PDF fire-and-forget.

- [ ] **Step 1: Atualizar a fachada (`lib/export/index.ts`)**

Substituir o conteúdo INTEIRO de `lib/export/index.ts` por:

```ts
import type { Pattern } from "@/lib/types";
import { buildExportModel } from "./model";
import { toSvg } from "./svg";
import { toDxf } from "./dxf";
import { toPdf } from "./pdf";
import { downloadFile, slug } from "./download";

export type ExportFormat = "svg" | "dxf" | "pdf-a4" | "pdf-single";

export function exportPattern(pattern: Pattern, format: ExportFormat): void {
  if (!pattern.spec || pattern.pieces.length === 0) return;
  const model = buildExportModel(pattern);
  const base = `${slug(pattern.name)}-${model.size}`;
  switch (format) {
    case "svg":
      downloadFile(`${base}.svg`, "image/svg+xml", toSvg(model));
      return;
    case "dxf":
      downloadFile(`${base}.dxf`, "image/vnd.dxf", toDxf(model));
      return;
    case "pdf-a4":
      // toPdf é async (pdf-lib); fire-and-forget — não muda a assinatura void
      toPdf(model, "a4")
        .then((bytes) =>
          downloadFile(`${base}-a4.pdf`, "application/pdf", bytes),
        )
        .catch(() => {});
      return;
    case "pdf-single":
      toPdf(model, "single")
        .then((bytes) =>
          downloadFile(`${base}-folha.pdf`, "application/pdf", bytes),
        )
        .catch(() => {});
      return;
    default: {
      // exaustividade: formato sem case vira erro de compilação
      const _exhaustive: never = format;
      return _exhaustive;
    }
  }
}
```

- [ ] **Step 2: Adicionar os itens PDF ao menu (`components/editor/Footer.tsx`)**

Substituir o array `FORMATS` (atualmente com `svg` e `dxf`):

```tsx
const FORMATS: { id: ExportFormat; label: string }[] = [
  { id: "svg", label: "SVG · 1:1 (plotter)" },
  { id: "dxf", label: "DXF · geometria 1:1 (CAD)" },
];
```

por:

```tsx
const FORMATS: { id: ExportFormat; label: string }[] = [
  { id: "svg", label: "SVG · 1:1 (plotter)" },
  { id: "dxf", label: "DXF · geometria 1:1 (CAD)" },
  { id: "pdf-a4", label: "PDF · A4 (colar em casa)" },
  { id: "pdf-single", label: "PDF · folha única (plotter)" },
];
```

- [ ] **Step 3: Atualizar a doc (`CLAUDE.md`)**

Localizar a frase (final do parágrafo "**Export is a client-side transform, not a server call.**"):

```
`exportPattern` dispatches format via an exhaustive `switch`/`never`. PDF tiling is the remaining planned phase.
```

Substituir por:

```
`toPdf` (`lib/export/pdf.ts`) serializes a **1:1 PDF** in two modes — `pdf-a4` (tiled A4 with glue overlap, page numbering, and a 10 cm calibration ruler on the first sheet) and `pdf-single` (one page the exact size of the molde sheet, for plotter/large-format). It reuses `flattenOutlineCm` (extracted from `toDxf`, shared DXF/PDF outline flattening) and loads `pdf-lib` — the feature's only new runtime dependency — via a dynamic `import()` inside `toPdf` so it is code-split out of the main bundle; `toPdf` is therefore `async` and its facade cases are fire-and-forget. `exportPattern` dispatches all four formats via an exhaustive `switch`/`never`. The whole export module (SVG/DXF/PDF) is now shipped; strict AAMA/ASTM DXF remains a later "Fase 2.5".
```

- [ ] **Step 4: Verificar build, testes e lint**

Run: `npm run build`
Expected: build de produção passa, sem erro de TypeScript (o `switch`/`never` cobre os 4 formatos; `pdf-lib` resolve).

Run: `npm test`
Expected: toda a suíte passa (Fases 1–2 + os novos testes de `pdf.test.ts` e `flattenOutlineCm`).

Run: `npm run lint -- app lib components`
Expected: sem erros de lint.

- [ ] **Step 5: Commit**

```bash
git add lib/export/index.ts components/editor/Footer.tsx CLAUDE.md
git commit -m "feat(export): liga PDF (A4 + folha única) na fachada e no menu do Footer"
```

---

## Verificação manual (pós-implementação, não é uma task)

`npm run dev` → gerar um molde → "Exportar" → **PDF · A4 (colar em casa)**. Imprimir
em A4 a **100% (sem "ajustar à página")** e medir a régua: o traço de 10 cm tem de
medir 10 cm. Montar duas folhas pela sobreposição de 1 cm e conferir que o contorno
casa. Depois **PDF · folha única (plotter)**: abrir e conferir que a página tem o
tamanho real do molde e a régua mede 10 cm. Com conflito ativo ou molde em branco,
os itens ficam desabilitados.
