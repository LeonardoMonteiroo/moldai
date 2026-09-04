# Architecture reference

This directory holds one file per subsystem — the operative rules `CLAUDE.md` used to state inline before it grew past what's worth loading into every session. `CLAUDE.md` still holds the universal, cross-cutting rules and the document map; read the topic file for a subsystem before working in it.

Each file here has a matching file of the same name in [`../decisions/`](../decisions/README.md) — the _why_: what shipped broken, what was measured, and the reasoning behind the choice — and, where one exists, in [`../learnings/`](../learnings/README.md) — agent-facing session notes on working in that subsystem, not rules or rationale. Read the architecture file for the rule; read the decisions file when you need to know why it exists, before changing or arguing with it, or when a bug looks like a repeat of one already paid for; read the learnings file for gotchas a session would otherwise waste time rediscovering.

| File                                           | Covers                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| [overview.md](overview.md)                     | What MoldAI is, and current scope                                         |
| [conventions.md](conventions.md)               | Language boundary, copy tone, live regions, on-screen honesty             |
| [design-system.md](design-system.md)           | Tokens, the two type systems, shadcn, type scale, `AppShell`/`PageHeader` |
| [testing.md](testing.md)                       | Vitest projects, `renderWithIntl`, `vi.mock` specifiers                   |
| [infra.md](infra.md)                           | Formatting/lint gates, commands, Docker/Compose                           |
| [design-handoff.md](design-handoff.md)         | The `docs/design/` reference, `scripts/design-review/`                    |
| [data-layer.md](data-layer.md)                 | `Pattern`, pure editor-state logic, thin repositories                     |
| [rate-limiting.md](rate-limiting.md)           | Redis-backed buckets, fail-open policy                                    |
| [observability.md](observability.md)           | `reportError`, `/api/health`, security headers                            |
| [seo.md](seo.md)                               | `metadataBase`, robots/sitemap, structured data                           |
| [auth.md](auth.md)                             | Credentials, email verification, Google OAuth                             |
| [billing.md](billing.md)                       | `Wallet`/`Transaction`, Stripe, the four wallet invariants                |
| [api-routes.md](api-routes.md)                 | Route shape, body parsing, error codes                                    |
| [generation-flow.md](generation-flow.md)       | The AI generation route, attachments, trust boundary                      |
| [seams-and-assembly.md](seams-and-assembly.md) | The seam graph, conflict detection, sewing order                          |
| [drafting.md](drafting.md)                     | `lib/draft/*`, the swappable engine, per-archetype rules                  |
| [size-charts.md](size-charts.md)               | `/size-charts`, patch validation, snapshot-once                           |
| [slopers.md](slopers.md)                       | `/slopers`, atelier bases                                                 |
| [client-state.md](client-state.md)             | The five Zustand stores, error-path conventions                           |
| [screens.md](screens.md)                       | Every full-page screen                                                    |
| [export.md](export.md)                         | `lib/export/*`, the seven export formats                                  |
| [i18n.md](i18n.md)                             | `next-intl`, the `Translate` seam, wire error codes                       |
