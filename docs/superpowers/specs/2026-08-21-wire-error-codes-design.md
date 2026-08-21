# Wire Error Codes and the End of Hardcoded pt-BR in `app/api` and `lib`

**Status:** approved, ready for planning
**Date:** 2026-08-21

## Goal

Remove every hardcoded pt-BR display string from `app/api/**` and `lib/**`, so that one rule holds without exception:

> **The wire and the database carry codes. pt-BR text is resolved at the edge that renders it, from `messages/pt-BR.json`.**

This closes the "Known asymmetry" paragraph in CLAUDE.md's i18n section, which currently documents a subset of the problem as permanent.

## Why now

The convention hook (`.claude/hooks/check-conventions.mjs`) runs its hardcoded-pt-BR check (CHECK 1) on **`.tsx` files only**. Every route handler is `.ts`, so 43 pt-BR strings accumulated in exactly the blind spot the mechanical check cannot see. Two of them reached persistent storage:

- `Wallet.planLabel` is a Postgres column holding `"Grátis"` / `"Ateliê"`.
- `Pattern.savedAgo` is a field inside the persisted `PatternState` blob holding `"ainda não salvo"` / `"salvo agora"`.

The second is also a live bug independent of i18n: nothing ever recomputes it, so the editor header claims "salvo agora" indefinitely, including after a reload.

A third finding: `lib/db/pattern.ts`'s `patternNotFound()` still returns `"Molde não encontrado."` — pre-rename wording that survived the `Molde`→`Pattern` sweep because no client ever renders it.

## The three mechanisms

Each is already established in this codebase. Nothing new is invented.

| Kind of string                             | Mechanism                                                     | Existing precedent               |
| ------------------------------------------ | ------------------------------------------------------------- | -------------------------------- |
| Wire error payload                         | machine-readable code, `t("errors." + code)` at the call site | `SignupErrorCode`                |
| Server-produced text persisted into a blob | injected `Translate`, emit the resolved string                | `draftGarment`, `detectConflict` |
| Derivable label                            | catalog lookup keyed by the EN enum value                     | `t("garmentType." + spec.type)`  |

## Audited inventory — 43 sites

### A · Wire error payloads (21)

| File                                              | Lines          | Strings                                                                                                                   |
| ------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `app/api/account/password/route.ts`               | 16, 24, 38, 39 | `Corpo inválido.` · `Conta não encontrada.` · `Senha atual incorreta.` · `A nova senha deve ter pelo menos 8 caracteres.` |
| `app/api/account/profile/route.ts`                | 15, 23         | `Corpo inválido.` · `Nome obrigatório.`                                                                                   |
| `app/api/account/route.ts`                        | 16, 24, 36     | `Corpo inválido.` · `Conta não encontrada.` · `Senha incorreta.`                                                          |
| `app/api/patterns/[id]/route.ts`                  | 39, 46         | `Corpo inválido.` · `Nome obrigatório.`                                                                                   |
| `app/api/patterns/[id]/generate/route.ts`         | 31, 38         | `Corpo inválido.` · `Mensagem obrigatória.`                                                                               |
| `app/api/patterns/[id]/graduate/route.ts`         | 24, 42         | `Corpo inválido.` · `Nenhum tamanho válido para graduar.`                                                                 |
| `app/api/patterns/[id]/conflict/resolve/route.ts` | 27             | `Corpo inválido.`                                                                                                         |
| `app/api/size-charts/[id]/route.ts`               | 10, 24         | `Grade não encontrada.` · `Corpo inválido.`                                                                               |
| `app/api/size-charts/[id]/activate/route.ts`      | 14             | `Grade não encontrada.`                                                                                                   |
| `lib/auth/session.ts`                             | 21             | `Login necessário.`                                                                                                       |
| `lib/db/pattern.ts`                               | 21             | `Molde não encontrado.` (stale pre-rename wording)                                                                        |

`Corpo inválido.` is duplicated across **8** routes.

Only the **9** payloads from the three `/api/account/*` routes are ever displayed, and they reach the user through just three call sites — `ProfileSection.tsx:43`, `PasswordSection.tsx:45`, `DangerZoneSection.tsx:34` — each via `setError(result.error ?? t("fallback"))`. The other **12** are dead payload: no client reads `.error` from any other response.

### B · Server-produced chat text, persisted into the pattern blob (7)

| File                                              | Lines        | Strings                                                                                                 |
| ------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| `app/api/patterns/[id]/generate/route.ts`         | 85, 106, 135 | `Pra acertar a modelagem, me responde:` · `Não consegui aplicar esse pedido.` · chip `−{cost} crédito`  |
| `app/api/patterns/[id]/graduate/route.ts`         | 67, 68       | `Graduação aplicada para {list}.` · chip `−{cost} créditos`                                             |
| `app/api/patterns/[id]/conflict/resolve/route.ts` | 41, 42       | `Copa da manga refeita para a cava ajustada — as costuras voltaram a bater.` · chip `correção gratuita` |

