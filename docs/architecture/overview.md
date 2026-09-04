# What this is, and current scope

> For the why behind these rules, see [`../decisions/overview.md`](../decisions/overview.md).
> For universal, cross-cutting rules, see the root [`CLAUDE.md`](../../CLAUDE.md).

MoldAI is an AI pattern-making product for clothing: chat with an AI to generate/adjust 2D sewing patterns, grade sizes, and export to Audaces/Molde.me/plotter/PDF. This repo is a Next.js app with a real backend:

- **Auth:** see [`auth.md`](auth.md).
- **Chat:** a real Anthropic API call (`claude-sonnet-5`) interprets the user's request and returns a `GarmentSpec` (garment type + measurement overrides + style); the server validates/clamps that spec and drafts the pattern pieces from it — see [`generation-flow.md`](generation-flow.md).
- **Patterns:** persisted per account, many per account (the dashboard's list).
- **Billing:** a real per-account `Wallet` + append-only `Transaction` ledger, shared across the account's patterns — see [`billing.md`](billing.md). The gateway is **Stripe**, behind `PAYMENT_PROVIDER=stripe`; the default is still a **mock** that simulates instant success instead of charging a card, and no live Stripe account has ever been exercised from this repo.

Requires `ANTHROPIC_API_KEY`, `DATABASE_URL`, and `AUTH_SECRET` in `.env.local`.

## Scope

**MVP (small-scale/personal-use production) is five subsystems, all shipped:**

- **Pattern editor** — `/pattern/[id]`. The single most complex screen. The paywall and the seam-conflict warning are implemented inline here — see [`export.md`](export.md), [`seams-and-assembly.md`](seams-and-assembly.md).
- **Dashboard** — the app's home, `/`.
- **Configurações do usuário / credit management** — `/settings`. No design-doc screen exists for it; it shipped as original design work.
- **Medidas e grades (scoped down)** — `/size-charts`. See [`size-charts.md`](size-charts.md).
- **Bases do ateliê** — `/slopers`. See [`slopers.md`](slopers.md).

**Shipped since, past that original five**: the public landing at `/`, `/planos`, the post-signup wizard `/onboarding`, version history at `/pattern/[id]/versions`, the export screen `/pattern/[id]/export`, and the DXF import flow `/import`. See [`screens.md`](screens.md) for all of the above.

**Design source of truth** for what's built vs. what's reference: see [`design-handoff.md`](design-handoff.md).
