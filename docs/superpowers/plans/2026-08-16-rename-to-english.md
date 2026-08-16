# Subsistema 2 — Rename total para inglês — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Padronizar todo o código em inglês — identificadores, chaves do wire e valores de enum de domínio — mantendo texto de exibição e o idioma da IA em pt-BR, sem qualquer mudança de comportamento.

**Architecture:** Rename mecânico de símbolos compartilhados = espinha serial. Três tasks de rename por conceito (Measurements → GarmentSpec/enums/gender → ids-de-peça/funções-de-draft), cada uma atômica em todos os arquivos que a tocam e fechando com o gate verde; depois migração de reset e reescrita do CLAUDE.md (paralelizáveis entre si).

**Tech Stack:** TypeScript, Next 16, Prisma v6, Vitest. Gate do subsistema 1: `format:check` + `eslint app lib components` + `vitest run` + `next build`.

## Global Constraints

- **Zero mudança de comportamento/geometria/lógica/fluxo de crédito.** Só nomes mudam. O fluxo de crédito (débito→draft, refund em decline/clarify/erro, 402 sem débito e sem chamada de IA) fica idêntico.
- **Model id permanece EXATAMENTE `claude-sonnet-5`.** Segredos nunca commitados/impressos.
- **Trust boundary intacta:** `validateSpec`/`validateQuestions` seguem clampando todo enum/numérico — agora com os tokens EN.
- **Texto de exibição fica pt-BR:** `name` de peça ("Frente", "Manga", "Saia"), labels de Chip/`detailRows`, chat, labels de aba, `assistantMessage` da IA e o texto do system prompt. NÃO traduzir.
- **Glossário canônico (fonte da verdade)** — todo rename usa exatamente estes pares:
  - GarmentType: blusa→blouse, vestido→dress, saia→skirt, camiseta→tshirt
  - Sexo→Gender (`sexo`→`gender`): fem→female, masc→male
  - Decote→Neckline (`decote`→`neckline`): reto→straight, V→V, redondo→round
  - MangaLen→SleeveLength (`manga`→`sleeve`): sem→none, curta→short, longa→long
  - SaiaSilhueta→SkirtSilhouette (`saia`→`skirt`): reta→straight, evase→a-line, gode→gore, meia-roda→half-circle, circulo→circle
  - GarmentStyle: decoteProfundidadeCm→necklineDepthCm, compSaiaCm→skirtLengthCm, pences→darts, folgaCosturaCm→seamAllowanceCm, cavaAjusteCm→armholeDeepenCm, mangaRefit→sleeveRefit
  - GarmentSpec: tipo→type, sexo→gender
  - Measurements: busto→bust, cintura→waist, quadril→hip, alturaQuadril→hipHeight, comprimentoCostas→backLength, ombro→shoulder, compSaia→skirtLength, compMangaCurta→shortSleeveLength, compMangaLonga→longSleeveLength
  - Consts/funções: SIZE_TABLE_MASC→SIZE_TABLE_MALE; draftCorpo→draftBody, draftManga→draftSleeve, draftSaia→draftSkirt, refitManga→refitSleeve
  - Arquivos: lib/draft/corpo.ts→body.ts, manga.ts→sleeve.ts, saia.ts→skirt.ts (+ .test.ts)
  - Ids de peça: frente→front, costas→back, manga→sleeve, corpo→body, saia→skirt
