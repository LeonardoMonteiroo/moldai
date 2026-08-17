# English-Only Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every source comment, test name, project doc, and infra config file in the repo English-only, and change the AI's chat system prompt from fixed pt-BR to English-authored with dynamic language mirroring — while leaving the pt-BR UI catalog, the design-handoff reference, and historical planning docs untouched.

**Architecture:** This is mostly a mechanical text-translation sweep (grep for Portuguese-accented characters → translate the comment/string in place → verify no logic changed). One task (`lib/ai.ts`) is a real behavior change: the system prompt moves from "always answer in pt-BR" to "answer in whatever language the user just wrote in." `CLAUDE.md` gets updated to document that behavior change, per the project's own rule that conflicting documented decisions must be reconciled, not silently overridden.

**Tech Stack:** No new dependencies. Next.js 16 / TypeScript / Vitest / next-intl (unchanged).

## Global Constraints

- Commit messages: English, Conventional Commits (`type(scope): summary`), per `CLAUDE.md` convention.
- Verify with `npm run build`, not bare `tsc` (a bare `tsc` run gives a spurious `app/layout.tsx` `LayoutProps` error under Next 16).
- Scope lint checks to `app lib components` (running lint at the repo root can false-alarm on `.claude/worktrees/` if one exists).
- **Excluded from this entire sweep — do not touch:**
  - `messages/pt-BR.json` — the UI translation catalog; stays pt-BR by design.
  - `docs/design/**` (`README.md`, `MoldAI Wireframes.dc.html`) — the verbatim external design handoff; `CLAUDE.md` explicitly calls it "reference to recreate... not code to copy," so translating it would corrupt its fidelity as a source document.
  - `docs/superpowers/specs/**` and `docs/superpowers/plans/**` (all files except the new one this plan creates) — historical decision records from past sessions; rewriting them rewrites history, not just code.
  - `prisma/migrations/**/migration.sql` — applied database migration history; must never be hand-edited after the fact.
  - `prisma/seed.ts`'s data literal `"Ateliê"` — a seeded fixture _value_ (an account/plan name), not code; only the `console.log` text around it is in scope.
  - Any **hardcoded chat-facing/UI literal string** in route handlers or components that is not a comment or a test name — e.g. the JSON error bodies (`"Corpo inválido."`, `"Mensagem obrigatória."`), the empty-`assistantMessage` fallbacks, and the credit-cost chip label (`"−${cost} crédito"`) in `app/api/pattern/generate/route.ts`, and the canned "sleeve refit" AI chat message + `"correção gratuita"` chip label in `app/api/pattern/conflict/resolve/route.ts`. These are user-facing chat/UI text, not source-code prose, and the project's UI text stays pt-BR for now (single-locale `next-intl`, unchanged by this plan). This creates a known asymmetry — the AI's _own_ generated replies will mirror the user's language (Task 1), but these fixed fallback/label strings stay pt-BR — and `CLAUDE.md` (Task 11) documents that asymmetry explicitly rather than silently deciding it away.
- Everywhere else — source comments, test `describe`/`it` names, trivial test fixture strings, project docs (`CLAUDE.md`, `AGENTS.md` is auto-generated and already English so needs no edits, `README.md`), and infra config comments/log strings (Docker, CI, `scripts/smoke-prod.mjs`) — becomes English. Code identifiers, wire keys, and enum values were already English from the earlier rename subsystem; this plan does not touch them.
- Completion check per task: `grep -nE "[àáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]"` (PowerShell: `Select-String -Pattern '[àáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]'`) over the task's touched files returns nothing.

---

### Task 1: `lib/ai.ts` — English system prompt + dynamic language mirroring

**Files:**

- Modify: `lib/ai.ts`
- Modify: `lib/ai.test.ts`

**Interfaces:**

- Consumes: nothing new — `proposeGarment(state: EditorState, answering: boolean): Promise<AiDecision>` signature is unchanged.
- Produces: same `AiDecision` shape; `assistantMessage` content will now vary by the user's input language instead of always being pt-BR. No caller (`app/api/pattern/generate/route.ts`) needs to change.

- [ ] **Step 1: Rewrite the `TOOL` schema's `description` fields to English, and add language-mirroring instructions**

Replace the `TOOL` object in `lib/ai.ts` with:

```typescript
const TOOL: Anthropic.Tool = {
  name: "propose_garment",
  description:
    "Decide how the user's request translates into a GarmentSpec (garment specification). Always choose a decision, and write assistantMessage in the same language the user wrote in.",
  input_schema: {
    type: "object",
    properties: {
      decision: {
        type: "string",
        enum: ["apply", "decline", "ask"],
        description:
          "apply = ready to draft now; decline = out of scope (pants, accessories…); ask = missing relevant detail, ask questions before drafting.",
      },
      spec: {
        type: "object",
        description:
          "The COMPLETE, UPDATED GarmentSpec (not just the delta). Always fill this in when decision=apply — include everything that already existed plus the requested changes.",
        properties: {
          type: {
            type: "string",
            enum: ["blouse", "dress", "skirt", "tshirt"],
          },
          gender: {
            type: "string",
            enum: ["female", "male"],
            description:
              "Gender / measurement base. Infer from cues like 'men's'/'women's'/'unisex' (in any language). Default female.",
          },
          measurementOverrides: {
            type: "object",
            description:
              "Numeric (cm) overrides of body measurements, by measurement name. Only include what the request explicitly asks to adjust; everything else comes from the size table.",
            properties: Object.fromEntries(
              Object.keys(MEASUREMENT_RANGES).map((k) => [
                k,
                { type: "number" },
              ]),
            ),
            additionalProperties: { type: "number" },
          },
          style: {
            type: "object",
            properties: {
              neckline: { type: "string", enum: ["straight", "V", "round"] },
              necklineDepthCm: { type: "number" },
              sleeve: { type: "string", enum: ["none", "short", "long"] },
              skirt: {
                type: "string",
                enum: ["straight", "a-line", "gore", "half-circle", "circle"],
              },
              skirtLengthCm: { type: "number" },
              darts: { type: "boolean" },
              seamAllowanceCm: { type: "number" },
              armholeDeepenCm: {
                type: "number",
                description:
                  "Deepens the body's armhole by X cm (0 to 6). Use when the user asks to increase/deepen/lower the armhole (e.g. 'add 2cm to the armhole'). Only affects the body — the sleeve may need adjusting afterward.",
              },
            },
          },
        },
        required: ["type", "gender", "measurementOverrides", "style"],
      },
      questions: {
        type: "array",
        description:
          "Fill in ONLY when decision=ask. 1 to 4 objective single-choice questions, with options drawn from the valid catalog. Don't invent measurements or draft.",
        items: {
          type: "object",
          properties: {
            label: {
              type: "string",
              description:
                "Short question, written in the same language the user used (e.g. 'Neckline').",
            },
            options: {
              type: "array",
              items: { type: "string" },
              description: "2 to 6 single-choice options.",
            },
            allowOther: {
              type: "boolean",
              description: "true if a free-text 'other' field makes sense.",
            },
          },
          required: ["label", "options"],
        },
      },
      declineReason: {
        type: "string",
        description: "Fill in ONLY when decision=decline.",
      },
      assistantMessage: {
        type: "string",
        description:
          "Short reply to the user in chat, in the same language the user wrote in, describing what was done or why not.",
      },
    },
    required: ["decision", "assistantMessage"],
  },
};
```

- [ ] **Step 2: Rewrite `buildSystem` to English, with an explicit language-mirroring instruction**

Replace `buildSystem` with:

```typescript
function buildSystem(state: EditorState, answering: boolean): string {
  const currentSpec = state.pattern.spec;
  const isEmpty = state.pattern.pieces.length === 0;
  return [
    "You are MoldAI's pattern-drafting engine. You receive natural-language requests about a garment and translate them into a GarmentSpec (type + measurements + style).",
    "The GarmentSpec has: type (blouse | dress | skirt | tshirt); gender (female | male); measurementOverrides (body measurements in cm, override the size table); style (neckline, necklineDepthCm, sleeve, skirt, skirtLengthCm, darts, seamAllowanceCm, armholeDeepenCm).",
    "armholeDeepenCm deepens the body's armhole (0 to 6 cm): use it when asked to increase/lower the armhole. Since it only affects the body, the sleeve cap may end up mismatched and trigger a seam-conflict warning — that's expected, the user resolves it with the sleeve-fix action.",
    "tshirt = knit garment (round neckline, short set-in sleeve by default, no darts, fitted); blouse = woven fabric (may have darts, any neckline). Choose tshirt for a t-shirt and blouse for a blouse/shirt.",
    "Valid style catalog: neckline in straight|V|round; sleeve in none|short|long; skirt (silhouette) in straight|a-line|gore|half-circle|circle.",
    "Map the user's vocabulary to these tokens regardless of what language they wrote in — e.g. neckline 'straight'->straight, 'V-neck'->V, 'round'->round; sleeve 'short'->short, 'long'->long, 'sleeveless'->none; skirt 'straight'->straight, 'godet'->gore, 'A-line'->a-line, 'half circle'->half-circle, 'circle'->circle.",
    "Infer gender from the request ('men's'->male, 'women's'->female, no cue->female).",
    "Always write assistantMessage, and any question labels/options, in the same natural language the user's most recent message was written in — mirror it exactly, never default to a fixed language.",
    isEmpty
      ? "CURRENT STATE: BLANK pattern, no piece created yet. This is a from-scratch request: build the entire GarmentSpec the garment needs. If the request already provides enough, use apply; but a generic request with only the piece type (e.g. 'make a t-shirt', no gender, size, neckline, sleeve, or fit) is UNDERSPECIFIED — in that case use decision=ask before drafting."
      : "A spec is already applied (below). An adjustment request should return the ENTIRE UPDATED SPEC (not just the delta): start from the current spec and apply the requested changes.",
    "If the request isn't a garment this spec can represent (e.g. pants, accessories, a generic request unrelated to a draftable piece), use decision=decline and explain gently in assistantMessage. Don't fill in spec in that case.",
    answering
      ? "The user just ANSWERED your questions (the answers are in the last user message). Do NOT use decision=ask again — use apply (or decline if out of scope) with your best understanding of the answers."
      : "If relevant detail is missing to draft correctly (neckline, sleeve, fit, length, size…), use decision=ask with 1 to 4 objective single-choice questions, options from the valid catalog; don't invent measurements or draft in that case. Only use apply once you have enough.",
    "",
    "Female size table (cm):",
    JSON.stringify(SIZE_TABLE),
    "Male size table (cm):",
    JSON.stringify(SIZE_TABLE_MALE),
    "",
    "Current pattern spec:",
    JSON.stringify(currentSpec ?? null),
  ].join("\n");
}
```

