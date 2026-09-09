"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { verifyEmail, resendVerification } from "@/lib/api-client";
import { Button } from "@/components/ui/button";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

// #240: invalid_token/expired_token identify a token that cannot ever
// succeed -- retrying the same confirm call is a dead end, and the mailed
// token itself doesn't carry an email address to resend against (the whole
// point of a single-use, sha-256-hashed token). POST /api/verify-email/resend
// is deliberately credential-gated (email + password) so an unverified
// address can't be spammed by someone who doesn't know the password, so this
// screen has to collect both before it can ask for a fresh link -- there is
// no way to make that one click. Once collected, this reuses the exact same
// resendVerification() call SignupCard's and LoginCard's resend buttons do.
const DEAD_TOKEN_CODES = new Set(["invalid_token", "expired_token"]);

export default function VerifyCard({ token }: { token: string }) {
  const t = useTranslations("Verify");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState("");
  const [deadToken, setDeadToken] = useState(false);

  const [resendEmail, setResendEmail] = useState("");
  const [resendPassword, setResendPassword] = useState("");
  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState("");
  const [resendDone, setResendDone] = useState(false);

  async function onConfirm() {
    setStatus("loading");
    setError("");
    try {
      const result = await verifyEmail(token);
      if (result.status === "error") {
        setStatus("idle");
        setError(t(`errors.${result.error}`));
        setDeadToken(DEAD_TOKEN_CODES.has(result.error));
        return;
      }
      setStatus("done");
    } catch {
      setStatus("idle");
      setError(t("errors.bad_body"));
    }
  }

  async function onResend(e: React.FormEvent) {
    e.preventDefault();
    setResending(true);
    setResendError("");
    setResendDone(false);
    try {
      const result = await resendVerification(resendEmail, resendPassword);
      if (result.status === "error") {
        setResendError(t(`errors.${result.error}`));
        return;
      }
      setResendDone(true);
    } catch {
      setResendError(t("errors.bad_body"));
    } finally {
      setResending(false);
    }
  }

  if (status === "done") {
    return (
      <div className="mt-3">
        {/* Own <h1>, not app/verify/page.tsx's -- a static server-rendered
            heading alongside this one produced two headings at once (fixed
            after the redesign handoff's Round 2 reference screenshot showed
            only one), the same fix SignupCard's success state needed. */}
        <h1 className="text-body font-semibold">{t("successHeading")}</h1>
        <p className="text-ink text-ui mt-1 leading-[1.6]">
          {t("successBody")}
        </p>
        {/* asChild rather than a Link wearing hand-written button classes:
            those were a second copy of the primitive that had already drifted
            from it (inline-block, so it never stretched). */}
        <Button asChild className="mt-4 w-full">
          <Link href="/login">{t("loginLink")}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <h1 className="text-body font-semibold">{t("heading")}</h1>
      {/* Full ink, not muted: the design colours the password-reset intro
          explicitly and leaves this one to inherit, because here the sentence
          IS the screen -- there is nothing else to read. */}
      <p className="text-ink text-ui mt-2 leading-[1.6]">{t("intro")}</p>
      {/* text-meta, matching FieldError: this is a hand-written paragraph
          rather than a Field, so the primitive's own sizing never reached it. */}
      {error && <p className="text-alert text-meta mt-3">{error}</p>}
      {deadToken ? (
        resendDone ? (
          <p className="text-olive-dark text-ui mt-3">{t("resendDone")}</p>
        ) : (
          <form onSubmit={onResend} className="mt-3 flex flex-col gap-3">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="verify-resend-email">
                  {t("emailLabel")}
                </FieldLabel>
                <Input
                  id="verify-resend-email"
                  type="email"
                  value={resendEmail}
                  onChange={(event) => setResendEmail(event.target.value)}
                  required
                  autoComplete="username"
                  className="bg-surface-alt"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="verify-resend-password">
                  {t("passwordLabel")}
                </FieldLabel>
                <Input
                  id="verify-resend-password"
                  type="password"
                  value={resendPassword}
                  onChange={(event) => setResendPassword(event.target.value)}
                  required
                  autoComplete="current-password"
                  className="bg-surface-alt"
                />
              </Field>
            </FieldGroup>
            {resendError && (
              <p className="text-alert text-meta">{resendError}</p>
            )}
            <Button
              type="submit"
              disabled={resending || !resendEmail || !resendPassword}
              className="w-full"
            >
              {resending ? t("resendButtonLoading") : t("resendButton")}
            </Button>
          </form>
        )
      ) : (
        /* w-full because this card is a plain div, not the flex-col form that
           stretches the auth screens' buttons for free. */
        <Button
          type="button"
          onClick={onConfirm}
          disabled={status === "loading"}
          className="mt-4 w-full"
        >
          {status === "loading"
            ? t("confirmButtonLoading")
            : t("confirmButton")}
        </Button>
      )}
      <p className="text-center">
        <Link
          href="/login"
          className="text-muted text-meta mt-3 inline-block hover:underline"
        >
          {t("backToLoginLink")}
        </Link>
      </p>
    </div>
  );
}
