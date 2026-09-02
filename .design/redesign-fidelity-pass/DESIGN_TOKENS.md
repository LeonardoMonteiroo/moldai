# Design Tokens: Redesign Fidelity Pass

## Status: Audited existing system — no additions

This project's tokens are **locked and already complete** in `app/globals.css` (Tailwind v4 `@theme`/`@theme inline` blocks — there is deliberately no `tailwind.config.ts`). CLAUDE.md is explicit: _"Extend the `@theme` block; never hardcode hex values in components"_ and shadcn's semantic names exist only as aliases onto these tokens, never a literal value of their own.

This pass **adds nothing**. What follows is the actual, current token set (read live from `app/globals.css`), so every fix made during Phase 6 has a single accurate reference instead of a guess.

## Color

```
--color-ink:              #1c1c19
--color-paper:            #f4f2ec   (page background, set on body)
--color-surface:          #ffffff   (raised surfaces — cards, modals, dialogs)
--color-surface-alt:      #fcfbf7
--color-border:           #ded9cc
--color-line:             #f0ece1
--color-grid-line:        #e8e4d8
--color-olive:            #4a5a3a   (brand / primary action)
--color-olive-dark:       #38452c
--color-olive-tint:       #eaeee2
--color-olive-border:     #d7ddc9
--color-olive-foreground: #f7f7f2   (text/icon on an olive fill)
--color-amber-bg:         #fdf3d8   (notice, not error)
--color-amber-border:     #f0dfa8
--color-amber-text:       #7a5f14
--color-muted:            #6e6b60   (darkened from the handoff's #8b8779 — that
                                      failed WCAG AA on every ground it's used
                                      against; this clears 4.5:1)
--color-muted-2:          #5a564a
--color-placeholder:      #a29e91
--color-disabled:         #b8b3a4
--color-disabled-border:  #ece8dd
--color-pattern-guide:    #b3ab93
--color-alert:            #b5502f   (destructive / red alert token)
--color-track:            #ece8dd
--color-overlay:          rgba(28, 28, 25, 0.28)
--color-google-{blue,green,yellow,red}   (fixed by Google's own brand guidelines, not ours to retint)
```

shadcn semantic aliases (`--color-background`, `--color-primary`, `--color-accent`, `--color-destructive`, `--color-ring`, etc.) map onto the above in a second `@theme inline` block — `--color-border` and `--color-muted` are **deliberately not aliased** (shadcn's "muted" means a surface; this repo's means text).

## Radius

```
--radius-chip:  6.5px
--radius-btn:   9.5px
--radius-item:  11px
--radius-card:  13.5px
--radius-modal: 16px
--radius-pill:  20px
```

## Shadow

```
--shadow-card:  0 2px 10px rgba(28, 28, 25, 0.07)
--shadow-modal: 0 12px 34px rgba(28, 28, 25, 0.22)
--shadow-plan:  0 3px 14px rgba(74, 90, 58, 0.13)
```

## Typography

```
--text-tick:    10.5px
--text-meta:    11.5px
--text-ui:      12.5px   (default UI size)
--text-control: 13.5px   (buttons/inputs/tabs)
--text-body:    16px
--text-title:   21px
--text-display: 26px
--text-hero:    54px, line-height 1.02   (LandingHero + Planos hero only)

--tracking-eyebrow:  0.08em   (uppercase labels)
--tracking-wordmark: -0.4px   (the wordmark only, in auth pages + headers)
--tracking-hero:     -1.6px   (LandingHero + Planos hero only)

Fonts: --font-sans → Archivo (body/UI), --font-display → Bricolage Grotesque (display),
both via next/font/google in app/layout.tsx.
```

`font-normal` is the body-text default — `font-semibold` is reserved for real emphasis, not a default weight (it had spread to 85 call sites before the sweep that fixed this).

## Layout / Breakpoints

No named breakpoint tokens exist beyond Tailwind's own defaults (`sm`/`md`/`lg`/`xl`/`2xl`) — the project uses those directly rather than a custom scale. Not a gap for this pass: reference screenshots are desktop-only (see brief), so no breakpoint work is in scope.

## Motion

No named duration/easing tokens exist. Transitions in this codebase use Tailwind's default `transition` utilities inline, not a custom motion scale. Out of scope for this pass — a fidelity audit doesn't introduce a new motion system.

## Dark Mode — explicitly NOT generated

This app is **light-only by deliberate design decision**, documented in CLAUDE.md: `@custom-variant dark (&:is(.dark *))` keeps every shadcn `dark:` class permanently inert, because `.dark` is never set anywhere. Generating a dark palette here would contradict that decision. This is the one place this pass departs from the design-tokens skill's default template, and it departs on purpose.

## Gaps found

None. Every value any of the 11 screens' reference `.dc.html`/screenshots calls for (per `docs/design/README.md`'s own confirmation: _"Cores, tipografia, espaçamento e componentes vêm do design system moldai-ui já publicado"_) already exists above. If Phase 6 finds a screen needs a value not in this list, that is a stop-and-confirm moment, not a silent addition.