- **Hooks ativos:** commits disparam pre-commit (lint-staged). Mensagens terminam com `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Método:** substituição cirúrgica (Edit/sed com fronteira de palavra), NUNCA um find-replace cego — muitos termos aparecem também como texto de display pt-BR que deve permanecer. A rede de segurança é o gate verde + os greps de aceite + os testes.

---

### Task 1: Rename das medidas (Measurements)

**Files:**

- Modify: `lib/measurements.ts` + `lib/measurements.test.ts`
- Modify: `lib/draft/core.ts`, `lib/draft/corpo.ts`, `lib/draft/manga.ts`, `lib/draft/saia.ts`, `lib/draft/garment.ts` (+ os `.test.ts` que referenciam medidas)
- Modify: `lib/ai.ts` (referência a `SIZE_TABLE_MALE`; o JSON de `SIZE_TABLE`/`SIZE_TABLE_MALE` embutido no prompt passa a ter as chaves EN; o schema de `measurementOverrides` deriva de `Object.keys(MEASUREMENT_RANGES)` → automático)
- Modify: `lib/export/*` que leem `baseMeasurements`/`Measurements`
- Modify: qualquer componente que leia chaves cruas de `Measurements`

**Interfaces:**

- Produces: interface `Measurements` com chaves EN; `SIZE_TABLE`/`SIZE_TABLE_MALE`/`MEASUREMENT_RANGES` com chaves EN; `resolveMeasurements(size, overrides, sexo)` (o 3º param e o tipo `Sexo` permanecem PT nesta task — vão na Task 2).

Rename APENAS as chaves de `Measurements` e a const `SIZE_TABLE_MASC`→`SIZE_TABLE_MALE`. NÃO tocar `GarmentSpec`/enums/`Sexo` (Task 2) nem ids de peça/funções de draft (Task 3).

- [ ] **Step 1: Aplicar o rename das 9 chaves + a const**

Mapa (verbatim): `busto→bust`, `cintura→waist`, `quadril→hip`, `alturaQuadril→hipHeight`, `comprimentoCostas→backLength`, `ombro→shoulder`, `compSaia→skirtLength`, `compMangaCurta→shortSleeveLength`, `compMangaLonga→longSleeveLength`, `SIZE_TABLE_MASC→SIZE_TABLE_MALE`. Aplicar em todos os arquivos acima, incluindo os literais dentro dos testes (ex.: `busto: 90`→`bust: 90`). Cuidado: `compSaia` (medida) é diferente de `compSaiaCm` (style, Task 2) — não confundir; e `ombro` só aparece como chave de medida.

- [ ] **Step 2: Grep de aceite (deve ser 0)**

Run: `grep -rInwE 'busto|cintura|quadril|alturaQuadril|comprimentoCostas|ombro|compSaia|compMangaCurta|compMangaLonga|SIZE_TABLE_MASC' lib app components | grep -v '\.test\.' | grep -vi 'coment'`
Expected: 0 linhas (nenhuma chave PT de medida sobrando fora de comentário; se um comentário PT explicar a medida, pode manter o comentário em PT — mas o identificador some).

- [ ] **Step 3: Gate verde**

Run: `npx vitest run && npx eslint app lib components && npm run format:check`
Expected: 144/144, eslint limpo, format limpo.

- [ ] **Step 4: Build (typecheck)**

Run: `npm run build`
Expected: verde.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(rename): medidas em inglês (bust/waist/hip/...)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Rename de GarmentSpec, enums e gender

**Files:**

- Modify: `lib/types.ts` (tipos `GarmentType` valores, `Sexo`→`Gender`, `Decote`→`Neckline`, `MangaLen`→`SleeveLength`, `SaiaSilhueta`→`SkirtSilhouette`, `GarmentStyle`, `GarmentSpec`)
- Modify: `lib/measurements.ts` (`resolveMeasurements` 3º param `sexo`→`gender`, default `"female"`; `Sexo` import→`Gender`)
- Modify: `lib/ai.ts` (schema da tool: enums e chaves EN; system prompt: texto pt-BR referenciando os tokens EN; `validateSpec`/`validateQuestions` refs)
- Modify: `lib/draft/garment.ts` (`validateSpec`, `validateQuestions`, `draftGarment`, `seamCheck` lendo `spec.type`/`style.*`), `lib/draft/{corpo,manga,saia,core}.ts` (lendo `style.neckline`/`sleeve`/`darts`/`armholeDeepenCm`/`sleeveRefit`/`knit`)
- Modify: `lib/editor/state.ts` (`applyGarmentSpec`, `getSpec`, `detectConflict` lendo `style.armholeDeepenCm`/`sleeveRefit`)
- Modify: `lib/store.ts`, `lib/api-client.ts` (tipos)
- Modify: `components/editor/*` que leem `spec.tipo`/`sexo`/`style.*` — em especial `FichaTecnicaTab.tsx` (**guard de display**, ver Step 2)
- Modify: `lib/export/model.ts` (e outros export que leem `spec`)
- Modify: todos os `.test.ts` com literais de enum/chave (ex.: `tipo: "blusa"`→`type: "blouse"`, `decote: "redondo"`→`neckline: "round"`, `saia: "evase"`→`skirt: "a-line"`, `cavaAjusteCm`→`armholeDeepenCm`)

**Interfaces:**

- Consumes: chaves de `Measurements` já EN (Task 1).
- Produces: `GarmentSpec { type, gender?, measurementOverrides, style }` com `style` em EN; enums EN. É o shape final do wire/blob.

- [ ] **Step 1: Renomear tipos, chaves e valores de enum**

Aplicar o glossário (seções Enums, GarmentSpec/GarmentStyle, gender) em todos os arquivos acima e nos testes. Pontos de atenção:

- `Sexo`→`Gender`, valores `fem`→`female`/`masc`→`male` em TODO lugar (types, resolveMeasurements default, ai.ts prompt/schema, FichaTecnica, seed se aplicável).
- `manga` como campo de `GarmentStyle` (MangaLen) → `sleeve`; NÃO confundir com o id de peça `manga` nem `draftManga` (Task 3).
- `saia` como campo de `GarmentStyle` (SaiaSilhueta) → `skirt`; idem, distinto do id de peça e `draftSaia` (Task 3).
- Valores com hífen são strings válidas: `"a-line"`, `"half-circle"`.
- `cavaAjusteCm`→`armholeDeepenCm` (settável pela IA, clampado 0–6 em validateSpec); `mangaRefit`→`sleeveRefit` (interno, NÃO aceito por validateSpec — manter esse contrato).

- [ ] **Step 2: Guard de display no FichaTecnicaTab**

Em `components/editor/FichaTecnicaTab.tsx`, onde hoje é `<Chip label="Tipo" value={pattern.spec.tipo} />`, o valor cru viraria "blouse" (inglês na UI PT). Adicionar um mapa PT e usá-lo:

```tsx
const GARMENT_TYPE_LABELS_PT: Record<GarmentType, string> = {
  blouse: "Blusa",
  dress: "Vestido",
  skirt: "Saia",
  tshirt: "Camiseta",
};
// ...
<Chip label="Tipo" value={GARMENT_TYPE_LABELS_PT[pattern.spec.type]} />;
```

O `gender` (linha ~38) já é exibido via ternário PT — atualizar para `pattern.spec.gender === "male" ? "masculina" : "feminina"`.

- [ ] **Step 3: System prompt referencia tokens EN (texto segue pt-BR)**

Em `lib/ai.ts`, o `buildSystem`/descrições da tool passam a citar os tokens EN mantendo a explicação em pt-BR e mapeando o vocabulário do usuário. Ex.: "type: blouse | dress | skirt | tshirt (camiseta/t-shirt → tshirt; blusa/camisa → blouse)", "gender: female | male (masculina→male, feminina→female, sem pista→female)", "neckline em straight|V|round; sleeve em none|short|long; skirt em straight|a-line|gore|half-circle|circle". `assistantMessage` continua exigido em pt-BR.

- [ ] **Step 4: Greps de aceite (devem ser 0, exceto rótulos de display PT)**

Run: `grep -rInwE 'tipo|sexo|decote|pences|folgaCosturaCm|cavaAjusteCm|mangaRefit|decoteProfundidadeCm|compSaiaCm' lib app components | grep -v '\.test\.'`
Run: `grep -rInE '"(blusa|vestido|camiseta|reto|reta|redondo|sem|curta|longa|evase|gode|meia-roda|circulo|fem|masc)"' lib app components`
Expected (ambos): 0 linhas de código-fonte. (Rótulos de display PT introduzidos no Step 2 — "Blusa"/"masculina" — são capitalizados/diferentes e NÃO batem nesses padrões; o grep casa apenas o token exato entre aspas, então labels como `"sem manga"` não disparam.) O glossário completo governa mesmo que o grep não liste todo valor.

- [ ] **Step 5: Gate verde + build**

Run: `npx vitest run && npx eslint app lib components && npm run format:check && npm run build`
Expected: 144/144, eslint/format limpos, build verde.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(rename): GarmentSpec/estilo/enums e gender em inglês

blusa→blouse, decote→neckline, saia(estilo)→skirt, cavaAjusteCm→armholeDeepenCm,
sexo→gender (female/male). Guard de display PT no FichaTecnicaTab; prompt da IA
segue pt-BR referenciando os tokens EN.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Rename de ids de peça e funções/arquivos de draft

**Files:**

- Rename (git mv): `lib/draft/corpo.ts`→`lib/draft/body.ts`, `lib/draft/manga.ts`→`lib/draft/sleeve.ts`, `lib/draft/saia.ts`→`lib/draft/skirt.ts` (+ `corpo.test.ts`→`body.test.ts`, `manga.test.ts`→`sleeve.test.ts`, `saia.test.ts`→`skirt.test.ts`)
- Modify: `lib/draft/garment.ts` (imports + chamadas `draftBody`/`draftSleeve`/`draftSkirt`)
- Modify: `lib/editor/state.ts` (`refitManga`→`refitSleeve`; auto-seleção da 1ª peça por id, se por id)
- Modify: `lib/store.ts` / `components/editor/*` que comparam `selectedPieceId`/id de peça
- Modify: `lib/export/*` que usam id de peça
- Modify: testes que referenciam `draftManga`/`refitManga`/ids de peça

**Interfaces:**

- Consumes: shape EN de GarmentSpec/Measurements (Tasks 1–2).
- Produces: funções `draftBody/draftSleeve/draftSkirt`, `refitSleeve`; ids de peça EN (`front/back/sleeve/body/skirt`).

**IMPORTANTE — display fica PT:** o campo `name` das peças (`name: "Frente"`, `"Costas"`, `"Manga"`, `"Saia"`, `"Corpo"`) é texto de exibição no canvas → **permanece pt-BR**. Só o `id` da peça, os nomes de função e os nomes de arquivo mudam.

- [ ] **Step 1: git mv dos arquivos (preserva histórico)**

```bash
git mv lib/draft/corpo.ts lib/draft/body.ts
git mv lib/draft/corpo.test.ts lib/draft/body.test.ts
git mv lib/draft/manga.ts lib/draft/sleeve.ts
git mv lib/draft/manga.test.ts lib/draft/sleeve.test.ts
git mv lib/draft/saia.ts lib/draft/skirt.ts
git mv lib/draft/saia.test.ts lib/draft/skirt.test.ts
```

- [ ] **Step 2: Renomear funções e ids de peça**

`draftCorpo→draftBody`, `draftManga→draftSleeve`, `draftSaia→draftSkirt`, `refitManga→refitSleeve`; atualizar imports em `garment.ts` (`from "./body"|"./sleeve"|"./skirt"`). Ids de peça: onde o `id` de uma `Piece` é `"frente"/"costas"/"manga"/"corpo"/"saia"`, trocar por `"front"/"back"/"sleeve"/"body"/"skirt"`, e atualizar toda comparação por esse id (state auto-select, store, componentes, export). **Deixar `name:` intacto** (PT display).

- [ ] **Step 3: Greps de aceite**

Run: `grep -rInwE 'draftCorpo|draftManga|draftSaia|refitManga' lib app components`
Expected: 0.
Run: `grep -rInE 'id: "(frente|costas|manga|corpo|saia)"' lib app components`
Expected: 0 (ids EN agora).
Run: `grep -rInE 'name: "(Frente|Costas|Manga|Saia|Corpo)"' lib` — Expected: AINDA presentes (display PT preservado — confirmação positiva).

- [ ] **Step 4: Gate verde + build**

Run: `npx vitest run && npx eslint app lib components && npm run format:check && npm run build`
Expected: 144/144, limpos, build verde.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(rename): arquivos/funções de draft e ids de peça em inglês

corpo/manga/saia→body/sleeve/skirt; draft*/refitManga→...Sleeve; ids
frente/costas→front/back. name de peça permanece PT (display).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Migração Prisma de reset dos moldes

