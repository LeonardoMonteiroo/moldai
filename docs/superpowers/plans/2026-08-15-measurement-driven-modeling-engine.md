# Motor de Modelagem por Medidas Reais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o motor ilustrativo (params/deltas sobre formas prontas) por um engine de drafting que traça a geometria das peças a partir de medidas do corpo (cm), com tabela ABNT PP–GG + override no chat, blocos corpo/manga/saia e contrato de IA spec-based.

**Architecture:** Módulos puros novos e aditivos primeiro (`lib/measurements.ts`, `lib/draft/*`), cada um com testes Vitest, sem quebrar o build. Depois liga o backend (`mock-data`, `generate/route`, `ai`) ao fluxo spec-based, migra os componentes para detalhes flexíveis + viewBox dinâmico, e por fim remove o código morto e atualiza o CLAUDE.md. O drafting é em cm num espaço local por peça; `autoLayout` posiciona as peças e calcula o viewBox; SVG é derivado com `SCALE` px/cm. A IA nunca emite px — só uma `GarmentSpec` que o servidor valida/clampa e re-traça.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Zustand, Anthropic SDK (`claude-sonnet-5`), **Vitest** (novo).

## Global Constraints

Todo requisito de cada tarefa inclui implicitamente esta seção:

- **Build verde a cada tarefa.** Módulos novos são aditivos; nada que já compila pode passar a não compilar ao fim de uma tarefa. `npm run build` e `npm run lint` limpos ao fim de cada tarefa; `npm test` verde nas tarefas que criam/alteram testes.
- **Editor continua abrindo em branco.** `seedPattern` = molde novo, `version: 0`, sem peças, chat vazio, `spec` vazia. A primeira geração cria a spec e traça as peças. Não regredir isso.
- **A IA nunca emite geometria/px.** Só devolve `GarmentSpec`; o servidor valida enums e clampa medidas/profundidades por faixa **antes** de traçar.
- **Modelo é `claude-sonnet-5`, exatamente.** Não trocar.
- **Sem segredos no git.** `ANTHROPIC_API_KEY` só em `.env.local` (já no `.gitignore`). Nunca imprimir a chave.
- **Débito-antes-de-IA com estorno em toda falha.** Saldo insuficiente → 402 sem débito/IA. `decline` e qualquer erro/parse falho → estorna o crédito. Mantido do fluxo atual.
- **Unidade e escala.** Drafting em cm; `SCALE = 4` px/cm para render. `PX(cm) = round(cm*SCALE)`.
- **Fórmulas citáveis.** As constantes de drafting vêm das fontes da spec; a fidelidade de curva é ilustrativa (plausível, não industrial). Ajuste fino visual das constantes é parte da verificação das tarefas de bloco (via Playwright MCP), não um placeholder.
- **Idioma.** `assistantMessage` e textos de UI em português do Brasil.

---

### Task 1: Vitest + módulo de medidas

**Files:**
- Modify: `package.json` (scripts + devDependency)
- Create: `vitest.config.ts`
- Create: `lib/measurements.ts`
- Test: `lib/measurements.test.ts`

**Interfaces:**
- Produces: `Measurements` (interface), `SizeLabel` (reuso de `lib/types.ts`), `SIZE_TABLE: Record<SizeLabel, Measurements>`, `resolveMeasurements(size: SizeLabel, overrides: Partial<Measurements>): Measurements`, `MEASUREMENT_RANGES: Record<keyof Measurements, {min:number; max:number}>`.

- [ ] **Step 1: Adicionar Vitest**

Instalar dev dep e scripts:
```bash
npm install -D vitest@^2
```
`package.json` → em `"scripts"` adicionar:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Config do Vitest**

Create `vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node", include: ["lib/**/*.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```

- [ ] **Step 3: Teste que falha (tabela + resolução)**

Create `lib/measurements.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { SIZE_TABLE, resolveMeasurements } from "./measurements";

describe("size table", () => {
  it("tem as 5 tamanhos com graduação monotônica de busto/cintura/quadril", () => {
    const order = ["PP", "P", "M", "G", "GG"] as const;
    for (let i = 1; i < order.length; i++) {
      const a = SIZE_TABLE[order[i - 1]];
      const b = SIZE_TABLE[order[i]];
      expect(b.busto).toBeGreaterThan(a.busto);
      expect(b.cintura).toBeGreaterThan(a.cintura);
      expect(b.quadril).toBeGreaterThan(a.quadril);
    }
    expect(SIZE_TABLE.M.busto).toBe(92);
  });

  it("resolve base do tamanho e aplica overrides", () => {
    const base = resolveMeasurements("M", {});
    expect(base.cintura).toBe(74);
    const custom = resolveMeasurements("M", { cintura: 68 });
    expect(custom.cintura).toBe(68);
    expect(custom.quadril).toBe(base.quadril);
  });
});
```

- [ ] **Step 4: Rodar teste e ver falhar**

Run: `npm test`
Expected: FAIL (módulo `./measurements` não existe).

- [ ] **Step 5: Implementar `lib/measurements.ts`**

```ts
import { SizeLabel } from "./types";

export interface Measurements {
  busto: number;             // circunferência do busto (cm)
  cintura: number;           // circunferência da cintura (cm)
  quadril: number;           // circunferência do quadril (cm)
  alturaQuadril: number;     // cintura → quadril (cm)
  comprimentoCostas: number; // nuca → cintura (cm)
  ombro: number;             // largura de um ombro (cm)
  compSaia: number;          // comprimento default da saia (cm)
  compMangaCurta: number;    // (cm)
  compMangaLonga: number;    // (cm)
}

export const SIZE_TABLE: Record<SizeLabel, Measurements> = {
  PP: { busto: 84, cintura: 66, quadril: 92,  alturaQuadril: 20.0, comprimentoCostas: 40.0, ombro: 11.5, compSaia: 60, compMangaCurta: 18, compMangaLonga: 58 },
  P:  { busto: 88, cintura: 70, quadril: 96,  alturaQuadril: 20.3, comprimentoCostas: 40.5, ombro: 11.8, compSaia: 60, compMangaCurta: 18, compMangaLonga: 58 },
  M:  { busto: 92, cintura: 74, quadril: 100, alturaQuadril: 20.6, comprimentoCostas: 41.0, ombro: 12.0, compSaia: 60, compMangaCurta: 18, compMangaLonga: 58 },
  G:  { busto: 96, cintura: 78, quadril: 104, alturaQuadril: 21.0, comprimentoCostas: 41.5, ombro: 12.3, compSaia: 60, compMangaCurta: 18, compMangaLonga: 58 },
  GG: { busto: 100, cintura: 82, quadril: 108, alturaQuadril: 21.3, comprimentoCostas: 42.0, ombro: 12.5, compSaia: 60, compMangaCurta: 18, compMangaLonga: 58 },
};

export const MEASUREMENT_RANGES: Record<keyof Measurements, { min: number; max: number }> = {
  busto: { min: 70, max: 140 },
  cintura: { min: 55, max: 130 },
  quadril: { min: 78, max: 150 },
  alturaQuadril: { min: 15, max: 28 },
  comprimentoCostas: { min: 34, max: 50 },
  ombro: { min: 9, max: 16 },
  compSaia: { min: 25, max: 120 },
  compMangaCurta: { min: 8, max: 35 },
  compMangaLonga: { min: 40, max: 70 },
};

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v));
}

export function resolveMeasurements(size: SizeLabel, overrides: Partial<Measurements>): Measurements {
  const base = { ...SIZE_TABLE[size] };
  for (const k of Object.keys(overrides) as (keyof Measurements)[]) {
    const v = overrides[k];
    if (typeof v === "number" && Number.isFinite(v)) {
      const r = MEASUREMENT_RANGES[k];
      base[k] = clamp(v, r.min, r.max);
    }
  }
  return base;
}
```

