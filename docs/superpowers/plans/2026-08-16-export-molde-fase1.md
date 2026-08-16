# Export real do molde — Fase 1 (núcleo + SVG 1:1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar o botão "Exportar" (hoje mock) num download real de SVG em escala 1:1 (mm) da geometria drafada, via um núcleo `ExportModel` agnóstico de formato.

**Architecture:** Um núcleo `buildExportModel(pattern)` re-drafa as peças em cm exatos (novo `draftPiecesCm`, reusando os drafters) e produz um `ExportModel` com contornos Bézier em cm. Um serializer puro `toSvg(model)` vira string SVG em mm (1:1). A UI do `Footer` ganha um menu de formato que baixa o arquivo client-side, sem rota nem mutação de estado.

**Tech Stack:** Next.js 16, TypeScript, Vitest (env node, sem DOM), Tailwind v4. Sem dependências novas nesta fase.

## Global Constraints

- **Escala física real:** SVG em mm, 1:1. `MM = 10` (cm→mm). Um segmento de 10 cm mede 100 unidades no arquivo, e `width`/`height` saem em `mm`.
- **Geometria = linha de costura líquida (net line).** A folga NÃO é deslocada pra geometria; vai só anotada (`seamAllowanceCm`).
- **Tudo client-side.** Sem rota de servidor, sem `api-client`, sem store action, sem custo de crédito. Export é side-effect de download puro.
- **Precisão:** re-drafar em cm via `draftPiecesCm` (NÃO reverter px→cm do store, que herda o arredondamento de `PX()`).
- **Respeita o bloqueio existente:** botão desabilitado quando `exportBlocked` (conflito) **ou** `pattern.pieces.length === 0` **ou** `!pattern.spec`.
- **Curvas preservadas no model** (Bézier); nada de achatar nesta fase (achatamento é só do DXF, Fase 2).
- **Sem regressão** no `draftGarment`: o refactor da Task 1 não muda o resultado px observável.
- Testes rodam via `npm test` (vitest); o include já cobre `lib/**/*.test.ts`.

---

## File Structure

- `lib/draft/garment.ts` (modify) — extrai helper `draftAll`, adiciona `draftPiecesCm`; `draftGarment` inalterado por fora.
- `lib/export/model.ts` (create) — tipos `ExPt`/`ExSeg`/`ExportPiece`/`ExportModel`, `outlineSegments`, `buildExportModel`.
- `lib/export/svg.ts` (create) — `toSvg`.
- `lib/export/download.ts` (create) — `slug`, `downloadFile` (único ponto com DOM).
- `lib/export/index.ts` (create) — `ExportFormat`, `exportPattern` (fachada).
- `components/editor/Footer.tsx` (modify) — botão "Exportar" vira menu de formato.
- `lib/draft/garment.test.ts` (modify) — teste de `draftPiecesCm`.
- `lib/export/model.test.ts` (create) — testes de `outlineSegments` e `buildExportModel`.
- `lib/export/svg.test.ts` (create) — testes de `toSvg`.
- `CLAUDE.md` (modify) — documenta o módulo de export.

---

## Task 1: Expor `draftPiecesCm` (refactor de `garment.ts`)

**Files:**
- Modify: `lib/draft/garment.ts:75-104`
- Test: `lib/draft/garment.test.ts`

**Interfaces:**
- Consumes: `resolveMeasurements`, `Measurements` (`@/lib/measurements`); `DraftedPiece`, `autoLayout` (`./core`); `BlockOpts`, `draftCorpo` (`./corpo`); `draftManga`; `draftSaia`.
- Produces: `draftPiecesCm(spec: GarmentSpec, size: SizeLabel): DraftedPiece[]` — as peças em cm, antes do `autoLayout`. `draftGarment(spec, size)` mantém a mesma assinatura e retorno `{ pieces, viewBox, measurements, armholeLenCm }`.

- [ ] **Step 1: Write the failing test**

Adicionar em `lib/draft/garment.test.ts` (no topo, garantir o import de `draftPiecesCm` junto dos imports existentes de `./garment`):