**Files:**

- Create: `prisma/migrations/<timestamp>_reset_moldes_english/migration.sql`

**Interfaces:**

- Consumes: nada de código; o shape EN do blob (Tasks 1–3) é a razão do reset.
- Produces: uma migração que esvazia a tabela `Molde`.

- [ ] **Step 1: Gerar a migração vazia e escrever o SQL**

Como não há mudança de schema (só de conteúdo do blob), criar a migração e colocar o SQL de reset. Com o Postgres local no ar:

```bash
npm run db:migrate -- --create-only --name reset_moldes_english
```

Editar o `migration.sql` gerado para conter exatamente:

```sql
-- Reset dos moldes: o EditorState persistido mudou de shape (chaves PT→EN)
-- no rename total. Moldes antigos não desserializam no código novo.
-- Dado dev/pré-produção — reset é aceitável (decisão registrada no spec).
DELETE FROM "Molde";
```

(Se o Postgres não estiver acessível para o `--create-only`, criar a pasta `prisma/migrations/<timestamp>_reset_moldes_english/` manualmente com o `migration.sql` acima; o timestamp segue o formato `AAAAMMDDHHMMSS` das migrações existentes e deve ser posterior à última.)

- [ ] **Step 2: Aplicar e verificar (se DB disponível)**

