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

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
