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
