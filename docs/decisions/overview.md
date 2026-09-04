# What this is, and current scope

> This is the _why_. For the operative rule, see [`../architecture/overview.md`](../architecture/overview.md).
> For universal, cross-cutting rules, see the root [`CLAUDE.md`](../../CLAUDE.md).

- **The "real backend" roadmap (Phase A auth → B persistence → C billing) is fully shipped.** This matters as a standing fact about the repo's maturity: none of auth, pattern persistence, or billing is a stub or a mock standing in for a future real implementation — the only deliberately-mocked seam left is the payment gateway itself (see [`billing.md`](billing.md)), and even that has a real Stripe code path behind a flag, just never exercised against a live account from this environment.
- **Pattern editor is the single most complex screen of the design handoff.** Its paywall and seam-conflict warning are implemented inline rather than as separate screens — a screen-count decision, not a technical one.
- **Configurações do usuário / credit management has no design-doc screen at all.** It shipped as original design work because the handoff never speced one — worth knowing before assuming every screen traces back to a `.dc.html` reference.
- **Shipped past the original five MVP subsystems**: the public landing at `/` (#13), `/planos` (#15), the post-signup wizard `/onboarding` (#14), version history at `/pattern/[id]/versions` (#16), the export screen `/pattern/[id]/export` (#17), and the DXF import flow `/import` (#11 — analysis is read-and-verify only; creating a pattern from a parsed file is real, #238). The issue numbers are kept here as a historical trail of when each shipped, not because they're still open questions.
