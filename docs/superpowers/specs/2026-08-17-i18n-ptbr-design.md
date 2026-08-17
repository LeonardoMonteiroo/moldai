# Subsistema 3 — i18n (next-intl, single-locale pt-BR) — design

**Data:** 2026-08-17
**Contexto maior:** faxina de qualidade em 3 subsistemas — 1 (tooling ✅) → 2 (rename inglês ✅) → **3 (i18n)**. Ver [[repo-quality-faxina-roadmap]].
**Status:** design aprovado

## Objetivo

Externalizar o **texto de UI hardcoded nos componentes** para um catálogo `next-intl`, com locale único **pt-BR** (sem traduzir para outro idioma). Prepara o terreno para futuras localidades — adicionar um idioma passa a ser uma tarefa de tradução do catálogo, não uma caça a strings no código. Nenhuma mudança de comportamento ou de texto visível.

## Escopo

**Dentro (thin):**

- Instalar e configurar `next-intl` (setup **sem i18n routing**, locale fixo `pt-BR`).
- Extrair o **chrome de UI** de `components/editor/*.tsx`, `app/login/page.tsx`, `app/page.tsx` para `messages/pt-BR.json`: labels de botão, abas, empty states, headers, aria-labels, placeholders, chips estáticos, notas "em breve".
- Substituir os literais por chamadas `t("chave")` (com ICU para interpolação/plural onde fizer sentido, ex.: contagem de peças).

**Fora:**

- **Strings geradas na `lib/`** (drafters: `name` de peça, `detailRows` label/value; `state.ts`: `ConflictInfo.description`/`suggestion`) → **i18n Fase 2** (deferido, documentado). São produzidas no servidor durante o drafting e embutidas no `EditorState`/blob; i18n-á-las exige os drafters emitirem _chaves_ resolvidas na renderização — um refactor do modelo de dados que toca o que é persistido. Ficam como literais pt-BR por ora.
- **`assistantMessage` da IA** e o system prompt — gerados no servidor em pt-BR, fora do catálogo.
- Segundo locale / traduções reais.
- Roteamento por locale (`[locale]` segment), middleware, seletor de idioma.

## Biblioteca e setup

`next-intl` **4.13.7** (peer deps declaram `next: ^16.0.0` + `react: ^19.0.0` → compatível com Next 16.3.1 / React 19.2.8; instalar com `--legacy-peer-deps` como padrão do projeto). Setup **"without i18n routing"** (App Router, locale fixo):

1. `next.config.ts` — envolver a config com `createNextIntlPlugin("./i18n/request.ts")`.
2. `i18n/request.ts` — `getRequestConfig(async () => ({ locale: "pt-BR", messages: (await import("../messages/pt-BR.json")).default }))`.
3. `app/layout.tsx` — `const messages = await getMessages();` e envolver o body com `<NextIntlClientProvider messages={messages}>`; `<html lang="pt-BR">`.
4. Sem middleware, sem segmento `[locale]`.

## Catálogo

`messages/pt-BR.json`, organizado por **namespace = componente/tela**. Ex.:

```json
{
  "Topbar": { "buyCredits": "Comprar créditos", "credits": "créditos" },
  "Footer": { "export": "Exportar", "saveVersion": "Salvar versão", "…": "…" },
  "ChatPanel": { "…": "…" },
  "MessageInput": { "placeholder": "Descreva o ajuste…" },
  "TabBar": {
    "pattern2d": "Molde 2D",
    "proof3d": "Prova 3D",
    "techsheet": "Ficha técnica",
    "cutplan": "Plano de corte"
  },
  "PaywallModal": { "…": "…" },
  "TechSheetTab": { "…": "…" },
  "CutPlanTab": { "…": "…" },
  "Proof3DTab": { "…": "…" },
  "ConflictInfoCard": { "…": "…" },
  "PieceDetailsPanel": { "…": "…" },
  "ClarifyCard": { "…": "…" },
  "GeneratingOverlay": { "…": "…" },
  "CanvasArea": { "…": "…" },
  "Login": { "…": "…" }
}
```

