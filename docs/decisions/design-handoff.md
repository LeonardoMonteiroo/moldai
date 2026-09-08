# Design handoff: reference, not verdict

> This is the _why_. For the operative rule, see [`../architecture/design-handoff.md`](../architecture/design-handoff.md).
> For universal, cross-cutting rules, see the root [`CLAUDE.md`](../../CLAUDE.md).

### The design handoff is a reference, not a verdict (login's red error labels)

**The rule this changed.** `CLAUDE.md` used to end the marketing-surface divergence
note with "Every other screen's `.dc.html` remains authoritative." Read literally that
makes the handoff unfalsifiable: any place the app is better than the drawing becomes a
bug to be closed, and a screenshot-alignment pass is licensed to revert product
judgement it cannot see the reasoning for. That is the wrong default for a handoff
that was drawn once, in one pass, without the app's states in front of it.

**What surfaced it.** A screen-by-screen design review reached `/login`'s
invalid-credentials state. Three real divergences came out of it (the email input never
got `aria-invalid`, so only the password field reddened; `FieldError` rendered at 12.5px
against the design's 11.5px; every form label rendered at 13.5px against the design's
12.5px — all 21 `<label>` elements across all 12 `.dc.html` files are 12.5px, with no
exception). Those three were implementation drift and were fixed toward the design.

**The fourth was not drift.** `Field`'s `data-[invalid=true]:text-destructive` colours
the whole field subtree, so the labels turn `--color-alert` alongside the input border
and the message. `Autenticacao.dc.html` reddens only the border and the message and
leaves the labels at default ink. Asked to choose, the call was to **keep the coloured
labels and change the rule instead** — the design's error styling is the weaker of the
two, and a rule that cannot lose an argument to the product is not a rule, it is a
freeze.

**So the framing is now: reference, not verdict — with the bar being a stated reason.**
An unrecorded difference is still drift; the thing that makes a divergence legitimate is
that someone wrote down why. "I preferred it" in this file is a decision. The identical
difference left only in the code is an accident, and the next tidying pass will
correctly remove it.

**Scope note.** The three real fixes landed in the primitives, not per call site
(`components/ui/label.tsx` for the 12.5px label, `components/ui/field.tsx` for
`FieldError`/`FieldDescription`/`FieldTitle`), so they reach all 13 `Field` consumers at
once. The same review also found the login email bug's twin in
`PasswordSection`'s "nova senha" field — a `Field` marked `data-invalid` whose `Input`
carried no `aria-invalid`, announcing a field as valid while showing it as failed.

### The redesign handoff's four real content/behavior changes, closed as #232–#235

The README's diff against the current app surfaced four real content/behavior changes, each flagged there with an open question at the time — **all four have since shipped:**

1. **Dashboard's onboarding checklist** ("Comece com o pé direito · N de 5", 5 steps) shipped as `OnboardingChecklistCard.tsx` (#232). Its "convidar alguém da equipe" step resolved the multi-user-per-account question by staying permanently unreachable — disabled + "em breve" badged, never a checkmark — rather than built or linked externally, since multi-user accounts still don't exist. Dismissal is `localStorage`-only (browser-local, not synced per account), per the #232 spec.
2. **Settings menu reorder** shipped (#233) — `SETTINGS_SECTIONS` is now profile, password, usage, plan, **danger** (last). It used to be profile, password, danger, usage, plan; moving danger to the end was the deliberate change #233 made.
3. **Version comparison's Comprimento (length) delta** shipped (#234) — `VersionCompare.tsx` renders it alongside the existing Cava/Consumo deltas via `lengthDeltaLabel`.
4. **Login's "Continuar com Google" button** shipped (#235) — not decorative: `auth.ts` gained a real Google OAuth provider first (see [`auth.md`](auth.md)), so the button signs in for real.

Everything else in the redesign package (Landing, Onboarding, Bases do ateliê, Medidas e grades, Importação, Editor, Planos, Versões layout) was visual/layout refinement of content that already matched `messages/pt-BR.json` and the current components — a styling pass, not new scope. All 11 screens have a closed `.specs/features/redesign-*` entry (spec + validation, most with tasks.md), each checked against the `.dc.html`'s stated values via tests and mutation testing.

### Plano de corte's mockup describes a tool the app doesn't have (#280)

**What surfaced it.** `CutPlanTab`'s own density/spacing review (issue #280), the follow-up `docs/design/README.md` §5 had flagged since the original pass. `Editor.dc.html`'s Plano de corte state renders a two-pane layout: the nesting preview on the left, and a 250px sidebar on the right holding a "Quantidade por tamanho" batch grid (per-size quantity steppers) and an editable "Peças" list (arbitrary named rectangles, add/remove, width/height typed in) behind an "Otimizar corte" button. None of that is real — the mockup's own script (`SIZES`, `CORTE_DEFAULT_PIECES`, `batchBySize`, `cortePieces`) is synthetic demo state with no backing feature. `lib/export/cutplan.ts` computes the real cut plan straight from the pattern's own drafted pieces (`cutInstancesFromModel`) — there is no per-size batch quantity independent of the pattern's own size grading, and no arbitrary user-defined rectangle a plan could nest instead.

**The call, at the time.** Reproducing the mockup's sidebar in full would have meant inventing a batch-cutting/free-form-piece feature that didn't exist anywhere else in the product, which CLAUDE.md's "surface limitations, never invent capabilities" rule ruled out. So the divergence stood: `CutPlanTab` kept its real auto/manual nesting toggle, its metrics derived from the actual plan, and its single-column scrollable layout (the same header-then-content shape `TechSheetTab`/`Proof3DTab` already use, itself an established, deliberate divergence from the design's floating-canvas chrome for content-heavy tabs). What DID move toward the design at that point, because it cost nothing and had a real analog: the legend row (Fundo/Tecido/Peça do molde) and the fabric-weave texture behind the preview's pieces, the section labels' `text-tick` (10.5px) size, and the preview card's `bg-surface` + 18px padding.