```ts
import { draftPiecesCm } from "./garment";

describe("draftPiecesCm", () => {
  it("devolve peças em cm (frente/costas/manga) para camiseta", () => {
    const pcs = draftPiecesCm(
      { tipo: "camiseta", sexo: "masc", measurementOverrides: {}, style: {} },
      "M",
    );
    expect(pcs.map((p) => p.id)).toEqual(["corpo-frente", "corpo-costas", "manga"]);
    const frente = pcs[0];
    // outlineCm em cm reais: largura da frente na casa de dezenas de cm, não centenas (px)
    const xs = frente.outlineCm.map(([x]) => x);
    const largura = Math.max(...xs) - Math.min(...xs);
    expect(largura).toBeGreaterThan(20);
    expect(largura).toBeLessThan(80);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/draft/garment.test.ts`
Expected: FAIL — `draftPiecesCm is not a function` / import não resolve.

- [ ] **Step 3: Write minimal implementation**

Substituir o corpo de `draftGarment` (linhas 75-104) por um helper compartilhado mais dois wrappers. Confirmar que `Measurements` já está importado (linha 1) — está.

```ts
function draftAll(spec: GarmentSpec, size: SizeLabel): {
  drafted: DraftedPiece[];
  measurements: Measurements;
  armholeLenCm?: number;
} {
  const sexo: Sexo = spec.sexo ?? "fem";
  const measurements: Measurements = resolveMeasurements(size, spec.measurementOverrides, sexo);
  const drafted: DraftedPiece[] = [];
  let armholeLenCm: number | undefined;

  const isCorpo = spec.tipo === "blusa" || spec.tipo === "vestido" || spec.tipo === "camiseta";
  if (isCorpo) {
    const knit = spec.tipo === "camiseta";
    const lengthCm = spec.tipo === "vestido"
      ? measurements.comprimentoCostas
      : measurements.comprimentoCostas + measurements.alturaQuadril + 5;
    const opts: BlockOpts = { sexo, knit, lengthCm };
    const style: GarmentStyle = spec.tipo === "camiseta"
      ? { ...spec.style, decote: spec.style.decote ?? "redondo", pences: false, manga: spec.style.manga ?? "curta" }
      : spec.style;
    const { frente, costas, armholeLenCm: a } = draftCorpo(measurements, style, opts);
    armholeLenCm = a;
    drafted.push(frente, costas);
    const manga = draftManga(measurements, style, a, opts);
    if (manga) drafted.push(manga);
  }
  if (spec.tipo === "saia" || spec.tipo === "vestido") {
    drafted.push(draftSaia(measurements, spec.style));
  }

  return { drafted, measurements, armholeLenCm };
}

export function draftPiecesCm(spec: GarmentSpec, size: SizeLabel): DraftedPiece[] {
  return draftAll(spec, size).drafted;
}

export function draftGarment(spec: GarmentSpec, size: SizeLabel) {
  const { drafted, measurements, armholeLenCm } = draftAll(spec, size);
  const { pieces, viewBox } = autoLayout(drafted, 8);
  return { pieces, viewBox, measurements, armholeLenCm };
}
```

- [ ] **Step 4: Run tests to verify they pass (novo + regressão)**

Run: `npx vitest run lib/draft/garment.test.ts`
Expected: PASS — inclui os testes antigos de `draftGarment` (sem regressão) e o novo de `draftPiecesCm`.

- [ ] **Step 5: Commit**

```bash
git add lib/draft/garment.ts lib/draft/garment.test.ts
git commit -m "refactor(draft): expõe draftPiecesCm (geometria cm) sem mudar draftGarment"
```

---

## Task 2: `ExportModel` + `outlineSegments` + `buildExportModel` (`lib/export/model.ts`)

**Files:**
- Create: `lib/export/model.ts`
- Test: `lib/export/model.test.ts`

