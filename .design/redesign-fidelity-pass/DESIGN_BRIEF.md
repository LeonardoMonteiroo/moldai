# Design Brief: Redesign Fidelity Pass

## Problem

The MoldAI redesign handoff (`docs/design/`) was implemented and, per commit history, formally validated screen by screen through `.specs/features/redesign-*` — but every one of those validations checked the implementation against the _written spec's_ stated values (class names, rem/px figures, copy strings), verified with tests and mutation testing. None of them ever put the _rendered_ screen next to the reference `docs/design/screenshots/*.png` and looked. The person who actually looks at the app today still sees screens that read as visually different from the design — a mismatch code-level checks are structurally unable to catch (a shadow that's missing, a weight that's off, a spacing token that's individually correct but wrong next to its neighbor).

## Solution

A systematic screen-by-screen visual audit: run the real app, capture each of the 11 redesigned screens at a real desktop viewport, put each next to its `docs/design/screenshots/*.png` reference, and describe what's actually different — structurally and stylistically, not from memory of the spec text. Every real divergence found gets fixed directly in the component, using only tokens/components that already exist. This is a fidelity correction pass, not a redesign — nothing about IA, tokens, or content is up for reinterpretation here.

## Experience Principles

1. **See the pixels, not the spec** — the only evidence that counts is a live screenshot next to the reference image. A passing test or a spec line is not evidence of visual fidelity.
2. **Fix the drift, not the vocabulary** — every fix reuses an existing `moldai-ui` token or `components/ui/*` primitive. If closing a gap seems to need a new token or component, that's a signal to stop and confirm rather than invent one.
3. **Dynamic content is not a defect** — the reference screenshots carry the design tool's placeholder data (specific counts, names, thumbnails). Only layout, spacing, type, color, and structural differences are findings; differing sample data is not.

## Aesthetic Direction

