---
name: backlog-issue
description: Create, list, and resolve GitHub issues in this repo's backlog (GitHub Issues on the repo's own remote). Creation follows the project's standard shape — a Conventional-Commits-style title, a Context/Why/Acceptance-criteria body, and a required type + priority label pair. Trigger this whenever the user asks to add something to the backlog ("add to backlog: ...", "adiciona ao backlog...", "backlog isso:"), file/open/create an issue for a bug, feature, or roadmap item; wants to see what's in the backlog or list/filter open issues; or asks to resolve/fix/close a specific numbered issue ("fix issue #140", "resolve #12", "close issue 8"). Do not use it for a one-off lookup on a single issue (just run `gh issue view` directly) or for work that isn't meant to become or resolve a tracked backlog item.
---

# Backlog issue

This project's backlog lives in GitHub Issues, triaged with two label
families: an existing type label (`bug` / `enhancement` / `documentation` /
`question`) and a `priority: high|medium|low` label added specifically for
this backlog. Every issue this skill creates carries exactly one of each —
that pairing is what makes the backlog usable as a "what's next" list
instead of an unsorted pile.

This skill covers three workflows: **creating** an issue, **listing** the
backlog, and **resolving** an issue end-to-end (implement → commit → push →
close).

## Creating an issue

### The standard

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

### Workflow

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

## Listing issues

No script needed — `gh issue list` directly, scoped to what the user asked
for:

```bash
gh issue list --state open --limit 50                          # everything open
gh issue list --label "priority: high"                         # just the urgent tier
gh issue list --label bug --state open                         # open bugs only
gh issue list --search "export" --state open                   # keyword match
gh issue list --json number,title,labels,createdAt --state open # structured, for sorting/filtering yourself
```

When presenting the list back, group or sort by the `priority: *` label
(high → medium → low) rather than GitHub's default creation-date order —
that's what makes it read as a backlog instead of a chronological log. Call
out any open issue carrying no `priority: *` label at all: it's untriaged
and worth flagging rather than silently sorting it to the bottom.

## Resolving an issue

"Resolve #N" / "fix issue #N" / "close #N" means the full loop: understand
the issue, implement and verify the fix, then commit → push → close. Don't
stop at implementing the code — closing the loop (push + close) is part of
what "resolve" means here, not a separate favor to ask for afterward.

1. **Read the issue first**, don't work from the title alone:
   ```bash
   gh issue view <n> --json title,body,labels,comments
   ```
   The body's `Acceptance criteria` section is the actual definition of
   done — implement against it, and don't consider the issue resolved until
   every checkbox is genuinely satisfied. Check `comments` too; a later
   comment can narrow or redirect the original ask.
2. **Implement the fix** (or feature) per this repo's own conventions —
   CLAUDE.md's architecture/scope rules, the EN-identifier/pt-BR-UI
   boundary, existing test patterns. Add or update tests that exercise the
   acceptance criteria, not just a smoke check.
3. **Verify before committing** — run the relevant test scope at minimum
   (`npm test`, or a narrower `npx vitest run <path>` while iterating),
   `npm run typecheck`, and `npm run lint` on the touched files. Don't
   commit on the strength of "it should work."
4. **Commit** using this repo's Conventional Commits format
   (`type(scope): summary`), with a body that explains *why*, and include a
   `Closes #<n>` line — GitHub auto-closes the issue when this commit lands
   on the repo's default branch, and it's the audit trail linking the fix to
   the report regardless:
   ```
   fix(export): fail fast on an incomplete measurements row instead of hanging

   Closes #140. <why, in 1-3 sentences>
   ```
5. **Push** (`git push`). If this repo's workflow for the change in
   question goes through a PR rather than a direct push to the default
   branch, the `Closes #<n>` line still works — it just fires on merge
   instead of on push — but do not treat "opened the PR" as resolved; the
   issue isn't closed until the code has actually landed.
6. **Close the issue explicitly**, even though step 4 may have already
   auto-closed it on push to the default branch — this call is then a
   harmless no-op, and it's the only thing that actually closes it in a
   PR-based or non-default-branch workflow:
   ```bash
   gh issue close <n> --comment "Fixed in <sha>: <one-line summary of the fix>."
   ```
7. **Report back**: the commit SHA, what changed, and confirmation the
   issue is closed (or, if it's genuinely blocked, say so explicitly rather
   than closing an issue that isn't actually resolved).

Skipping straight to "implemented" without the commit/push/close steps
leaves the backlog stale — the whole point of resolving through this skill
is that the tracker ends up matching reality without a separate follow-up
ask.
