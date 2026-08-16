# Export do molde — roadmap / checklist de fases

Feature: export real do molde no editor. Spec:
`docs/superpowers/specs/2026-08-16-export-molde-design.md`.
Cada fase é shippable e revisável sozinha; o `ExportModel` e a fachada
`exportPattern` já foram desenhados pra receber as fases 2/3 sem refactor.

---

## ✅ Fase 1 — Núcleo + SVG 1:1 (mergeada em `main`, cc2b9b0)

- [x] `draftPiecesCm(spec, size)` exposto em `lib/draft/garment.ts` (cm exatos, sem regressão no `draftGarment`)
- [x] `ExportModel` + `outlineSegments` + `buildExportModel` (`lib/export/model.ts`)
- [x] Serializer `toSvg` 1:1 em mm (`lib/export/svg.ts`, `MM=10`)
- [x] `download.ts` + fachada `exportPattern` (`lib/export/index.ts`)
- [x] Menu de formato no `Footer` (SVG), desabilitado em conflito/vazio/sem-spec
- [x] Doc no `CLAUDE.md`
- [x] Review de branch inteira (opus): Ready to merge = Yes; suíte 72/72

### Pendências herdadas da Fase 1 (não bloqueiam — dobrar na Fase 2 ou fazer avulso)

- [ ] **Verificação manual (Step 3 da Task 6):** `npm run dev` → gerar molde → "Exportar" → SVG → abrir no Inkscape e confirmar 1:1 (aresta conhecida bate em cm)
- [ ] Minor: `escapeXml` não neutraliza `--` dentro do comentário `<!-- -->` (patternName com `--` gera XML de comentário tecnicamente malformado). Fix: mover a anotação pra `<title>`/`<desc>` (já cobertos por `escapeXml`) ou colapsar `-` no comentário
- [ ] Minor: caminho `seamAllowanceCm === null` (`?? 0` no header do SVG) não coberto por teste (inalcançável em produção, código defensivo)
- [ ] Minor: reclicar o gatilho "Exportar" com o menu aberto fecha via backdrop em vez de alternar (UX cosmética)
- [ ] Minor: `exportPattern` no-op silencioso para formato não tratado — trocar o `if (format === "svg")` por `switch` exaustivo com default `never` quando um 2º formato entrar (vira erro de compilação, não silêncio)

---

## ⬜ Fase 2 — DXF (AAMA/ASTM), padrão CAD/Audaces

Objetivo: `lib/export/dxf.ts` → `toDxf(model: ExportModel): string`; importa no
Audaces/Gerber/Lectra mantendo escala. Tamanho base só (sem grade graduada).

- [ ] Brainstorm/spec curta da Fase 2 (decisões: quantos segmentos por curva no achatamento; quais camadas; ASCII DXF mínimo vs. biblioteca)
- [ ] Plano de implementação (writing-plans) a partir da spec
- [ ] Achatar cada `cubic` do `ExportModel` em polilinha por amostragem (N segmentos/curva) — helper testável isolado
- [ ] `toDxf`: `LWPOLYLINE` fechada por contorno; unidade mm (coords × 10); cabeçalho `$INSUNITS = 4` (mm)
- [ ] Camadas por tipo de linha: contorno / grainline / texto-anotação
- [ ] Adicionar `"dxf"` a `ExportFormat` e ao menu do `Footer`; converter o dispatch de `exportPattern` para `switch`/`never` (resolve o Minor da Fase 1)
- [ ] Testes: contém `LWPOLYLINE`, `$INSUNITS` mm, N vértices por curva achatada, camadas nomeadas
- [ ] Verificação manual: importar o `.dxf` no Audaces (ou visualizador DXF) e conferir escala/peças
- [ ] Review + merge

---

## ⬜ Fase 3 — PDF tiling (impressão caseira, estilo Molde.me)

Objetivo: `lib/export/pdf.ts` → `toPdf(model: ExportModel): Uint8Array`; peça
real fatiada em A4 com marcas de colagem e régua de calibração.

- [ ] Brainstorm/spec curta da Fase 3 (decisões: A4 retrato vs. A0; margem de colagem; conteúdo da régua)
- [ ] Plano de implementação (writing-plans)
- [ ] Adicionar dependência `pdf-lib` (única dep nova do feature inteiro)
- [ ] Lógica de tiling: fatiar o sheet (mm) em páginas A4 com sobreposição de colagem + numeração linha/coluna
- [ ] Quadrado-régua de calibração de 5 cm na 1ª folha (confere escala na impressão)
- [ ] Desenhar contorno (linhas + Bézier via `drawSvgPath`/linhas), fio, dart, rótulos
- [ ] Adicionar `"pdf"` a `ExportFormat` e ao menu do `Footer`
- [ ] Testes: PDF válido (magic `%PDF`), nº de páginas = tiles esperados, presença da régua de calibração
- [ ] Verificação manual: imprimir em A4 e medir o quadrado (5 cm)
- [ ] Review + merge

---

## Fora de escopo (do feature de export como um todo)

- Offset de margem de costura (linha de corte = contorno + folga deslocada com tratamento de canto/curva) — recurso de geometria à parte
- Graduação multi-tamanho no arquivo (nest AAMA graduado) — depende de a graduação virar real primeiro
- PLT/HPGL — nicho, YAGNI
- Rota de servidor / persistência do arquivo — download client-side basta
