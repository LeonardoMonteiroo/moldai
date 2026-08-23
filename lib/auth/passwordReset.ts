// The wire contracts for the two password-reset routes, kept beside the
// codes they describe -- the same placement as VerifyErrorCode/ResendErrorCode
// in lib/auth/verification.ts for their sibling verify/resend routes. Token
// generation is not duplicated here: both routes reuse
// newVerificationToken/hashToken from lib/auth/verification.ts directly.
export type RequestResetErrorCode = "bad_body" | "rate_limited";

export type ConfirmResetErrorCode =
  | "invalid_token"
  | "expired_token"
  | "weak_password"
  | "bad_body"
  | "rate_limited";