### C · `lib/` display text (15)

| File                    | Lines       | Strings                                                                                                     |
| ----------------------- | ----------- | ----------------------------------------------------------------------------------------------------------- |
| `lib/format.ts`         | 19–24       | `relativeTime`: `agora`, `há {n} min`, `há {n}h`, `há {n}d`, plus a hardcoded `toLocaleDateString("pt-BR")` |
| `lib/format.ts`         | 4           | `formatList`'s `" e "` conjunction                                                                          |
| `lib/editor/state.ts`   | 73, 75, 130 | `Novo molde` · `ainda não salvo` · `salvo agora`                                                            |
| `lib/billing/wallet.ts` | 29, 64      | `Grátis` · `Ateliê`                                                                                         |
| `lib/store.ts`          | 163, 206    | `esse ajuste` · `essa graduação`                                                                            |
| `lib/export/index.ts`   | 19          | `A exportação falhou. Tente novamente.`                                                                     |
| `lib/db/sizeChart.ts`   | 82          | `(cópia)`                                                                                                   |

## Design

### 1 · Error codes

New module `lib/api/errors.ts` holding the shared **route-level** vocabulary plus one helper:

```ts
/** Codes any route can emit, independent of domain. */
export type RouteErrorCode = "bad_body" | "unauthorized";

/** One per resource kind. */
export type NotFoundCode =
  "pattern_not_found" | "size_chart_not_found" | "account_not_found";

export const ERROR_STATUS: Record<RouteErrorCode | NotFoundCode, number>;

export function apiError(
  code: string,
  status: number,
  headers?: HeadersInit,
): NextResponse;
```

**How a domain code gets its status.** `ERROR_STATUS` covers only the shared route-level and not-found codes. Domain codes carry their own status per route, in a local `Record` — precisely what `app/api/signup/route.ts` already does with `STATUS: Record<SignupErrorCode, number>`. So `password/route.ts` declares `Record<"wrong_password" | "weak_password", number>` mapping both to 400, and each route keeps a two-line local `fail()` that reads whichever map applies.

`apiError` therefore takes `code: string` rather than a union: the caller has already narrowed the code through its own exhaustive `Record`, and typing the parameter as a fixed union would force every domain union into this module and invert the dependency the colocation rule exists to prevent. The exhaustiveness guarantee lives in the per-route `Record`, which fails to compile if a union member has no status.

`NextResponse` in `lib/` is already the established pattern — `patternNotFound()` lives in `lib/db/pattern.ts` and `requireUser()`'s unauthorized response in `lib/auth/session.ts`. CLAUDE.md's "lib stays framework-free" rule is specifically about **`next-intl`**, which this module does not import.

**Domain codes stay where their pure logic lives.** `ChangePasswordResult`'s `"wrong_password" | "weak_password"` remains in `lib/account/settings.ts`; `SignupErrorCode` remains in `lib/account/signup.ts`. Those unions type a pure function's return value and cannot move without inverting the dependency. Each route unions its domain codes with the shared ones and exports the result as its wire contract, exactly as `signup/route.ts` already does with its local `STATUS` map.

This makes `app/api/account/password/route.ts:36-40` collapse to `return fail(result.error)`. The pure layer was already returning correct codes; the route was converting them to prose and throwing the codes away.

**Client side.** The three settings sections stop doing `result.error ?? t("fallback")` — a construction in which a server-supplied string _outranked_ the catalog — and switch to `t("errors." + result.error)`. Each of `ProfileSection`, `PasswordSection`, `DangerZoneSection` gains an `errors` object in its namespace, shaped exactly like the existing `Signup.errors.*`.

The 18 dead payloads keep carrying a code rather than being deleted, per the uniform-codes decision: the `error` field already exists in each response, so this is a value substitution, not a shape change, and any future client that wants to show a reason has one ready.

### 2 · Server-produced chat text

Resolved through the `Translate` the routes hold, into a new `PatternData.chat.*` sub-object. `generate` and `conflict/resolve` already call `getTranslations("PatternData")`; `graduate` gains one.

`PatternData` is the right namespace because it already holds every other string the server writes into a pattern blob — drafter `detailRows`, piece names, and `detectConflict`'s title/description/suggestion. Chat messages and credit chips are the same class of data.

The credit chips become catalog entries with an ICU plural on `cost`, which also fixes the existing `crédito`/`créditos` split being hardcoded per call site.

### 3 · `lib/` display text