**Interfaces:**
- Consumes: `draftPiecesCm` (Task 1); `DraftedPiece`, `Pt`, `bbox` (`@/lib/draft/core`); `Pattern`, `SizeLabel` (`@/lib/types`).
- Produces:
  - `type ExPt = { x: number; y: number }`
  - `type ExSeg = { kind: "line"; to: ExPt } | { kind: "cubic"; c1: ExPt; c2: ExPt; to: ExPt }`
  - `interface ExportPiece { id; name; qty; widthCm; heightCm; outline: { start: ExPt; segs: ExSeg[] }; grainline?: [ExPt, ExPt]; dart?: ExPt[]; originCm: ExPt }`
  - `interface ExportModel { patternName: string; size: SizeLabel; unit: "cm"; seamAllowanceCm: number | null; sheetWidthCm: number; sheetHeightCm: number; pieces: ExportPiece[] }`
  - `outlineSegments(ptsCm: Pt[], curvedSpans?: [number, number][]): { start: ExPt; segs: ExSeg[] }`
  - `buildExportModel(pattern: Pattern): ExportModel`

- [ ] **Step 1: Write the failing test (outlineSegments)**

Criar `lib/export/model.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { outlineSegments, buildExportModel } from "./model";
import type { Pt } from "@/lib/draft/core";
import type { Pattern } from "@/lib/types";

describe("outlineSegments", () => {
  it("emite line em aresta fora de span e cubic dentro de span", () => {
    const pts: Pt[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const { start, segs } = outlineSegments(pts, [[1, 2]]); // curva só na aresta 1->2
    expect(start).toEqual({ x: 0, y: 0 });
    expect(segs).toHaveLength(4); // uma por aresta (fechado)
    expect(segs[0].kind).toBe("line");
    expect(segs[1].kind).toBe("cubic");
    expect(segs[2].kind).toBe("line");
    expect(segs[3].kind).toBe("line");
  });

  it("cai para polilinha de lines quando < 3 pontos", () => {
    const { segs } = outlineSegments([[0, 0], [5, 5]]);
    expect(segs.every((s) => s.kind === "line")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/export/model.test.ts`
Expected: FAIL — módulo `./model` não existe.

- [ ] **Step 3: Write `outlineSegments` (implementação mínima)**

Criar `lib/export/model.ts` com os tipos e `outlineSegments`. A matemática espelha `outlinePath` de `lib/draft/core.ts` (mesma fórmula Catmull-Rom→Bézier, tangentes travadas nas bordas do span), mas em cm e devolvendo segmentos tipados:

```ts
import type { Pattern, SizeLabel } from "@/lib/types";
import { bbox, type DraftedPiece, type Pt } from "@/lib/draft/core";
import { draftPiecesCm } from "@/lib/draft/garment";

export type ExPt = { x: number; y: number };
export type ExSeg =
  | { kind: "line"; to: ExPt }
  | { kind: "cubic"; c1: ExPt; c2: ExPt; to: ExPt };

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

const P = (p: Pt): ExPt => ({ x: p[0], y: p[1] });

export function outlineSegments(
  ptsCm: Pt[],
  curvedSpans: [number, number][] = [],
): { start: ExPt; segs: ExSeg[] } {
  const p = ptsCm;
  const n = p.length;
  if (n < 3) {
    const segs: ExSeg[] = [];
    for (let i = 1; i < n; i++) segs.push({ kind: "line", to: P(p[i]) });
    return { start: P(p[0] ?? [0, 0]), segs };
  }
  const at = (i: number) => p[((i % n) + n) % n];
  const spanFor = (i: number) => curvedSpans.find(([a, b]) => i >= a && i + 1 <= b);
  const segs: ExSeg[] = [];
  for (let i = 0; i < n; i++) {
    const p1 = at(i), p2 = at(i + 1);
    const span = spanFor(i);
    if (!span) {
      segs.push({ kind: "line", to: P(p2) });
      continue;
    }
    const [a, b] = span;
    const p0 = i === a ? p1 : at(i - 1);
    const p3 = i + 1 === b ? p2 : at(i + 2);
    const c1: ExPt = { x: p1[0] + (p2[0] - p0[0]) / 6, y: p1[1] + (p2[1] - p0[1]) / 6 };
    const c2: ExPt = { x: p2[0] - (p3[0] - p1[0]) / 6, y: p2[1] - (p3[1] - p1[1]) / 6 };
    segs.push({ kind: "cubic", c1, c2, to: P(p2) });
  }
  return { start: P(at(0)), segs };
}
```

