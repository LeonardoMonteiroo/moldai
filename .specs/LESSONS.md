# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - When a design cites an exact numeric formula/coefficient, add at least one hand-derived exact-value assertion for it, not only directional (greater-than/monotonic) assertions -- a directional-only test suite lets the coefficient itself drift undetected.

- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `lib/draft` · harmful: 0
- features: bust-dart-shaping
- evidence: lib/draft/body.ts:345 (bustCupDeltaCm / 4) (lib/draft)
- last seen: 2026-09-01T19:54:45Z

### L-002 - When a spec lists two related optional fields with independent fallback resolution as an edge case, add a dedicated test that sets only one of the two -- tests that always set both together never exercise the independent-resolution path.

- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `lib/measurements` · harmful: 0
- features: bust-dart-shaping
- evidence: spec.md Edge Cases: only one of two paired optional fields set (lib/measurements)
- last seen: 2026-09-01T19:54:45Z

### L-003 - Verify a spec's cited i18n catalog namespace against the real messages file before writing the AC text -- a typed namespace name that doesn't match the existing catalog structure silently misleads whoever reads the spec later, even when the implementation correctly follows the real pattern.

- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `i18n` · harmful: 0
- features: bust-dart-shaping
- evidence: spec.md P3 AC2 (catalog namespace text) (i18n)
- last seen: 2026-09-01T19:54:45Z

### L-004 - When an acceptance criterion covers an absent/dismissed/null branch of conditionally-rendered UI, add a test that renders that branch directly instead of only testing the positive/shown branch, even if the unconditional class placement makes the negative branch look self-evidently correct.

- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `components/dashboard` · harmful: 0
- features: redesign-dashboard
- evidence: DASH-06 (P2 AC2) / components/dashboard/DashboardShell.test.tsx (components/dashboard)
- last seen: 2026-09-01T22:16:59Z

### L-005 - When a spec requires an exact clearance/inset value (e.g. Npx to avoid overlapping floating chrome), add a test that asserts the specific class/value directly — a value can be correctly wired in source yet remain completely unguarded by any test.

- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `components-layout` · harmful: 0
- features: redesign-editor
- evidence: CanvasArea.tsx:186 (mutation b, EDCH-03) (components-layout)
- last seen: 2026-09-01T23:05:08Z

### L-006 - When a disabled/gating condition is an OR of several causes, test each cause with a fixture where the OTHER causes are false, not just a fixture where multiple causes happen to overlap (e.g. a blank pattern is both 'no pieces' and 'no spec' at once).

- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `components-editor` · harmful: 0
- features: redesign-editor
- evidence: HeaderActions.tsx:68-72 (mutation c, EDCH-06) (components-editor)
- last seen: 2026-09-01T23:05:08Z

### L-007 - A UI notice's auto-dismiss timer needs a fake-timers test that advances past the duration and asserts the notice is gone — asserting only its text/tone does not prove the timeout actually fires.

- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `components-editor` · harmful: 0
- features: redesign-editor
- evidence: EDCH-07 (validation.md) (components-editor)
- last seen: 2026-09-01T23:05:15Z

### L-008 - When a spec requires an element to move to a specific new position, not just remain present, assert that position (class or DOM order) directly rather than only presence/absence.

- signal: `spec_precision_gap` · recurrence: 1 feature(s) · scope: `components-editor` · harmful: 0
- features: redesign-editor
- evidence: EDCH-09 (validation.md) (components-editor)
- last seen: 2026-09-01T23:05:15Z

### L-009 - When an AC changes a Tailwind utility class (e.g. a radius/border/shadow token swap), add a test asserting that exact class on the element, not just the padding/width ACs that happen to share the same commit.

- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `components/landing` · harmful: 0
- features: redesign-landing
- evidence: LAND-06 / components/landing/LandingPage.test.tsx (no rounded assertion found) (components/landing)
- last seen: 2026-09-02T00:45:52Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