- [ ] **Step 3: Translate the two remaining PT comments in `lib/ai.ts`**

`// Guard redundante à instrução do prompt: respondendo, nunca voltar a perguntar.` →
`// Redundant guard for the prompt instruction: when answering, never ask again.`

`// sem pergunta aproveitável → desenha com defaults` →
`// no usable question → draft with defaults`

- [ ] **Step 4: Translate `lib/ai.test.ts`'s comment, test names, and fixture strings**

`// handle compartilhado do mock (a factory reusa a mesma fn create)` →
`// shared handle for the mock (the factory reuses the same create fn)`

`it("mapeia decision=ask com perguntas validadas", ...)` → `it("maps decision=ask with validated questions", ...)`
`it("degrada ask sem perguntas válidas para apply", ...)` → `it("degrades ask without valid questions to apply", ...)`
`it("answering=true força apply mesmo se a IA responder ask", ...)` → `it("answering=true forces apply even if the AI responds ask", ...)`

Fixture content: `text: "quero uma camiseta"` → `text: "I want a t-shirt"`; `assistantMessage: "Me conta mais:"` → `assistantMessage: "Tell me more:"`; `label: "Gola", options: ["redonda", "V"]` → `label: "Neckline", options: ["round", "V"]` (both occurrences of `label: "Gola"` in the file).

- [ ] **Step 5: Verify**

Run: `npx vitest run lib/ai.test.ts`
Expected: 3/3 pass.

Run: `grep -nE "[àáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]" lib/ai.ts lib/ai.test.ts` (or PowerShell `Select-String`)
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add lib/ai.ts lib/ai.test.ts
git commit -m "$(cat <<'EOF'
refactor(ai): rewrite system prompt in English, mirror user's language