- [ ] **Step 4: Run test to verify outlineSegments passes**

Run: `npx vitest run lib/export/model.test.ts -t outlineSegments`
Expected: PASS (os testes de `buildExportModel` ainda não existem).

- [ ] **Step 5: Write the failing test (buildExportModel)**

Adicionar ao mesmo `lib/export/model.test.ts`:

```ts
function fakePattern(): Pattern {
  return {
    id: "p1",
    name: "Camiseta Teste",
    version: 1,
    savedAgo: "agora",
    baseSize: "M",
    unit: "cm",
    sizesApplied: [],
    sizesPending: [],
    pieces: [{ id: "x", name: "x", qty: 1, outline: { kind: "polygon", points: "0,0" }, label: { x: 0, y: 0 }, detailRows: [] }],
    spec: { tipo: "camiseta", sexo: "masc", measurementOverrides: {}, style: { folgaCosturaCm: 1.5 } },
  };
}

describe("buildExportModel", () => {
  it("monta model em cm com peças posicionadas e folga anotada", () => {
    const m = buildExportModel(fakePattern());
    expect(m.unit).toBe("cm");
    expect(m.size).toBe("M");
    expect(m.seamAllowanceCm).toBe(1.5);
    expect(m.sheetWidthCm).toBeGreaterThan(0);
    expect(m.sheetHeightCm).toBeGreaterThan(0);
    expect(m.pieces.length).toBeGreaterThanOrEqual(2);
    // origens crescem em x (peças lado a lado, sem sobreposição de origem)
    for (let i = 1; i < m.pieces.length; i++) {
      expect(m.pieces[i].originCm.x).toBeGreaterThan(m.pieces[i - 1].originCm.x);
    }
    // outline fechado começa no start e tem uma segmento por aresta
    const f = m.pieces[0];
    expect(f.widthCm).toBeGreaterThan(0);
    expect(f.outline.segs.length).toBeGreaterThanOrEqual(3);
  });

  it("usa folga default 1 quando style.folgaCosturaCm ausente", () => {
    const pat = fakePattern();
    pat.spec!.style = {};
    expect(buildExportModel(pat).seamAllowanceCm).toBe(1);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npx vitest run lib/export/model.test.ts -t buildExportModel`
Expected: FAIL — `buildExportModel is not a function`.

- [ ] **Step 7: Write `buildExportModel`**

Acrescentar ao fim de `lib/export/model.ts`. Layout em cm espelha o `autoLayout` (pad 6 cm, gap 8 cm), mas mantém cada contorno em coordenadas locais da peça (origem no canto do bbox) e guarda a posição no sheet em `originCm`:

```ts
export function buildExportModel(pattern: Pattern): ExportModel {
  const spec = pattern.spec;
  if (!spec) throw new Error("buildExportModel: pattern sem spec");
  const drafted: DraftedPiece[] = draftPiecesCm(spec, pattern.baseSize);

  const padCm = 6;
  const gapCm = 8;
  let cursorX = padCm;
  let maxH = 0;

  const pieces: ExportPiece[] = drafted.map((dp) => {
    const b = bbox(dp.outlineCm);
    const shift = (pt: Pt): Pt => [pt[0] - b.minX, pt[1] - b.minY];
    const local = dp.outlineCm.map(shift);
    const ep: ExportPiece = {
      id: dp.id,
      name: dp.name,
      qty: dp.qty,
      widthCm: b.w,
      heightCm: b.h,
      outline: outlineSegments(local, dp.curvedSpans ?? []),
      originCm: { x: cursorX, y: padCm },
    };
    if (dp.grainlineCm) {
      const [g1, g2] = dp.grainlineCm;
      ep.grainline = [P(shift(g1)), P(shift(g2))];
    }
    if (dp.dartCm && dp.dartCm.length >= 3) ep.dart = dp.dartCm.map((pt) => P(shift(pt)));
    cursorX += b.w + gapCm;
    maxH = Math.max(maxH, b.h);
    return ep;
  });

  return {
    patternName: pattern.name,
    size: pattern.baseSize,
    unit: "cm",
    seamAllowanceCm: spec.style.folgaCosturaCm ?? 1,
    sheetWidthCm: cursorX - gapCm + padCm,
    sheetHeightCm: maxH + padCm * 2,
    pieces,
  };
}
```

