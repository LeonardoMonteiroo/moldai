# Backend real — Fase C (billing/créditos reais) — Design

## Contexto

Roadmap "real backend" A→B→C do MoldAI: Fase A (auth real, Auth.js v5 + Postgres/Prisma)
e Fase B (persistência real do molde por usuário) já estão em `main`. Falta só billing:
hoje `applyPurchase` (`lib/editor/state.ts`) é um mock — o botão "comprar" no
`PaywallModal` só soma créditos num campo `credits` dentro do mesmo blob JSON do
molde (`Molde.data.credits`), sem cobrança real, sem histórico auditável, sem
renovação de assinatura de verdade (`renewsInDays` é um número estático que reseta
pra 30 quando clica "assinar").

Esta fase torna o billing "real" no mesmo sentido que A e B foram: infraestrutura
de verdade (Postgres, transação atômica, ledger auditável, renovação por data real
com um job automático) — **sem** integração com gateway de pagamento real (Stripe
etc.) — decisão confirmada com o usuário: o clique em "comprar"/"assinar" continua
simulando sucesso instantâneo, só que agora grava um ledger de verdade e mexe numa
wallet relacional própria em vez de um campo dentro do JSON do molde.

## Decisões confirmadas com o usuário

1. **Ledger real, sem gateway de pagamento** — tabela de transações no Postgres,
   sem Stripe/checkout real.
2. **Renovação automática por cron/job** — não é só uma data estática; um mecanismo
   de fundo credita o plano de verdade quando `renewsAt` vence, sem ação do usuário.
3. **Saldo reseta pro total do plano na renovação** (não acumula) — modelo
   "use ou perde", padrão SaaS.
4. **Sem UI nova** — Topbar/PaywallModal continuam exatamente como estão; história
   de transações fica pra quando o dashboard entrar em escopo.
5. **Arquitetura: `Wallet` + `Transaction` em tabelas próprias**, separadas do
   `Molde` (Abordagem B, escolhida sobre manter tudo dentro do blob do molde) —
   aceitando o custo de precisar de uma transação que trava as duas linhas
   (`Molde` + `Wallet`) nos dois endpoints que hoje debitam crédito.

## Modelo de dados (Prisma)

```prisma
model Wallet {
  userId       String        @id
  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  plan         String        // PlanId: "free" | "atelier" | "studio" | "factory"
  planLabel    String
  balance      Int
  total        Int
  renewsAt     DateTime?     // null = sem assinatura recorrente ativa
  updatedAt    DateTime      @updatedAt
  transactions Transaction[]
}

model Transaction {
  id           String   @id @default(cuid())
  userId       String
  wallet       Wallet   @relation(fields: [userId], references: [userId], onDelete: Cascade)
  type         String   // "debit" | "refund" | "topup" | "subscribe" | "renew"
  amount       Int      // sempre positivo; sinal implícito pelo type
  balanceAfter Int
  reason       String?  // "generate" | "adjust" | "graduate" | "purchase-topup" | "purchase-subscribe" | "cron-renew"
  createdAt    DateTime @default(now())

  @@index([userId, createdAt])
}
```

`User` ganha `wallet Wallet?` ao lado do já existente `molde Molde?`.

`renewsAt` como coluna real (fora do JSON) é o que permite ao cron consultar
"quem vence agora" (`WHERE renewsAt <= now()`) com índice, em vez de escanear e
desserializar todo blob de todo usuário.

## Módulos (mesmo padrão pure-logic + repositório fino já usado em auth/molde)