**Reversed, in part.** The "Quantidade por tamanho" half of the sidebar has since been built for real (this change): `Pattern.cutQuantities` is a genuine, persisted per-size quantity map (`lib/types.ts`, validated by `lib/export/cutQuantities.ts`, written through `PATCH /api/patterns/[id]/cut-plan`), and `lib/export/cutplan.ts`'s `planCutLayout` nests every requested size's copies together when it's set — a real capability, not a mockup echo. `CutPlanSizePanel.tsx` docks it as its own 250px column, matching the mockup's width. The "Peças" arbitrary-rectangle list and the "Otimizar corte" button are the part of the call that still stands: neither has a backing capability (there is still no user-defined rectangle a plan could nest, and the real auto/manual toggle already covers what "Otimizar corte" implied), so they remain unbuilt on purpose.

**Still open.** Prova 3D and Ficha técnica have not had this same pass yet — `docs/design/README.md` §5 still marks them pending.

### The written-spec verification wasn't the same evidence as a screenshot, and it showed

**That written-spec verification is not the same evidence as a rendered screenshot next to the reference PNG, and it had never been done** — a component can match every value a spec states and still look wrong next to its neighbors. A real screenshot-vs-`docs/design/screenshots/*.png` pass (2026-09-02) closed that gap and found four real, code-level-invisible divergences, all now fixed:

- `PageHeader`'s credits chip had drifted into a two-line block with a full-width bar and a separate button, against the design's single compact 30px pill — this affected every authenticated screen, not just the one that surfaced it.
- `LandingNav` had no current-page highlight for "Planos".
- Login's footer carried an extra sentence beyond the design's copy.
- `SettingsSidebar` was missing its "Conta" eyebrow label.

**Two things surfaced but were deliberately left unbuilt, as new scope rather than visual fixes:** Planos' nav swapping "Dúvidas" for a "Formatos" link (implies a page section that doesn't exist), and a per-message version chip in the chat log (would need version-per-message tracking added to the data model).

**The drivers are versioned, and they are not tests.**
`scripts/design-review/` holds one scenario per screen state (`node
scripts/design-review/run.mjs login.invalid`), whose job is to put the real app into
one real state — a genuine failed login, a genuinely rate-limited account, a real
mailed reset link out of Mailpit — and leave it on screen at the reference captures'
own 1280×900 next to the `.dc.html` it is being compared against. The values each
scenario prints are **reported, never enforced**: a difference is something to look at
and decide about, which is the conversation this whole entry is about, so a driver
must never be able to fail a build. It reaches Playwright by absolute path inside
`.claude/skills/playwright-skill/node_modules` rather than adding a dependency, the
same arrangement this repo already uses to drive a browser. Redis buckets are cleared
through the container up front, because every account these scenarios use fails on
purpose and would otherwise soft-lock its own helper by the tenth run.