- [ ] **Step 8: Run all model tests**

Run: `npx vitest run lib/export/model.test.ts`
Expected: PASS (todos).

- [ ] **Step 9: Commit**

```bash
git add lib/export/model.ts lib/export/model.test.ts
git commit -m "feat(export): núcleo ExportModel + outlineSegments + buildExportModel (cm)"
```

---

## Task 3: Serializer SVG 1:1 (`lib/export/svg.ts`)

**Files:**
- Create: `lib/export/svg.ts`
- Test: `lib/export/svg.test.ts`

**Interfaces:**
- Consumes: `ExportModel`, `ExPt`, `ExSeg` (`./model`).
- Produces: `toSvg(model: ExportModel): string`.

- [ ] **Step 1: Write the failing test**

Criar `lib/export/svg.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toSvg } from "./svg";
import type { ExportModel } from "./model";

const model: ExportModel = {
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
      qty: 1,
      widthCm: 10,
      heightCm: 10,
      // quadrado 10cm de lado -> 4 lines
      outline: {
        start: { x: 0, y: 0 },
        segs: [
          { kind: "line", to: { x: 10, y: 0 } },
          { kind: "line", to: { x: 10, y: 10 } },
          { kind: "line", to: { x: 0, y: 10 } },
          { kind: "line", to: { x: 0, y: 0 } },
        ],
      },
      grainline: [{ x: 5, y: 1 }, { x: 5, y: 9 }],
      originCm: { x: 2, y: 2 },
    },
  ],
};

describe("toSvg", () => {
  it("gera dimensões em mm 1:1 e viewBox", () => {
    const svg = toSvg(model);
    expect(svg).toContain('width="200mm"'); // 20cm * 10
    expect(svg).toContain('height="300mm"');
    expect(svg).toContain('viewBox="0 0 200 300"');
  });

  it("escala 1:1: aresta de 10cm vira 100 unidades no path", () => {
    const svg = toSvg(model);
    // origem x=2cm -> 20 ; borda direita x=2+10=12cm -> 120
    expect(svg).toContain("M20 20");
    expect(svg).toContain("L120 20");
  });

  it("um path de contorno por peça + anotação de tamanho/folga no cabeçalho", () => {
    const svg = toSvg(model);
    expect(svg.match(/<path /g)?.length).toBe(1);
    expect(svg).toContain("tam M");
    expect(svg).toContain("folga 1cm (net line)");
    expect(svg).toContain("Camiseta &amp; Cia"); // XML escapado
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run lib/export/svg.test.ts`
Expected: FAIL — módulo `./svg` não existe.

- [ ] **Step 3: Write `toSvg`**

Criar `lib/export/svg.ts`:

