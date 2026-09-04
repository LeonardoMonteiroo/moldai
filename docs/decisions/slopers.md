# Atelier bases (`/slopers`)

> This is the _why_. For the operative rule, see [`../architecture/slopers.md`](../architecture/slopers.md).
> For universal, cross-cutting rules, see the root [`CLAUDE.md`](../../CLAUDE.md).

- **The round-trip test asserting identical pieces is what licenses not storing geometry** — `lib/slopers/convert.ts`'s `sloperFromPattern`/`patternFromSloper` pair only earns the right to omit `pieces` from `SloperData` because a test proves `draftGarment(spec, ...)` reproduces byte-identical output from the frozen snapshot alone. Without that proof, dropping the pieces would be an unverified assumption, not a documented guarantee.
- This follows the `Pattern.savedAgo`/`Wallet.planLabel` lesson (see [`data-layer.md`](data-layer.md) and [`billing.md`](billing.md)) **applied before the fact** rather than discovered after a bug: don't persist a second copy of a fact a spec + frozen measurements already determine.
- **`Block` was the first name tried for this concept and was unavailable** — `lib/draft/body.ts` already exports `BlockOpts` for the per-block (body/sleeve/skirt) drafters, so reusing "Block" for the atelier-base concept would have collided with an unrelated, already-shipped meaning of the word in the same codebase. `Sloper` was chosen as the closest real pattern-making term that didn't collide.
- **"A failed create on `/slopers` has to record its error on this screen's store, not the dashboard's"** is restated in `client-state.md` and `screens.md` too because it's the concrete reason `/slopers` was never folded into `useDashboardStore` even though both screens list similarly-shaped cards — it is the one fact that keeps recurring every time someone proposes sharing the store.