- **`lib/billing/wallet.ts`** — lógica pura, sem DB, testável isolada:
  - `Wallet` / `LedgerEntry` types
  - `seedWallet(now: Date): Wallet` — mesmos valores default de hoje (plano
    Ateliê, 320/500), `renewsAt = now + 12 dias` (replica o "renova em 12 dias"
    que a seed mockada mostra hoje, agora como timestamp real)
  - `debitWallet(wallet, amount, reason): LedgerEntry`
  - `refundWallet(wallet, amount, reason): LedgerEntry`
  - `applyPurchase(wallet, type: "topup" | "subscribe", now: Date): LedgerEntry`
    — topup soma 100 ao saldo; subscribe fixa plano Ateliê, `balance = total = 500`,
    `renewsAt = now + 30 dias`
  - `renewWallet(wallet, now: Date): LedgerEntry` — `balance = total`;
    `renewsAt` avança 30 dias a partir do `renewsAt` agendado anterior (não a
    partir de `now`, pra não acumular atraso se o cron rodar um pouco depois
    do horário exato)
  - Cada função muta o `wallet` in-place e **retorna** o `LedgerEntry`
    correspondente, já com `balanceAfter` capturado logo após a mutação —
    quem chama só acumula as entries num array e entrega pro repositório persistir.

- **`lib/db/wallet.ts`** — único lugar que toca Prisma pra wallet:
  - `withWallet<T>(userId, fn): Promise<T>` — load→trava (`FOR UPDATE`,
    seed via `INSERT ... ON CONFLICT DO NOTHING` se a linha não existir, mesmo
    padrão de `withMolde`)→`fn(wallet)` retorna `{ result, entries }`→salva
    wallet + insere as `entries` no ledger (`createMany`)→retorna `result`
  - `loadWallet(userId): Promise<Wallet>` — leitura sem lock, get-or-seed,
    pro `GET /api/pattern` e pra compor resposta de rotas que não mexem em wallet
  - `resetWallet(userId): Promise<Wallet>` — mirror de `resetMolde`, reseeda a
    wallet pra `seedWallet(now)` e persiste (upsert)

- **`lib/db/molde-wallet.ts`** (novo) — `withMoldeAndWallet<T>(userId, fn)`:
  a **única** função que trava as duas linhas na mesma transação Prisma —
  **sempre** `Molde` primeiro, `Wallet` depois (ordem fixa documentada como
  invariante no código e no `CLAUDE.md`, pra nunca existir risco de deadlock
  por lock cruzado). `fn(state, wallet)` retorna `{ result, entries }`; salva
  os dois + insere as entries, tudo atômico.

- **`lib/editor/state.ts`** perde `Credits`/`seedCredits`/`debitCredits`/
  `refundCredits`/`applyPurchase` — o `EditorState` "puro" desse módulo passa a
  ser só pattern/chat/conflict (sem `credits`).

- **`lib/api/compose.ts`** (novo, pequeno) — `composeEditorState(moldeState, wallet, now): EditorState`:
  monta o `EditorState` completo (formato que a API/store já expõem hoje,
  incluindo `credits.renewsInDays` calculado a partir de `wallet.renewsAt` real)
  pra devolver na resposta JSON. **Zero mudança no client/store/componentes** —
  eles continuam lendo os mesmos campos de sempre.

## Rotas afetadas