- [ ] **Step 6: Rodar testes**

Run: `npm test` → PASS. Depois `npm run build` e `npm run lint` limpos.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json vitest.config.ts lib/measurements.ts lib/measurements.test.ts
git commit -m "feat: vitest + tabela de medidas ABNT (PP-GG) e resolveMeasurements"
```

---

### Task 2: Tipos da spec + primitivos de drafting e auto-layout

**Files:**
- Modify: `lib/types.ts` (adicionar tipos novos, sem remover os antigos)
- Create: `lib/draft/core.ts`
- Test: `lib/draft/core.test.ts`

**Interfaces:**
- Consumes: `PieceOutline` de `lib/types.ts`.
- Produces (em `lib/types.ts`): `GarmentType`, `Decote`, `MangaLen`, `SaiaSilhueta`, `GarmentStyle`, `GarmentSpec`, `DetailRow`, e campos **novos/opcionais** em `Piece`: `detailRows?: DetailRow[]`. Também `Pattern.spec?: GarmentSpec`, `Pattern.baseMeasurements?: Measurements`, `Pattern.viewBox?: { w: number; h: number }`.
- Produces (em `lib/draft/core.ts`): `SCALE = 4`, `PX(cm)`, `Pt = [number, number]`, `DraftedPiece` (`{ id; name; qty; outlineCm: Pt[]; guideCm?: Pt[]; grainlineCm?: [Pt, Pt]; dartCm?: Pt[]; detailRows: DetailRow[]; armholeLenCm?: number }`), `polyPath(pts: Pt[]): PieceOutline`, `smoothPath(pts: Pt[], closed: boolean): PieceOutline` (Catmull-Rom→Bézier), `bbox(pts: Pt[])`, `autoLayout(pieces: DraftedPiece[], gapCm?: number): { pieces: Piece[]; viewBox: {w:number;h:number} }`.

- [ ] **Step 1: Tipos novos em `lib/types.ts` (aditivo)**

Adicionar (não remover nada ainda):
```ts
export type GarmentType = "blusa" | "vestido" | "saia";
export type Decote = "reto" | "V" | "redondo";
export type MangaLen = "sem" | "curta" | "longa";
export type SaiaSilhueta = "reta" | "evase" | "gode" | "meia-roda" | "circulo";

export interface GarmentStyle {
  decote?: Decote;
  decoteProfundidadeCm?: number;
  manga?: MangaLen;
  saia?: SaiaSilhueta;
  compSaiaCm?: number;
  pences?: boolean;
  folgaCosturaCm?: number;
}

export interface GarmentSpec {
  tipo: GarmentType;
  measurementOverrides: Record<string, number>; // chaves de Measurements
  style: GarmentStyle;
}

export interface DetailRow { label: string; value: string; }
```
Em `Piece` adicionar campo opcional `detailRows?: DetailRow[];` (manter `details`, `params` como estão por ora).
Em `Pattern` adicionar opcionais `spec?: GarmentSpec; viewBox?: { w: number; h: number };` (e importar `Measurements` para `baseMeasurements?: Measurements;`). Import: `import type { Measurements } from "./measurements";`.

- [ ] **Step 2: Teste que falha (layout + curva)**

Create `lib/draft/core.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { autoLayout, bbox, polyPath, DraftedPiece } from "./core";

const rect = (id: string, w: number, h: number): DraftedPiece => ({
  id, name: id, qty: 1,
  outlineCm: [[0, 0], [w, 0], [w, h], [0, h]],
  detailRows: [],
});

