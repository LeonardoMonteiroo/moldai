# Slopers reais + arquétipo camiseta — Plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Elevar o motor de modelagem a construção de sloper real (curvas só em decote/cava/copa; ombro, lateral, barra e centro retos; comprimento até o quadril) e adicionar o tipo `camiseta` (malha, gola redonda, manga montada) com tabela de medidas masculina selecionável por `sexo`.

**Architecture:** Drafters puros em cm (`lib/draft/*`) produzem `DraftedPiece` com um novo campo `curvedSpans` que marca quais trechos do contorno são curvos; `core.ts` desenha reta em cada aresta e Catmull-Rom só dentro dos spans. `garment.ts` orquestra a partir de uma `GarmentSpec` sempre revalidada por `validateSpec`. A IA (`ai.ts`) só devolve a spec; nunca geometria.

**Tech Stack:** TypeScript, Next.js 16 (App Router), Zustand, Vitest, Anthropic SDK (`claude-sonnet-5`).

## Global Constraints

- A IA **nunca** é confiada para geometria. `validateSpec` (`lib/draft/garment.ts`) é a fronteira de confiança: whitelist de todos os enums (`tipo`, `sexo`, `decote`, `manga`, `saia`) e clamp de todo campo numérico, **antes** de desenhar, independentemente do que o modelo devolveu.
- Modelo Anthropic exatamente `claude-sonnet-5`. `ANTHROPIC_API_KEY` só em `.env.local` (git-ignored); nunca commitar/imprimir.
- Curvas **somente** em decote, cava e copa da manga. Ombro, lateral, barra e linha de centro são **retos**. É o coração do fix — nada de suavizar contorno inteiro.
- `SCALE = 4` px/cm e o arredondamento de `PX` preservados.
- `sexo` default `"fem"`. `camiseta` = malha (`knit`): folga de vestir 0, decote redondo por padrão, sem pences, manga curta por padrão.
- Fluxo de créditos (debita-então-desenha, refund em falha, 402 sem saldo) **intocado**.
- Cada task termina com `npm test` verde. `npm run lint` e `npm run build` limpos no fim.
- Não confiar em `Date.now()`/aleatoriedade nos drafters (funções puras determinísticas).

---

## File Structure

- `lib/types.ts` — MODIFY: `GarmentType += "camiseta"`, `Sexo`, `GarmentSpec.sexo?`.
- `lib/measurements.ts` — MODIFY: recalibra `ombro` (fem), `SIZE_TABLE_MASC`, faixa de `ombro`, `resolveMeasurements(size, overrides, sexo)`.
- `lib/draft/core.ts` — MODIFY: `DraftedPiece.curvedSpans?`, `outlinePath`, `place`/`autoLayout` sem `curvedIds`.
- `lib/draft/corpo.ts` — REWRITE: sloper real + `BlockOpts` + `curvedSpans`.
- `lib/draft/manga.ts` — REWRITE: copa em sino + `curvedSpans` + `BlockOpts`.
- `lib/draft/saia.ts` — MODIFY: compatível com `curvedSpans`, cintura/barra dos radiais curvas.
- `lib/draft/garment.ts` — MODIFY: `validateSpec` (camiseta, sexo), `draftGarment` (BlockOpts, arquétipo camiseta, sexo).
- `lib/ai.ts` — MODIFY: schema/prompt com camiseta + sexo + tabela masculina.
- `lib/mock-data.ts` — MODIFY: seed `sexo`, `baseMeasurements` via sexo.
- `CLAUDE.md` — MODIFY: documenta camiseta + sexo + tabela masculina.
- Testes: `lib/**/*.test.ts` atualizados/criados junto de cada task.

---

## Task 1: Tipos — `camiseta` e `sexo`

**Files:**

- Modify: `lib/types.ts:9-28`

**Interfaces:**

- Produces: `GarmentType` inclui `"camiseta"`; `type Sexo = "fem" | "masc"`; `GarmentSpec.sexo?: Sexo`.

- [ ] **Step 1: Editar tipos**

Em `lib/types.ts`, trocar:

```ts
export type GarmentType = "blusa" | "vestido" | "saia" | "camiseta";
export type Sexo = "fem" | "masc";
```

e no `GarmentSpec` adicionar o campo (opcional para não quebrar literais existentes; `validateSpec` sempre o preenche em runtime):

```ts
export interface GarmentSpec {
  tipo: GarmentType;
  sexo?: Sexo;
  measurementOverrides: Record<string, number>;
  style: GarmentStyle;
}
```

- [ ] **Step 2: Rodar a suíte pra garantir que nada quebrou**

Run: `npm test`
Expected: PASS (mudança puramente aditiva de tipos).

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "feat(types): tipo camiseta e campo sexo na GarmentSpec"
```

---

## Task 2: Medidas — tabela masculina, `ombro` recalibrado, `resolveMeasurements(sexo)`

**Files:**

- Modify: `lib/measurements.ts`
- Test: `lib/measurements.test.ts`

**Interfaces:**

- Consumes: `Sexo` (Task 1).
- Produces: `SIZE_TABLE_MASC: Record<SizeLabel, Measurements>`; `resolveMeasurements(size, overrides, sexo?: Sexo)`; `ombro` = meia-largura do centro à ponta do ombro.

- [ ] **Step 1: Escrever/atualizar os testes (falhando)**

Substituir `lib/measurements.test.ts` por:

```ts
import { describe, it, expect } from "vitest";
import {
  SIZE_TABLE,
  SIZE_TABLE_MASC,
  MEASUREMENT_RANGES,
  resolveMeasurements,
} from "./measurements";

