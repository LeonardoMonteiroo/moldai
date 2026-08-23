import { describe, it, expect } from "vitest";
import messages from "@/messages/pt-BR.json";
import type { SignupErrorCode } from "@/lib/account/signup";
import type { VerifyErrorCode, ResendErrorCode } from "@/lib/auth/verification";
import type { ChangePasswordResult } from "@/lib/account/settings";

/**
 * #56: six call sites build a catalog key from a wire error code at runtime
 * (`t(\`errors.${result.error}\`)`) instead of a literal `t("...")`, so
 * `.claude/hooks/check-conventions.mjs`'s CHECK 4 cannot see them, and
 * next-intl does not throw on a missing key -- it renders the literal key
 * path and logs IntlError: MISSING_MESSAGE while the surrounding code keeps
 * running. An `unauthorized` gap already shipped exactly this way once.
 *
 * This guards the mechanical thing the migration is missing: every code a
 * screen's own route can actually produce has a non-empty catalog entry
 * under that screen's namespace. Deliberately scoped to what each ROUTE can
 * emit, not the broader client-side AccountErrorCode type ProfileSection/
 * PasswordSection/DangerZoneSection share -- that type is a generic union
 * reused across three unrelated routes (it also carries pattern_not_found /
 * size_chart_not_found / sloper_not_found, from other screens' actions
 * entirely), and demanding catalog entries for codes a route structurally
 * cannot return would just be noise. Per CLAUDE.md, this asserts against
 * the imported messages object itself, never a pasted pt-BR literal or a
 * pattern a MISSING_MESSAGE fallback could also satisfy.
 */

type Errors = Record<string, string>;

function errorsUnder(namespace: string): Errors {
  const ns = (messages as Record<string, unknown>)[namespace];
  const errors =
    ns && typeof ns === "object"
      ? (ns as Record<string, unknown>).errors
      : undefined;
  return errors && typeof errors === "object" ? (errors as Errors) : {};
}

// Each list is checked for exhaustiveness against its source union below,
// where one is exported (SignupErrorCode / VerifyErrorCode / ResendErrorCode
// / ChangePasswordResult) -- a future member added to any of those becomes a
// compile error here, not a silent gap. ProfileSection and DangerZoneSection
// read ad-hoc apiError(...) string literals scattered across their routes
// rather than one exported union, so those two lists are hand-derived from
// the route source (cited per entry) with no compile-time exhaustiveness
// check -- a real, narrower guarantee than the other four, called out
// honestly rather than pretended away.

const SIGNUP_CODES = [
  "invalid_name",
  "invalid_email",
  "weak_password",
  "email_taken",
  "bad_body",
  "rate_limited",
  "mail_unavailable",
] as const satisfies readonly SignupErrorCode[];
type _SignupExhaustive =
  Exclude<SignupErrorCode, (typeof SIGNUP_CODES)[number]> extends never
    ? true
    : never;
const _signupExhaustive: _SignupExhaustive = true;
void _signupExhaustive;

const VERIFY_CODES = [
  "invalid_token",
  "expired_token",
  "bad_body",
  "rate_limited",
] as const satisfies readonly VerifyErrorCode[];
type _VerifyExhaustive =
  Exclude<VerifyErrorCode, (typeof VERIFY_CODES)[number]> extends never
    ? true
    : never;
const _verifyExhaustive: _VerifyExhaustive = true;
void _verifyExhaustive;

const RESEND_CODES = [
  "invalid_credentials",
  "already_verified",
  "cooldown",
  "bad_body",
  "rate_limited",
  "mail_unavailable",
] as const satisfies readonly ResendErrorCode[];
type _ResendExhaustive =
  Exclude<ResendErrorCode, (typeof RESEND_CODES)[number]> extends never
    ? true
    : never;
const _resendExhaustive: _ResendExhaustive = true;
void _resendExhaustive;

type ChangePasswordErrorCode = Extract<
  ChangePasswordResult,
  { ok: false }
>["error"];
const CHANGE_PASSWORD_CODES = [
  "wrong_password",
  "weak_password",
] as const satisfies readonly ChangePasswordErrorCode[];
type _ChangePasswordExhaustive =
  Exclude<
    ChangePasswordErrorCode,
    (typeof CHANGE_PASSWORD_CODES)[number]
  > extends never
    ? true
    : never;
const _changePasswordExhaustive: _ChangePasswordExhaustive = true;
void _changePasswordExhaustive;

// PATCH /api/account/profile (app/api/account/profile/route.ts): requireUser
// -> unauthorized, readJsonObject -> bad_body, validateName fails ->
// invalid_name. No try/catch around the write, so service_unavailable is
// never actually reachable here.
const PROFILE_CODES = ["unauthorized", "bad_body", "invalid_name"] as const;

// DELETE /api/account (app/api/account/route.ts): requireUser ->
// unauthorized, readJsonObject -> bad_body, getUserById miss ->
// account_not_found, verifyForDeletion fails -> wrong_password.
const DANGER_ZONE_CODES = [
  "unauthorized",
  "bad_body",
  "account_not_found",
  "wrong_password",
] as const;

// POST /api/account/password (app/api/account/password/route.ts):
// requireUser -> unauthorized, readJsonObject -> bad_body, getUserById miss
// -> account_not_found, changePassword's own two codes.
const PASSWORD_SECTION_CODES = [
  "unauthorized",
  "bad_body",
  "account_not_found",
  ...CHANGE_PASSWORD_CODES,
] as const;

describe("template-built errors.${code} catalog coverage (#56)", () => {
  it.each([
    // Login: only its resend action builds a key (app/login/page.tsx:66).
    ["Login", RESEND_CODES],
    // Signup: both signUp (:50) and resend (:66) build one, same namespace.
    ["Signup", [...SIGNUP_CODES, ...RESEND_CODES]],
    ["Verify", VERIFY_CODES],
    ["ProfileSection", PROFILE_CODES],
    ["PasswordSection", PASSWORD_SECTION_CODES],
    ["DangerZoneSection", DANGER_ZONE_CODES],
  ] as const)(
    "%s.errors has a non-empty entry for every code its route(s) can return",
    (namespace, codes) => {
      const errors = errorsUnder(namespace);
      for (const code of new Set(codes)) {
        expect(errors[code], `${namespace}.errors.${code}`).toBeTruthy();
      }
    },
  );
});
