---
name: docs-audit
description: Audit docs/architecture/*.md (and CLAUDE.md) claims against the current codebase — file paths, counts ("seven formats", "30 routes"), file:line anchors, and absolute statements ("no second engine is registered", "X is the only consumer of Y") — and report drift. Use when asked to audit/check/verify the architecture docs, when a doc's file:line citation looks wrong, or before trusting a count/claim in docs/architecture or docs/decisions — also invocable with /docs-audit. Do not use for reviewing a diff against conventions (use the moldai-conventions agent) or migration safety (use the migration-safety agent).
---

# Docs audit

`CLAUDE.md` states this outright: "several claims here had drifted from the code before this split existed (a screen's import block called an 'inert placeholder' long after it shipped real, a rate-limit table missing two buckets, a token scale that had grown a step) — that's what regular auditing is for." This skill is that audit, made repeatable instead of relying on someone remembering to do it.

You are **read-only by default** — audit and report first. Only edit a doc file if the user asks you to apply the fixes after seeing the report.

## What counts as a checkable claim

Not every sentence in `docs/architecture/*.md` is checkable — many are rules ("never store a computed value") that don't reference current state. Focus on claims that assert something about the repo **as it stands right now**:

1. **A concrete count** — "seven downloadable formats", "30 route.ts files", "three Zustand stores", "16 route.ts files use requireUser()". These go stale the moment a feature ships.
2. **A `path:line` or bare `path` anchor** — every doc file cites real files (`lib/db/pattern.ts:30`, `components/editor/Footer.tsx`). A rename, a line shifting from an unrelated edit above it, or a file moving/disappearing breaks the anchor silently — nothing errors, the doc just becomes wrong.
3. **An absolute/exclusivity statement** — "no second engine is registered", "X is the *only* consumer of Y", "the sole exemption is Z", "sits in exactly N files". These are the highest-value claims to check because they're the ones a reader takes furthest on faith, and the ones a later PR is least likely to think to update (the PR that adds the second thing rarely re-reads the doc that said there'd never be one).
4. **A cross-reference between a rule and its own justification** — a `decisions/<topic>.md` entry that a matching `architecture/<topic>.md` rule cites as precedent; check the precedent still says what the rule claims it says.

## Method

1. Pick scope: one topic file (fast, targeted — do this when you were already reading that file for a task) or a full sweep of `docs/architecture/*.md` + `CLAUDE.md` (slower, do this when explicitly asked for a full audit).
2. For each file, extract the checkable claims per the four categories above.
3. For a **count claim**: find the actual count with a real command (`grep -rl requireUser app --include=route.ts | wc -l`, `ls lib/export/*.ts | grep -v test`, etc. — the same commands the doc's own author used, several of which are already given inline in the docs, e.g. `migration-safety.md`'s own reminder to verify the `requireUser` count "rather than trusting this count"). Compare.
4. For a **path/anchor claim**: open the file at that path. If it doesn't exist, `git log --follow` or a targeted `Grep` for the symbol name to find where it moved. If it exists, check the cited line still contains what the doc says it does (a line number a few off after unrelated edits is a near-miss, not a full miss — note it, but weight it lower than a fully wrong citation).
5. For an **absolute statement**: grep for the thing it claims doesn't exist / is unique. A registry file (`lib/draft/engine/registry.ts`, `lib/db/*`) is usually the fastest place to check an "only" or "no second" claim, since it's the single place new instances get added.
6. Rank findings by consequence, not just count: a wrong `path:line` a reader would open and get confused by outranks a stale adjective; an absolute claim that's now false outranks both, since it actively misleads a decision.

## Output format

Same shape as the `migration-safety`/`moldai-conventions` review agents, for consistency:

```
N. [HIGH|MEDIUM|LOW] <the stale claim, quoted>
   Where: docs/architecture/<file>.md:<line>
   Reality: <what the codebase actually shows, with the command or file:line that proves it>
   Fix: <the specific replacement text, or "delete — no longer true">
```

Then: `Verdict: <N stale claims found | CURRENT — spot-checked claims still match the code>`.

If the user asks you to apply the fixes, edit the doc file directly — this is the one case this skill writes, and only after the report has been shown and the user has asked for it.

## Worked example (verified live in this repo — a good calibration for what "HIGH" looks like)

```
1. [HIGH] "No second engine is registered" (docs/architecture/drafting.md:8)
   Where: docs/architecture/drafting.md:8
   Reality: lib/draft/engine/registry.ts's ENGINES record has two entries —
   moldai: moldaiEngine and freesewing: freesewingEngine — registered by #269
   (see the file's own header comment). The freesewing engine drafts tshirt,
   blouse, skirt, and trousers via lib/draft/engine/freesewing/designs/*.
   Fix: replace "No second engine is registered" with a statement that the
   freesewing engine is registered but not the app's default (state which
   ENGINE_ID is default, and cite registry.ts).

2. [MEDIUM] "components/editor/Footer.tsx" cited as the export-menu component
   Where: docs/architecture/conventions.md, docs/architecture/export.md
   Reality: components/editor/Footer.tsx does not exist on main — the export
   menu is now components/editor/ExportModal.tsx (which still reads the
   Footer i18n namespace, per its own comment at line 29), and header actions
   moved to components/editor/HeaderActions.tsx.
   Fix: repoint both docs' anchors at ExportModal.tsx (and HeaderActions.tsx
   where relevant), keep "Footer" only as the i18n namespace name, not a file.

Verdict: 2 stale claims found (1 HIGH, 1 MEDIUM) in a two-file spot check —
run the full sweep for a complete pass.
```

These two were found by the same method above during a broader project review — evidence the drift CLAUDE.md warns about is live in this repo right now, not hypothetical.
