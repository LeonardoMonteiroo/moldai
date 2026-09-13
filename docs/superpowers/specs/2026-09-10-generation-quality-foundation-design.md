# Generation quality foundation: measurement profiles and readiness

Status: approved direction, awaiting written-spec approval before implementation.

## Context

The current generation flow treats a size chart as both a grading source and the
closest approximation of a person's body. That is useful for a quick draft, but
it makes the result fragile when a user wants a reusable body profile, when a
measurement is missing, or when a set of values is internally inconsistent.

The competitive research found a consistent pattern in mature tools: separate
the person's measurements from the size/grading system, make the required input
explicit for the selected garment, preserve the input used for a generated
pattern, and report fit assumptions before the draft is produced.

The first delivery will strengthen that foundation. It will not attempt a
photo-to-pattern system or full cloth simulation.

## Goals

1. Let a user create and reuse a named measurement profile across patterns.
2. Keep measurement provenance and confidence visible to the domain layer.
3. Detect missing, out-of-range, and contradictory measurements before a paid
   draft is committed.
4. Apply a selected profile deterministically to the base size while preserving
   the existing size-chart grading behavior for the other sizes.
5. Make the generated pattern independent from later edits or deletion of the
   profile.
6. Preserve the current size-chart flow for users who do not select a profile.

## Non-goals

- Photo measurement or automatic body extraction.
- 3D cloth physics, drape prediction, or replacing the current Prova 3D proxy.
- Making `BodyType` drive geometry. It remains descriptive metadata until there
  are validated drafting formulas for it.
- A new grading algorithm. The current size-chart progression remains the
  source of non-base sizes.
- Mixing profile measurements into `GarmentSpec.measurementOverrides`. Profile
  data is persistent body input; overrides remain explicit, per-generation
  geometry adjustments.
- Expanding the first delivery to every possible posture or fit correction.
  Existing engine-supported fields such as shoulder slope, back width, bust
  point height, and bust span can be captured when available.

## Product behavior

### Profile lifecycle

The user can create, edit, confirm, and delete a profile from the measurement
profile area exposed alongside the existing size-chart workflow. A profile has
an explicit name, gender, optional notes, and a partial set of measurements.
Partial profiles are allowed at rest because different garments require
different subsets of measurements.

Each populated measurement stores:

```ts
type MeasurementSource = "manual" | "import";
type MeasurementConfidence = "unverified" | "guided" | "confirmed";

interface MeasurementEntry {
  valueCm: number;
  source: MeasurementSource;
  confidence: MeasurementConfidence;
  measuredAt?: string;
}
```

The first UI creates manual/unverified entries and provides a confirmation
action for the populated values. Import remains a domain value for future CSV
or connector work; it does not add an import workflow in this delivery.

### Selecting a profile for generation

The new-pattern form adds an optional “Perfil de medidas” selector with an
explicit “usar apenas a grade” option. The selector is only meaningful on the
first generation of a pattern. The server remains authoritative and never
changes a frozen pattern's base measurements because a profile was later edited,
renamed, or deleted.

If exactly one profile exists, the form may preselect it. Otherwise the default
is the current size-chart flow. A missing profile is not silently replaced by a
different profile.

### Readiness states

Readiness is evaluated against the chosen drafting engine and garment type:

- `ready`: required inputs are present and relationships are valid.
- `review`: drafting can proceed, but there are warnings such as unconfirmed
  values or use of the size chart without a profile.
- `needs_input`: a blocking measurement or relationship is missing/invalid.

Blocking readiness is returned before wallet debit and before a pattern version
is created. The response contains machine-readable issue codes and measurement
keys; UI copy is resolved through the existing pt-BR catalog.

## Domain contracts

The new pure domain module should own profile validation, profile-to-numeric
conversion, and readiness evaluation. It must not import React, Prisma, or
request objects.