describe("core drafting", () => {
  it("bbox mede a peça", () => {
    expect(bbox([[2, 3], [10, 3], [10, 20]])).toEqual({ minX: 2, minY: 3, maxX: 10, maxY: 20, w: 8, h: 17 });
  });

  it("polyPath fecha o polígono", () => {
    const o = polyPath([[0, 0], [1, 0], [1, 1]]);
    expect(o.kind).toBe("polygon");
  });

  it("autoLayout empilha peças lado a lado e calcula viewBox > 0", () => {
    const { pieces, viewBox } = autoLayout([rect("a", 10, 20), rect("b", 30, 40)], 5);
    expect(pieces).toHaveLength(2);
    expect(viewBox.w).toBeGreaterThan(0);
    expect(viewBox.h).toBeGreaterThan(0);
    // segunda peça começa depois da primeira + gap (em px)
    const ax = (pieces[0].outline as { points: string }).points.split(" ")[0];
    const bx = (pieces[1].outline as { points: string }).points.split(" ")[0];
    expect(parseFloat(bx)).toBeGreaterThan(parseFloat(ax));
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `npm test` → FAIL (`./core` inexistente).

- [ ] **Step 4: Implementar `lib/draft/core.ts`**

```ts
import { DetailRow, Piece, PieceOutline } from "@/lib/types";

export const SCALE = 4; // px por cm
export const PX = (cm: number) => Math.round(cm * SCALE * 10) / 10;

export type Pt = [number, number];

export interface DraftedPiece {
  id: string;
  name: string;
  qty: number;
  outlineCm: Pt[];
  guideCm?: Pt[];
  grainlineCm?: [Pt, Pt];
  dartCm?: Pt[];
  detailRows: DetailRow[];
  armholeLenCm?: number;
}

export function bbox(pts: Pt[]) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

export function polyPath(ptsCm: Pt[]): PieceOutline {
  const points = ptsCm.map(([x, y]) => `${PX(x)},${PX(y)}`).join(" ");
  return { kind: "polygon", points };
}

// Catmull-Rom -> Bézier suave. `closed` liga o último ao primeiro ponto.
export function smoothPath(ptsCm: Pt[], closed: boolean): PieceOutline {
  const p = ptsCm.map(([x, y]) => [PX(x), PX(y)] as Pt);
  const n = p.length;
  if (n < 3) return polyPath(ptsCm);
  const at = (i: number) => p[(i + n) % n];
  let d = `M${at(0)[0]} ${at(0)[1]} `;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)} `;
  }
  if (closed) d += "Z";
  return { kind: "path", d: d.trim() };
}

function translateOutline(o: PieceOutline, dx: number, dy: number): PieceOutline {
  if (o.kind === "polygon") {
    const points = o.points.split(" ").map((pair) => {
      const [x, y] = pair.split(",").map(Number);
      return `${(x + dx).toFixed(1)},${(y + dy).toFixed(1)}`;
    }).join(" ");
    return { kind: "polygon", points };
  }
  // path: só temos comandos absolutos M/C/L/Z gerados aqui; transladamos números em pares após M/C/L.
  const d = o.d.replace(/([MCL])([^MCLZ]*)/g, (_, cmd, nums) => {
    const parts = nums.trim().split(/\s+/).map(Number);
    const shifted = parts.map((v: number, i: number) => (i % 2 === 0 ? v + dx : v + dy).toFixed(1));
    return `${cmd}${shifted.join(" ")} `;
  });
  return { kind: "path", d: d.trim() };
}

// Constrói a Piece final aplicando outline/guia/grainline/dart com deslocamento (dx,dy) em px.
function place(dp: DraftedPiece, dxPx: number, dyPx: number, curved: boolean): Piece {
  const outline = curved ? smoothPath(dp.outlineCm, true) : polyPath(dp.outlineCm);
  const piece: Piece = {
    id: dp.id,
    name: dp.name,
    qty: dp.qty,
    params: {},
    outline: translateOutline(outline, dxPx, dyPx),
    detailRows: dp.detailRows,
    label: { x: dxPx + 6, y: dyPx + PX(bbox(dp.outlineCm).h) - 6 },
    details: { folgaCostura: "", penceBusto: "", cava: "", fio: "", consumo: "" },
  };
  if (dp.guideCm) piece.guideOutline = translateOutline(polyPath(dp.guideCm), dxPx, dyPx);
  if (dp.grainlineCm) {
    const [[x1, y1], [x2, y2]] = dp.grainlineCm;
    piece.grainline = { x1: PX(x1) + dxPx, y1: PX(y1) + dyPx, x2: PX(x2) + dxPx, y2: PX(y2) + dyPx };
  }
  if (dp.dartCm && dp.dartCm.length >= 3) {
    const dd = (polyPath(dp.dartCm) as { points: string }).points
      .split(" ").map((p) => p.split(",").map(Number));
    const [a, b, c] = dd;
    piece.dart = { d: `M${a[0] + dxPx} ${a[1] + dyPx} L${b[0] + dxPx} ${b[1] + dyPx} L${c[0] + dxPx} ${c[1] + dyPx} Z` };
  }
  return piece;
}

export function autoLayout(
  drafted: DraftedPiece[],
  gapCm = 8,
  curvedIds: string[] = [],
): { pieces: Piece[]; viewBox: { w: number; h: number } } {
  const pad = PX(6);
  const gap = PX(gapCm);
  let cursorX = pad;
  let maxH = 0;
  const pieces: Piece[] = [];
  for (const dp of drafted) {
    const b = bbox(dp.outlineCm);
    const dx = cursorX - PX(b.minX);
    const dy = pad - PX(b.minY);
    pieces.push(place(dp, dx, dy, curvedIds.includes(dp.id)));
    cursorX += PX(b.w) + gap;
    maxH = Math.max(maxH, PX(b.h));
  }
  return { pieces, viewBox: { w: Math.round(cursorX - gap + pad), h: Math.round(maxH + pad * 2) } };
}
```

- [ ] **Step 5: Rodar testes + build**

Run: `npm test` → PASS. `npm run build`, `npm run lint` limpos.

- [ ] **Step 6: Commit**

```bash
git add lib/types.ts lib/draft/core.ts lib/draft/core.test.ts
git commit -m "feat: tipos GarmentSpec + primitivos de drafting (SCALE/curva/autoLayout)"
```

---

### Task 3: Bloco do corpo (frente e costas)

**Files:**
- Create: `lib/draft/corpo.ts`
- Test: `lib/draft/corpo.test.ts`

**Interfaces:**
- Consumes: `Measurements` (`lib/measurements.ts`), `GarmentStyle`, `DetailRow` (`lib/types.ts`), `DraftedPiece`, `Pt` (`lib/draft/core.ts`).
- Produces: `draftCorpo(m: Measurements, style: GarmentStyle): { frente: DraftedPiece; costas: DraftedPiece; armholeLenCm: number }`.

Convenção: cada peça é traçada em cm no seu espaço local (origem no topo-esq da própria bbox). Desenha-se a **peça inteira** (frente/costas com centro no meio), largura cheia. `armholeLenCm` é o comprimento aproximado da cava, usado pela manga (Task 4) para casar a copa.

- [ ] **Step 1: Teste que falha**

Create `lib/draft/corpo.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveMeasurements } from "@/lib/measurements";
import { draftCorpo } from "./corpo";
import { bbox } from "./core";

const M = resolveMeasurements("M", {});

describe("draftCorpo", () => {
  it("frente mais larga que altura razoável e escala com o busto", () => {
    const small = draftCorpo(resolveMeasurements("PP", {}), {});
    const big = draftCorpo(resolveMeasurements("GG", {}), {});
    expect(bbox(big.frente.outlineCm).w).toBeGreaterThan(bbox(small.frente.outlineCm).w);
  });

  it("decote V aprofunda mais que reto", () => {
    const reto = draftCorpo(M, { decote: "reto" });
    const v = draftCorpo(M, { decote: "V", decoteProfundidadeCm: 8 });
    // o ponto mais alto do decote em V desce mais (maior y no topo central)
    const topReto = Math.min(...reto.frente.outlineCm.map((p) => p[1]));
    const topV = Math.min(...v.frente.outlineCm.map((p) => p[1]));
    expect(topV).toBeGreaterThanOrEqual(topReto);
    expect(v.frente.detailRows.some((r) => /decote/i.test(r.label))).toBe(true);
  });

  it("expõe comprimento de cava positivo e casável", () => {
    const { armholeLenCm } = draftCorpo(M, {});
    expect(armholeLenCm).toBeGreaterThan(10);
  });

  it("gera pence quando pences=true", () => {
    expect(draftCorpo(M, { pences: true }).frente.dartCm?.length).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test` → FAIL.

- [ ] **Step 3: Implementar `lib/draft/corpo.ts`**

```ts
import { Measurements } from "@/lib/measurements";
import { DetailRow, GarmentStyle } from "@/lib/types";
import { DraftedPiece, Pt } from "./core";

const cm = (v: number) => `${v.toFixed(1).replace(".", ",")} cm`;

// Traça meio-corpo espelhado -> peça inteira. `frontish` controla decote (frente mais fundo).
function bodice(m: Measurements, style: GarmentStyle, id: string, name: string, frontish: boolean): {
  piece: DraftedPiece;
  armholeLenCm: number;
} {
  const folga = style.folgaCosturaCm ?? 1;
  const quarter = m.busto / 4;
  const halfW = quarter + folga;        // meia largura (centro -> lateral) no busto
  const len = m.comprimentoCostas;      // ombro/nuca -> cintura
  const neckHalf = m.comprimentoCostas / 6 + 0.5 + (frontish ? 0.5 : 0); // meia largura do decote
  const shoulder = m.ombro;
  const armholeDepth = quarter * 0.5 + 2; // altura de cava a partir da linha de ombro
  const baseDrop = frontish ? neckHalf + 1 : neckHalf * 0.5; // profundidade base do decote
  const extra = style.decote && style.decote !== "reto" ? Math.max(0, style.decoteProfundidadeCm ?? 4) : 0;
  const neckDrop = baseDrop + (frontish ? extra : extra * 0.3);
  const waistHalf = halfW - 1;          // leve afunilamento na cintura

  // centro em x = halfW; y=0 na linha de ombro
  const cx = halfW;
  const shoulderY = 0;
  const top: Pt[] = [];
  // ombro esquerdo -> decote -> ombro direito
  top.push([cx - shoulder, shoulderY + 1.5]);          // ponta de ombro esq
  top.push([cx - neckHalf, shoulderY]);                // base pescoço esq
  if (style.decote === "V") {
    top.push([cx, shoulderY + neckDrop]);              // bico do V
  } else if (style.decote === "redondo") {
    top.push([cx - neckHalf * 0.5, shoulderY + neckDrop * 0.7]);
    top.push([cx, shoulderY + neckDrop]);
    top.push([cx + neckHalf * 0.5, shoulderY + neckDrop * 0.7]);
  } else {
    top.push([cx, shoulderY + baseDrop * 0.4]);        // reto suave
  }
  top.push([cx + neckHalf, shoulderY]);                // base pescoço dir
  top.push([cx + shoulder, shoulderY + 1.5]);          // ponta de ombro dir

  const outlineCm: Pt[] = [
    ...top,
    [cx + halfW, shoulderY + armholeDepth],            // cava dir
    [cx + waistHalf, len],                             // cintura dir
    [cx - waistHalf, len],                             // cintura esq
    [cx - halfW, shoulderY + armholeDepth],            // cava esq
  ];

  // comprimento aproximado da cava (ombro -> lateral do busto), por lado
  const armholeLenCm = Math.hypot(halfW - shoulder, armholeDepth - 1.5) + armholeDepth * 0.15;

  const grainlineCm: [Pt, Pt] = [[cx, shoulderY + 3], [cx, len - 3]];
  const detailRows: DetailRow[] = [
    { label: "Folga de costura", value: cm(folga) },
    { label: "Largura (busto)", value: cm(halfW * 2) },
    { label: "Comprimento", value: cm(len) },
    { label: "Cava", value: cm(armholeLenCm) },
    { label: "Decote", value: style.decote ?? "reto" },
    { label: "Fio", value: "reto" },
  ];

  let dartCm: Pt[] | undefined;
  if (style.pences) {
    const dartW = Math.max(1.5, (m.quadril / 4 - m.cintura / 4) * 0.5);
    const dy = len - 6;
    dartCm = [[cx - dartW, len], [cx, dy - 12], [cx + dartW, len]];
    detailRows.splice(4, 0, { label: "Pence", value: cm(dartW * 2) });
  }

  return {
    piece: { id, name, qty: 1, outlineCm, grainlineCm, dartCm, detailRows, armholeLenCm },
    armholeLenCm,
  };
}

export function draftCorpo(m: Measurements, style: GarmentStyle) {
  const f = bodice(m, style, "corpo-frente", "Frente", true);
  const c = bodice(m, style, "corpo-costas", "Costas", false);
  return { frente: f.piece, costas: c.piece, armholeLenCm: f.armholeLenCm };
}
```

- [ ] **Step 4: Rodar testes**

Run: `npm test` → PASS. `npm run build`, `npm run lint` limpos.

- [ ] **Step 5: Commit**

```bash
git add lib/draft/corpo.ts lib/draft/corpo.test.ts
git commit -m "feat: bloco de corpo (frente/costas) por medidas"
```

---

### Task 4: Bloco de manga

**Files:**
- Create: `lib/draft/manga.ts`
- Test: `lib/draft/manga.test.ts`

**Interfaces:**
- Consumes: `Measurements`, `GarmentStyle`, `DraftedPiece`, `Pt`.
- Produces: `draftManga(m: Measurements, style: GarmentStyle, armholeLenCm: number): DraftedPiece | null` (null quando `style.manga === "sem"`).

Copa dimensionada pela cava: bicep base ≈ `armholeLenCm * 0.9`, altura de copa ≈ `armholeLenCm * 0.4`. Comprimento conforme `manga` (curta/longa).

- [ ] **Step 1: Teste que falha**

Create `lib/draft/manga.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveMeasurements } from "@/lib/measurements";
import { draftManga } from "./manga";
import { bbox } from "./core";

const M = resolveMeasurements("M", {});

describe("draftManga", () => {
  it("retorna null quando manga=sem", () => {
    expect(draftManga(M, { manga: "sem" }, 22)).toBeNull();
  });
  it("longa é mais comprida que curta", () => {
    const curta = draftManga(M, { manga: "curta" }, 22)!;
    const longa = draftManga(M, { manga: "longa" }, 22)!;
    expect(bbox(longa.outlineCm).h).toBeGreaterThan(bbox(curta.outlineCm).h);
  });
  it("largura da copa acompanha a cava", () => {
    const estreita = draftManga(M, { manga: "curta" }, 18)!;
    const larga = draftManga(M, { manga: "curta" }, 30)!;
    expect(bbox(larga.outlineCm).w).toBeGreaterThan(bbox(estreita.outlineCm).w);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test` → FAIL.

- [ ] **Step 3: Implementar `lib/draft/manga.ts`**

```ts
import { Measurements } from "@/lib/measurements";
import { DetailRow, GarmentStyle } from "@/lib/types";
import { DraftedPiece, Pt } from "./core";

const cm = (v: number) => `${v.toFixed(1).replace(".", ",")} cm`;

export function draftManga(m: Measurements, style: GarmentStyle, armholeLenCm: number): DraftedPiece | null {
  if (style.manga === "sem" || !style.manga) return null;
  const bicep = armholeLenCm * 0.9;         // largura no topo
  const capH = armholeLenCm * 0.4;          // altura da copa
  const len = style.manga === "longa" ? m.compMangaLonga : m.compMangaCurta;
  const hemHalf = (bicep / 2) * (style.manga === "longa" ? 0.7 : 0.92); // afunila na manga longa

  const cxTop = bicep / 2;
  // copa: dois picos suaves (frente/costas) -> lateral
  const outlineCm: Pt[] = [
    [cxTop, 0],                       // topo central da copa
    [bicep * 0.78, capH * 0.55],
    [bicep, capH],                    // axila dir
    [cxTop + hemHalf, capH + len],    // barra dir
    [cxTop - hemHalf, capH + len],    // barra esq
    [0, capH],                        // axila esq
    [bicep * 0.22, capH * 0.55],
  ];
  const grainlineCm: [Pt, Pt] = [[cxTop, 3], [cxTop, capH + len - 3]];
  const detailRows: DetailRow[] = [
    { label: "Tipo", value: style.manga === "longa" ? "longa" : "curta" },
    { label: "Comprimento", value: cm(capH + len) },
    { label: "Cava (copa)", value: cm(armholeLenCm) },
    { label: "Fio", value: "reto" },
  ];
  return { id: "manga", name: "Manga", qty: 2, outlineCm, grainlineCm, detailRows, armholeLenCm };
}
```

- [ ] **Step 4: Rodar testes** — `npm test` PASS; build/lint limpos.

- [ ] **Step 5: Commit**

```bash
git add lib/draft/manga.ts lib/draft/manga.test.ts
git commit -m "feat: bloco de manga casando a copa com a cava"
```

---

### Task 5: Bloco de saia (reta/evasê/godê/meia-roda/círculo)

**Files:**
- Create: `lib/draft/saia.ts`
- Test: `lib/draft/saia.test.ts`

**Interfaces:**
- Consumes: `Measurements`, `GarmentStyle`, `SaiaSilhueta`, `DraftedPiece`, `Pt`.
- Produces: `draftSaia(m: Measurements, style: GarmentStyle): DraftedPiece`.

Fórmula real (círculo/godê): raio da cintura `r = cintura / (2π)` (círculo/godê total), `cintura / π` (meia-roda). Raio externo `R = r + comprimento`. A peça é o setor entre os dois arcos. Reta = retângulo `¼quadril + folga`. Evasê = interpola largura de barra entre reta e godê.

- [ ] **Step 1: Teste que falha**

Create `lib/draft/saia.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { resolveMeasurements } from "@/lib/measurements";
import { draftSaia } from "./saia";
import { bbox } from "./core";

const M = resolveMeasurements("M", {}); // cintura 74, quadril 100

describe("draftSaia", () => {
  it("círculo: arco da cintura ~ cintura/4 (um quarto de peça) com raio cintura/2π", () => {
    const dp = draftSaia(M, { saia: "circulo", compSaiaCm: 60 });
    // metadado exposto nas linhas de detalhe: raio da cintura
    const raioRow = dp.detailRows.find((r) => /raio/i.test(r.label));
    expect(raioRow).toBeTruthy();
    const raio = parseFloat(raioRow!.value.replace(",", "."));
    expect(raio).toBeCloseTo(74 / (2 * Math.PI), 0);
  });
  it("godê tem barra mais larga que reta", () => {
    const reta = draftSaia(M, { saia: "reta", compSaiaCm: 60 });
    const gode = draftSaia(M, { saia: "gode", compSaiaCm: 60 });
    expect(bbox(gode.outlineCm).w).toBeGreaterThan(bbox(reta.outlineCm).w);
  });
  it("comprimento respeita compSaiaCm", () => {
    const curta = draftSaia(M, { saia: "reta", compSaiaCm: 40 });
    const longa = draftSaia(M, { saia: "reta", compSaiaCm: 90 });
    expect(bbox(longa.outlineCm).h).toBeGreaterThan(bbox(curta.outlineCm).h);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test` → FAIL.

- [ ] **Step 3: Implementar `lib/draft/saia.ts`**

```ts
import { Measurements } from "@/lib/measurements";
import { DetailRow, GarmentStyle, SaiaSilhueta } from "@/lib/types";
import { DraftedPiece, Pt } from "./core";

const cm = (v: number) => `${v.toFixed(1).replace(".", ",")} cm`;

// setor anelar (arco de cintura e de barra) amostrado em pontos
function radialSkirt(cintura: number, comp: number, denom: number): { pts: Pt[]; r: number } {
  const r = cintura / denom;             // raio interno (cintura)
  const R = r + comp;                    // raio externo (barra)
  const sweep = (Math.PI * 2) / denom;   // ângulo de UM quarto de peça (peça cortada 4x/2x)
  const half = sweep / 2;
  const steps = 12;
  const inner: Pt[] = [];
  const outer: Pt[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = -half + (sweep * i) / steps;
    inner.push([r * Math.sin(a), -r * Math.cos(a)]);
    outer.push([R * Math.sin(a), -R * Math.cos(a)]);
  }
  // fecha: cintura (esq->dir) + barra (dir->esq)
  const pts = [...inner, ...outer.reverse()];
  // normaliza para y>=0 (bbox translada depois)
  const minY = Math.min(...pts.map((p) => p[1]));
  return { pts: pts.map(([x, y]) => [x, y - minY] as Pt), r };
}

export function draftSaia(m: Measurements, style: GarmentStyle): DraftedPiece {
  const silhueta: SaiaSilhueta = style.saia ?? "reta";
  const folga = style.folgaCosturaCm ?? 1;
  const comp = style.compSaiaCm ?? m.compSaia;
  const detailRows: DetailRow[] = [
    { label: "Silhueta", value: silhueta },
    { label: "Comprimento", value: cm(comp) },
    { label: "Folga de costura", value: cm(folga) },
    { label: "Fio", value: "reto" },
  ];

  if (silhueta === "circulo" || silhueta === "gode" || silhueta === "meia-roda") {
    const denom = silhueta === "meia-roda" ? Math.PI : 2 * Math.PI;
    const { pts, r } = radialSkirt(m.cintura, comp, denom);
    detailRows.splice(1, 0, { label: "Raio da cintura", value: cm(r) });
    // desloca para x>=0
    const minX = Math.min(...pts.map((p) => p[0]));
    const outlineCm = pts.map(([x, y]) => [x - minX, y] as Pt);
    const cxTop = -minX; // aproximação do centro no topo
    return { id: "saia", name: "Saia", qty: silhueta === "meia-roda" ? 1 : 2, outlineCm,
      grainlineCm: [[cxTop, 4], [cxTop, comp]], detailRows };
  }

  // reta / evasê: trapézio (¼ quadril na cintura, barra igual ou mais larga)
  const waistHalf = m.quadril / 4 + folga; // usa quadril como largura de referência do painel
  const flare = silhueta === "evase" ? 12 : 0;
  const hemHalf = waistHalf + flare;
  const outlineCm: Pt[] = [
    [waistHalf === hemHalf ? 0 : (hemHalf - waistHalf), 0],
    [(hemHalf - waistHalf) + waistHalf * 2, 0],
    [hemHalf * 2, comp],
    [0, comp],
  ];
  detailRows.splice(1, 0, { label: "Cintura (painel)", value: cm(waistHalf * 2) });
  return { id: "saia", name: "Saia", qty: 2, outlineCm,
    grainlineCm: [[hemHalf, 4], [hemHalf, comp - 4]], detailRows };
}
```

- [ ] **Step 4: Rodar testes** — `npm test` PASS; build/lint limpos.

- [ ] **Step 5: Commit**

```bash
git add lib/draft/saia.ts lib/draft/saia.test.ts
git commit -m "feat: bloco de saia (reta/evasê/godê/meia-roda/círculo) com raio real"
```

---

### Task 6: Composição do vestuário + validação da spec

**Files:**
- Create: `lib/draft/garment.ts`
- Test: `lib/draft/garment.test.ts`

**Interfaces:**
- Consumes: tudo de `lib/draft/*`, `resolveMeasurements`, `MEASUREMENT_RANGES`, tipos de spec.
- Produces:
  - `validateSpec(raw: unknown): GarmentSpec` — força enums válidos, clampa `decoteProfundidadeCm`∈[0,15], `compSaiaCm`∈[25,120], `folgaCosturaCm`∈[0,4], filtra `measurementOverrides` para chaves conhecidas.
  - `draftGarment(spec: GarmentSpec, size: SizeLabel): { pieces: Piece[]; viewBox: {w:number;h:number}; measurements: Measurements; armholeLenCm?: number }` — resolve arquétipo (`saia` → só saia; `blusa` → corpo F/C + manga; `vestido` → corpo F/C + manga + saia), traça, e chama `autoLayout` (curvedIds = ["corpo-frente","corpo-costas","manga","saia"] p/ silhuetas radiais; saia reta/evasê fica poligonal — ver nota).
  - `seamCheck(armholeLenCm: number | undefined, mangaLenCm: number | undefined): { diffCm: number } | null` — compara cava×copa, retorna diff se > 1 cm.

Nota de curva: a saia radial (círculo/godê) já vem como polígono amostrado de arco — renderizar como **polígono** (pontos densos) evita distorção do smoothing; corpo e manga usam **smooth**. Então `curvedIds = ["corpo-frente","corpo-costas","manga"]`.

- [ ] **Step 1: Teste que falha**

Create `lib/draft/garment.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { validateSpec, draftGarment } from "./garment";

describe("validateSpec", () => {
  it("cai para defaults em enums inválidos e clampa faixas", () => {
    const s = validateSpec({ tipo: "foo", style: { saia: "xxx", compSaiaCm: 999, decoteProfundidadeCm: -5 }, measurementOverrides: { cintura: 70, hack: 1 } });
    expect(["blusa", "vestido", "saia"]).toContain(s.tipo);
    expect(s.style.compSaiaCm).toBeLessThanOrEqual(120);
    expect(s.style.decoteProfundidadeCm).toBeGreaterThanOrEqual(0);
    expect(s.measurementOverrides.hack).toBeUndefined();
    expect(s.measurementOverrides.cintura).toBe(70);
  });
});

describe("draftGarment", () => {
  it("blusa gera frente, costas e manga", () => {
    const { pieces } = draftGarment({ tipo: "blusa", measurementOverrides: {}, style: { manga: "curta", decote: "V" } }, "M");
    const ids = pieces.map((p) => p.id).sort();
    expect(ids).toEqual(["corpo-costas", "corpo-frente", "manga"]);
  });
  it("saia gera só a peça de saia e viewBox > 0", () => {
    const { pieces, viewBox } = draftGarment({ tipo: "saia", measurementOverrides: {}, style: { saia: "gode" } }, "M");
    expect(pieces.map((p) => p.id)).toEqual(["saia"]);
    expect(viewBox.w).toBeGreaterThan(0);
  });
  it("vestido combina corpo + saia", () => {
    const { pieces } = draftGarment({ tipo: "vestido", measurementOverrides: {}, style: { manga: "sem", saia: "evase" } }, "M");
    expect(pieces.map((p) => p.id)).toContain("saia");
    expect(pieces.map((p) => p.id)).toContain("corpo-frente");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npm test` → FAIL.

- [ ] **Step 3: Implementar `lib/draft/garment.ts`**

```ts
import { MEASUREMENT_RANGES, Measurements, resolveMeasurements } from "@/lib/measurements";
import {
  Decote, GarmentSpec, GarmentStyle, GarmentType, MangaLen, Piece, SaiaSilhueta, SizeLabel,
} from "@/lib/types";
import { autoLayout, DraftedPiece } from "./core";
import { draftCorpo } from "./corpo";
import { draftManga } from "./manga";
import { draftSaia } from "./saia";

const TIPOS: GarmentType[] = ["blusa", "vestido", "saia"];
const DECOTES: Decote[] = ["reto", "V", "redondo"];
const MANGAS: MangaLen[] = ["sem", "curta", "longa"];
const SAIAS: SaiaSilhueta[] = ["reta", "evase", "gode", "meia-roda", "circulo"];

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
const pick = <T,>(v: unknown, allowed: T[], def: T): T => (allowed.includes(v as T) ? (v as T) : def);

export function validateSpec(raw: unknown): GarmentSpec {
  const r = (raw ?? {}) as Record<string, unknown>;
  const style = (r.style ?? {}) as Record<string, unknown>;
  const ovRaw = (r.measurementOverrides ?? {}) as Record<string, unknown>;
  const overrides: Record<string, number> = {};
  for (const k of Object.keys(MEASUREMENT_RANGES)) {
    const v = ovRaw[k];
    if (typeof v === "number" && Number.isFinite(v)) overrides[k] = v; // faixa é aplicada em resolveMeasurements
  }
  const outStyle: GarmentStyle = {
    decote: style.decote !== undefined ? pick(style.decote, DECOTES, "reto") : undefined,
    manga: style.manga !== undefined ? pick(style.manga, MANGAS, "sem") : undefined,
    saia: style.saia !== undefined ? pick(style.saia, SAIAS, "reta") : undefined,
    decoteProfundidadeCm: style.decoteProfundidadeCm !== undefined ? clamp(Number(style.decoteProfundidadeCm) || 0, 0, 15) : undefined,
    compSaiaCm: style.compSaiaCm !== undefined ? clamp(Number(style.compSaiaCm) || 60, 25, 120) : undefined,
    folgaCosturaCm: style.folgaCosturaCm !== undefined ? clamp(Number(style.folgaCosturaCm) || 1, 0, 4) : undefined,
    pences: typeof style.pences === "boolean" ? style.pences : undefined,
  };
  return { tipo: pick(r.tipo, TIPOS, "blusa"), measurementOverrides: overrides, style: outStyle };
}

export function seamCheck(armholeLenCm?: number, mangaCavaCm?: number): { diffCm: number } | null {
  if (armholeLenCm == null || mangaCavaCm == null) return null;
  const diff = Math.abs(armholeLenCm - mangaCavaCm);
  return diff > 1 ? { diffCm: Math.round(diff * 10) / 10 } : null;
}

export function draftGarment(spec: GarmentSpec, size: SizeLabel) {
  const measurements: Measurements = resolveMeasurements(size, spec.measurementOverrides);
  const drafted: DraftedPiece[] = [];
  let armholeLenCm: number | undefined;

  if (spec.tipo === "blusa" || spec.tipo === "vestido") {
    const { frente, costas, armholeLenCm: a } = draftCorpo(measurements, spec.style);
    armholeLenCm = a;
    drafted.push(frente, costas);
    const manga = draftManga(measurements, spec.style, a);
    if (manga) drafted.push(manga);
  }
  if (spec.tipo === "saia" || spec.tipo === "vestido") {
    drafted.push(draftSaia(measurements, spec.style));
  }

  const { pieces, viewBox } = autoLayout(drafted, 8, ["corpo-frente", "corpo-costas", "manga"]);
  return { pieces, viewBox, measurements, armholeLenCm };
}
```

- [ ] **Step 4: Rodar testes** — `npm test` PASS; build/lint limpos.

- [ ] **Step 5: Commit**

```bash
git add lib/draft/garment.ts lib/draft/garment.test.ts
git commit -m "feat: composição do vestuário (draftGarment) + validação/clamp da spec"
```

---

### Task 7: Ligar backend ao fluxo spec-based (mock-data + IA + rota)

**Files:**
- Modify: `lib/mock-data.ts`
- Modify: `lib/ai.ts`
- Modify: `app/api/pattern/generate/route.ts`
- Test: `lib/draft/garment.test.ts` (adicionar caso de aplicação via mock-data) — ou novo `lib/mock-data.test.ts`

**Interfaces:**
- Consumes: `draftGarment`, `validateSpec`, `seamCheck`.
- Produces (mock-data): `applyGarmentSpec(spec: GarmentSpec): { conflict: ConflictInfo | null }` — resolve tamanho-base do pattern, chama `draftGarment`, grava `pieces`/`viewBox`/`spec`/`baseMeasurements`, e calcula conflito via `seamCheck` (markers dos pontos reais da cava). `getSpec(): GarmentSpec`.
- Produces (ai): `proposeGarment(state): Promise<{ decision: "apply" | "decline"; spec?: GarmentSpec; declineReason?: string; assistantMessage: string }>`.

- [ ] **Step 1: Novo `mock-data.ts` — estado com spec/measurements**

- `seedPattern()`: continua em branco (`version: 0`, `pieces: []`), `spec: { tipo: "blusa", measurementOverrides: {}, style: {} }` como base neutra, `baseMeasurements: resolveMeasurements(baseSize, {})`, `viewBox: { w: 620, h: 380 }`.
- Adicionar `applyGarmentSpec` (não importar `seamCheck` aqui — no primeiro corte a copa deriva da cava, então nunca há mismatch; `seamCheck` fica em `garment.ts` para evolução futura, e um export não usado não gera erro de lint, ao contrário de um import não usado):
```ts
export function applyGarmentSpec(spec: GarmentSpec): void {
  const size = state.pattern.baseSize;
  const { pieces, viewBox, measurements } = draftGarment(spec, size);
  // Conflito de costura fica desligado no primeiro corte: a copa da manga é
  // dimensionada a partir da cava do corpo, logo casam por construção.
  state.pattern = { ...state.pattern, pieces, viewBox, spec, baseMeasurements: measurements };
  state.conflict = null;
}
```
- Import em `mock-data.ts`: `import { draftGarment } from "@/lib/draft/garment";` (só isto do engine — nada de `seamCheck`).
- Remover do caminho ativo: `updatePieceParams`, `PIECE_META`, `PIECE_ORDER`, `buildConflict`/`LANDMARKS`, `makePiece` (não mais usados). Manter `addMessage/debit/refund/bumpVersion/applySizes/applyPurchase`.

- [ ] **Step 2: Novo `ai.ts` — tool spec-based**

- Substituir `TOOL` por `propose_garment` cujo `input_schema` reflete `GarmentSpec` (tipo enum; style com enums de decote/manga/saia e números; measurementOverrides como objeto de números com chaves de `Measurements`). `required: ["decision","assistantMessage"]`.
- `buildSystem(state)` inclui: tabela de medidas (JSON de `SIZE_TABLE`), a `spec` atual (`state.pattern.spec`), catálogo de estilos válidos, e a regra: molde vazio ⇒ gere a spec do zero; ajuste ⇒ devolva a spec inteira atualizada; pedido fora do escopo (calça, acessório etc.) ⇒ `decision:"decline"`.
- `proposeGarment` chama `claude-sonnet-5`, `tool_choice` forçado, lê `tool_use`, devolve `{ decision, spec: validateSpec(input.spec), ... }` (validação no servidor, não confiar na IA).

- [ ] **Step 3: Novo `generate/route.ts`**

Mesma casca de créditos (402 sem débito; débito; try; estorno em decline/erro). No sucesso: `applyGarmentSpec(decision.spec)`, `bumpVersion()`, `addMessage(ai)`, retorna `{ status: "ok" | "conflict", state }`. Decline: addMessage + refund + `{ status: "declined" }`.

- [ ] **Step 4: Teste de aplicação**

Em `lib/mock-data.test.ts` (novo), importar `getState/applyGarmentSpec/resetState` e verificar: aplicar `{tipo:"saia", style:{saia:"circulo"}}` cria 1 peça `saia`, `viewBox.w>0`, e `getState().pattern.pieces.length===1`. (Chamar `resetState()` antes.)

- [ ] **Step 5: Rodar testes + build + smoke curl**

`npm test` PASS; `npm run build`/`lint` limpos. Subir `npm run dev` e:
```bash
curl -s -XPOST localhost:3000/api/pattern/generate -H 'content-type: application/json' -d '{"message":"quero uma saia godê midi"}' | head -c 400
```
Esperado: `status:"ok"`, peça `saia` no state. (Requer `ANTHROPIC_API_KEY`.)

- [ ] **Step 6: Commit**

```bash
git add lib/mock-data.ts lib/ai.ts app/api/pattern/generate/route.ts lib/mock-data.test.ts
git commit -m "feat: fluxo spec-based (mock-data applyGarmentSpec + IA propose_garment + rota)"
```

---

### Task 8: Componentes — detalhes flexíveis + viewBox dinâmico

**Files:**
- Modify: `components/editor/PatternCanvas.tsx`
- Modify: `components/editor/CanvasArea.tsx` (passar viewBox)
- Modify: `components/editor/PieceDetailsPanel.tsx`
- Modify: `components/editor/FichaTecnicaTab.tsx`
- Modify: `components/editor/PlanoCorteTab.tsx` (consumo a partir de área/px, sem `details.consumo`)

**Interfaces:**
- Consumes: `pattern.viewBox`, `piece.detailRows`.

- [ ] **Step 1: `PatternCanvas` usa viewBox dinâmico**

Aceitar prop `viewBox: { w:number; h:number }` e usar `viewBox={\`0 0 ${w} ${h}\`}`. `CanvasArea` passa `pattern.viewBox ?? {w:620,h:380}`.

- [ ] **Step 2: `PieceDetailsPanel` renderiza `detailRows`**

Trocar as linhas fixas (folga/pence/cava/fio/consumo) por `piece.detailRows.map(...)`. Manter o bloco de graduação e o botão Graduar.

- [ ] **Step 3: `FichaTecnicaTab` genérica**

Como cada peça tem linhas próprias, renderizar por peça um mini-bloco "nome + tabela label/valor de `detailRows`" em vez das colunas fixas. Cabeçalho do pattern (nome/base/unidade) mantido.

- [ ] **Step 4: `PlanoCorteTab` consumo**

Estimar consumo por soma das áreas de bbox das peças × qty (aproximação), já que `details.consumo` não existe mais. Exibir em metros com fator simples documentado.

- [ ] **Step 5: Verificação visual (Playwright MCP)**

`npm run dev`; via MCP: molde em branco → "vestido evasê com manga curta e decote V" → 3–4 peças coerentes; "saia godê midi" (após reset) → peça de saia em leque; painel de detalhes mostra linhas específicas; abas Ficha/Plano sem erro. Ajustar constantes de bloco se alguma peça sair distorcida. `npm run build`/`lint` limpos.

- [ ] **Step 6: Commit**

```bash
git add components/editor/PatternCanvas.tsx components/editor/CanvasArea.tsx components/editor/PieceDetailsPanel.tsx components/editor/FichaTecnicaTab.tsx components/editor/PlanoCorteTab.tsx
git commit -m "feat: canvas com viewBox dinâmico + ficha de detalhes flexível"
```

---

### Task 9: Limpeza de código morto + CLAUDE.md

**Files:**
- Modify: `lib/geometry.ts` (remover se totalmente morto, ou reduzir a re-exports), `lib/types.ts` (remover `params` de `Piece`, `PieceDetails` antigo/`details`), `lib/store.ts` (remover `updatePieceParams`/GENERATION_STEPS "3 peças" se preso a 3), `lib/mock-data.ts` (remover restos)
- Modify: `CLAUDE.md`

**Interfaces:** nenhuma nova.

- [ ] **Step 1: Remover deltas/legado**

Após tudo migrado: remover `PIECE_PARAM_SCHEMA`, `defaultParams`, `clampParams`, `computeGeometry`, `deriveDetails`, `frente/costas/mangaGeometry` de `lib/geometry.ts` (apagar o arquivo se não sobrar nada exportado e ninguém importar). Remover `Piece.params` e `Piece.details`/`PieceDetails` fixo de `types.ts`; ajustar `core.ts` `place()` para não preencher `params`/`details`. Ajustar `GENERATION_STEPS` para texto genérico (não "3 peças").

- [ ] **Step 2: Build/lint/test verdes**

`npm run build`, `npm run lint`, `npm test` — tudo limpo. Corrigir quaisquer imports órfãos.

- [ ] **Step 3: Atualizar `CLAUDE.md`**

- Seção "There is no test suite configured" → agora há Vitest (`npm test`).
- "Pieces are parametric and computed" → reescrever para o engine por medidas: `Measurements` + `GarmentSpec` → `draftGarment` (blocos em `lib/draft/*`) → `Piece[]` + `viewBox`; a IA devolve `GarmentSpec` validada no servidor; graduação/override por tabela.
- Bullet do `generate` → fluxo spec-based (`proposeGarment` + `applyGarmentSpec`), conflito agora é `seamCheck` opcional.
- Comandos: adicionar `npm test`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: remover motor de deltas legado; CLAUDE.md descreve engine por medidas"
```

---

## Verificação final (whole-branch)

- `npm run build`, `npm run lint`, `npm test` limpos.
- Playwright MCP: em branco → gerar vestido (corpo+manga+saia coerentes), saia godê (leque com raio real), blusa decote V; ajuste por chat ("deixa a saia mais rodada", "manga longa") re-traça; pedido fora do escopo (ex.: "calça jeans") → decline com estorno de crédito.
- Editor abre em branco (v0) após restart.
- Nenhum resto de `params`/`PIECE_PARAM_SCHEMA`/`LANDMARKS` no código.