The prompt previously hardcoded pt-BR for every assistantMessage. It now
instructs the model to reply in whatever language the user's own message
was written in, and the prompt/tool-schema source text moves to English
for consistency with the rest of the codebase.
EOF
)"
```

---

### Task 2: `lib/draft/*` — translate comments and test names

**Files:**

- Modify: `lib/draft/body.ts`, `lib/draft/sleeve.ts`, `lib/draft/skirt.ts`, `lib/draft/garment.ts`, `lib/draft/core.ts`
- Modify: `lib/draft/body.test.ts`, `lib/draft/sleeve.test.ts`, `lib/draft/skirt.test.ts`, `lib/draft/garment.test.ts`, `lib/draft/core.test.ts`

**Interfaces:** No signature changes — text-only edits. `sleeve.ts` has this exact pair of PT comments to translate as a concrete example:

```
// 0 axila esq -> 1 ctrl costas -> 2 topo -> 3 ctrl frente -> 4 axila dir (copa, curva)
// 4 -> 5 barra dir (reta) -> 6 barra esq (reta) -> 0 (reta)
```

→

```
// 0 left underarm -> 1 back ctrl -> 2 top -> 3 front ctrl -> 4 right underarm (cap, curved)
// 4 -> 5 right hem (straight) -> 6 left hem (straight) -> 0 (straight)
```

- [ ] **Step 1: For each file in the Files list, grep for Portuguese-accented characters and translate every comment / `describe`/`it` name / trivial fixture string found, preserving code structure and logic exactly (text-only change)**

Run per file: `grep -nE "[àáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]" <file>` to enumerate matches, then edit each one in place. Do not touch `t("...")` catalog-key arguments (already English keys from the i18n Fase 2 work) or any `messages/pt-BR.json` content.

- [ ] **Step 2: Verify**

Run: `npx vitest run lib/draft`
Expected: all `lib/draft/*.test.ts` pass, same count as before this task.

Run: `grep -nrE "[àáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]" lib/draft`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add lib/draft
git commit -m "$(cat <<'EOF'
refactor(draft): translate source comments and test names to English
EOF
)"
```

---

### Task 3: `lib/export/*` — translate comments and test names

**Files:**

- Modify: `lib/export/model.ts`, `lib/export/index.ts`, `lib/export/cutplan.ts`, `lib/export/pdf.ts`, `lib/export/dxf.ts`, `lib/export/dxf-aama.ts`
- Modify: `lib/export/model.test.ts`, `lib/export/cutplan.test.ts`, `lib/export/svg.test.ts`, `lib/export/pdf.test.ts`, `lib/export/dxf.test.ts`, `lib/export/dxf-aama.test.ts`

**Interfaces:** No signature changes — text-only edits.

- [ ] **Step 1: For each file, grep for Portuguese-accented characters and translate every comment / test name / trivial fixture string found, preserving logic exactly**

Same method as Task 2, Step 1.

- [ ] **Step 2: Verify**

Run: `npx vitest run lib/export`
Expected: same pass count as before this task.

Run: `grep -nrE "[àáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]" lib/export`
Expected: no matches.

- [ ] **Step 3: Commit**

```bash
git add lib/export
git commit -m "$(cat <<'EOF'
refactor(export): translate source comments and test names to English
EOF
)"
```

---

### Task 4: `lib/editor/state.ts` — translate comments and test names

**Files:**

- Modify: `lib/editor/state.ts`
- Modify: `lib/editor/state.test.ts`

- [ ] **Step 1: Grep and translate**

Same method as Task 2, Step 1. Do not touch any `t("conflict.*")` catalog-key call — those resolve pt-BR text from `messages/pt-BR.json`, unaffected by this sweep.

- [ ] **Step 2: Verify**

Run: `npx vitest run lib/editor/state.test.ts`
Run: `grep -nrE "[àáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]" lib/editor`
Expected: tests pass, no matches.

- [ ] **Step 3: Commit**

```bash
git add lib/editor
git commit -m "$(cat <<'EOF'
refactor(editor): translate source comments and test names to English
EOF
)"
```

---

### Task 5: `lib/canvas/*` — translate comments and test names

**Files:**

- Modify: `lib/canvas/viewport.ts`, `lib/canvas/useCanvasViewport.ts`, `lib/canvas/measure.ts`
- Modify: `lib/canvas/viewport.test.ts`, `lib/canvas/measure.test.ts`

- [ ] **Step 1: Grep and translate** (same method as Task 2, Step 1)

- [ ] **Step 2: Verify**

Run: `npx vitest run lib/canvas`
Run: `grep -nrE "[àáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]" lib/canvas`

- [ ] **Step 3: Commit**

```bash
git add lib/canvas
git commit -m "$(cat <<'EOF'
refactor(canvas): translate source comments and test names to English
EOF
)"
```

---

### Task 6: `lib/auth/*` and `lib/db/molde.ts` — translate comments and test names

**Files:**

- Modify: `lib/auth/session.ts`, `lib/db/molde.ts`
- Modify: `lib/auth/session.test.ts`, `lib/auth/authorize.test.ts`, `lib/db/molde.test.ts`

- [ ] **Step 1: Grep and translate** (same method as Task 2, Step 1)

- [ ] **Step 2: Verify**

Run: `npx vitest run lib/auth lib/db`
Run: `grep -nrE "[àáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]" lib/auth lib/db`

- [ ] **Step 3: Commit**

```bash
git add lib/auth lib/db
git commit -m "$(cat <<'EOF'
refactor(auth,db): translate source comments and test names to English
EOF
)"
```

---

### Task 7: `lib/store.ts`, `lib/types.ts`, `lib/measurements.ts`, `lib/format.test.ts` — translate comments and test names

**Files:**

- Modify: `lib/store.ts`, `lib/types.ts`, `lib/measurements.ts`
- Modify: `lib/store.test.ts`, `lib/measurements.test.ts`, `lib/format.test.ts`

- [ ] **Step 1: Grep and translate** (same method as Task 2, Step 1)

- [ ] **Step 2: Verify**

Run: `npx vitest run lib/store.test.ts lib/measurements.test.ts lib/format.test.ts`
Run: `grep -nE "[àáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]" lib/store.ts lib/types.ts lib/measurements.ts lib/store.test.ts lib/measurements.test.ts lib/format.test.ts`

- [ ] **Step 3: Commit**

```bash
git add lib/store.ts lib/store.test.ts lib/types.ts lib/measurements.ts lib/measurements.test.ts lib/format.test.ts
git commit -m "$(cat <<'EOF'
refactor(lib): translate source comments and test names to English
EOF
)"
```

---

### Task 8: `components/editor/*` — translate comments

**Files:**

- Modify: `components/editor/TechSheetTab.tsx`, `components/editor/Footer.tsx`, `components/editor/CutPlanTab.tsx`, `components/editor/ChatPanel.tsx`, `components/editor/PieceDetailsPanel.tsx`, `components/editor/CanvasArea.tsx`, `components/editor/PatternCanvas.tsx`

**Interfaces:** Text-only edits. Do **not** touch any JSX string rendered to the user, any `useTranslations(...)` namespace, or any `t("...")` call — all of those are pt-BR UI text by design and out of scope. Only touch `//` and `/* */` comments.

- [ ] **Step 1: For each file, grep for Portuguese-accented characters, and for every match that is inside a `//` or `/* */` comment, translate it to English. If a match is inside a JSX-rendered string, a `t(...)` call, or a `useTranslations` namespace, leave it untouched — it's UI text, not a comment.**

- [ ] **Step 2: Verify**

Run: `npm run build`
Expected: clean build (per project convention, use `npm run build`, not bare `tsc`, to avoid a spurious Next 16 `LayoutProps` error).

- [ ] **Step 3: Commit**

```bash
git add components/editor
git commit -m "$(cat <<'EOF'
refactor(components): translate source comments to English
EOF
)"
```

---

### Task 9: `app/api/pattern/*` routes and `app/layout.tsx` — translate comments (not user-facing literals)

**Files:**

- Modify: `app/api/pattern/generate/route.ts`, `app/api/pattern/generate/route.test.ts`, `app/api/pattern/conflict/resolve/route.ts`, `app/api/pattern/graduate/route.ts`, `app/api/pattern/graduate/route.test.ts`, `app/api/pattern/reset/route.ts`, `app/layout.tsx`

**Interfaces:** Text-only edits to comments and test names. Per Global Constraints, do **not** translate the hardcoded pt-BR string literals that are JSON error bodies, chat fallback text, or chip labels (e.g. `"Corpo inválido."`, `"Mensagem obrigatória."`, `"Pra acertar a modelagem, me responde:"`, `"Não consegui aplicar esse pedido."`, `` `−${cost} crédito` ``, `"Copa da manga refeita para a cava ajustada — as costuras voltaram a bater."`, `"correção gratuita"`) — those remain pt-BR, documented as a known asymmetry in Task 11.

