import { z } from "zod";

// #152: POST /api/billing/purchase's own trust boundary is isPurchaseType/
// isPaidPlanId (lib/billing/wallet.ts, lib/billing/plans.ts) -- both narrow
// an `unknown`, the same "readJsonObject caller keeps its own post-parse
// check" precedent AccountProfilePatchSchema's `name: z.unknown()` already
// follows. This schema only proves the body is an object at all (parseBody's
// own contribution); it must not pre-reject a bad `type`/`plan` on shape,
// since the route's own invalid_purchase_type/invalid_plan codes are more
// specific than parseBody's generic bad_body and existing tests assert on
// them by name.
// `type` is `.optional()` (unlike a typical required field) because a body
// with no `type` key at all -- `{}` -- must still reach isPurchaseType(undefined)
// and answer the domain code invalid_purchase_type, not the schema-level
// bad_body: zod v4 treats a bare z.unknown() key as required-but-any-value,
// which rejects an absent key outright (verified against this repo's own
// zod version) -- the opposite of what "readJsonObject caller keeps its own
// more specific check" needs here.
export const PurchaseBodySchema = z.object({
  type: z.unknown().optional(),
  patternId: z.unknown().optional(),
  plan: z.unknown().optional(),
});

// #206: there is deliberately NO webhook body schema any more. The Stripe
// webhook authenticates an HMAC signature over the RAW request bytes, so it
// must not parse-and-reserialize the body at all -- re-serializing changes
// key order and whitespace and the signature stops matching. It reads
// `request.text()` and hands those exact bytes to the SDK's own
// constructEvent, which parses only AFTER verifying; the parsed payload is
// then narrowed by lib/billing/stripe.ts's parseGatewayEvent, which is the
// trust boundary a zod schema would otherwise have been. That makes the
// webhook the one documented exception to CLAUDE.md's "every route reads its
// body through readJsonObject/parseBody" rule -- stated in the route's own
// header too, at the place a reader meets it.
