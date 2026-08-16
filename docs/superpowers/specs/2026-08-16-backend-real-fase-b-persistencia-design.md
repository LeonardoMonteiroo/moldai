# Fase B — Persistência do molde por usuário (design)

**Data:** 2026-08-16
**Roadmap:** backend real A (auth ✅) → **B (persistência por usuário)** → C (billing real)
**Status:** design aprovado

## Objetivo

Hoje o molde (pattern/peças/chat/créditos/conflito) vive num **singleton in-memory** (`lib/mock-data.ts`), compartilhado entre todas as contas e resetado a cada restart do servidor. A Fase B migra esse estado para o **Postgres via Prisma**, de modo que **cada usuário tenha o seu próprio molde persistente**. Auth/usuários já são reais (Fase A); esta fase fecha o gap "logar não me dá o meu molde".

## Escopo

**Dentro:**
- Um molde por usuário (espelha a UI atual, que não tem lista de moldes).
- Persistir o `EditorState` inteiro (pattern/peças/chat/créditos/conflito) no Postgres.
- Seed lazy: no primeiro acesso de um usuário sem molde, cria o blank molde + créditos padrão e persiste.
- Reset por usuário (endpoint existente `POST /api/pattern/reset`).
- Atomicidade do fluxo de crédito via transação com lock de linha por usuário.

**Fora (não fazer nesta fase):**
- Múltiplos moldes por usuário, listagem, criar/trocar/excluir.
- Histórico de versões / "Salvar versão" (segue **"em breve"**; o número `version` já incrementa a cada geração).
- Extrair créditos para tabela própria / ledger — isso é **Fase C** (billing real). Nesta fase os créditos ficam dentro do blob.
- Self-signup, billing real (Stripe).

## Decisões (confirmadas com o usuário)

1. **Cardinalidade:** um molde por usuário.
2. **Forma de persistência:** blob JSON do `EditorState` inteiro (não normalizado, não re-draftado). O `EditorState` já é 100% serializável (números, strings, timestamps numéricos — sem `Date`/funções) e já é enviado como JSON ao cliente. `pieces`/`viewBox`/`baseMeasurements`/`conflict` são guardados como estão (não re-derivados no load), o que preserva exatamente o comportamento de **"Ignorar conflito"** (limpa o aviso mantendo a geometria divergente) sem flag extra.
3. **Concorrência:** `load → muta → save` roda numa **transação interativa do Prisma com lock de linha** (`SELECT … FOR UPDATE` na linha do molde). Requests do mesmo usuário serializam; o débito nunca some nem duplica.

## Modelo de dados (Prisma)

```prisma
model Molde {
  userId    String   @id
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  data      Json     // EditorState inteiro serializado
  updatedAt DateTime @updatedAt
}
```

E o lado reverso em `User`:

```prisma
model User {
  // … campos existentes …
  molde Molde?
}
```

Uma linha por usuário. `onDelete: Cascade` remove o molde se a conta for apagada. Gera **uma migração Prisma nova** (`prisma migrate dev` no host; `prisma migrate deploy` roda no entrypoint do container).

`data` é tipado no app como `EditorState` (cast na borda do repositório; o Prisma tipa `Json` como `Prisma.JsonValue`).

## Estrutura de módulos (espelha a Fase A: lógica pura ↔ DB)

### `lib/editor/state.ts` — operações puras, DB-free
Extrai de `lib/mock-data.ts` toda a lógica de manipulação do estado, convertida de "mutar o global" para **receber/retornar/mutar um `EditorState` passado como argumento**:

- `seedState(): EditorState` — o blank molde (sem peças, chat vazio, "Novo molde", `version: 0`) + créditos padrão (Ateliê, 320/500, renova em 12 dias). Junta o que hoje são `seedPattern`/`seedChat`/`seedCredits`.
- `addMessage(state, message)`, `debitCredits(state, amount)`, `refundCredits(state, amount)`, `bumpVersion(state)`, `setConflict(state, conflict)`, `applySizes(state, sizes)`, `applyPurchase(state, type)` — cada um muta e/ou retorna o `state`.
- `applyGarmentSpec(state, spec)` — re-drafta via `draftGarment`, atualiza pieces/viewBox/spec/baseMeasurements e anexa/limpa o conflito (apply-with-warning). Lógica idêntica à atual.
- `refitManga(state)`, `getSpec(state)` — como hoje, sobre o `state` recebido.
- Helpers `detectConflict`, `cavaMarker` vêm junto (privados do módulo), intactos.

Sem estado de módulo. Testável no Vitest sem Postgres (como `lib/auth/authorize.ts`).

### `lib/db/molde.ts` — repositório (única camada que toca o DB)
- `withMolde<T>(userId, fn: (state: EditorState) => T | Promise<T>): Promise<T>` — abre uma **transação interativa**, faz **`SELECT … FOR UPDATE`** da linha do molde do usuário (via `tx.$queryRaw`), carrega/parseia o `EditorState` (ou `seedState()` se não existir), executa `fn(state)` (que muta o `state` e devolve o payload da resposta), **persiste o `state` (upsert do blob) dentro da mesma transação** e retorna o valor de `fn`. Garante atomicidade do débito.
- `loadMolde(userId): Promise<EditorState>` — leitura **read-only** (para o `GET /api/pattern`), sem efeito colateral: se não houver linha, devolve `seedState()` **sem gravar**. A materialização da linha acontece na primeira mutação (via `withMolde`), mantendo o GET idempotente e livre de escrita.
- `resetMolde(userId): Promise<EditorState>` — sobrescreve com `seedState()` e persiste.

