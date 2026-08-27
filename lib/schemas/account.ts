import { z } from "zod";

// Field-level validation (trim, length cap, blank rejection) stays in
// lib/account/settings.ts's validateName, which already returns the
// specific `invalid_name` wire code -- this schema only proves the body is
// an object carrying a `name` key at all, so a malformed/null/non-object
// body still 400s as `bad_body` before reaching that pure function, per
// PATCH /api/account/profile's existing test matrix.
export const AccountProfilePatchSchema = z.object({
  name: z.unknown(),
});

// #152: mirrors AccountProfilePatchSchema's own shape -- changePassword
// (lib/account/settings.ts) takes both fields as `unknown` and owns the
// field-level checks itself (wrong_password/weak_password). Both are
// `.optional()` so an entirely absent key still reaches changePassword
// (which treats it exactly like any other non-string) and answers that
// domain code, rather than the schema rejecting it as bad_body first --
// zod v4 treats a bare z.unknown() key as required-but-any-value, not
// required-key-optional-absence.
export const AccountPasswordBodySchema = z.object({
  currentPassword: z.unknown().optional(),
  newPassword: z.unknown().optional(),
});