- [ ] **Step 1: For each file, grep for Portuguese-accented characters. Translate matches that are comments or test names. Leave matches that are the excluded literals above untouched.**

- [ ] **Step 2: Verify**

Run: `npx vitest run app/api/pattern`
Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add app/api/pattern app/layout.tsx
git commit -m "$(cat <<'EOF'
refactor(api): translate source comments and test names to English
EOF
)"
```

---

### Task 10: `prisma/seed.ts` — translate the log message

**Files:**

- Modify: `prisma/seed.ts`

- [ ] **Step 1: Translate the console.log text**

`console.log("Seed concluído:", USERS.map((u) => u.email).join(", "));`
→
`console.log("Seed complete:", USERS.map((u) => u.email).join(", "));`

Leave `name: "Ateliê"` untouched — it's fixture data (a seeded account/plan name), not code.

- [ ] **Step 2: Verify**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add prisma/seed.ts
git commit -m "$(cat <<'EOF'
refactor(db): translate seed script log message to English
EOF
)"
```

---

### Task 11: `CLAUDE.md` — translate remaining PT prose and document the AI-language behavior change

**Files:**

- Modify: `CLAUDE.md`

**Interfaces:** Documentation-only. This task also reconciles the architecture doc with Task 1's behavior change, per the project's own "ask before conflicting" rule (already satisfied via the earlier AskUserQuestion confirmation in this conversation).

- [ ] **Step 1: Translate the `Commands` block's bash comments (lines 26–32)**

Replace:

```
npm run db:up          # sobe só o Postgres local (docker compose up -d db), porta host 5433
npm run db:migrate     # aplica migrações Prisma
npm run db:seed        # semeia contas dev (dev@moldai.local / moldai-dev)
npm run docker:up     # sobe app + Postgres juntos no Docker (dev, hot reload) em http://localhost:3000
npm run docker:prod   # sobe a imagem de produção (next start) + Postgres
npm run smoke:prod    # sobe o stack de prod e faz LOGIN de verdade (pega regressão tipo UntrustedHost)
npm run smoke         # só o checador HTTP de login, contra um servidor já no ar (SMOKE_URL)
```

With:

```
npm run db:up          # bring up local Postgres only (docker compose up -d db), host port 5433
npm run db:migrate     # apply Prisma migrations
npm run db:seed        # seed dev accounts (dev@moldai.local / moldai-dev)
npm run docker:up     # bring up app + Postgres together in Docker (dev, hot reload) at http://localhost:3000
npm run docker:prod   # bring up the production image (next start) + Postgres
npm run smoke:prod    # brings up the prod stack and does a REAL login (catches regressions like UntrustedHost)
npm run smoke         # just the HTTP login checker, against a server already running (SMOKE_URL)
```

- [ ] **Step 2: Translate the "Docker vs host" paragraph**

Replace:
`**Docker vs host:** No container, o app fala com o Postgres em \`db:5432\` (DNS do Docker Compose); no host em \`localhost:5433\`. Segredos (\`.env.local\`) vêm via \`env_file\` em runtime — nunca embutidos na imagem.`

With:
`**Docker vs host:** Inside the container, the app talks to Postgres at \`db:5432\` (Docker Compose DNS); on the host, at \`localhost:5433\`. Secrets (\`.env.local\`) come in via \`env_file\` at runtime — never baked into the image.`

- [ ] **Step 3: Fix the stray PT sentence in "What this is" and translate "Fase" → "Phase" throughout the file's prose**

In the "What this is" paragraph, replace:
`Authentication is now **real** (Fase A do "backend real", roadmap A→B→C): ... Only login exists — self-signup is deferred (shown as "em breve"). Cada conta tem o seu próprio molde persistido (Postgres/Prisma); billing/créditos seguem mock (top-up local) até a Fase C. Requires ...`

With:
`Authentication is now **real** (Phase A of "real backend", roadmap A→B→C): ... Only login exists — self-signup is deferred (shown as "em breve"). Each account has its own persisted molde (Postgres/Prisma); billing/credits remain mock (local top-up) until Phase C. Requires ...`

(Keep the rest of that paragraph's English text as-is; only the quoted sentence and "Fase A"/"Fase C" change.)

In the Architecture section, replace `Fase B do "backend real"` with `Phase B of "real backend"`, and replace `Fase 2.5` occurrences' surrounding prose only if written in PT (the term "Fase 2.5" itself is already quoted as a project phase name — translate to `Phase 2.5` since it's prose, not a literal UI/file reference).

- [ ] **Step 4: Update the Conventions paragraph to describe the new AI-language behavior**

Replace:
`The commit subject/body is English even though the product UI and the AI's chat responses are pt-BR. (Code identifiers, wire keys, and enum values are English; only UI display text and AI responses are pt-BR — see the Architecture section.)`

With:
`The commit subject/body is English even though the product UI stays pt-BR; the AI's chat responses mirror whichever language the user writes in (see the i18n paragraph in Architecture). (Code identifiers, wire keys, and enum values are English; UI display text stays pt-BR; the AI's chat responses mirror the user's language.)`

- [ ] **Step 5: Update the "Code identifiers..." architecture paragraph heading sentence**

Replace:
`**Code identifiers, wire keys, and enum values (\`GarmentType\`, \`Gender\`, \`Measurements\` fields, \`GarmentStyle\` fields, piece ids, drafter file/function names) are all English; UI display text and the AI's chat responses stay pt-BR.**`