```ts
type MeasurementProfileValues = Partial<
  Record<keyof Measurements, MeasurementEntry>
>;

interface MeasurementProfileData {
  name: string;
  gender: Gender;
  unit: "cm";
  values: MeasurementProfileValues;
  notes?: string;
}

type ReadinessIssueSeverity = "blocker" | "warning";

interface ReadinessIssue {
  code:
    | "profile_measurement_missing"
    | "profile_measurement_out_of_range"
    | "inconsistent_measurements"
    | "measurement_confidence_low"
    | "using_size_chart_measurements"
    | "engine_measurements_missing"
    | "engine_type_unsupported"
    | "engine_style_unsupported";
  severity: ReadinessIssueSeverity;
  fields: string[];
}

interface GenerationReadiness {
  status: "ready" | "review" | "needs_input";
  issues: ReadinessIssue[];
  requiredMeasurements: string[];
}
```

`Measurements` and the engine capability contract remain the source of truth
for valid keys and required fields. The profile module must reject unknown keys,
non-finite values, and values outside the existing measurement ranges.

The first relational validation set is deliberately conservative and applies
only when all fields in a rule are present:

- `waistToFloor >= waistToKnee >= waistToSeat >= hipHeight`;
- `waistToFloor >= waistToUpperLeg >= waistToSeat`;
- `shoulderToWrist >= shoulderToElbow`;
- `crossSeam >= crossSeamFront`.

Contradictions are blockers for a selected profile. Low confidence is a warning,
not a blocker, because the user may intentionally draft before confirming every
value.

## Persistence and snapshot semantics

Add a new Prisma JSON-blob model rather than adding person-specific fields to
`SizeChart`:

```prisma
model MeasurementProfile {
  id        String   @id @default(cuid())
  userId    String
  data      Json
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, updatedAt])
}
```

`User` receives the inverse `measurementProfiles` relation. The existing
ownership, `requireUser`, and JSON validation conventions apply.

When a profile is selected for a first generation:

1. Load and ownership-check the profile.
2. Resolve the selected size chart as today.
3. Copy the chart's base-size row and overlay only the populated profile values.
4. Keep every non-base size row from the chart unchanged.
5. Store the resulting numeric base row in the existing pattern snapshot and
   `baseMeasurements` flow.
6. Store a `measurementProfileName` snapshot on `Pattern` and
   `PatternVersion` for user-facing provenance.

The numeric overlay is therefore frozen inside the pattern. The profile ID is
not used as a live dependency, so later profile edits/deletion cannot alter an
existing pattern. The selected profile must not be copied into
`measurementOverrides`; this keeps regeneration semantics unambiguous.

On subsequent generations, the pattern's frozen size table and engine remain
authoritative. A profile selector is not shown for those requests, and a forged
profile ID cannot mutate the snapshot.

## Generation flow changes

`POST /api/patterns/[id]/generate` accepts an optional
`measurementProfileId` only for the first draft.

The route must:

1. Parse the optional ID with the existing bounded-body helpers.
2. Validate profile ownership before invoking the AI tool. An invalid or
   unauthorized profile returns a machine-readable error and does not debit.
3. Preserve the current propose/validate/apply/ask/decline behavior.
4. On an `apply` decision for a first draft, evaluate readiness using the final
   `GarmentSpec`, the selected engine capability, the selected profile (if any),
   and the size chart.
5. If readiness is `needs_input`, return `status: "needs_input"` plus the
   readiness payload, without wallet debit, version creation, or geometry
   mutation.
6. If readiness is `ready` or `review`, apply the base-row overlay and continue
   through the existing draft, seam-check, and version snapshot flow.

The no-profile path remains valid. It returns a warning issue
`using_size_chart_measurements` so the UI can make the tradeoff visible without
breaking existing users.

The route must not debit for a readiness blocker. Existing refund behavior for
downstream AI/drafting failures remains unchanged.

## API surface

Add thin, authenticated handlers:

- `GET /api/measurement-profiles`: list the current user's profiles, ordered by
  `updatedAt desc`.
- `POST /api/measurement-profiles`: validate and create one profile.
- `GET /api/measurement-profiles/[id]`: return one owned profile.
- `PATCH /api/measurement-profiles/[id]`: validate and update one owned profile.
- `DELETE /api/measurement-profiles/[id]`: delete one owned profile.

All handlers use `requireUser`, bounded body parsing, ownership-scoped Prisma
access, and machine-readable error codes. The client uses `lib/api-client`; no
component calls `fetch` directly.

The generation response adds `readiness` only when useful to the client. Error
and issue codes never contain localized prose. Existing chat/state contracts are
preserved unless the response is the new non-billed `needs_input` result.

