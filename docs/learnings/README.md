# Learnings

This directory holds one file per subsystem, same filenames as
[`../architecture/`](../architecture/README.md) and [`../decisions/`](../decisions/README.md) —
so a rule, its rationale, and the session notes about working on it are always one
predictable path apart.

## Scope — agent-facing only

Learnings cover **how to work in this repo**, not what the repo should do:

- hook/tooling behavior an agent would otherwise rediscover the hard way
- silent failures (a mock that never intercepts, a check that passes vacuously)
- environment/dev-stack traps
- an approach that was tried and abandoned, and why it isn't worth retrying
- prompt/agent traps — a phrasing or task shape that reliably produces a wrong turn

**Out of scope, with the destination named:**

- a rule everyone must follow → [`../architecture/<topic>.md`](../architecture/README.md)
- product or design rationale, what shipped broken and what was measured →
  [`../decisions/<topic>.md`](../decisions/README.md)

This tier carries **no normative rules**. If a learning here hardens into something
every agent must follow, move it into the matching architecture file and delete the
entry here — a learning that has become a rule shouldn't also linger as a learning.

## Entry format

Newest entry on top of its file.

```markdown
## YYYY-MM-DD — short title

- **Symptom** — what it looked like from inside a session.
- **What's actually true** — with a `path:line` or command as evidence.
- **Do this instead** — the concrete next action.
```

## Maintenance

- Newest entry on top.
- Delete an entry the moment the thing it describes is gone (a file renamed, a hook
  removed, a bug fixed at the root). A learning about something that no longer exists
  is worse than no learning at all — it sends the next session chasing a ghost.
- Don't create a topic file speculatively. It's created on the first real entry; an
  empty stub is noise. [`INBOX.md`](INBOX.md) holds anything that doesn't map to a
  topic yet.

## Index

Only topic files that actually exist are listed here.

| File                 | Covers                                                         |
| -------------------- | -------------------------------------------------------------- |
| [infra.md](infra.md) | Hooks, dev-stack, and tooling gotchas not documented elsewhere |
| [INBOX.md](INBOX.md) | Learnings that don't map to a topic file yet                   |