| Rota                                 | Antes                                                                           | Depois                                                                                                                                                              |
| ------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/pattern/generate`         | `withMolde`                                                                     | `withMoldeAndWallet`; `debitCredits`/`refundCredits` → `debitWallet`/`refundWallet` empurrando pra `entries`                                                        |
| `POST /api/pattern/graduate`         | `withMolde`                                                                     | `withMoldeAndWallet`, idem                                                                                                                                          |
| `POST /api/pattern/conflict/resolve` | `withMolde`                                                                     | continua `withMolde` (não mexe em crédito) + `loadWallet` pra compor a resposta                                                                                     |
| `GET /api/pattern`                   | `loadMolde`                                                                     | `loadMolde` + `loadWallet` → `composeEditorState`                                                                                                                   |
| `POST /api/pattern/reset`            | `resetMolde` (que já reseedava `credits` junto, por `seedState()` incluir tudo) | `resetMolde` + novo `resetWallet(userId)` (mirror do `resetMolde`, reseed pra `seedWallet(now)`) — preserva o comportamento atual de "resetar" zerar créditos junto |
| `POST /api/billing/purchase`         | `withMolde` (chamava `applyPurchase(state, type)`)                              | `withWallet` (chama `applyPurchase(wallet, type, now)`) + `loadMolde` pra compor a resposta                                                                         |

## Renovação automática (cron)

Sem scheduler externo disponível no projeto (self-hosted Docker Compose, sem
Vercel Cron) — mecanismo consistente com o que já existe (`prisma/seed.ts`
rodado via `tsx`, `docker-entrypoint.sh` orquestrando comandos):

- **`scripts/cron-renew.ts`** — script standalone (roda via `tsx`, como o seed):
  busca `prisma.wallet.findMany({ where: { renewsAt: { lte: now } } })`, e pra
  cada wallet vencida chama `withWallet(userId, wallet => ({ result: null,
entries: [renewWallet(wallet, now)] }))`. Loga quantas renovou. Usa imports
  relativos (`../lib/...`), não o alias `@/`, mesma convenção do `seed.ts`
  (evita depender de resolução de path alias fora do Next).
- **`package.json`**: novo script `"cron:renew": "dotenv -e .env.local -- tsx scripts/cron-renew.ts"`
  (mesmo padrão de `db:seed`), pra rodar manualmente/local.
- **Docker Compose**: novo serviço `cron` (mesma imagem `runner`/`dev`, variando
  só o `command`) rodando um loop simples: renova, dorme 1h, repete —
  `sh -c "while true; do npx tsx scripts/cron-renew.ts; sleep 3600; done"`.
  Precisa do mesmo `DATABASE_URL`/`env_file` do serviço `app`. Adicionado tanto
  em `docker-compose.yml` (dev) quanto herdado em `docker-compose.prod.yml`.
- **`Dockerfile`**: o estágio `runner` ainda não copia `scripts/` (só usa
  `prisma/seed.ts` hoje) — precisa de `COPY --from=build /app/scripts ./scripts`
  pro serviço `cron` conseguir rodar o script em produção. `tsx` já está
  disponível (`npm ci` sem `--omit=dev` instala devDependencies também, e o
  `runner` copia o `node_modules` inteiro do estágio `build`).

## Migração / dados existentes

Nova migração Prisma cria as tabelas `Wallet`/`Transaction`. **Sem backfill
dos créditos que já estão no JSON do molde** — dado que só existem contas de
desenvolvimento seedadas (`dev@moldai.local`/`atelier@moldai.local`, sem
usuários reais em produção ainda), a wallet desses usuários é populada
"de graça" pelo mesmo mecanismo de seed-on-missing que `withWallet`/`loadWallet`
já fazem — ou seja, a conta dev simplesmente recomeça com o saldo padrão
(320/500 Ateliê) na primeira requisição após o deploy, igual ao que já
aconteceu uma vez antes com a migração `reset_moldes_english`. Documentado
aqui como decisão deliberada, não uma omissão.

## Testes

- `lib/billing/wallet.test.ts` — testa cada função pura isolada (debit/refund/
  purchase/renew), sem DB, incluindo o caso de `renewWallet` avançar a partir
  do `renewsAt` agendado (não de `now`).
- `lib/db/wallet.test.ts` — mirror do `lib/db/molde.test.ts` já existente
  (mesmo padrão de teste do repositório).
- Testes de rota existentes (`generate/route.test.ts`, `graduate/route.test.ts`,
  etc.) ajustados pros novos helpers, mantendo as asserções de comportamento
  (débito, refund, 402 em saldo insuficiente) idênticas — só a implementação
  interna muda.
- `scripts/cron-renew.ts` — sem teste automatizado formal (é um script standalone
  de infra, como o `seed.ts`, que também não tem teste); a lógica de negócio que
  importa (`renewWallet`) já é coberta pelos testes puros.

## Fora de escopo (Fase C)

- Gateway de pagamento real (Stripe ou equivalente) — decisão confirmada, fica
  pra uma fase futura se algum dia o produto processar dinheiro de verdade.
- UI de histórico de transações — fica pro dashboard (fora de escopo do editor).
- Downgrade/cancelamento de assinatura — não existe hoje no mock, não é
  introduzido aqui.
- Planos "studio"/"factory" (existem no `PlanId` mas não têm preço/fluxo no
  `PaywallModal` hoje) — permanecem não implementados, como já são.