describe("size tables", () => {
  it("fem tem 5 tamanhos com graduação monotônica de busto/cintura/quadril", () => {
    const order = ["PP", "P", "M", "G", "GG"] as const;
    for (let i = 1; i < order.length; i++) {
      const a = SIZE_TABLE[order[i - 1]],
        b = SIZE_TABLE[order[i]];
      expect(b.busto).toBeGreaterThan(a.busto);
      expect(b.cintura).toBeGreaterThan(a.cintura);
      expect(b.quadril).toBeGreaterThan(a.quadril);
      expect(b.ombro).toBeGreaterThan(a.ombro);
    }
    expect(SIZE_TABLE.M.busto).toBe(92);
  });

  it("masc é mais largo no ombro que fem no mesmo tamanho", () => {
    expect(SIZE_TABLE_MASC.M.ombro).toBeGreaterThan(SIZE_TABLE.M.ombro);
    expect(SIZE_TABLE_MASC.M.busto).toBe(100);
  });

  it("resolve base do tamanho e aplica overrides (default fem)", () => {
    expect(resolveMeasurements("M", {}).cintura).toBe(74);
    expect(resolveMeasurements("M", { cintura: 68 }).cintura).toBe(68);
  });

  it("resolve pela tabela masculina quando sexo=masc", () => {
    expect(resolveMeasurements("M", {}, "masc").busto).toBe(100);
    expect(resolveMeasurements("M", {}, "fem").busto).toBe(92);
  });

  it("clampa ombro à nova faixa [14,26]", () => {
    expect(resolveMeasurements("M", { ombro: 99 }).ombro).toBe(
      MEASUREMENT_RANGES.ombro.max,
    );
    expect(resolveMeasurements("M", { ombro: 1 }).ombro).toBe(
      MEASUREMENT_RANGES.ombro.min,
    );
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- measurements`
Expected: FAIL (`SIZE_TABLE_MASC` indefinido, faixa de ombro antiga).

- [ ] **Step 3: Implementar**

Substituir a `SIZE_TABLE`, adicionar `SIZE_TABLE_MASC`, ajustar faixa e assinatura em `lib/measurements.ts`. Manter a `interface Measurements` como está (só a semântica de `ombro` muda). Import de `Sexo`:

```ts
import { SizeLabel, Sexo } from "./types";
```

```ts
export const SIZE_TABLE: Record<SizeLabel, Measurements> = {
  PP: {
    busto: 84,
    cintura: 66,
    quadril: 92,
    alturaQuadril: 20.0,
    comprimentoCostas: 40.0,
    ombro: 17.5,
    compSaia: 60,
    compMangaCurta: 18,
    compMangaLonga: 58,
  },
  P: {
    busto: 88,
    cintura: 70,
    quadril: 96,
    alturaQuadril: 20.3,
    comprimentoCostas: 40.5,
    ombro: 18.0,
    compSaia: 60,
    compMangaCurta: 18,
    compMangaLonga: 58,
  },
  M: {
    busto: 92,
    cintura: 74,
    quadril: 100,
    alturaQuadril: 20.6,
    comprimentoCostas: 41.0,
    ombro: 18.5,
    compSaia: 60,
    compMangaCurta: 18,
    compMangaLonga: 58,
  },
  G: {
    busto: 96,
    cintura: 78,
    quadril: 104,
    alturaQuadril: 21.0,
    comprimentoCostas: 41.5,
    ombro: 19.0,
    compSaia: 60,
    compMangaCurta: 18,
    compMangaLonga: 58,
  },
  GG: {
    busto: 100,
    cintura: 82,
    quadril: 108,
    alturaQuadril: 21.3,
    comprimentoCostas: 42.0,
    ombro: 19.5,
    compSaia: 60,
    compMangaCurta: 18,
    compMangaLonga: 58,
  },
};

export const SIZE_TABLE_MASC: Record<SizeLabel, Measurements> = {
  PP: {
    busto: 92,
    cintura: 80,
    quadril: 92,
    alturaQuadril: 21.0,
    comprimentoCostas: 43.0,
    ombro: 21.0,
    compSaia: 60,
    compMangaCurta: 22,
    compMangaLonga: 62,
  },
  P: {
    busto: 96,
    cintura: 84,
    quadril: 96,
    alturaQuadril: 21.3,
    comprimentoCostas: 43.5,
    ombro: 21.5,
    compSaia: 60,
    compMangaCurta: 22,
    compMangaLonga: 62,
  },
  M: {
    busto: 100,
    cintura: 88,
    quadril: 100,
    alturaQuadril: 21.6,
    comprimentoCostas: 44.0,
    ombro: 22.0,
    compSaia: 60,
    compMangaCurta: 22,
    compMangaLonga: 62,
  },
  G: {
    busto: 104,
    cintura: 92,
    quadril: 104,
    alturaQuadril: 22.0,
    comprimentoCostas: 44.5,
    ombro: 22.5,
    compSaia: 60,
    compMangaCurta: 22,
    compMangaLonga: 62,
  },
  GG: {
    busto: 108,
    cintura: 96,
    quadril: 108,
    alturaQuadril: 22.3,
    comprimentoCostas: 45.0,
    ombro: 23.0,
    compSaia: 60,
    compMangaCurta: 22,
    compMangaLonga: 62,
  },
};
```

Na `MEASUREMENT_RANGES`, trocar a linha do `ombro` para:

```ts
  ombro: { min: 14, max: 26 },
```

E a função:

```ts
export function resolveMeasurements(
  size: SizeLabel,
  overrides: Partial<Measurements>,
  sexo: Sexo = "fem",
): Measurements {
  const base = { ...(sexo === "masc" ? SIZE_TABLE_MASC : SIZE_TABLE)[size] };
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

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- measurements`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/measurements.ts lib/measurements.test.ts
git commit -m "feat(measurements): tabela masculina, ombro como meia-largura, resolveMeasurements(sexo)"
```

---

## Task 3: Core — contorno por segmentos (`curvedSpans` + `outlinePath`)

**Files:**

- Modify: `lib/draft/core.ts`
- Modify: `lib/draft/garment.ts:65` (remover `curvedIds` da chamada de `autoLayout`)
- Test: `lib/draft/core.test.ts`

**Interfaces:**

- Produces: `DraftedPiece.curvedSpans?: [number, number][]`; `outlinePath(ptsCm: Pt[], curvedSpans?: [number, number][]): PieceOutline`; `autoLayout(drafted, gapCm?)` (sem `curvedIds`). `place` interno usa `dp.curvedSpans`.
- Consumes: nada novo.

Semântica de `curvedSpans`: cada `[a, b]` marca que as arestas cobrindo os vértices de índice `a` até `b` (inclusive) são curvas. Uma aresta `i → (i+1) mod n` é curva sse existe span com `i >= a` e `i+1 <= b`; `b` pode valer `n` (número de vértices) para incluir a aresta de fechamento `n-1 → 0`. Fora de qualquer span: reta.

- [ ] **Step 1: Reescrever os testes de core (falhando)**

Substituir o `describe("smoothPath", ...)` de `lib/draft/core.test.ts` — trocar o import e o bloco de smoothPath. Novo arquivo:

```ts
import { describe, it, expect } from "vitest";
import { autoLayout, bbox, polyPath, outlinePath, DraftedPiece } from "./core";

const rect = (id: string, w: number, h: number): DraftedPiece => ({
  id,
  name: id,
  qty: 1,
  outlineCm: [
    [0, 0],
    [w, 0],
    [w, h],
    [0, h],
  ],
  detailRows: [],
});

describe("core drafting", () => {
  it("bbox mede a peça", () => {
    expect(
      bbox([
        [2, 3],
        [10, 3],
        [10, 20],
      ]),
    ).toEqual({ minX: 2, minY: 3, maxX: 10, maxY: 20, w: 8, h: 17 });
  });

  it("polyPath fecha o polígono", () => {
    expect(
      polyPath([
        [0, 0],
        [1, 0],
        [1, 1],
      ]).kind,
    ).toBe("polygon");
  });

  it("autoLayout empilha peças lado a lado e calcula viewBox > 0", () => {
    const { pieces, viewBox } = autoLayout(
      [rect("a", 10, 20), rect("b", 30, 40)],
      5,
    );
    expect(pieces).toHaveLength(2);
    expect(viewBox.w).toBeGreaterThan(0);
    expect(viewBox.h).toBeGreaterThan(0);
    const ax = (pieces[0].outline as { points: string }).points.split(" ")[0];
    const bx = (pieces[1].outline as { points: string }).points.split(" ")[0];
    expect(parseFloat(bx)).toBeGreaterThan(parseFloat(ax));
  });

  describe("outlinePath", () => {
    it("sem spans: só retas (L), nenhum C, fecha com Z", () => {
      const o = outlinePath(
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
        [],
      ) as { kind: "path"; d: string };
      expect(o.kind).toBe("path");
      expect(o.d).not.toMatch(/C/);
      expect(o.d).toMatch(/L/);
      expect(o.d).toMatch(/Z$/);
    });

    it("com span: as arestas do span viram C; as de fora seguem L", () => {
      // quadrado; curva só a aresta entre v1 e v2 (span [1,2])
      const o = outlinePath(
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
        ],
        [[1, 2]],
      ) as { kind: "path"; d: string };
      expect(o.d).toMatch(/C/);
      expect(o.d).toMatch(/L/);
      expect(o.d).toMatch(/Z$/);
    });

    it("span de fechamento [k,n] curva a aresta que volta ao vértice 0", () => {
      const pts: [number, number][] = [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ];
      const o = outlinePath(pts, [[3, 4]]) as { kind: "path"; d: string };
      // 4 vértices; span [3,4] cobre a aresta 3->0 (fechamento)
      expect(o.d).toMatch(/C[^Z]*Z$/);
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- core`
Expected: FAIL (`outlinePath` não existe).

- [ ] **Step 3: Implementar em `lib/draft/core.ts`**

Trocar `DraftedPiece` para incluir `curvedSpans?`:

```ts
export interface DraftedPiece {
  id: string;
  name: string;
  qty: number;
  outlineCm: Pt[];
  curvedSpans?: [number, number][];
  guideCm?: Pt[];
  grainlineCm?: [Pt, Pt];
  dartCm?: Pt[];
  detailRows: DetailRow[];
  armholeLenCm?: number;
}
```

Substituir `smoothPath` por `outlinePath`:

```ts
// Desenha um contorno fechado: reta (L) em cada aresta, exceto nas arestas
// cobertas por um curvedSpan, onde emite Catmull-Rom->Bézier com as tangentes
// travadas nas bordas do span (não puxa para os pontos retos vizinhos).
export function outlinePath(
  ptsCm: Pt[],
  curvedSpans: [number, number][] = [],
): PieceOutline {
  const p = ptsCm.map(([x, y]) => [PX(x), PX(y)] as Pt);
  const n = p.length;
  if (n < 3) return polyPath(ptsCm);
  const at = (i: number) => p[(i + n) % n];
  const spanFor = (i: number) =>
    curvedSpans.find(([a, b]) => i >= a && i + 1 <= b);
  let d = `M${at(0)[0].toFixed(1)} ${at(0)[1].toFixed(1)} `;
  for (let i = 0; i < n; i++) {
    const p1 = at(i),
      p2 = at(i + 1);
    const span = spanFor(i);
    if (!span) {
      d += `L${p2[0].toFixed(1)} ${p2[1].toFixed(1)} `;
      continue;
    }
    const [a, b] = span;
    const p0 = i === a ? p1 : at(i - 1);
    const p3 = i + 1 === b ? p2 : at(i + 2);
    const c1x = p1[0] + (p2[0] - p0[0]) / 6,
      c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6,
      c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)} `;
  }
  d += "Z";
  return { kind: "path", d: d.trim() };
}
```

Trocar `place` para escolher o desenho pelos spans da própria peça e remover o parâmetro `curved`:

```ts
function place(dp: DraftedPiece, dxPx: number, dyPx: number): Piece {
  const spans = dp.curvedSpans ?? [];
  const outline = spans.length
    ? outlinePath(dp.outlineCm, spans)
    : polyPath(dp.outlineCm);
  const piece: Piece = {
    id: dp.id,
    name: dp.name,
    qty: dp.qty,
    outline: translateOutline(outline, dxPx, dyPx),
    detailRows: dp.detailRows,
    label: { x: dxPx + 6, y: dyPx + PX(bbox(dp.outlineCm).h) - 6 },
  };
  if (dp.guideCm)
    piece.guideOutline = translateOutline(polyPath(dp.guideCm), dxPx, dyPx);
  if (dp.grainlineCm) {
    const [[x1, y1], [x2, y2]] = dp.grainlineCm;
    piece.grainline = {
      x1: PX(x1) + dxPx,
      y1: PX(y1) + dyPx,
      x2: PX(x2) + dxPx,
      y2: PX(y2) + dyPx,
    };
  }
  if (dp.dartCm && dp.dartCm.length >= 3) {
    const dd = (polyPath(dp.dartCm) as { points: string }).points
      .split(" ")
      .map((pp) => pp.split(",").map(Number));
    const [aa, bb, cc] = dd;
    piece.dart = {
      d: `M${aa[0] + dxPx} ${aa[1] + dyPx} L${bb[0] + dxPx} ${bb[1] + dyPx} L${cc[0] + dxPx} ${cc[1] + dyPx} Z`,
    };
  }
  return piece;
}
```

Trocar `autoLayout` para remover `curvedIds`:

```ts
export function autoLayout(
  drafted: DraftedPiece[],
  gapCm = 8,
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
    pieces.push(place(dp, dx, dy));
    cursorX += PX(b.w) + gap;
    maxH = Math.max(maxH, PX(b.h));
  }
  return {
    pieces,
    viewBox: {
      w: Math.round(cursorX - gap + pad),
      h: Math.round(maxH + pad * 2),
    },
  };
}
```

- [ ] **Step 4: Ajustar o único consumidor de `curvedIds`**

Em `lib/draft/garment.ts:65`, trocar:

```ts
const { pieces, viewBox } = autoLayout(drafted, 8, [
  "corpo-frente",
  "corpo-costas",
  "manga",
]);
```

por:

```ts
const { pieces, viewBox } = autoLayout(drafted, 8);
```

- [ ] **Step 5: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS. (Após esta task, as peças de corpo/manga renderizam como polígonos retos dos pontos antigos — sem curva, sem balão — até serem reescritas nas Tasks 4-5.)

- [ ] **Step 6: Commit**

```bash
git add lib/draft/core.ts lib/draft/garment.ts lib/draft/core.test.ts
git commit -m "feat(core): contorno por curvedSpans (outlinePath), fim da suavização global"
```

---

## Task 4: Corpo — sloper real (frente/costas)

**Files:**

- Rewrite: `lib/draft/corpo.ts`
- Test: `lib/draft/corpo.test.ts`

**Interfaces:**

- Consumes: `Measurements`, `resolveMeasurements` (Task 2); `DraftedPiece`, `Pt` (Task 3).
- Produces: `interface BlockOpts { sexo: Sexo; knit: boolean; lengthCm: number }`; `draftCorpo(m, style, opts?: BlockOpts): { frente: DraftedPiece; costas: DraftedPiece; armholeLenCm: number }`. `opts` opcional com defaults `{ sexo:"fem", knit:false, lengthCm: comprimentoCostas + alturaQuadril + 5 }`.

- [ ] **Step 1: Escrever os testes (falhando)**

Substituir `lib/draft/corpo.test.ts` por:

```ts
import { describe, it, expect } from "vitest";
import { resolveMeasurements } from "@/lib/measurements";
import { draftCorpo, BlockOpts } from "./corpo";
import { bbox, Pt } from "./core";

const M = resolveMeasurements("M", {});
const optsM: BlockOpts = {
  sexo: "fem",
  knit: false,
  lengthCm: M.comprimentoCostas + M.alturaQuadril + 5,
};

// menor y central = base do decote (frente/costas)
const neckDrop = (pts: Pt[]) => {
  const b = bbox(pts);
  const cx = (b.minX + b.maxX) / 2;
  const central = pts.filter(
    (p) => Math.abs(p[0] - cx) < b.w * 0.2 && p[1] < b.h * 0.5,
  );
  return Math.max(...central.map((p) => p[1]));
};

describe("draftCorpo sloper", () => {
  it("escala a largura com o busto", () => {
    const small = draftCorpo(resolveMeasurements("PP", {}), {});
    const big = draftCorpo(resolveMeasurements("GG", {}), {});
    expect(bbox(big.frente.outlineCm).w).toBeGreaterThan(
      bbox(small.frente.outlineCm).w,
    );
  });

  it("ombro tem caimento (ponta do ombro abaixo da HPS)", () => {
    const { frente } = draftCorpo(M, {}, optsM);
    const b = bbox(frente.outlineCm);
    const cx = (b.minX + b.maxX) / 2;
    // HPS: ponto mais alto perto do centro; ponta do ombro: ponto alto mais afastado
    const near = frente.outlineCm.filter(
      (p) => Math.abs(p[0] - cx) < b.w * 0.25,
    );
    const far = frente.outlineCm.filter((p) => Math.abs(p[0] - cx) > b.w * 0.3);
    const hpsY = Math.min(...near.map((p) => p[1]));
    const shoulderTipY = Math.min(...far.map((p) => p[1]));
    expect(shoulderTipY).toBeGreaterThan(hpsY);
  });

  it("comprimento chega ao quadril (blusa/camiseta)", () => {
    const { frente } = draftCorpo(M, {}, optsM);
    expect(bbox(frente.outlineCm).h).toBeCloseTo(optsM.lengthCm, 0);
  });

  it("decote frente mais fundo que costas; V > redondo > reto", () => {
    const reto = draftCorpo(M, { decote: "reto" }, optsM);
    const red = draftCorpo(M, { decote: "redondo" }, optsM);
    const v = draftCorpo(M, { decote: "V", decoteProfundidadeCm: 8 }, optsM);
    expect(neckDrop(v.frente.outlineCm)).toBeGreaterThan(
      neckDrop(v.costas.outlineCm),
    );
    expect(neckDrop(v.frente.outlineCm)).toBeGreaterThan(
      neckDrop(red.frente.outlineCm),
    );
    expect(neckDrop(red.frente.outlineCm)).toBeGreaterThan(
      neckDrop(reto.frente.outlineCm),
    );
  });

  it("marca decote e cava como curvedSpans", () => {
    const { frente } = draftCorpo(M, {}, optsM);
    expect((frente.curvedSpans ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("expõe comprimento de cava casável", () => {
    expect(draftCorpo(M, {}, optsM).armholeLenCm).toBeGreaterThan(10);
  });

  it("gera pence quando pences=true (não-knit)", () => {
    expect(
      draftCorpo(M, { pences: true }, optsM).frente.dartCm?.length,
    ).toBeGreaterThanOrEqual(3);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- corpo`
Expected: FAIL (`BlockOpts`/nova assinatura não existem).

- [ ] **Step 3: Reescrever `lib/draft/corpo.ts`**

```ts
import { Measurements } from "@/lib/measurements";
import { DetailRow, GarmentStyle, Sexo } from "@/lib/types";
import { DraftedPiece, Pt } from "./core";

const cm = (v: number) => `${v.toFixed(1).replace(".", ",")} cm`;

export interface BlockOpts {
  sexo: Sexo;
  knit: boolean;
  lengthCm: number;
}

function defaultOpts(m: Measurements): BlockOpts {
  return {
    sexo: "fem",
    knit: false,
    lengthCm: m.comprimentoCostas + m.alturaQuadril + 5,
  };
}

// Traça uma peça de corpo inteira (meia-peça espelhada em torno de cx) com
// curvas só em decote e cava. `frontish` controla a profundidade do decote.
function bodice(
  m: Measurements,
  style: GarmentStyle,
  opts: BlockOpts,
  id: string,
  name: string,
  frontish: boolean,
): { piece: DraftedPiece; armholeLenCm: number } {
  const folga = style.folgaCosturaCm ?? 1;
  const folgaVestir = opts.knit ? 0 : 2;
  const halfChest = m.busto / 4 + folgaVestir;
  const armholeDepth = m.busto / 8 + (opts.sexo === "masc" ? 10.5 : 9.5);
  const caimentoOmbro = opts.sexo === "masc" ? 4.5 : 4.0;
  const neckHalf = m.busto / 14 + (opts.sexo === "masc" ? 0.8 : 0);
  const ombro = m.ombro;
  const len = opts.lengthCm;
  const hemHalf = m.quadril / 4 + folgaVestir;

  const backNeckDrop = 2.0;
  let frontNeckDrop: number;
  if (style.decote === "V")
    frontNeckDrop = neckHalf + Math.max(0, style.decoteProfundidadeCm ?? 6);
  else if (style.decote === "redondo")
    frontNeckDrop = neckHalf + (opts.knit ? 2.0 : 1.0);
  else frontNeckDrop = neckHalf * 0.7;
  const neckDrop = frontish ? frontNeckDrop : backNeckDrop;

  const fitted = !!style.pences && !opts.knit;
  const waistY = m.comprimentoCostas;
  const waistHalf = Math.max(
    halfChest - (m.quadril / 4 - m.cintura / 4),
    halfChest - 3,
  );

  const cx = Math.max(ombro, halfChest, hemHalf);
  const midArmY = caimentoOmbro + (armholeDepth - caimentoOmbro) * 0.55;
  const armCtrlX = (ombro + halfChest) / 2 - 1; // distância do centro

  const pts: Pt[] = [];
  const spans: [number, number][] = [];
  const push = (p: Pt) => (pts.push(p), pts.length - 1);

  const cf = push([cx, neckDrop]); // centro decote
  push([cx - neckHalf * 0.6, neckDrop * 0.55]); // ctrl decote esq
  const hpsL = push([cx - neckHalf, 0]); // HPS esq
  spans.push([cf, hpsL]); // decote esq (curvo)
  const shL = push([cx - ombro, caimentoOmbro]); // ombro esq (reta hpsL->shL)
  push([cx - armCtrlX, midArmY]); // ctrl cava esq
  const uaL = push([cx - halfChest, armholeDepth]); // axila esq
  spans.push([shL, uaL]); // cava esq (curva)
  if (fitted) push([cx - waistHalf, waistY]); // cintura esq
  push([cx - hemHalf, len]); // barra esq
  push([cx + hemHalf, len]); // barra dir (reta = barra)
  if (fitted) push([cx + waistHalf, waistY]); // cintura dir
  const uaR = push([cx + halfChest, armholeDepth]); // axila dir
  push([cx + armCtrlX, midArmY]); // ctrl cava dir
  const shR = push([cx + ombro, caimentoOmbro]); // ombro dir
  spans.push([uaR, shR]); // cava dir (curva)
  const hpsR = push([cx + neckHalf, 0]); // HPS dir (reta shR->hpsR)
  push([cx + neckHalf * 0.6, neckDrop * 0.55]); // ctrl decote dir
  spans.push([hpsR, pts.length]); // decote dir + fechamento (curvo)

  const armholeLenCm =
    Math.hypot(halfChest - ombro, armholeDepth - caimentoOmbro) * 1.08;

  const detailRows: DetailRow[] = [
    { label: "Folga de costura", value: cm(folga) },
    { label: "Largura (tórax)", value: cm(halfChest * 2) },
    { label: "Comprimento", value: cm(len) },
    { label: "Cava", value: cm(armholeLenCm) },
    { label: "Decote", value: style.decote ?? "reto" },
    { label: "Fio", value: "reto" },
  ];

  let dartCm: Pt[] | undefined;
  if (fitted) {
    const dartW = Math.max(1.5, (m.quadril / 4 - m.cintura / 4) * 0.5);
    dartCm = [
      [cx - dartW, waistY],
      [cx, waistY - 12],
      [cx + dartW, waistY],
    ];
    detailRows.splice(4, 0, { label: "Pence", value: cm(dartW * 2) });
  }

  const grainlineCm: [Pt, Pt] = [
    [cx, 3],
    [cx, len - 3],
  ];
  return {
    piece: {
      id,
      name,
      qty: 1,
      outlineCm: pts,
      curvedSpans: spans,
      grainlineCm,
      dartCm,
      detailRows,
      armholeLenCm,
    },
    armholeLenCm,
  };
}

export function draftCorpo(
  m: Measurements,
  style: GarmentStyle,
  opts: BlockOpts = defaultOpts(m),
) {
  const f = bodice(m, style, opts, "corpo-frente", "Frente", true);
  const c = bodice(m, style, opts, "corpo-costas", "Costas", false);
  return { frente: f.piece, costas: c.piece, armholeLenCm: f.armholeLenCm };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- corpo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/draft/corpo.ts lib/draft/corpo.test.ts
git commit -m "feat(corpo): sloper real com caimento de ombro, cava curva e comprimento no quadril"
```

---

## Task 5: Manga — copa em sino

**Files:**

- Rewrite: `lib/draft/manga.ts`
- Test: `lib/draft/manga.test.ts`

**Interfaces:**

- Consumes: `BlockOpts` (Task 4); `DraftedPiece`, `Pt` (Task 3).
- Produces: `draftManga(m, style, armholeLenCm, opts?: BlockOpts): DraftedPiece | null`. `opts` opcional (default `{ sexo:"fem", knit:false, lengthCm:0 }` — `lengthCm` não é usado pela manga).

- [ ] **Step 1: Atualizar os testes (falhando)**

Substituir `lib/draft/manga.test.ts` por:

```ts
import { describe, it, expect } from "vitest";
import { resolveMeasurements } from "@/lib/measurements";
import { draftManga } from "./manga";
import { bbox } from "./core";

const M = resolveMeasurements("M", {});

describe("draftManga copa em sino", () => {
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
  it("marca a copa como curvedSpan", () => {
    const mg = draftManga(M, { manga: "curta" }, 22)!;
    expect((mg.curvedSpans ?? []).length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- manga`
Expected: FAIL (falta `curvedSpans` / assinatura).

- [ ] **Step 3: Reescrever `lib/draft/manga.ts`**

```ts
import { Measurements } from "@/lib/measurements";
import { DetailRow, GarmentStyle } from "@/lib/types";
import { DraftedPiece, Pt } from "./core";
import { BlockOpts } from "./corpo";

const cm = (v: number) => `${v.toFixed(1).replace(".", ",")} cm`;

export function draftManga(
  m: Measurements,
  style: GarmentStyle,
  armholeLenCm: number,
  _opts: BlockOpts = { sexo: "fem", knit: false, lengthCm: 0 },
): DraftedPiece | null {
  if (style.manga === "sem" || !style.manga) return null;
  const bicep = armholeLenCm * 0.9;
  const capH = armholeLenCm / 3;
  const len = style.manga === "longa" ? m.compMangaLonga : m.compMangaCurta;
  const hemHalf = (bicep / 2) * (style.manga === "longa" ? 0.7 : 0.9);
  const cxTop = bicep / 2;

  // 0 axila esq -> 1 ctrl costas -> 2 topo -> 3 ctrl frente -> 4 axila dir (copa, curva)
  // 4 -> 5 barra dir (reta) -> 6 barra esq (reta) -> 0 (reta)
  const outlineCm: Pt[] = [
    [0, capH],
    [bicep * 0.2, capH * 0.3],
    [cxTop, 0],
    [bicep * 0.8, capH * 0.3],
    [bicep, capH],
    [cxTop + hemHalf, capH + len],
    [cxTop - hemHalf, capH + len],
  ];
  const curvedSpans: [number, number][] = [[0, 4]];
  const grainlineCm: [Pt, Pt] = [
    [cxTop, 3],
    [cxTop, capH + len - 3],
  ];
  const detailRows: DetailRow[] = [
    { label: "Tipo", value: style.manga === "longa" ? "longa" : "curta" },
    { label: "Comprimento", value: cm(capH + len) },
    { label: "Cava (copa)", value: cm(armholeLenCm) },
    { label: "Fio", value: "reto" },
  ];
  return {
    id: "manga",
    name: "Manga",
    qty: 2,
    outlineCm,
    curvedSpans,
    grainlineCm,
    detailRows,
    armholeLenCm,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- manga`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/draft/manga.ts lib/draft/manga.test.ts
git commit -m "feat(manga): copa em sino com curvedSpan, laterais e barra retas"
```

---

## Task 6: Saia — compatibilidade com `curvedSpans`

**Files:**

- Modify: `lib/draft/saia.ts`
- Test: `lib/draft/saia.test.ts` (garantir que ainda passa; adicionar asserção de span nos radiais)

**Interfaces:**

- Consumes: `DraftedPiece.curvedSpans` (Task 3).
- Produces: `draftSaia` inalterada na assinatura; radiais (circulo/gode/meia-roda) marcam cintura e barra como `curvedSpans`.

Correções de fidelidade da saia (godê ≠ círculo, evasê interpolado) seguem como follow-ups fora deste escopo.

- [ ] **Step 1: Ler o teste atual e adicionar asserção (falhando)**

Acrescentar a `lib/draft/saia.test.ts` um caso:

```ts
import { describe, it, expect } from "vitest";
import { resolveMeasurements } from "@/lib/measurements";
import { draftSaia } from "./saia";
import { bbox } from "./core";

const M = resolveMeasurements("M", {});

describe("draftSaia", () => {
  it("reta gera trapézio com 4 vértices e viewBox > 0", () => {
    const s = draftSaia(M, { saia: "reta" });
    expect(s.outlineCm.length).toBe(4);
    expect(bbox(s.outlineCm).w).toBeGreaterThan(0);
  });
  it("radial (circulo) marca cintura e barra como curvedSpans", () => {
    const s = draftSaia(M, { saia: "circulo" });
    expect((s.curvedSpans ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- saia`
Expected: FAIL (radial sem `curvedSpans`).

- [ ] **Step 3: Implementar spans no ramo radial de `lib/draft/saia.ts`**

No bloco `if (silhueta === "circulo" || ...)`, os pontos são `[...inner(0..steps), ...outer.reverse()(steps+1 pontos)]`. Marcar a cintura (índices `0..steps`) e a barra (`steps+1 .. 2*steps+1`) como curvas. Após montar `outlineCm`, retornar com `curvedSpans`:

```ts
const steps = 12; // igual ao usado em radialSkirt
const waistSpan: [number, number] = [0, steps];
const hemSpan: [number, number] = [steps + 1, 2 * steps + 1];
return {
  id: "saia",
  name: "Saia",
  qty: silhueta === "meia-roda" ? 1 : 2,
  outlineCm,
  curvedSpans: [waistSpan, hemSpan],
  grainlineCm: [
    [cxTop, 4],
    [cxTop, comp],
  ],
  detailRows,
};
```

(O `radialSkirt` usa `steps = 12`; manter esse valor sincronizado. A saia reta/evasê continua sem `curvedSpans` — trapézio reto.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- saia`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/draft/saia.ts lib/draft/saia.test.ts
git commit -m "feat(saia): cintura e barra dos radiais como curvedSpans"
```

---

## Task 7: Orquestração — `validateSpec` + `draftGarment` + arquétipo camiseta

**Files:**

- Modify: `lib/draft/garment.ts`
- Test: `lib/draft/garment.test.ts`

**Interfaces:**

- Consumes: `draftCorpo`/`BlockOpts` (Task 4), `draftManga` (Task 5), `draftSaia` (Task 6), `resolveMeasurements(sexo)` (Task 2), `Sexo`/`GarmentType` (Task 1).
- Produces: `validateSpec` aceita `camiseta` e `sexo`; `draftGarment(spec, size)` idem e aplica o arquétipo camiseta.

- [ ] **Step 1: Atualizar os testes (falhando)**

Substituir `lib/draft/garment.test.ts` por:

```ts
import { describe, it, expect } from "vitest";
import { validateSpec, draftGarment } from "./garment";

describe("validateSpec", () => {
  it("cai para defaults em enums inválidos e clampa faixas", () => {
    const s = validateSpec({
      tipo: "foo",
      sexo: "xx",
      style: { saia: "xxx", compSaiaCm: 999, decoteProfundidadeCm: -5 },
      measurementOverrides: { cintura: 70, hack: 1 },
    });
    expect(s.tipo).toBe("blusa");
    expect(s.sexo).toBe("fem");
    expect(s.style.saia).toBe("reta");
    expect(s.style.compSaiaCm).toBeLessThanOrEqual(120);
    expect(s.style.decoteProfundidadeCm).toBeGreaterThanOrEqual(0);
    expect(s.measurementOverrides.hack).toBeUndefined();
    expect(s.measurementOverrides.cintura).toBe(70);
  });
  it("aceita tipo camiseta e sexo masc", () => {
    const s = validateSpec({
      tipo: "camiseta",
      sexo: "masc",
      style: {},
      measurementOverrides: {},
    });
    expect(s.tipo).toBe("camiseta");
    expect(s.sexo).toBe("masc");
  });
  it("preserva zero válido em folgaCosturaCm", () => {
    expect(
      validateSpec({
        tipo: "saia",
        style: { folgaCosturaCm: 0 },
        measurementOverrides: {},
      }).style.folgaCosturaCm,
    ).toBe(0);
  });
  it("clampa zero inválido em compSaiaCm para limite inferior", () => {
    expect(
      validateSpec({
        tipo: "saia",
        style: { compSaiaCm: 0 },
        measurementOverrides: {},
      }).style.compSaiaCm,
    ).toBe(25);
  });
  it("usa default para valores não-finitos", () => {
    expect(
      validateSpec({
        tipo: "saia",
        style: { compSaiaCm: "xxx" as unknown as number },
        measurementOverrides: {},
      }).style.compSaiaCm,
    ).toBe(60);
  });
});

describe("draftGarment", () => {
  it("blusa gera frente, costas e manga", () => {
    const { pieces } = draftGarment(
      {
        tipo: "blusa",
        sexo: "fem",
        measurementOverrides: {},
        style: { manga: "curta", decote: "V" },
      },
      "M",
    );
    expect(pieces.map((p) => p.id).sort()).toEqual([
      "corpo-costas",
      "corpo-frente",
      "manga",
    ]);
  });
  it("camiseta gera frente/costas/manga, sem pence, decote redondo", () => {
    const { pieces } = draftGarment(
      { tipo: "camiseta", sexo: "masc", measurementOverrides: {}, style: {} },
      "M",
    );
    const ids = pieces.map((p) => p.id).sort();
    expect(ids).toEqual(["corpo-costas", "corpo-frente", "manga"]);
    const frente = pieces.find((p) => p.id === "corpo-frente")!;
    expect(frente.dart).toBeUndefined();
    expect(frente.detailRows.some((r) => /redondo/i.test(r.value))).toBe(true);
  });
  it("saia gera só a peça de saia e viewBox > 0", () => {
    const { pieces, viewBox } = draftGarment(
      {
        tipo: "saia",
        sexo: "fem",
        measurementOverrides: {},
        style: { saia: "gode" },
      },
      "M",
    );
    expect(pieces.map((p) => p.id)).toEqual(["saia"]);
    expect(viewBox.w).toBeGreaterThan(0);
  });
  it("vestido combina corpo + saia", () => {
    const { pieces } = draftGarment(
      {
        tipo: "vestido",
        sexo: "fem",
        measurementOverrides: {},
        style: { manga: "sem", saia: "evase" },
      },
      "M",
    );
    const ids = pieces.map((p) => p.id);
    expect(ids).toContain("saia");
    expect(ids).toContain("corpo-frente");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm test -- garment`
Expected: FAIL (`camiseta`/`sexo` não aceitos).

- [ ] **Step 3: Implementar em `lib/draft/garment.ts`**

Atualizar imports e enums:

```ts
import {
  MEASUREMENT_RANGES,
  Measurements,
  resolveMeasurements,
} from "@/lib/measurements";
import {
  Decote,
  GarmentSpec,
  GarmentStyle,
  GarmentType,
  MangaLen,
  SaiaSilhueta,
  Sexo,
  SizeLabel,
} from "@/lib/types";
import { autoLayout, DraftedPiece } from "./core";
import { BlockOpts, draftCorpo } from "./corpo";
import { draftManga } from "./manga";
import { draftSaia } from "./saia";

const TIPOS: GarmentType[] = ["blusa", "vestido", "saia", "camiseta"];
const SEXOS: Sexo[] = ["fem", "masc"];
const DECOTES: Decote[] = ["reto", "V", "redondo"];
const MANGAS: MangaLen[] = ["sem", "curta", "longa"];
const SAIAS: SaiaSilhueta[] = ["reta", "evase", "gode", "meia-roda", "circulo"];
```

No `return` de `validateSpec`, adicionar `sexo`:

```ts
return {
  tipo: pick(r.tipo, TIPOS, "blusa"),
  sexo: pick(r.sexo, SEXOS, "fem"),
  measurementOverrides: overrides,
  style: outStyle,
};
```

Reescrever `draftGarment`:

```ts
export function draftGarment(spec: GarmentSpec, size: SizeLabel) {
  const sexo: Sexo = spec.sexo ?? "fem";
  const measurements: Measurements = resolveMeasurements(
    size,
    spec.measurementOverrides,
    sexo,
  );
  const drafted: DraftedPiece[] = [];
  let armholeLenCm: number | undefined;

  const isCorpo =
    spec.tipo === "blusa" ||
    spec.tipo === "vestido" ||
    spec.tipo === "camiseta";
  if (isCorpo) {
    const knit = spec.tipo === "camiseta";
    const lengthCm =
      spec.tipo === "vestido"
        ? measurements.comprimentoCostas
        : measurements.comprimentoCostas + measurements.alturaQuadril + 5;
    const opts: BlockOpts = { sexo, knit, lengthCm };
    // Arquétipo camiseta: gola redonda, sem pences, manga curta por padrão.
    const style: GarmentStyle =
      spec.tipo === "camiseta"
        ? {
            ...spec.style,
            decote: spec.style.decote ?? "redondo",
            pences: false,
            manga: spec.style.manga ?? "curta",
          }
        : spec.style;
    const {
      frente,
      costas,
      armholeLenCm: a,
    } = draftCorpo(measurements, style, opts);
    armholeLenCm = a;
    drafted.push(frente, costas);
    const manga = draftManga(measurements, style, a, opts);
    if (manga) drafted.push(manga);
  }
  if (spec.tipo === "saia" || spec.tipo === "vestido") {
    drafted.push(draftSaia(measurements, spec.style));
  }

  const { pieces, viewBox } = autoLayout(drafted, 8);
  return { pieces, viewBox, measurements, armholeLenCm };
}
```

(`seamCheck` fica inalterada.)

- [ ] **Step 4: Rodar e ver passar**

Run: `npm test -- garment`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/draft/garment.ts lib/draft/garment.test.ts
git commit -m "feat(garment): valida camiseta/sexo e desenha o arquétipo camiseta"
```

---

## Task 8: IA — schema e prompt com camiseta + sexo

**Files:**

- Modify: `lib/ai.ts`

**Interfaces:**

- Consumes: `validateSpec` (Task 7), `SIZE_TABLE`/`SIZE_TABLE_MASC` (Task 2).
- Produces: ferramenta `propose_garment` com `tipo` incluindo `camiseta` e campo `sexo`; prompt distingue camiseta (malha) de blusa (tecido) e infere `sexo`.

Sem teste unitário: `ai.ts` faz chamada real à API (não exercitado por Vitest, consistente com o repo). A fronteira de confiança (`validateSpec`) já é coberta na Task 7. Verificação é manual (Task 10).

- [ ] **Step 1: Editar o schema da ferramenta**

Em `lib/ai.ts`, no `TOOL.input_schema.properties.spec.properties`, trocar o enum de `tipo` e adicionar `sexo`:

```ts
          tipo: { type: "string", enum: ["blusa", "vestido", "saia", "camiseta"] },
          sexo: { type: "string", enum: ["fem", "masc"], description: "Sexo/base de medidas. Infira de pistas como 'masculina'/'feminina'/'unissex'. Default fem." },
```

E incluir `sexo` no `required` do `spec`:

```ts
        required: ["tipo", "sexo", "measurementOverrides", "style"],
```

- [ ] **Step 2: Atualizar import e prompt**

Trocar o import de medidas:

```ts
import {
  MEASUREMENT_RANGES,
  SIZE_TABLE,
  SIZE_TABLE_MASC,
} from "@/lib/measurements";
```

No `buildSystem`, atualizar as linhas de descrição e a tabela:

```ts
    "A GarmentSpec tem: tipo (blusa | vestido | saia | camiseta); sexo (fem | masc); measurementOverrides (medidas do corpo em cm, sobrepõem a tabela de tamanhos); style (decote, decoteProfundidadeCm, manga, saia, compSaiaCm, pences, folgaCosturaCm).",
    "camiseta = peça de malha (gola redonda, manga montada curta por padrão, sem pences, caimento justo); blusa = tecido plano (pode ter pences, decote reto/V/redondo). Escolha camiseta para t-shirt/camiseta e blusa para blusa/camisa social.",
    "Catálogo de estilos válidos: decote em reto|V|redondo; manga em sem|curta|longa; saia (silhueta) em reta|evase|gode|meia-roda|circulo.",
    "Infira sexo do pedido ('masculina'->masc, 'feminina'->fem, sem pista->fem).",
```

e trocar o bloco da tabela de tamanhos por ambas:

```ts
    "Tabela de tamanhos feminina (cm):",
    JSON.stringify(SIZE_TABLE),
    "Tabela de tamanhos masculina (cm):",
    JSON.stringify(SIZE_TABLE_MASC),
```

- [ ] **Step 3: Sanidade de tipos/lint**

Run: `npm run lint`
Expected: sem erros novos em `lib/ai.ts`.

- [ ] **Step 4: Commit**

```bash
git add lib/ai.ts
git commit -m "feat(ai): schema e prompt distinguem camiseta/blusa e inferem sexo"
```

---

## Task 9: Mock/estado + CLAUDE.md

**Files:**

- Modify: `lib/mock-data.ts`
- Modify: `CLAUDE.md`
- Test: `lib/mock-data.test.ts` (garantir verde; adicionar caso camiseta)

**Interfaces:**

- Consumes: `resolveMeasurements(sexo)` (Task 2), `applyGarmentSpec`/`draftGarment` (Task 7).
- Produces: seed com `sexo: "fem"`; `baseMeasurements` coerente com `sexo`.

- [ ] **Step 1: Ler `lib/mock-data.ts` e localizar `seedPattern`/`applyGarmentSpec`**

Verificar onde o `spec` inicial e `baseMeasurements` são montados.

- [ ] **Step 2: Atualizar o teste (falhando se aplicável)**

Acrescentar a `lib/mock-data.test.ts`:

```ts
it("drafts a camiseta masculina from a spec", () => {
  resetState();
  applyGarmentSpec({
    tipo: "camiseta",
    sexo: "masc",
    measurementOverrides: {},
    style: {},
  });
  const state = getState();
  const ids = state.pattern.pieces.map((p) => p.id).sort();
  expect(ids).toEqual(["corpo-costas", "corpo-frente", "manga"]);
  expect(state.pattern.spec!.sexo).toBe("masc");
});
```

- [ ] **Step 3: Implementar**

No `seedPattern`, garantir que o `spec` inicial inclua `sexo: "fem"` e que `baseMeasurements` use `resolveMeasurements(size, {}, "fem")`. No `applyGarmentSpec`, passar `spec.sexo ?? "fem"` onde `resolveMeasurements`/`draftGarment` forem chamados (draftGarment já lê `spec.sexo` internamente após a Task 7; garantir que `baseMeasurements` guardado use o mesmo `sexo`).

Exemplo do ponto de gravação (ajustar aos nomes reais no arquivo):

```ts
const sexo = spec.sexo ?? "fem";
const { pieces, viewBox, measurements } = draftGarment(
  spec,
  state.pattern.baseSize,
);
state.pattern.spec = spec;
state.pattern.pieces = pieces;
state.pattern.viewBox = viewBox;
state.pattern.baseMeasurements = measurements; // já resolvido com o sexo certo
```

- [ ] **Step 4: Rodar a suíte inteira**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Atualizar CLAUDE.md**

Na seção **Architecture**, onde descreve `GarmentSpec` e o motor de modelagem, registrar: (a) `GarmentType` agora inclui `camiseta`; (b) `GarmentSpec` tem `sexo` (`fem|masc`) que escolhe entre `SIZE_TABLE` e `SIZE_TABLE_MASC`; (c) o contorno de cada peça é desenhado por `curvedSpans` (curvas só em decote/cava/copa; resto reto), não mais por suavização global; (d) `ombro` é meia-largura do centro à ponta do ombro. Ajustar a frase sobre `draftManga`/`autoLayout` para refletir a ausência de `curvedIds`.

- [ ] **Step 6: Commit**

```bash
git add lib/mock-data.ts lib/mock-data.test.ts CLAUDE.md
git commit -m "feat(mock): seed com sexo; docs de camiseta/sexo/curvedSpans no CLAUDE.md"
```

---

## Task 10: Verificação final

**Files:** nenhum (só verificação).

- [ ] **Step 1: Suíte + lint + build**

Run: `npm test && npm run lint && npm run build`
Expected: tudo verde/limpo.

- [ ] **Step 2: Verificação manual (dev)**

`npm run dev`, no chat pedir "camiseta masculina M":

- frente/costas com **centro reto**, **decote redondo raso**, **ombro reto com leve caimento**, **cava curva**, **lateral reta**, **barra reta**, **comprimento até o quadril**;
- manga curta com **copa em sino** (topo curvo, laterais e barra retas);
- sem balão em nenhuma peça.

Pedir "blusa feminina com pences": corpo afunila na cintura (pence), decote conforme o estilo.

- [ ] **Step 3: (sem commit)** Seguir para `superpowers:finishing-a-development-branch`.

---

## Self-Review (autor)

- **Cobertura do spec:** contorno por segmentos (Task 3), sloper real frente/costas (Task 4), copa em sino (Task 5), saia compatível (Task 6), camiseta + sexo + tabela masculina (Tasks 1/2/7), IA (Task 8), mock/docs (Task 9). ✔
- **Placeholders:** nenhum "TODO"; todo passo de código traz o código. ✔
- **Consistência de tipos:** `BlockOpts` definido na Task 4 e consumido nas Tasks 5/7; `Sexo` na Task 1 e usado em 2/7/8; `curvedSpans` na Task 3 e consumido em 4/5/6; `outlinePath` na Task 3. `resolveMeasurements(size, overrides, sexo?)` consistente entre 2/7/9. `autoLayout` perde `curvedIds` na Task 3 e o único chamador é ajustado no mesmo passo. ✔
- **Verde por task:** params novos são opcionais (`opts?`, `sexo?`) para não quebrar chamadas/literais existentes entre tasks. ✔