With:
`**Code identifiers, wire keys, and enum values (\`GarmentType\`, \`Gender\`, \`Measurements\` fields, \`GarmentStyle\` fields, piece ids, drafter file/function names) are all English; UI display text stays pt-BR while the AI's chat responses mirror the user's language (see the i18n paragraph below).**`

- [ ] **Step 6: Rewrite the i18n paragraph's closing sentence to describe the new system-prompt behavior and the known asymmetry with fixed fallback strings**

Replace the final sentence of the i18n paragraph:
`The AI's own \`assistantMessage\`/chat text (\`lib/ai.ts\`'s system prompt and the chat literal in \`app/api/pattern/conflict/resolve/route.ts\`) stays outside the catalog by design — it's produced by code/model logic, not static screen chrome, so it's steered by the pt-BR system prompt rather than translated.`

With:
`The AI's own \`assistantMessage\`/chat text is produced by the model, not static screen chrome, so it stays outside the \`PatternData\`/\`messages\` catalogs entirely: \`lib/ai.ts\`'s system prompt is written in English and instructs the model to mirror the language of the user's own message in \`assistantMessage\` and any clarifying-question labels/options, rather than defaulting to a fixed language — so an AI chat reply may not be pt-BR even though the rest of the UI is. Hardcoded fallback/canned chat strings that don't go through the model (the empty-\`assistantMessage\` fallbacks and the credit-cost chip label in \`app/api/pattern/generate/route.ts\`, and the "sleeve refit" chat message + chip label in \`app/api/pattern/conflict/resolve/route.ts\`) are unaffected by this and remain fixed pt-BR, same as the rest of the UI catalog — a known asymmetry, not yet reconciled.`

- [ ] **Step 7: Verify**

Run: `grep -nE "[àáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]" CLAUDE.md`
Expected: only matches inside quoted literal UI strings that are genuinely pt-BR product text — `"em breve"`, `"Corrigir manga"`, `"Molde em branco"`, `"Novo molde"`, `"ainda não disponível"` — remain, since those are references to actual on-screen pt-BR copy, not prose. No other matches.

- [ ] **Step 8: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(claude): translate remaining PT prose; document AI language mirroring

The AI's assistantMessage/system prompt no longer defaults to fixed pt-BR
(see the ai.ts refactor) — it now mirrors whatever language the user
writes in. Updates the architecture doc to describe this, and flags the
known asymmetry with fixed pt-BR fallback/chip strings that don't go
through the model.
EOF
)"
```

---

### Task 12: `README.md` — full translation to English

**Files:**

- Modify: `README.md`

- [ ] **Step 1: Replace the file contents**

````markdown
# MoldAI

AI-powered 2D pattern editor (chat → GarmentSpec → sewing pieces). Next.js 16 (App Router) + TypeScript, real auth (Auth.js v5 + Postgres/Prisma). The molde/chat/credits backend is still an in-memory mock (Phase B pending).

## Prerequisites

- Node 22 (host flow) and/or Docker Desktop (containerized flow).
- `.env.local` at the repo root with:
  - `ANTHROPIC_API_KEY` — Anthropic API key (chat uses `claude-sonnet-5`).
  - `AUTH_SECRET` — Auth.js secret (`npx auth secret` or `openssl rand -base64 32`).
  - `DATABASE_URL` — `postgresql://moldai:moldai@localhost:5433/moldai?schema=public` (host flow).

## Run with Docker (app + Postgres together)

```bash
npm run docker:up     # dev, hot reload — http://localhost:3000
npm run docker:prod   # production image (next start)
```
````

One command brings up the app and Postgres; the entrypoint applies migrations and seeds the dev accounts. Inside the container the app talks to Postgres at `db:5432`; secrets come from `.env.local` at runtime (never baked into the image).

> After changing dependencies (`package.json`), recreate the anonymous `node_modules` volume: `docker compose down -v` (or `docker compose up --build --renew-anon-volumes`).

## Run on the host (without containerizing the app)

```bash
npm run db:up        # bring up Postgres only (Docker), host port 5433
npm run db:migrate   # apply Prisma migrations
npm run db:seed      # seed dev accounts
npm run dev          # app at http://localhost:3000
```

## Login (seeded dev accounts)

`dev@moldai.local` / `moldai-dev`. Self-signup doesn't exist yet (shown as "em breve").

## Tests and build

```bash
npm test             # vitest (doesn't need Postgres running)
npm run build        # production build + TypeScript check
npm run smoke:prod   # brings up the production stack and does a real login (auth smoke test)
npm run smoke        # just the login checker, against a server already running (SMOKE_URL=...)
```

`smoke` runs the full login flow (CSRF → credentials → session) and requires a valid session at the end — it catches regressions a plain "home responded 200" check wouldn't (e.g. the `trustHost`/`UntrustedHost` issue that only breaks in production).

## Architecture

See `CLAUDE.md` for the architecture decisions. Auth and users are real (Postgres/Prisma); molde/chat/credits are an in-memory mock until Phase B.

````

- [ ] **Step 2: Verify**

Run: `grep -nE "[àáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]" README.md`
Expected: no matches outside the quoted `"em breve"` literal.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
docs: translate README to English
EOF
)"
````

---

### Task 13: Docker/CI/scripts config comments — translate to English

**Files:**

