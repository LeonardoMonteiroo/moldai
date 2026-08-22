---
name: backlog-issue
description: Create a GitHub issue in this repo's backlog (GitHub Issues on the repo's own remote) in the project's standard shape — a Conventional-Commits-style title, a Context/Why/Acceptance-criteria body, and a required type + priority label pair. Trigger this whenever the user asks to add something to the backlog ("add to backlog: ...", "adiciona ao backlog...", "backlog isso:"), or otherwise asks to file/open/create a GitHub issue for a bug, feature, or roadmap item — even without the word "backlog." Do not use it for questions about existing issues (use gh directly) or for anything that isn't meant to become a tracked, prioritized work item.
---

# Backlog issue

This project's backlog lives in GitHub Issues, triaged with two label
families: an existing type label (`bug` / `enhancement` / `documentation` /
`question`) and a `priority: high|medium|low` label added specifically for
this backlog. Every issue this skill creates carries exactly one of each —
that pairing is what makes the backlog usable as a "what's next" list
instead of an unsorted pile.

## The standard

**Title:** `type(scope): summary` — the exact vocabulary CLAUDE.md's commit
convention uses (`feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `ci`,
`style`). Always English, lowercase summary, imperative mood, no trailing
period — mirror a real commit message, e.g.:

```
feat(export): implement strict AAMA/ASTM notches and drill holes
fix(size-charts): baseMeasurements patch merges instead of replacing
chore(billing): backfill plan label for pre-Phase-C wallets
```

English regardless of what language the request came in — this repo treats
commits, CLAUDE.md, and code identifiers as English artifacts independent of
who's writing them or what language they used to ask; only UI-facing text is
pt-BR. Translate the request's meaning into the title, don't transliterate
it.

**Scope:** the module the item touches. Reuse an existing scope when the
item lands in the same area — check `git log --oneline -50` if unsure what's
already in use; recent scopes include `api`, `editor`, `size-charts`, `ui`,
`a11y`, `billing`, `dashboard`, `export`, `settings`, `stores`, `i18n`,
`rate-limit`, `paywall`. Coin a new scope only when none fit.

**Body**, always these three sections, in this order:

```markdown
## Context
1-3 sentences: what's wrong or missing, and where. Cite the actual file,
route, or behavior when you know it — this is what makes the issue
actionable later instead of a vague reminder.

## Why
The motivation: user impact, a documented limitation this closes, a bug's
blast radius, or which roadmap item this is part of.

## Acceptance criteria
- [ ] Concrete, checkable condition
- [ ] Another one
```

Don't invent acceptance criteria the user didn't ask for and that aren't
implied by the request or the codebase — a vague item can have one or two
criteria; don't pad it to look thorough.

**Labels — both required:**

| Commit type | GitHub label |
|---|---|
| `fix` | `bug` |
| `feat` | `enhancement` |
| `docs` | `documentation` |
| `refactor` / `chore` / `test` / `ci` / `style` | `enhancement` |

Use `question` only when the item is genuinely a question/discussion, not a
work item — pass `--type-label question` to the script to override the
table above.

Priority is required on every issue, even when the user didn't state one —
an untriaged backlog is just a pile again. Infer it:

- **high** — blocks something else, breaks data/money paths (billing,
  auth, migrations), or the user's language signals urgency ("bloqueia",
  "quebra", "urgente", "security").
- **low** — matches this repo's own "em breve" framing, pure polish, or an
  explicit someday/nice-to-have.
- **medium** — the default for everything else: most bug fixes and scoped
  features that aren't blocking anything.

State the priority you picked when you report back (see below) — it's a
guess when the user didn't say so explicitly, and relabeling is one `gh
issue edit <n> --add-label / --remove-label` away.

## Workflow

1. Pull `type`, `scope`, `summary`, and `priority` out of the request. If
   the request is in Portuguese, translate the meaning for the title/body —
   don't paste the Portuguese in.
2. Write the body to a temp file (use the scratchpad directory if one is
   configured) following the three-section template above.
3. Run the script — it validates `type`/`priority`, creates any missing
   label with sensible color/description, and creates the issue:

   ```bash
   .claude/skills/backlog-issue/scripts/create_issue.sh \
     --type feat --scope export --priority medium \
     --summary "implement strict AAMA/ASTM notches and drill holes" \
     --body-file /path/to/body.md
   ```

   `--repo` defaults to whatever `gh repo view` infers from the current
   directory, so this works unmodified in any repo once its own `bug` /
   `enhancement` / `documentation` labels exist (GitHub creates those by
   default) — a missing `priority: *` label is created automatically the
   first time it's needed.
4. Add `--dry-run` first if you want to sanity-check the title/body/labels
   before actually filing — it prints exactly what would be created and
   touches nothing. Drop it to file for real.
5. Report back the issue number/URL and the priority you assigned, so the
   user can relabel in one command if your guess was off.

Creating an issue is visible, shared state — someone else could see it, and
it's not free to undo cleanly (closing isn't deleting). Filing one when the
user's own words already ask for it ("add to backlog: X") needs no separate
confirmation — that request *is* the authorization. But if you're
inferring the need to file an issue from context rather than a direct ask,
check with the user first rather than surprising them with a new issue in
their tracker.
