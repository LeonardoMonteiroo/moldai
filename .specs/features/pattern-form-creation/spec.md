# Pattern Creation Form Specification

## Problem Statement

`Dashboard.dc.html`'s new-pattern chooser offers three ways to start a molde. Two are real; the middle one, "Preencher formulário", ships disabled with an "em breve" badge (`components/dashboard/NewPatternDialog.tsx:22-33`) because two of the design's five form fields had nothing behind them: a molde could not choose its own size chart (a pattern snapshots the _account's_ active chart at its first generation), and `POST /api/patterns/[id]/generate` accepted exactly one image where the design shows several. Free-text chat is therefore the only guided way into a first draft, and a pattern-maker who knows exactly what they want — blusa, decote redondo, manga longa, punho reto, grade masculina — has to write it as prose and hope the model extracts it.

This feature builds the form for real, and builds the two missing capabilities under it rather than shipping fields that silently do nothing.

## Goals

- [ ] "Preencher formulário" is an enabled option that produces a real drafted pattern and lands the user in `/pattern/[id]`, at the same `COSTS.adjust` charge as any other generation.
- [ ] A structured choice the user makes in the form reaches the drafter as that exact value — never as prose the model may reinterpret, and never silently dropped.
- [ ] A molde can be drafted from any size chart the account owns, chosen per molde, without changing which chart is account-active.
- [ ] Up to `MAX_ATTACHMENT_COUNT` photos/sketches reach the generation call as real image blocks, with every cap enforced server-side before a debit.
- [ ] No field on the shipped form is inert: anything not backed by real behavior is absent or disabled with a stated reason.

## Out of Scope

| Feature                                                                                                            | Reason                                                                                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-photo in the editor's own composer (`MessageInput`)                                                          | The wire moves to `images[]` so the composer necessarily migrates, but its UI stays at one attachment per turn. A mid-conversation adjustment is one thought; the form is an opening brief. Widening the composer is a separate design question with no reference screen. |
| Numeric style fields (`necklineDepthCm`, `skirtLengthCm`, `trouserLengthCm`, `seamAllowanceCm`, `armholeDeepenCm`) | Each is a cm value with a `STYLE_LIMITS` range, not an enum a select can express honestly. The details textarea reaches all of them through the model, and the editor adjusts them afterwards. Five more numeric inputs would also blow past the design's 460px dialog.   |
| `style.stretch` (`STRETCH_CLASSES`)                                                                                | A fabric property, not a garment shape — the user picks fabric after the molde exists, and `tshirt` already drafts as a knit through `BlockOpts`. Belongs in the details text.                                                                                            |
| Creating or editing a size chart from inside the dialog                                                            | `/size-charts` already owns that whole screen, with import, per-cell overrides and progression rules. The form links out to it rather than growing a second, thinner editor.                                                                                              |
| Changing a pattern's size chart after its first draft                                                              | A pattern freezes its snapshot at the first generation on purpose (`seedPatternSizeSnapshot`) so editing a chart never retroactively redraws an in-progress molde. Unchanged by this feature.                                                                             |
| A per-pattern `sizeChartId` column on `Pattern`                                                                    | The chosen chart's _resolved_ data is already frozen into `state.pattern.sizeTable`/`sizeChartName`. Storing the id as well would be a second copy of a fact the blob already holds — the `Wallet.planLabel`/`savedAgo` mistake.                                          |
| Gender as its own form control                                                                                     | The chosen size chart carries its own `gender`, and that is the value drafting needs. A second control could disagree with the chart, which is exactly the mismatch `pickSizeChartForGeneration`'s substitution path exists to report.                                    |
| A wizard with multiple screens ("passo a passo")                                                                   | The design's own reference renders one dialog with every field visible (`Dashboard.dc.html:283-320`). The option's subtitle copy says "passo a passo"; the layout does not. Layout wins.                                                                                  |

---

## Assumptions & Open Questions

| Assumption / decision                                          | Chosen default                                                                                                                                                                | Rationale                                                                                                                                                                                                                                                                                                   | Confirmed? |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| How the form's structured choices reach the drafter            | The route runs them through `validateSpec`, renders them into the system prompt as already-decided, and then re-applies the validated form values over the AI's returned spec | Instruction alone is not a defence — the repo's own rule (`applyGarmentSpec` clamping regardless of what the model claims prompted a value). Re-applying after the fact makes "the user's explicit choice wins" structural rather than hoped-for                                                            | y          |
| A style select the user leaves alone                           | Sends nothing for that field; the AI's inference stands                                                                                                                       | A select defaulting to a concrete enum value would force a choice the user never made, and `validateSpec` already distinguishes `undefined` from a value. Each select carries an explicit "deixar a IA decidir" entry as its default                                                                        | y          |
| The AI still returns `decision: "ask"` despite a complete form | Navigate to `/pattern/[id]` anyway; the clarifying question is already in the pattern's chat, where the user answers it                                                       | `ask` refunds and drafts nothing, so there is no charge to justify and nothing to show in the dialog. The import flow auto-answers because it has no chat surface to fall back on; the form does — the editor. Silently auto-answering a real question would be worse                                       | y          |
| The AI returns `decision: "decline"`                           | Same: navigate, with the decline in the chat                                                                                                                                  | Identical reasoning. The dialog is not a second place to litigate what the chat already says                                                                                                                                                                                                                | y          |
| Gender for the drafted spec                                    | The chosen size chart's own `gender`                                                                                                                                          | See Out of Scope. Makes the gender/chart mismatch unreachable from this flow, so `rejectedActiveName` is always null here                                                                                                                                                                                   | y          |
| A `sizeChartId` naming no chart the account owns               | 400 `invalid_size_chart`, before any debit or AI call                                                                                                                         | Unreachable from the real UI, so it is a forged request, not a fallback case. Silently substituting would draft from measurements the caller did not ask for; a fabricated substitution notice would name a chart that does not exist                                                                       | y          |
| The name field left empty                                      | Create under the catalog's `PatternData.newPatternName`, do not block submit                                                                                                  | The design's placeholder reads as a hint, not a required marker, and every pattern created anywhere else in the app starts under that same default name                                                                                                                                                     | y          |
| Photo cap                                                      | `MAX_ATTACHMENT_COUNT = 4`                                                                                                                                                    | A real garment brief is front, back, one detail and one sketch. The cap is what bounds the request body, so it needs a number, and 4 prepared attachments (`MAX_ATTACHMENT_LONG_EDGE_PX`, JPEG) sit well inside `MAX_ATTACHMENTS_TOTAL_BASE64_CHARS`                                                        | y          |
| Wire shape for images                                          | Replace the singular `image` field with `images: WireAttachment[]` rather than accepting both                                                                                 | The field is never persisted (only `ChatMessage.hasImage` is), so this is the cheap direction of a wire change. Keeping both shapes means two validators and two prompt paths. Renaming makes all three call sites a compile error — the safe direction, per the `PLAN_PRICES`/`PLAN_PRICE_CENTS` precedent | y          |
| Style values surviving a garment-type change                   | Cleared to "deixar a IA decidir" for every field the new type does not apply to                                                                                               | A blouse's `collar` left set while the type is now `skirt` would be sent as an explicit user choice the user cannot see or undo, and `validateSpec` would happily pass it through                                                                                                                           | y          |
| Whether the dialog can be dismissed mid-flight                 | No — closing is blocked while the create-and-generate round trip is running                                                                                                   | A `Pattern` has already been created by then; dismissing would orphan it with no id retained. Matches the `creating` guard `VerificationPanel` already uses on `/import`                                                                                                                                    | y          |

**Open questions:** none — all resolved or logged above.

---

## User Stories

All four stories below are P1: the user explicitly chose the full-capability option for the size chart, the photo count and the style controls, so none is a "should have" that could be dropped. The split is by independent testability and build order, not by whether it ships.

### P1: The form creates a real drafted pattern ⭐ MVP

**User Story**: As a pattern-maker who already knows what I want to make, I want to fill in a short form instead of writing a prompt, so that I get a first draft without having to phrase my intent as prose.

**Why P1**: This is the vertical slice. Without it the other three stories have no surface.

**Acceptance Criteria**:

1. WHEN the user activates the chooser's "Preencher formulário" option THEN the system SHALL replace the dialog's content with the form step, in the same dialog, without navigating.
2. WHEN the user activates the form's "Voltar" action THEN the system SHALL return to the chooser step with every value already entered still present.
3. The system SHALL cap the "Nome do molde" input at `MAX_PATTERN_NAME_LENGTH` (80) characters through the input's own `maxLength`.
4. IF the name input is empty when the form is submitted THEN the system SHALL create the pattern under the resolved `PatternData.newPatternName` catalog value rather than blocking submission.
5. The system SHALL cap the "Detalhes da peça" textarea at `MAX_CHAT_MESSAGE_LENGTH` characters through the textarea's own `maxLength`.
6. WHEN the user submits the form THEN the system SHALL create exactly one `Pattern`, then issue exactly one generation request against it, then navigate to `/pattern/[id]` for the returned id.
7. WHILE the create-and-generate round trip is in flight the system SHALL disable both footer actions and every form control, and SHALL refuse to close the dialog.
8. IF the generation answers 402 `insufficient_credits` THEN the system SHALL keep the dialog open, surface that code's own message, and retain the created pattern's id so that a subsequent submit reuses it instead of creating a second `Pattern`.
9. IF the create or generate request fails for any other reason THEN the system SHALL keep the dialog open and record the wire code on the dashboard store's `actionError`, leaving the entered values intact.
10. The system SHALL state the generation's real `COSTS.adjust` cost on the submit action rather than presenting it as free.
11. WHEN `POST /api/patterns` receives a `name` longer than `MAX_PATTERN_NAME_LENGTH`, or one containing a NUL byte, THEN the route SHALL answer 400 `invalid_name` and create no `Pattern`.

**Independent Test**: With the style, chart and photo fields absent, fill name + type + details, submit, and land in the editor on a drafted pattern named as typed.

---

### P1: Structured style choices reach the drafter unchanged

**User Story**: As a pattern-maker, I want to pick decote, manga, gola, punho, fechamento, silhueta and caimento from lists, so that the draft uses exactly what I chose instead of the model's reading of my sentence.

**Why P1**: This is the whole reason to prefer a form over the prompt. A form whose selections the model may override is worse than no form.

**Acceptance Criteria**:

1. The system SHALL render each style control as a select whose default entry is an explicit "deixar a IA decidir" option, and SHALL send no value for that field while that entry is selected.
2. WHERE the selected garment type does not apply a style field the system SHALL NOT render that field's control.
3. WHILE the selected sleeve length is not `long` the system SHALL NOT render the cuff control, because no drafter reads `style.cuff` for a short or sleeveless garment.
4. WHEN the user changes the garment type THEN the system SHALL reset every style field the new type does not apply back to "deixar a IA decidir".
5. The route SHALL resolve the request's form spec through `validateSpec` before any use of it, so an unrecognized enum value is discarded rather than reaching a drafter.
6. WHEN the AI returns `decision: "apply"` and the request carried a form spec THEN the system SHALL overwrite each `type`, `gender` and `style` field the form set explicitly with the form's own validated value, and SHALL leave every field the form did not set at the AI's returned value.
7. The system SHALL include the form's explicit choices in that request's system prompt, so the model neither asks about a field already answered nor contradicts it in its own reply text.
8. The route SHALL NOT accept `style.sleeveRefit` from a form spec, so a request can never fake a sleeve refit.
9. IF a request carries a form spec whose `type` is absent or is not a recognized `GarmentType` THEN the route SHALL answer 400 `invalid_form_spec` before any debit or AI call, rather than letting `validateSpec`'s `"blouse"` default be merged over the garment the model correctly inferred.

**Independent Test**: Submit the form with `collar: "band"` while stubbing the AI to return `collar: "none"`, and assert the persisted spec carries `"band"`.

---

### P1: A molde is drafted from a size chart chosen per molde

**User Story**: As a pattern-maker with several grades in my library, I want to pick which one this molde is drafted from, so that a one-off menswear piece does not force me to change the grade my whole account uses.

**Why P1**: One of the two capabilities the option was disabled for.

**Acceptance Criteria**:

1. The system SHALL populate the "Tabela de medidas" select from `GET /api/size-charts`, listing every chart the account owns, system and custom alike.
2. The system SHALL send the selected chart's own `gender` as the request's spec gender, so no gender control is needed and no gender/chart mismatch is reachable from this flow.
3. WHEN a generation request carries a `sizeChartId` naming a chart the account owns AND the pattern has no pieces yet THEN the system SHALL freeze that chart into the pattern's snapshot via `seedPatternSizeSnapshot`.
4. IF a generation request carries a `sizeChartId` that names no chart the account owns THEN the route SHALL answer 400 `invalid_size_chart` before any debit, AI call or state mutation.
5. WHILE a generation request carries no `sizeChartId` the route SHALL keep the existing active-chart-then-system-default pick and its substitution notice unchanged.
6. WHEN a generation request carries a `sizeChartId` for a pattern that already has pieces THEN the system SHALL ignore it and leave the frozen snapshot untouched.
7. IF the chart list cannot be loaded THEN the form SHALL render the select disabled with a stated reason and SHALL still allow submission, falling back to the account's active-chart pick.
8. The system SHALL NOT change which chart is account-active as a side effect of a per-molde choice.

**Independent Test**: With a male custom chart in the library and a female chart active, submit the form choosing the male chart and assert the pattern's frozen `sizeChartName` is the male chart's while `User.activeSizeChartId` is unchanged.

---

### P1: Several photos reach the generation call

**User Story**: As a pattern-maker, I want to attach the front, the back and a sketch at once, so that the model sees the whole reference instead of one angle.

**Why P1**: The other capability the option was disabled for, and the design renders the multi-slot row explicitly.

**Acceptance Criteria**:

1. The system SHALL accept up to `MAX_ATTACHMENT_COUNT` photos in the form, and SHALL stop rendering the add cell once that many are held.
2. WHEN the user picks a file THEN the system SHALL run it through `prepareImage` before holding it, so an oversized or unsupported source is rejected before any decode work.
3. IF `prepareImage` rejects a picked file THEN the system SHALL surface that rejection's own reason and SHALL leave every already-added photo in place.
4. The system SHALL render a remove control on each held photo that removes only that photo.
5. The generation wire SHALL carry the attachments as `images`, an array of `{ mediaType, data }` entries, and SHALL NOT carry the former singular `image` field.
6. IF the `images` field is not an array, holds more than `MAX_ATTACHMENT_COUNT` entries, holds any entry `validateAttachmentInput` rejects, or holds a combined `data` length over `MAX_ATTACHMENTS_TOTAL_BASE64_CHARS` THEN the route SHALL answer 400 `invalid_attachment` before any debit or AI call.
7. WHEN the request carries N valid attachments THEN `proposeGarment` SHALL attach exactly N image content blocks to the final user turn, in the order received, ahead of that turn's text block.
8. The system SHALL record the count on the persisted `ChatMessage` as `imageCount` and SHALL persist no image bytes.
9. WHEN a persisted `ChatMessage` carries `hasImage` but no `imageCount` THEN `ChatBubble` SHALL render it as exactly one attachment.

**Independent Test**: Submit the form with three prepared photos and assert the Anthropic call's final turn holds three image blocks then one text block, and that the persisted message carries `imageCount: 3` and no base64.

---

## Edge Cases

- IF the user submits the form with every optional field untouched THEN the system SHALL still produce a real draft from garment type alone, because `validateSpec` fills nothing it was not given and the model infers the rest.
- IF the details textarea contains only whitespace AND no style field is set THEN the system SHALL still compose a non-empty request message naming the garment type, because the route rejects an empty `message` with 400 `missing_message`.
- IF the account has no size charts at all THEN the system SHALL fall back to the same lazy system-chart seeding `listSizeChartsForUser` already performs, so the select is never empty for a real account.
- WHEN the same photo file is picked twice THEN the system SHALL hold it twice rather than deduplicating, because two frames of the same file are indistinguishable after `prepareImage` and silently dropping one would be a control rewriting the user's input.
- IF the user closes the dialog after a failed submit that had already created a `Pattern` THEN the system SHALL leave that blank `Pattern` in the account's list, where the dashboard's own rename and delete already reach it.
- WHEN a garment type is selected for which no style control applies THEN the system SHALL render the form without a style region rather than an empty labelled group.

---

## Implicit-Requirement Dimensions Sweep

| Dimension                                | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Input validation & bounds                | `MAX_PATTERN_NAME_LENGTH` on the name (client `maxLength` plus route `invalid_name`); `MAX_CHAT_MESSAGE_LENGTH` on details (client plus the route's existing check); style enums through `validateSpec`; `sizeChartId` through an ownership lookup; `MAX_ATTACHMENT_COUNT`, per-image `MAX_ATTACHMENT_BASE64_CHARS` and combined `MAX_ATTACHMENTS_TOTAL_BASE64_CHARS`; `MAX_GENERATE_BODY_BYTES` re-derived to bound the whole body. |
| Failure / partial-failure states         | A created `Pattern` whose generation failed is retained as `pendingPatternId` and reused on retry (PFORM-08); every other failure keeps the dialog open with the values intact (PFORM-09). The pattern-plus-wallet transaction and its refund path are unchanged.                                                                                                                                                                    |
| Idempotency / retry / duplicate handling | `pendingPatternId` makes a retry reuse the same blank `Pattern`; the in-flight guard (PFORM-07) makes a double submit impossible.                                                                                                                                                                                                                                                                                                    |
| Auth boundaries & rate limits            | `requireUser()` gates both routes unchanged; `POST /api/patterns`'s existing account-keyed `create` bucket (60/h) already throttles this new entry point. No new bucket on `generate` — credits are its throttle, unchanged by this feature.                                                                                                                                                                                         |
| Concurrency / ordering                   | The generation still runs inside `withPatternAndWallet`, Pattern lock then Wallet lock, untouched. The form's own ordering (create, then generate, then navigate) is sequential by construction.                                                                                                                                                                                                                                     |
| Data lifecycle / expiry                  | Image bytes travel with the request and are never persisted — only `imageCount`. Form state is component-local and discarded when the dialog unmounts; nothing is written to `localStorage`.                                                                                                                                                                                                                                         |
| Observability                            | The existing `reportError("generate", …)` in the route's catch already covers every failure this feature can reach; the new 400s are client-forgery cases, not operator-actionable events. N/A because no new failure mode is unlogged.                                                                                                                                                                                              |
| External-dependency failure              | An Anthropic timeout or error takes the route's existing catch: the credit refunds and the dialog reports the failure. `ANTHROPIC_OPTIONS`' 20s bound and the 30s transaction budget are unchanged, and N images do not extend them because the cap bounds the payload.                                                                                                                                                              |
| State-transition integrity               | The dialog is a two-step machine: chooser to form and back, plus a submitting state that blocks both dismissal and re-entry. "Voltar" preserves entered values (PFORM-02); a type change resets only the now-inapplicable style fields (PFORM-23).                                                                                                                                                                                   |

---

## Requirement Traceability

| Requirement ID | Story                           | Phase                   | Status       |
| -------------- | ------------------------------- | ----------------------- | ------------ |
| PFORM-01       | P1: Form creates a real pattern | Design                  | Pending      |
| PFORM-02       | P1: Form creates a real pattern | Design                  | Pending      |
| PFORM-03       | P1: Form creates a real pattern | Design                  | Pending      |
| PFORM-04       | P1: Form creates a real pattern | Execute (T9, T10)       | Verified     |
| PFORM-05       | P1: Form creates a real pattern | Design                  | Pending      |
| PFORM-06       | P1: Form creates a real pattern | Execute (T14)           | Implementing |
| PFORM-07       | P1: Form creates a real pattern | Design                  | Pending      |
| PFORM-08       | P1: Form creates a real pattern | Design                  | Pending      |
| PFORM-09       | P1: Form creates a real pattern | Design                  | Pending      |
| PFORM-10       | P1: Form creates a real pattern | Design                  | Pending      |
| PFORM-11       | P1: Form creates a real pattern | Execute (T10)           | Verified     |
| PFORM-20       | P1: Structured style choices    | Design                  | Pending      |
| PFORM-21       | P1: Structured style choices    | Execute (T1)            | Implementing |
| PFORM-22       | P1: Structured style choices    | Execute (T1)            | Implementing |
| PFORM-23       | P1: Structured style choices    | Execute (T1)            | Implementing |
| PFORM-24       | P1: Structured style choices    | Execute (T2, T12)       | Verified     |
| PFORM-25       | P1: Structured style choices    | Execute (T2, T12)       | Verified     |
| PFORM-26       | P1: Structured style choices    | Execute (T6, T12)       | Verified     |
| PFORM-27       | P1: Structured style choices    | Execute (T2, T12)       | Verified     |
| PFORM-28       | P1: Structured style choices    | Execute (T2, T12)       | Verified     |
| PFORM-40       | P1: Per-molde size chart        | Design                  | Pending      |
| PFORM-41       | P1: Per-molde size chart        | Execute (T13)           | Verified     |
| PFORM-42       | P1: Per-molde size chart        | Execute (T4, T8, T13)   | Verified     |
| PFORM-43       | P1: Per-molde size chart        | Execute (T8, T13)       | Verified     |
| PFORM-44       | P1: Per-molde size chart        | Execute (T13)           | Verified     |
| PFORM-45       | P1: Per-molde size chart        | Execute (T4, T8, T13)   | Verified     |
| PFORM-46       | P1: Per-molde size chart        | Execute (T4, T8, T13)   | Verified     |
| PFORM-47       | P1: Per-molde size chart        | Execute (T13)           | Implementing |
| PFORM-60       | P1: Several photos              | Execute (T3)            | Implementing |
| PFORM-61       | P1: Several photos              | Design                  | Pending      |
| PFORM-62       | P1: Several photos              | Design                  | Pending      |
| PFORM-63       | P1: Several photos              | Design                  | Pending      |
| PFORM-64       | P1: Several photos              | Execute (T11, T14, T15) | Implementing |
| PFORM-65       | P1: Several photos              | Execute (T3, T11)       | Verified     |
| PFORM-66       | P1: Several photos              | Execute (T7)            | Verified     |
| PFORM-67       | P1: Several photos              | Execute (T11, T15)      | Verified     |
| PFORM-68       | P1: Several photos              | Design                  | Pending      |

**ID format:** `PFORM-NN`, numbered per story block (01-11 form shell, 20-28 style controls, 40-47 size chart, 60-68 photos) so each story's acceptance criteria map to its IDs in order.

**Coverage:** 36 total, 0 mapped to tasks yet, 36 unmapped ⚠️ (resolved in Tasks)

---

## Success Criteria

- [ ] The chooser's middle option is enabled, carries no "em breve" badge, and its catalog entry no longer states a limitation that has been removed.
- [ ] Filling name, type, chart, three style selects, two photos and details produces a drafted pattern in the editor whose `TechSheetTab` shows the chosen chart's name and whose spec carries every selected style value.
- [ ] Every cap in the sweep table is enforced by a route-level test that asserts no debit occurred.
- [ ] `npm test`, `npm run lint` and `npm run build` all pass, and `.claude/hooks/check-conventions.mjs` reports no new violation.