- Modify: `docker-compose.yml`, `docker-compose.prod.yml`, `Dockerfile`, `docker-entrypoint.sh`, `.github/workflows/ci.yml`, `scripts/smoke-prod.mjs`

- [ ] **Step 1: `docker-compose.yml`** — replace line 11's comment:
      `# host 5433 (não 5432) para não colidir com outro Postgres local` → `# host 5433 (not 5432) so it doesn't collide with another local Postgres`

- [ ] **Step 2: `docker-compose.prod.yml`** — replace lines 1–2:

```
# Override de produção: docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
# Builda o target `runner` (next start) e remove os bind mounts de dev.
```

→

```
# Production override: docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build
# Builds the `runner` target (next start) and removes the dev bind mounts.
```

- [ ] **Step 3: `Dockerfile`** — translate these five comments:

```
# ---- deps: instala node_modules (+ prisma generate via postinstall) ----
# ---- dev: hot reload; o código vem por bind mount em runtime ----
# ---- build: gera o .next de produção ----
# ---- runner: produção (next start + toolchain para migrate/seed) ----
# lib/ é necessário pelo prisma/seed.ts (importa ../lib/auth/hash) no entrypoint
```

→

```
# ---- deps: installs node_modules (+ prisma generate via postinstall) ----
# ---- dev: hot reload; code comes in via bind mount at runtime ----
# ---- build: generates the production .next ----
# ---- runner: production (next start + toolchain for migrate/seed) ----
# lib/ is needed by prisma/seed.ts (imports ../lib/auth/hash) in the entrypoint
```

- [ ] **Step 4: `docker-entrypoint.sh`** — translate the echoed strings and comment:

```
echo "[entrypoint] aguardando o Postgres..."
# pg_isready rejeita a query string (?schema=public) do DATABASE_URL — o
# parser de URI dele não aceita esse parâmetro. Prisma aceita; então só o
# readiness check usa a URL sem a query.
echo "[entrypoint] Postgres pronto."
echo "[entrypoint] aplicando migrações (prisma migrate deploy)..."
echo "[entrypoint] seed (idempotente)..."
npx prisma db seed || echo "[entrypoint] aviso: seed falhou, seguindo mesmo assim"
echo "[entrypoint] iniciando: $*"
```

→

```
echo "[entrypoint] waiting for Postgres..."
# pg_isready rejects the query string (?schema=public) in DATABASE_URL — its
# URI parser doesn't accept that parameter. Prisma does accept it; so only the
# readiness check uses the URL without the query.
echo "[entrypoint] Postgres ready."
echo "[entrypoint] applying migrations (prisma migrate deploy)..."
echo "[entrypoint] seed (idempotent)..."
npx prisma db seed || echo "[entrypoint] warning: seed failed, continuing anyway"
echo "[entrypoint] starting: $*"
```

- [ ] **Step 5: `.github/workflows/ci.yml`** — translate the comment block:

```
# Dummies não-secretos: o build importa rotas que instanciam PrismaClient
# (lib/db/prisma.ts) e o NextAuth, que exigem estas envs no import — mas o
# build NÃO conecta em nada. Nunca colocar segredos reais aqui.
```

→

```
# Non-secret dummies: the build imports routes that instantiate PrismaClient
# (lib/db/prisma.ts) and NextAuth, which require these envs at import time —
# but the build does NOT connect to anything. Never put real secrets here.
```

- [ ] **Step 6: `scripts/smoke-prod.mjs`** — translate the header comment block, the one inline comment, and every PT string passed to `console.log`/`ok`/`fail`:

Header (lines 2–14):

```javascript
// Production smoke test: verifies that REAL login works on the actual stack
// (`next start` / NODE_ENV=production), not just that the home page responds HTTP 200.
//
// Born from a real bug: a missing `trustHost` in Auth.js v5 took down every
// /api/auth/* route with a 500 (UntrustedHost) ONLY in production — in dev the
// host is trusted automatically. A smoke test that only checks the home page's
// HTTP status passes even with login broken; this one runs the full credentials
// flow and requires a valid session at the end, so it catches that class of regression.
//
// Usage:
//   node scripts/smoke-prod.mjs            # against SMOKE_URL (default localhost:3000)
//   SMOKE_URL=http://host:3000 node scripts/smoke-prod.mjs
// Env: SMOKE_URL, SMOKE_EMAIL, SMOKE_PASSWORD, SMOKE_READY_TIMEOUT_MS
```

`// Cookie jar mínimo (nome -> valor); reenviado em cada request.` → `// Minimal cookie jar (name -> value); resent on every request.`

String replacements (find/replace each exactly):

