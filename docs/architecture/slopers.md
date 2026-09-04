# Atelier bases (`/slopers`)

> For the why behind these rules, see [`../decisions/slopers.md`](../decisions/slopers.md).
> For universal, cross-cutting rules, see the root [`CLAUDE.md`](../../CLAUDE.md).

A `Sloper` (Prisma, JSON-blob-per-row like `Pattern`/`SizeChart`) holds `SloperData`: `name`, `spec`, and the frozen `sizes`/`baseSize`/`sizeTable`/`sizeChartName?` snapshot — **never the pieces**, because `draftGarment` is deterministic and persisting them would duplicate what the spec already determines. `lib/slopers/convert.ts` holds the pure pair `sloperFromPattern`/`patternFromSloper`, and the round-trip test asserting identical pieces is what licenses not storing geometry; the list thumbnail is drafted server-side for the same reason.

`POST /api/slopers {patternId, name}` copies the snapshot off a pattern the server itself read under the ownership scope — the client never sends a spec, so there is no second `validateSpec`-shaped trust boundary. Creating a pattern from a base (`POST /api/patterns {sloperId}`) costs **0 credits**: it is local drafting with no Anthropic call, the same reason `conflict/resolve` is free (see [`seams-and-assembly.md`](seams-and-assembly.md)).

The UI term is pt-BR "base"; `Sloper` is its translation, not a transliteration — `Block` was unavailable because `lib/draft/body.ts` already exports `BlockOpts` for the per-block (body/sleeve/skirt) drafters.

Screen: `components/slopers/SlopersShell.tsx` + `SloperGrid.tsx` + `SloperCard.tsx`, with their own `useSlopersStore` (`lib/slopersStore.ts`) — the same shell/grid/card-plus-own-store shape as the size-charts screen. Deliberately not folded into `useDashboardStore` even though both screens list cards: a failed create on `/slopers` has to record its error on this screen's store, not the dashboard's — see [`client-state.md`](client-state.md).