```ts
import type { ExportModel, ExPt, ExSeg } from "./model";

const MM = 10; // cm -> mm (1:1)
const f = (n: number) => (Math.round(n * 100) / 100).toString();

function escapeXml(s: string): string {
  return s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]!));
}

function pathD(start: ExPt, segs: ExSeg[], ox: number, oy: number): string {
  const X = (x: number) => f((ox + x) * MM);
  const Y = (y: number) => f((oy + y) * MM);
  let d = `M${X(start.x)} ${Y(start.y)}`;
  for (const s of segs) {
    if (s.kind === "line") d += ` L${X(s.to.x)} ${Y(s.to.y)}`;
    else d += ` C${X(s.c1.x)} ${Y(s.c1.y)} ${X(s.c2.x)} ${Y(s.c2.y)} ${X(s.to.x)} ${Y(s.to.y)}`;
  }
  return d + " Z";
}

export function toSvg(model: ExportModel): string {
  const w = model.sheetWidthCm * MM;
  const h = model.sheetHeightCm * MM;
  const parts: string[] = [];

  for (const p of model.pieces) {
    const ox = p.originCm.x;
    const oy = p.originCm.y;
    const X = (x: number) => f((ox + x) * MM);
    const Y = (y: number) => f((oy + y) * MM);

    parts.push(
      `<path d="${pathD(p.outline.start, p.outline.segs, ox, oy)}" fill="none" stroke="#000" stroke-width="0.3"/>`,
    );
    if (p.grainline) {
      const [a, b] = p.grainline;
      parts.push(
        `<line x1="${X(a.x)}" y1="${Y(a.y)}" x2="${X(b.x)}" y2="${Y(b.y)}" stroke="#4a5a3a" stroke-width="0.3" stroke-dasharray="6 4"/>`,
      );
    }
    if (p.dart && p.dart.length >= 3) {
      const dd = p.dart.map((pt, i) => `${i === 0 ? "M" : "L"}${X(pt.x)} ${Y(pt.y)}`).join(" ");
      parts.push(`<path d="${dd} Z" fill="none" stroke="#4a5a3a" stroke-width="0.3"/>`);
    }
    parts.push(
      `<text x="${X(p.outline.start.x)}" y="${Y(p.heightCm)}" font-family="sans-serif" font-size="6" fill="#5a564a">${escapeXml(p.name.toUpperCase())} · ${p.qty}x</text>`,
    );
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!-- MoldAI · ${escapeXml(model.patternName)} · tam ${model.size} · folga ${model.seamAllowanceCm ?? 0}cm (net line) -->`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}mm" height="${f(h)}mm" viewBox="0 0 ${f(w)} ${f(h)}">`,
    ...parts,
    `</svg>`,
  ].join("\n");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run lib/export/svg.test.ts`
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
git add lib/export/svg.ts lib/export/svg.test.ts
git commit -m "feat(export): serializer SVG 1:1 em mm (toSvg)"
```

---

## Task 4: Download + fachada (`lib/export/download.ts`, `lib/export/index.ts`)

**Files:**
- Create: `lib/export/download.ts`
- Create: `lib/export/index.ts`

**Interfaces:**
- Consumes: `buildExportModel` (`./model`), `toSvg` (`./svg`), `Pattern` (`@/lib/types`).
- Produces:
  - `slug(name: string): string`
  - `downloadFile(filename: string, mime: string, data: string | Uint8Array): void`
  - `type ExportFormat = "svg"` (DXF/PDF entram nas Fases 2/3)
  - `exportPattern(pattern: Pattern, format: ExportFormat): void`

Sem teste unitário: `download.ts` é um shim de DOM (o projeto roda vitest em env `node`, sem jsdom) e `exportPattern` termina num side-effect de download. O gate desta task é `npm run build` limpo (checagem de tipos) mais a verificação manual da Task 6.

- [ ] **Step 1: Write `download.ts`**

Criar `lib/export/download.ts`:

```ts
export function slug(name: string): string {
  const s = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "molde";
}

export function downloadFile(filename: string, mime: string, data: string | Uint8Array): void {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Write `index.ts` (fachada)**

Criar `lib/export/index.ts`:

```ts
import type { Pattern } from "@/lib/types";
import { buildExportModel } from "./model";
import { toSvg } from "./svg";
import { downloadFile, slug } from "./download";

export type ExportFormat = "svg"; // "dxf" | "pdf" chegam nas Fases 2 e 3