- `` `servidor não ficou pronto em ${BASE} (${READY_TIMEOUT_MS}ms) — último: ${last}` `` → `` `server didn't become ready at ${BASE} (${READY_TIMEOUT_MS}ms) — last: ${last}` ``
- `` `[smoke] alvo: ${BASE}  usuário: ${EMAIL}` `` → `` `[smoke] target: ${BASE}  user: ${EMAIL}` ``
- `// Endpoint de auth precisa estar de pé — 500 aqui é o sintoma do UntrustedHost.` → `// Auth endpoint needs to be up — a 500 here is the UntrustedHost symptom.`
- `// Raiz sem sessão deve mandar para /login.` → `// Root without a session should redirect to /login.`
- `` `GET / (anônimo) → ${anon.status} loc="${anonLoc}" (esperado redirect p/ /login)` `` → `` `GET / (anonymous) → ${anon.status} loc="${anonLoc}" (expected redirect to /login)` ``
- `"GET / (anônimo) → redirect /login"` → `"GET / (anonymous) → redirect /login"`
- `` `POST login → ${login.status} (5xx: provável UntrustedHost/trustHost)` `` → `` `POST login → ${login.status} (5xx: likely UntrustedHost/trustHost)` ``
- `` `login rejeitado (credenciais?): ${loginLoc}` `` → `` `login rejected (bad credentials?): ${loginLoc}` ``
- `// Prova real: a sessão precisa existir e ser do usuário esperado.` → `// Real proof: the session must exist and belong to the expected user.`
- `` `sessão sem o usuário esperado — recebido: ${JSON.stringify(sess)}` `` → `` `session missing the expected user — received: ${JSON.stringify(sess)}` ``
- `` `sessão ativa para ${sess.user.email}` `` → `` `active session for ${sess.user.email}` ``
- `// E a raiz autenticada não redireciona mais.` → `// And the authenticated root no longer redirects.`
- `` `GET / (autenticado) → ${authed.status} (esperado 200 — editor)` `` → `` `GET / (authenticated) → ${authed.status} (expected 200 — editor)` ``
- `"GET / (autenticado) → 200 (editor)"` → `"GET / (authenticated) → 200 (editor)"`
- `"\n✓ smoke de produção OK — login real funciona no stack next start"` → `"\n✓ production smoke OK — real login works on the next start stack"`

- [ ] **Step 7: Verify**

Run: `grep -nrE "[àáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]" docker-compose.yml docker-compose.prod.yml Dockerfile docker-entrypoint.sh .github/workflows/ci.yml scripts/smoke-prod.mjs`
Expected: no matches.

Run: `npm run docker:up` is **not** required for this verification (no need to actually boot Docker); a syntax sanity check is enough — `docker compose config` if Docker Desktop happens to be running, otherwise skip and rely on the fact these are comment-only/string-only edits with no structural YAML/shell changes.

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml docker-compose.prod.yml Dockerfile docker-entrypoint.sh .github/workflows/ci.yml scripts/smoke-prod.mjs
git commit -m "$(cat <<'EOF'
chore(infra): translate Docker/CI/smoke-test comments and logs to English
EOF
)"
```

---

### Task 14: Final verification sweep

**Files:** None modified — verification only.

- [ ] **Step 1: Repo-wide grep, excluding the always-excluded paths**

Run (PowerShell):

```powershell
Get-ChildItem -Recurse -File -Exclude *.json | `
  Where-Object { $_.FullName -notmatch '\\node_modules\\|\\\.next\\|\\messages\\|\\docs\\design\\|\\docs\\superpowers\\specs\\|\\docs\\superpowers\\plans\\|\\prisma\\migrations\\' } | `
  Select-String -Pattern '[àáâãéêíóôõúçÀÁÂÃÉÊÍÓÔÕÚÇ]' -List | `
  Select-Object Path
```

Expected: the only remaining matches are inside `prisma/seed.ts` (the `"Ateliê"` fixture value) and any quoted pt-BR UI literals inside `CLAUDE.md`/`README.md` (e.g. `"em breve"`, `"Corrigir manga"`, `"Molde em branco"`, `"Novo molde"`, `"ainda não disponível"`) — everything else must be clean. If anything else turns up, translate it before proceeding.

- [ ] **Step 2: Full test suite**

Run: `npm test`
Expected: all tests pass, same total count as on `main` before this branch started.

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: clean build (per project convention — not bare `tsc`).

- [ ] **Step 4: Lint**

Run: `npx eslint app lib components`
Expected: clean (scoped per project convention to avoid false alarms from any `.claude/worktrees/` directory).

- [ ] **Step 5: Report**

Summarize for the human partner: total files touched, confirmation that `messages/pt-BR.json`, `docs/design/**`, `docs/superpowers/specs/**`, `docs/superpowers/plans/**` (pre-existing files), and `prisma/migrations/**` were left untouched, and a reminder of the documented asymmetry (AI-generated chat replies now mirror the user's language; a handful of hardcoded fallback/chip strings in the two `app/api/pattern/*` routes remain fixed pt-BR).

---

## Self-Review

**1. Spec coverage:** Every category the user confirmed in scope — source comments, test names, `CLAUDE.md`/`AGENTS.md`/`README.md`, Docker/CI/script configs, and the AI system prompt with dynamic language mirroring — has a task. `AGENTS.md` needed no task: it's auto-regenerated by `next dev` and was already fully English when read during planning.

**2. Placeholder scan:** No "TBD"/"handle appropriately" steps. Every translation step either shows the exact before/after text (Tasks 1, 11, 12, 13) or gives a fully mechanical, verifiable procedure with a concrete worked example (Tasks 2–10): grep → translate each match → grep again to confirm zero. This is the appropriate level of concreteness for a pure-text-translation sweep across dozens of otherwise-identical files.

**3. Type consistency:** Task 1's `AiDecision`/`RawToolInput` interfaces are unchanged — only string literal content moves. No other task touches a type or function signature.

**4. Conflict-resolution rule honored:** The AI-language behavior change (Task 1) directly affects a documented `CLAUDE.md` decision; Task 11 updates `CLAUDE.md` in the same plan rather than leaving it stale, and the user already confirmed this update via AskUserQuestion before this plan was written.