## UI changes

The existing size-chart shell gains a profile view so the concepts remain
visually adjacent while staying distinct:

- profile list with name, gender, last update, and completeness summary;
- editor for named profile and measurement rows;
- per-row value, source, confidence, and measurement definition/help;
- “confirm populated measurements” action;
- delete confirmation with clear impact text;
- links from the new-pattern form to create or manage profiles.

The new-pattern form adds the profile selector and readiness feedback. Missing
fields are presented by human-readable measurement labels from the catalog, but
the network payload remains keyed by stable measurement identifiers.

The UI must not claim that `BodyType` changes drafting until the engine actually
uses it. Existing body-type copy should continue to say that it is descriptive
metadata.

## Implementation map

Expected implementation areas, subject to final code navigation before editing:

- `prisma/schema.prisma` and one migration for `MeasurementProfile`;
- `lib/measurementProfiles/*` for types, validation, and profile overlay;
- `lib/draft/readiness.ts` plus pure tests;
- `lib/api-client.ts` and profile API route handlers;
- `lib/editor/state.ts` and pattern/version snapshot typing;
- `app/api/patterns/[id]/generate/route.ts`;
- size-chart/profile components and the new-pattern form;
- pt-BR message catalog entries;
- API, domain, DOM, and generation-flow tests.

The implementation must first read the repository migration instructions and
the relevant current components before choosing exact filenames.

## Tests and acceptance criteria

### Domain and API tests

- Valid partial profiles round-trip through validation.
- Unknown keys, non-finite values, and out-of-range values are rejected.
- Each relational rule yields `inconsistent_measurements` with the involved
  fields.
- Required measurements are calculated from the selected engine/type, not from
  a hard-coded universal list.
- A selected profile overlays only the base size row.
- Profile ownership is enforced for every endpoint and generation request.
- A readiness blocker produces no debit and no version.
- A profile edit or deletion cannot change a previously generated pattern.
- A later generation cannot replace a frozen profile snapshot.

### UI and regression tests

- The profile editor renders measurement definitions and exact pt-BR labels.
- The new-pattern form sends the selected profile ID through `lib/api-client`.
- Empty profile library still preserves the current size-chart path.
- Existing size-chart, generation, wallet, and editor tests remain green.

### Acceptance criteria

The delivery is accepted when a user can create a profile, select it for a new
pattern, see missing or contradictory inputs before debit, generate a pattern
whose base row reflects the profile, and later edit/delete the profile without
changing that pattern. A user who selects no profile sees the existing behavior
plus a clear, non-blocking readiness warning.

## Rollout and compatibility

The migration is additive. Existing patterns, size charts, and users remain
valid because all new fields are optional and the no-profile path is preserved.
The feature can be rolled out behind the existing generation UI path without
changing engine capability contracts or the current Prova 3D behavior.

Before implementation is declared complete, run the repository verification
sequence, including formatting, lint, tests, and production build. If the
repository's migration skill requires a specific local database sequence, follow
that sequence and record the result in the implementation handoff.

## Alternatives considered

### Put body measurements directly in SizeChart

Rejected because a size chart is a grading system, while a profile describes a
person. Combining them would make reusable profiles, provenance, and immutable
pattern snapshots ambiguous.

### Start with photo-to-pattern or 3D simulation

Rejected for the first delivery. Those features add uncertainty before the
system has a reliable measurement contract and readiness gate. The research
supports treating measurement quality and parametric determinism as the first
foundation.

### Allow missing profile fields to silently fall back to the chart

Rejected when a profile is explicitly selected. Silent fallback would produce a
hybrid body without telling the user which values were not personal. The chart
fallback remains available only through the explicit no-profile path.

## Research basis

The direction is based on the competitive report in
`docs/research/2026-09-10-pattern-generation-competitive-research.md`, which
reviewed MPattern, FreeSewing, Tailornova, Lekala, BootstrapFashion, Seamly2D,
PatternMaker, CLO, Style3D, SewGrader, and Sewrio using current official
materials. The central product conclusions were reusable measurement profiles,
explicit fit/readiness inputs, deterministic snapshots, and a staged path toward
simulation.