Chaves em inglês (código), valores em pt-BR (display) — coerente com a fronteira do subsistema 2.

## Uso nos componentes

- **Client components** (`"use client"`, a maioria do editor): `const t = useTranslations("Namespace"); …t("key")`.
- **Server components** (se `app/login`/`app/page` forem server): `const t = await getTranslations("Namespace")`.
- **Interpolação/plural (ICU):** onde houver contagem/variável, usar mensagem ICU — ex.: `"pieceCount": "{count, plural, =1 {# peça} other {# peças}}"` — em vez de concatenar. Aplicar só onde já existe essa dinâmica; não inventar.
- **aria-labels e placeholders** também saem do catálogo (são texto de UI).

## O que NÃO muda

- Nenhum texto visível muda — é extração 1:1. A UI continua idêntica em pt-BR.
- As TAB ids (`pattern2d`/`proof3d`/`techsheet`/`cutplan`) e demais identificadores EN (subsistema 2) ficam como estão; só os **labels** exibidos passam pelo catálogo.
- Fluxo de crédito, contrato da IA, geometria, persistência — intactos. Model id `claude-sonnet-5` intacto.

## Testes / verificação

- Os testes existentes (Vitest) são de `lib/*` — não dependem de strings de componente, então seguem verdes sem mudança (i18n é camada de componente).
- **Gate:** `npm run format:check` + `npx eslint app lib components` + `npx vitest run` (144/144) + `npm run build`. O `NextIntlClientProvider`/`getMessages` precisa compilar no App Router.
- **Visual:** subir o app (dev ou Docker) e confirmar que todas as telas seguem exibindo o mesmo texto pt-BR (nenhuma chave "vazando" tipo `Footer.export` na tela — sinal de namespace/chave errada).
- Grep de aceite: nenhuma chave crua renderizada; catálogo cobre todos os literais extraídos.

## Estrutura / decomposição

Diferente do rename, i18n paraleliza melhor (componentes são arquivos disjuntos), mas o **setup é uma espinha serial** (o provider + config precisam existir antes de qualquer componente usar `useTranslations`, senão quebra em runtime). Sugestão:

1. **Setup (serial):** deps + `next.config.ts` + `i18n/request.ts` + provider no layout + `messages/pt-BR.json` vazio-ish (com um namespace piloto). Build verde.
2. **Extração por grupos de componentes** (paralelizável por arquivos disjuntos, cada grupo adiciona seu namespace ao catálogo e fecha com build verde) — cuidado: o `messages/pt-BR.json` é um arquivo compartilhado; se paralelizar, cada grupo mexe em seções distintas do JSON → risco de conflito de merge no catálogo. **Mais seguro: serial** ou lotes pequenos. O plano decide.
3. **Verificação visual final.**

## Limitações anotadas

- **Single-locale:** só pt-BR; não há seletor de idioma nem segundo catálogo. Adicionar locale futuro = novo `messages/<locale>.json` + (se quiser URL por locale) migrar para o setup com routing/middleware.
- **i18n Fase 2 (deferido):** strings geradas na `lib/` (detailRows/name de peça/conflito) seguem pt-BR literais no blob; internacionalizá-las exige emitir chaves nos drafters e resolver na render (refactor do modelo de dados + blob).
- **IA:** respostas do chat seguem pt-BR geradas pelo modelo, fora do catálogo (não são localizáveis por catálogo).

## Aceite

1. `next-intl` instalado e configurado (sem routing, locale pt-BR); build verde.
2. Todo o chrome de UI dos componentes/app vem do catálogo `messages/pt-BR.json`; nenhum literal pt-BR de UI hardcoded remanescente nos componentes (fora do que é Fase 2 / lib).
3. UI visualmente idêntica (mesmo texto pt-BR); nenhuma chave crua na tela.
4. Gate verde (format/eslint/vitest/build); E2E visual ok.