- **Philosophy**: N/A — this pass makes no new aesthetic decisions. The existing `moldai-ui` system (documented in `app/globals.css` and CLAUDE.md's "Design tokens" / "shadcn/ui" sections) is the fixed target.
- **Tone**: Match the reference exactly; no reinterpretation.
- **Reference points**: `docs/design/screens/*.dc.html` (structure/copy/style values) + `docs/design/screenshots/*.png` (the actual visual ground truth for this pass).
- **Anti-references**: Any change that moves a screen further from the reference screenshots, or that introduces a visual not present in either the `.dc.html` or the app's existing token set.

## Existing Patterns

- Typography: 8-step `--text-*` scale (`text-tick` 10.5px → `text-hero` 54px) in `app/globals.css`, `font-display` (Bricolage Grotesque) for display, Archivo for UI/body, loaded via `next/font/google` in `app/layout.tsx`. No `text-[Npx]` or stock Tailwind sizes anywhere in `app/`/`components/`.
- Colors: Tailwind v4 `@theme` tokens in `app/globals.css` (`--color-olive`, `--color-muted` etc.), a second `@theme inline` block aliasing shadcn's semantic names onto them (`--color-border`/`--color-muted` deliberately unaliased). Light-only; `dark:` classes kept inert via `@custom-variant dark`.
- Spacing/radius: `--radius-card` (13.5px), `--radius-btn` (9.5px); no arbitrary spacing values as hardcoded literals outside the existing scale.
- Components: `components/ui/*` (shadcn primitives tuned in place — extra `Button` variants/sizes, `Badge` sizes, `bubble`/`marker` chat variants, `ScrollArea`'s `viewportRef`/`fill`). Raw `<button>` is limited to 10 documented exceptions. Every full-page screen renders through `components/shared/AppShell.tsx` (except the 4 centered-card auth-family screens).

## Component Inventory

| Screen                                   | Component(s)                                                                                                          | Status                |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Landing                                  | `components/landing/*` (`LandingPage`, `LandingNav`, `StepsSection`, `FaqSection`, `CreditsSection`, `LandingFooter`) | Audit → fix if needed |
| Autenticação (Login/Signup/Reset/Verify) | `components/auth/*` (`LoginCard`, `SignupCard`, `PasswordResetCard`, `VerifyCard`)                                    | Audit → fix if needed |
| Onboarding                               | `OnboardingShell.tsx`                                                                                                 | Audit → fix if needed |
| Dashboard                                | `DashboardShell.tsx`, `Sidebar`, `PatternGrid`, `OnboardingChecklistCard`, `CreditsCard`/`RecentUsageCard`            | Audit → fix if needed |
| Editor                                   | `EditorShell.tsx`, `ChatPanel`, `CanvasArea`, `TabBar`                                                                | Audit → fix if needed |
| Histórico de versões                     | `VersionsShell.tsx`, `VersionList`, `VersionCompare`                                                                  | Audit → fix if needed |
| Bases do ateliê                          | `SlopersShell.tsx`, `SloperGrid`, `SloperCard`                                                                        | Audit → fix if needed |
| Medidas e grades                         | `SizeChartsShell.tsx`, `SizeChartLibrary`, `SizeChartTable`                                                           | Audit → fix if needed |
| Configurações                            | `SettingsShell.tsx` + 5 sections                                                                                      | Audit → fix if needed |
| Planos                                   | `PricingPage.tsx`                                                                                                     | Audit → fix if needed |
| Importar molde                           | `ImportShell.tsx`, `FileSummaryCard`, `LayerMappingPanel`, `VerificationPanel`                                        | Audit → fix if needed |

Every row starts "Exists"; this brief makes no claim about which will need "Modify" until the visual audit runs.

## Key Interactions

None introduced. This pass only touches static layout/visual properties (spacing, color, type, radius, alignment, hover/empty/loading state _appearance_) — no new interaction, no new state, no new route.

## Responsive Behavior

Out of scope. The reference screenshots are desktop-only captures; this pass validates the desktop breakpoint against them. Existing responsive behavior is left untouched unless a fix incidentally needs a value that already carries responsive variants.

## Accessibility Requirements

No regressions: any fix must preserve existing `aria-live`/`role` wiring (`ChatPanel`'s `log`, `GeneratingOverlay`'s `status`, load `status`/error `alert` regions per CLAUDE.md), focus order, and contrast (`--color-muted` stays at its WCAG-AA-passing value). A visual fix is never allowed to regress an accessibility invariant already documented in CLAUDE.md.

## Round 2 Addendum (2026-09-02, handoff refresh)

The design handoff was refreshed with `docs/design/screenshots/states/<screen>/*.png` (106 captures: empty, loading, load-error, action-error, dialogs, wizard steps, tabs, content variations) and `Estados de interacao.dc.html`/`estados-de-interacao.png` (a hover/focus/pressed/disabled sheet). None of this existed during Round 1, which only checked each screen's default state. Round 2 covers it, **exhaustively** (all 106, per the designer's explicit choice over a sampled pass).

**One real scope expansion, not a visual fix**: the refreshed Editor section documents "Exportar" opening an **in-editor modal** whose content (title/subtitle/body/download-label) varies by the active tab (Molde 2D / Plano de corte / Ficha técnica — Prova 3D hides the button), backed by three new state screenshots. The current implementation is a `Link` navigating to the dedicated `/pattern/[id]/export` screen. Per the designer's explicit choice, **this modal is now real, in-scope build work** — not a note-and-skip. It is additive: the dedicated `/export` screen (#17, its own checklist/format list) stays as-is; the modal is a second, faster path opened from the editor's tab bar for a quick export without leaving the canvas.

Out-of-scope carryover from Round 1 still applies (no new tokens, no unrelated content changes) except where this addendum explicitly overrides it (the export modal).

## Out of Scope

- Any new content, copy, or functional behavior change (those four already shipped as #232–#235 and are not being revisited).
- Any change to Information Architecture, navigation, or route structure.
- Any new design token, color, radius, or type-scale step.
- Mobile/tablet breakpoints (reference screenshots are desktop-only).
- Re-litigating the `.specs/features/redesign-*` written requirements — those stay as documented; this pass only adds the visual-diff evidence they never had.
