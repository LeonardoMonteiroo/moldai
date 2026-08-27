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

// #152: the webhook route deliberately never propagates parseBody's 400 (see
// its own header comment -- Asaas pauses the whole account's webhook queue
// after 15 consecutive non-2xx responses), so this schema only has to prove
// the body is an object; every field is read back out with the same
// hand-rolled `typeof`/shape checks the route already had, unchanged.
export const AsaasWebhookBodySchema = z.object({
  event: z.unknown().optional(),
  payment: z.unknown().optional(),
});