export function exportPattern(pattern: Pattern, format: ExportFormat): void {
  if (!pattern.spec || pattern.pieces.length === 0) return;
  const model = buildExportModel(pattern);
  const filename = `${slug(pattern.name)}-${model.size}.${format}`;
  if (format === "svg") {
    downloadFile(filename, "image/svg+xml", toSvg(model));
  }
}
```

- [ ] **Step 3: Verify types compile**

Run: `npm run build`
Expected: build conclui sem erros de TypeScript (o `.next` é gerado). Se aparecer o falso erro de `app/layout.tsx LayoutProps`, ignorar — é ruído conhecido do Next 16; o que importa é não haver erro novo em `lib/export/*`.

- [ ] **Step 4: Commit**

```bash
git add lib/export/download.ts lib/export/index.ts
git commit -m "feat(export): download client-side + fachada exportPattern"
```

---

## Task 5: Menu de formato no `Footer`

**Files:**
- Modify: `components/editor/Footer.tsx` (arquivo inteiro)

**Interfaces:**
- Consumes: `exportPattern`, `ExportFormat` (`@/lib/export`); `Pattern` (`@/lib/types`).
- Produces: nenhuma nova API — só comportamento de UI.

Sem teste unitário (componente; sem jsdom no projeto). Gate: `npm run build` + `npm run lint` limpos, mais a verificação manual da Task 6.

- [ ] **Step 1: Reescrever `Footer.tsx`**

O botão "Exportar" vira um disparador de menu (dropdown pra cima, à direita). Desabilita com conflito, molde vazio ou sem spec. Um backdrop invisível fecha o menu ao clicar fora.

```tsx
"use client";

import { useState } from "react";
import { Pattern } from "@/lib/types";
import { exportPattern, ExportFormat } from "@/lib/export";

const FORMATS: { id: ExportFormat; label: string }[] = [
  { id: "svg", label: "SVG · 1:1 (plotter)" },
];

export function Footer({
  pattern,
  exportBlocked,
}: {
  pattern: Pattern;
  exportBlocked: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pieceCount = pattern.pieces.reduce((sum, p) => sum + p.qty, 0);
  const exportDisabled = exportBlocked || pattern.pieces.length === 0 || !pattern.spec;

  const handleExport = (format: ExportFormat) => {
    exportPattern(pattern, format);
    setMenuOpen(false);
  };

  return (
    <div className="flex items-center gap-[10px] px-4 py-3 bg-surface border-t border-border">
      <span className="text-[12px] text-muted">
        {exportBlocked
          ? `v${pattern.version} · não exportável com conflito`
          : `${pieceCount} peças · base ${pattern.baseSize} · unidade ${pattern.unit}`}
      </span>
      <div className="flex-1" />

      <div className="relative">
        <button
          type="button"
          disabled={exportDisabled}
          onClick={() => setMenuOpen((o) => !o)}
          className="text-[12.5px] font-medium px-[14px] py-2 rounded-btn border transition-colors disabled:cursor-not-allowed disabled:text-disabled disabled:border-disabled-border enabled:border-border enabled:hover:bg-surface-alt"
        >
          Exportar
        </button>
        {menuOpen && !exportDisabled && (
          <>
            <button
              type="button"
              aria-label="Fechar menu de exportação"
              className="fixed inset-0 z-10 cursor-default"
              onClick={() => setMenuOpen(false)}
            />
            <div className="absolute bottom-full right-0 mb-1 z-20 min-w-[180px] py-1 bg-surface border border-border rounded-item shadow-card">
              {FORMATS.map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => handleExport(fmt.id)}
                  className="block w-full text-left text-[12.5px] px-3 py-2 hover:bg-surface-alt transition-colors"
                >
                  {fmt.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <button
        type="button"
        className="text-[12.5px] font-semibold px-4 py-2 rounded-btn bg-olive text-[#f7f7f2] hover:bg-olive-dark transition-colors"
      >
        Salvar versão
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Verify build + lint**

Run: `npm run build`
Expected: sem erros novos de TypeScript.

Run: `npm run lint -- app lib components`
Expected: 0 problemas (escopo em `app lib components` — o lint na raiz varre worktrees aninhados e dá falso-alarme).

- [ ] **Step 3: Commit**

```bash
git add components/editor/Footer.tsx
git commit -m "feat(export): botão Exportar vira menu de formato (SVG)"
```

---

## Task 6: Documentar no `CLAUDE.md` + verificação manual

**Files:**
- Modify: `CLAUDE.md` (parágrafo de arquitetura sobre drafting/pieces)

**Interfaces:** nenhuma (docs).

- [ ] **Step 1: Adicionar parágrafo de arquitetura no `CLAUDE.md`**

Inserir um parágrafo novo logo após o parágrafo que começa com "**Pieces are drafted from measurements, not deltas.**" (o último bloco da seção Architecture):

```markdown
**Export is a client-side transform, not a server call.** `lib/export/` turns the drafted pattern into a downloadable file with no API route, credit cost, or state mutation. `buildExportModel(pattern)` (`lib/export/model.ts`) re-drafts the pieces in exact cm via `draftPiecesCm(spec, size)` (exposed from `lib/draft/garment.ts` alongside the unchanged `draftGarment`) — it never reverses the store's px back to cm, so it doesn't inherit `PX()` rounding. The `ExportModel` is format-agnostic (per-piece outlines as typed cm segments — `line`/`cubic`, Béziers preserved — plus grainline/dart/name/qty and a `seamAllowanceCm` annotation; the exported geometry is the **net sewing line**, seam allowance is not offset into it). Pure serializers consume it: `toSvg` (`lib/export/svg.ts`) emits a 1:1 SVG in mm (`MM = 10`, so a 10 cm edge is 100 units and `width`/`height` are in `mm`). `exportPattern(pattern, format)` (`lib/export/index.ts`) builds the model, serializes, and triggers a browser download via `downloadFile` (`lib/export/download.ts`, the only DOM touchpoint). The `Footer`'s "Exportar" button opens a format menu and is disabled when a conflict is active, the molde is blank, or there is no `spec`. DXF (AAMA/ASTM) and PDF tiling are planned follow-up phases; only SVG ships in the first phase.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: documenta o módulo de export (client-side, ExportModel, SVG 1:1)"
```

- [ ] **Step 3: Verificação manual (roteiro — não é passo automatizável)**

1. `npm run dev`, abrir `http://localhost:3000`.
2. Gerar um molde (ex.: "camiseta masculina M gola redonda manga curta") e responder as perguntas se aparecerem.
3. No rodapé, clicar "Exportar" → o menu abre com "SVG · 1:1 (plotter)". Clicar.
4. Abrir o `.svg` baixado no navegador ou Inkscape. Conferir:
   - As peças (frente/costas/manga), fio tracejado e rótulos aparecem.
   - Em "Propriedades do documento" (Inkscape) o tamanho está em mm e bate com a peça real; medir uma aresta conhecida com a ferramenta de medida ⇒ valor em cm coerente (1:1).
5. Provocar um conflito (se aplicável) ou abrir um molde em branco ⇒ botão "Exportar" desabilitado.

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: toda a suíte verde (inclui os novos testes de `lib/export/*` e `lib/draft/garment`).

---

## Fases seguintes (fora deste plano)

- **Fase 2 — DXF (AAMA/ASTM):** `lib/export/dxf.ts` (`toDxf(model)`), achatando `cubic`→polilinha, `LWPOLYLINE`/camadas, `$INSUNITS` mm; adicionar `"dxf"` a `ExportFormat` e ao menu. Ganha plano próprio (writing-plans) quando a Fase 1 mergear.
- **Fase 3 — PDF tiling:** `lib/export/pdf.ts` (`toPdf(model): Uint8Array`), dependência `pdf-lib`, fatiamento A4 + régua de calibração; adicionar `"pdf"` ao `ExportFormat`/menu. Plano próprio.

Cada fase é shippable e revisável sozinha; o `ExportModel` e a fachada já foram desenhados pra recebê-las sem refactor.