Run: `npm run db:migrate` (aplica) — ou documentar no relatório que roda no `prisma migrate deploy` do entrypoint. Verificar que `prisma migrate status` fica sem pendências.

- [ ] **Step 3: Commit**

```bash
git add prisma/migrations
git commit -m "chore(db): migração de reset dos moldes (shape EN do blob)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Reescrever o CLAUDE.md para os nomes EN

**Files:**

- Modify: `CLAUDE.md`

**Interfaces:**

- Consumes: o estado final EN (Tasks 1–3). Doc — não afeta build.

- [ ] **Step 1: Atualizar todas as referências PT→EN**

Percorrer o CLAUDE.md e trocar os identificadores/valores PT pelos EN conforme o glossário: `GarmentType` valores (blusa→blouse, etc.), `tipo`→`type`, `sexo`→`gender`, medidas (`busto`→`bust`...), `draftManga`→`draftSleeve`, `refitManga`→`refitSleeve`, `corpo.ts/manga.ts/saia.ts`→`body.ts/sleeve.ts/skirt.ts`, `cavaAjusteCm`→`armholeDeepenCm`, `mangaRefit`→`sleeveRefit`, `pences`→`darts`, `folgaCosturaCm`→`seamAllowanceCm`, ids de peça. **Manter em pt-BR** as descrições de texto de display e a nota de que a IA responde em pt-BR; adicionar uma linha explicando a fronteira (código EN, UI/IA pt-BR) e o guard de display do FichaTecnicaTab.

- [ ] **Step 2: Verificar consistência**

Run: `grep -nE '\b(blusa|vestido|camiseta|tipo|sexo|busto|cintura|ombro|decote|pences|cavaAjuste|draftManga|refitManga|corpo\.ts|manga\.ts|saia\.ts)\b' CLAUDE.md`
Expected: 0 (só nomes EN; exceção: se citar explicitamente um rótulo de display PT entre aspas, como `"Blusa"`/`"Frente"`, tudo bem).

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md reflete os nomes em inglês (rename total)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Verificação final (após todas as tasks)

1. Greps de aceite (código): nenhuma chave/identificador/valor de enum PT — só rótulos de display pt-BR intencionais (`name` de peça, mapa `GARMENT_TYPE_LABELS_PT`, ternário de gender).
2. `npm run format:check` + `npx eslint app lib components` + `npx vitest run` (144/144) + `npm run build` — todos verdes.
3. `lib/ai.ts`: `model: "claude-sonnet-5"` intacto; `validateSpec`/`validateQuestions` clampam os enums EN; fluxo de crédito inalterado nas rotas.
4. Fluxo real: pedido pt-BR "faça uma blusa feminina manga curta" → `validateSpec` gera `type: "blouse"`, `gender: "female"`, `style.sleeve: "short"`; peças desenham; `assistantMessage` em pt-BR; `FichaTecnicaTab` mostra "Blusa"/"feminina".
5. Migração de reset presente; (Docker) molde persiste no shape EN após restart.
6. CLAUDE.md em EN.