- **`relativeTime` and `formatList`** take a `Translate` as their first parameter. All six call sites (`PatternCard`, `RecentUsageCard`, `UsageSection`, `PageHeader`, `PieceDetailsPanel`, and the `graduate` route) already have a translator in scope. This also removes `relativeTime`'s hardcoded `toLocaleDateString("pt-BR")` in favour of a catalog-driven locale, and `formatList`'s pt-BR `" e "` conjunction, neither of which any grep in this repo had flagged.
- **`lib/db/sizeChart.ts`'s `(cópia)`** — the duplicate route resolves the suffix and passes it in.
- **`lib/store.ts`'s paywall** — `paywall.actionLabel: string` becomes `paywall.action: "adjust" | "graduate" | null`. `PaywallModal` resolves `t("actions." + action)`, which deletes the `charAt(0).toUpperCase() + slice(1)` capitalisation surgery at `PaywallModal.tsx:25-26` — the catalog stores the correctly-cased phrase directly.
- **`lib/export/index.ts`** — `exportPattern` already receives a `t` and ignores it for this one string. One-line fix.
- **`lib/editor/state.ts`'s `"Novo molde"`** — `seedPatternState` takes a `Translate`, threaded from `POST /api/patterns` through `createPattern`. The module already receives a `t` in `applyGarmentSpec` and `refitSleeve`, so this is consistent with its existing signature style.

### 4 · Derive, don't persist

**`Wallet.planLabel`** — dropped. Migration `drop_wallet_plan_label` removes the column; `WalletRecord`, the `Credits` wire type, `lockWallet`/`saveWallet`'s SQL, and `composeEditorState` all lose the field. `PageHeader` resolves `t("plan." + credits.plan)`. This is the catalog-lookup-keyed-by-EN-enum rule applied to the one place that violated it in the database itself, and it makes label-drifts-from-plan structurally impossible.

**`Pattern.savedAgo`** — dropped from the `Pattern` interface in `lib/types.ts`. `loadPattern` widens from `Promise<PatternState | null>` to `Promise<{ state: PatternState; updatedAt: Date } | null>`; `composeEditorState` takes `updatedAt` and the editor renders `relativeTime(t, updatedAt)`. `bumpVersion` stops writing the field.

Old persisted blobs will still contain a `savedAgo` key. Nothing reads it, and TypeScript ignores excess keys on a parsed `unknown`, so **no reset migration is required** — this is deliberately the cheap direction of a blob change, unlike the `reset_moldes_english` precedent that changed the shape readers depended on.

## Testing

~27 assertions across 15 files change. Route tests assert codes rather than prose. Component tests assert against the exported `ptBR` catalog object, never a pasted literal, per the convention.

Two new pure test cases:

1. `ERROR_STATUS` is total over `RouteErrorCode | NotFoundCode` — a compile-time `Record` plus a runtime test that every union member has a status, so adding a code without a status cannot ship.
2. `relativeTime` and `formatList` under an injected fake `t`, asserting they emit keys and interpolation values rather than text.

`npm test`, `npm run lint`, and `npm run build` must all pass. Use `npm run build` for typechecking — bare `tsc` reports a spurious `app/layout.tsx` LayoutProps error under Next 16.

## Landing order

The change touches a Prisma column, a persisted blob type, and a wire contract, so it lands as ordered commits rather than one diff:

1. `lib/api/errors.ts` + all 21 error payloads → codes; the three settings sections resolve them.
2. Server-produced chat text → `PatternData.chat.*`.
3. `lib/` display text → the `Translate` seam (`format`, `store`/paywall, `export`, `sizeChart`, `seedPatternState`).
4. Derive-and-drop: the `planLabel` migration and the `savedAgo` removal, including the `loadPattern` widening.

Each commit leaves the suite green.

## CLAUDE.md updates

1. Delete the "Known asymmetry, not yet reconciled" paragraph in the i18n section — it becomes false.
2. Record `lib/api/errors.ts` and the codes-on-the-wire rule in the language-boundary bullet.
3. Note that `Wallet.planLabel` and `Pattern.savedAgo` are gone and why (derivable; the latter also always lied after a reload).
4. Note that the convention hook's CHECK 1 is `.tsx`-only, which is why this drift accumulated — so the next reader knows the mechanical check does not cover route handlers.

## Out of scope

- **The AI's `assistantMessage` and clarifying-question labels.** Model-produced, and `lib/ai/prompt.ts` deliberately instructs the model to mirror the user's own language. Not catalog text by design.
- **`app/layout.tsx:22`'s metadata description.** Next route metadata is a Server Component export that legitimately sits outside next-intl; the convention hook already exempts it via `metadataRanges`.
- **English `throw new Error(...)` messages** in `lib/ai/`. Developer-facing, never rendered.
- **DXF file-content strings** (`lib/export/dxf.ts:92`, `dxf-aama.ts:45`) containing `tam` / `folga` / `camada`. These are bytes inside an exported CAD file, not UI, and changing them changes exported artifacts. Worth revisiting alongside the AAMA "Fase 2.5" work, not here.
