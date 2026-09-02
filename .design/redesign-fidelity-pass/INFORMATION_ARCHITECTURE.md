# Information Architecture: Redesign Fidelity Pass

## Status: Unchanged

This pass validates and corrects the _visual_ implementation of 11 already-designed screens against `docs/design/screenshots/*.png`. It introduces no new pages, no new navigation, no new routes, and no new user flows.

The existing IA stands as-is:

- Public: `/` (signed-out landing), `/planos`, `/login`, `/signup`, `/verify`.
- Post-auth: `/` (dashboard), `/pattern/[id]` (editor), `/pattern/[id]/versions`, `/pattern/[id]/export`, `/size-charts`, `/slopers`, `/import`, `/settings?section=...`, `/onboarding`.

See CLAUDE.md's "Screens" section for the authoritative structure. Nothing here changes it.
