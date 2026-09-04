# MoldAI — decision log

The full rationale behind the rules in `CLAUDE.md`: what shipped broken, what was
measured, and why each decision went the way it did.

**`CLAUDE.md` is the operative document — it states the rules you must follow, and
it is what gets loaded into every session.** This directory is the archive it points
at, one file per topic, mirroring `docs/architecture/`'s own per-topic split — so a
rule and its rationale are always one predictable path apart. Read the matching file
when you need to know _why_ a rule exists, when you are about to change or argue with
one, or when a bug looks like it might be a repeat of one already paid for.

A third sibling, [`../learnings/`](../learnings/README.md), holds agent-facing session
notes (hook/tooling gotchas, dead ends) — not rationale, and not a place for product or
design decisions, which belong here instead.

Each file below holds the original `CLAUDE.md`/decision-log text for its topic, moved
verbatim from the single `docs/decisions.md` this directory replaced.

| File                                           | Covers                                                                                                                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [drafting.md](drafting.md)                     | Why the drafting engine (`lib/draft/*`) works the way it does — the measurement-vocabulary widening, notches, darts/internals, sub-piece drafters, the trousers archetype, the drafted-ease report — plus the #266→#267 swappable-engine decision |
| [export.md](export.md)                         | Cut-line offsetting/mitring, `foldEdge`-as-chord, sheet-packing growth, and the per-format (SVG/DXF/AAMA/PDF/PLT) export decisions                                                                                                                |
| [seo.md](seo.md)                               | The 2026-09-03 SEO/crawlability audit: `Offer` scoping, `priceDecimalString`, and what was checked and left alone                                                                                                                                 |
| [billing.md](billing.md)                       | `Wallet.planLabel`'s removal, the Planos payment-note reversion, and the annual-billing product decisions                                                                                                                                         |
| [auth.md](auth.md)                             | Google OAuth (#235) integration decisions, including the login button's own layout fix                                                                                                                                                            |
| [conventions.md](conventions.md)               | The old, now partly stale, verbatim copy of `CLAUDE.md`'s Conventions section (see the callout at the top for what has since changed)                                                                                                             |
| [seams-and-assembly.md](seams-and-assembly.md) | The seam-graph conflict detector (#134), the dress waist-join bug and its two-pass fix (#177/#185), and the derived sewing/assembly order (#138)                                                                                                  |
| [generation-flow.md](generation-flow.md)       | The AI generation flow's decision shapes and costing                                                                                                                                                                                              |
| [api-routes.md](api-routes.md)                 | Per-route trust-boundary and body-parsing decisions across `/api/*`                                                                                                                                                                               |
| [screens.md](screens.md)                       | Screen-level product decisions, including the dropped Molde.me import promise                                                                                                                                                                     |
| [size-charts.md](size-charts.md)               | Size-chart import, validation, and per-account chart decisions                                                                                                                                                                                    |
| [client-state.md](client-state.md)             | The five Zustand stores and why none of them share an instance                                                                                                                                                                                    |
| [rate-limiting.md](rate-limiting.md)           | The rate-limit bucket table and the accepted `login_email` trade-off                                                                                                                                                                              |
| [infra.md](infra.md)                           | Local-vs-CI formatting/lint/hook trust — why `pre-push` exists and the two dev-stack Docker traps                                                                                                                                                 |
| [design-system.md](design-system.md)           | The marketing surface's second design system (`/`, `/planos`, `/privacy`, `/terms`)                                                                                                                                                               |
| [design-handoff.md](design-handoff.md)         | Why the design handoff is a reference, not a verdict — the login red-error-labels case study                                                                                                                                                      |
| [overview.md](overview.md)                     | The shipped-roadmap claim, and the screen-scope history behind it                                                                                                                                                                                 |
| [data-layer.md](data-layer.md)                 | The `Pattern.savedAgo` bug and why `PatternRecord` widens `Pattern` instead of patching it                                                                                                                                                        |
| [observability.md](observability.md)           | The unloggable-Anthropic-failure gap `reportError` was built to close                                                                                                                                                                             |
| [slopers.md](slopers.md)                       | Why `Sloper` stores no geometry, and how the name was chosen                                                                                                                                                                                      |
| [i18n.md](i18n.md)                             | The server/client component split history, and the "i18n Fase 2" phasing                                                                                                                                                                          |
| [testing.md](testing.md)                       | The `next-intl` missing-key silent-pass finding, and the `vi.mock` specifier collision                                                                                                                                                            |

<!-- dangling reference note: docs/decisions/api-routes.md still carries a pointer to an "Atelier bases" section that never existed in this archive; flagged inline there rather than invented. -->