O parse do blob faz um cast único `data as unknown as EditorState` na borda; nenhum outro módulo importa Prisma.

### `lib/mock-data.ts` — **removido**
O nome não faz mais sentido (o molde deixa de ser mock). As rotas passam a importar de `lib/editor/state.ts` (operações) e `lib/db/molde.ts` (persistência).

## Fluxo nas rotas

Cada rota troca `getState()` + mutators globais por `withMolde(userId, …)`. O `userId` vem do `requireUser()` (o guard já devolve `SessionUser` com `id`).

Exemplo — `POST /api/pattern/generate` (comportamento de crédito **inalterado**):

```ts
const gate = await requireUser();
if (gate instanceof NextResponse) return gate;

// validação de corpo/mensagem como hoje (400 se inválido) …

return withMolde(gate.id, async (state) => {
  const cost = COSTS.adjust;
  if (state.credits.balance < cost) {
    return NextResponse.json(
      { status: "insufficient_credits", required: cost, balance: state.credits.balance },
      { status: 402 },
    );
  }
  addMessage(state, { …userMsg… });
  debitCredits(state, cost);
  try {
    const decision = await proposeGarment(state, answering);
    if (decision.decision === "ask")     { addMessage(state, {…questions…}); refundCredits(state, cost); return NextResponse.json({ status: "clarify",  state }); }
    if (decision.decision === "decline") { addMessage(state, {…})           ; refundCredits(state, cost); return NextResponse.json({ status: "declined", state }); }
    applyGarmentSpec(state, decision.spec);
    bumpVersion(state);
    addMessage(state, { …chip −cost, tone conflict? … });
    return NextResponse.json({ status: state.conflict ? "conflict" : "ok", state });
  } catch {
    refundCredits(state, cost);
    return NextResponse.json({ status: "error", state });
  }
});
```

**Nota de atomicidade da resposta 402:** o 402 (saldo insuficiente) retorna de dentro de `withMolde` **sem ter mutado o state** → nada é persistido de fato (upsert idempotente do mesmo valor). Nenhum débito, nenhuma chamada à IA — igual hoje.

Rotas afetadas (todas gated por `requireUser`):
- `GET  /api/pattern` → `loadMolde(userId)`.
- `POST /api/pattern/generate` → `withMolde`.
- `POST /api/pattern/graduate` → `withMolde` (débito 6 / 402).
- `POST /api/pattern/conflict/resolve` → `withMolde` ("fix" = `refitManga`, grátis; "ignore" = `setConflict(state, null)`).
- `POST /api/pattern/reset` → `resetMolde(userId)`.
- `POST /api/billing/purchase` → `withMolde` (`applyPurchase`).

O contrato JSON de resposta (`{ status, state }`, códigos 400/402, formato do `EditorState`) permanece **idêntico** — o cliente (Zustand store) não muda.

## Mudança de UI (regra "surface limitations")

- **Tela de login:** remover a nota "molde compartilhado entre contas / molde por usuário vem na próxima fase" — a limitação deixou de existir.
- **"Salvar versão · em breve":** permanece desabilitado com "em breve" (histórico de versões é fase futura).
- Seed por usuário: mesmo blank molde de hoje + Ateliê 320/500.

## Testes

- **Unit (Vitest, sem Postgres):** operações de `lib/editor/state.ts` — débito/refund, `bumpVersion`, `applySizes`, `applyGarmentSpec` (gera conflito quando `cavaAjusteCm` diverge; limpa quando bate), `refitManga` (limpa o conflito), `applyPurchase` (topup/subscribe), `seedState` (blank + créditos). Migra/adapta o que hoje testa a lógica do mock.
- **Rotas:** seguem com `@/lib/auth/guard` mockado; adicionar mock de `@/lib/db/molde` (`withMolde` executa o `fn` sobre um `EditorState` em memória; `loadMolde`/`resetMolde` devolvem seed) para exercitar o fluxo sem DB. Cobrir: 402 sem débito, débito+apply, refund em decline/clarify/erro, conflito, resolve fix/ignore.
- `npm test` continua **sem exigir Postgres rodando**.
- Verificação final: `npm run build`, `npx eslint app lib components`, e `npm run smoke:prod` (login + geração real persistida) — mais um smoke manual de que o molde **sobrevive a um restart** do container.

## Limitações anotadas

- **Geometria salva pode envelhecer:** se `draftGarment` mudar num deploy futuro, as peças já salvas ficam com a geometria antiga até a próxima geração. Aceitável — é o que o usuário viu por último; a próxima geração re-drafta.
- **Corrida multi-request:** resolvida por transação+lock por usuário (não é limitação).
- **Créditos no blob:** sem ledger/auditoria; a Fase C (billing) extrai créditos para estrutura própria quando precisar de transações de compra/renovação reais.

## Verificação (aceite)

1. Login com `dev@moldai.local`; gerar uma blusa; conferir peças/créditos/versão.
2. **Restart do container do app** (`docker compose restart app`); recarregar — o molde, o chat e o saldo **persistem**.
3. Login com `atelier@moldai.local` (segundo usuário) → molde **em branco e independente** (não vê o molde do `dev`); gerar algo; os dois moldes não se misturam.
4. Fluxo de conflito: aprofundar cava → conflito persistido; "Ignorar" persiste (não volta ao recarregar); "Corrigir manga" limpa e persiste, sem custo.
5. Saldo insuficiente → 402 sem débito; comprar créditos (mock) → saldo persiste.
6. `npm test`, `npm run build`, `eslint app lib components` limpos.
