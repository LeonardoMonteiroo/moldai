"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useTranslations } from "next-intl";
import { signIn } from "next-auth/react";
import { signUp, resendVerification } from "@/lib/api-client";
import {
  MIN_PASSWORD_LENGTH,
  MAX_PASSWORD_LENGTH,
} from "@/lib/account/settings";
import { GoogleIcon } from "@/components/auth/GoogleIcon";

// #109: the page heading moved to app/signup/page.tsx (a Server Component,
// so it can also export generateMetadata for the tab title) -- this keeps
// only the interactive form, mirroring VerifyCard's split.
export default function SignupCard() {
  const t = useTranslations("Signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  // Confirm-password is gated client-side only, mirroring PasswordSection —
  // the server never receives the confirm field.
  const mismatch =
    password.length > 0 && confirm.length > 0 && password !== confirm;
  const canSubmit =
    name.trim().length > 0 &&
    email.length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password === confirm;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError("");

    try {
      const result = await signUp(name, email, password);
      if (result.status === "error") {
        setError(t(`errors.${result.error}`));
        return;
      }
      // No auto-sign-in: the account starts unverified and cannot be signed in.
      // The card swaps in place -- no navigation, no new route. The component
      // keeps email and password in state so resend can satisfy the credential gate.
      setSent(true);
    } catch {
      setError(t("errors.bad_body"));
    } finally {
      setLoading(false);
    }
  }

  async function onResend() {
    setResending(true);
    setError("");
    setResent(false);
    try {
      const result = await resendVerification(email, password);
      if (result.status === "error") {
        setError(t(`errors.${result.error}`));
        return;
      }
      setResent(true);
    } catch {
      setError(t("resendError"));
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      {sent ? (
        <div className="mt-3">
          {/* A <p>, not a second <h1> -- app/signup/page.tsx already renders
              the route's one real heading; mirrors VerifyCard's own
              success-state styling. */}
          <p className="text-body font-semibold">{t("sentHeading")}</p>
          <p className="text-muted-2 text-ui mt-2">
            {t.rich("sentBody", {
              email,
              b: (chunks) => (
                <span className="text-ink font-medium">{chunks}</span>
              ),
            })}
          </p>
          <p className="text-muted text-meta mt-3">{t("sentHint")}</p>
          {error && <p className="text-alert text-ui mt-3">{error}</p>}
          {resent && (
            <p className="text-olive-dark text-ui mt-3">{t("resendDone")}</p>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={onResend}
            disabled={resending}
            className="mt-4"
          >
            {resending ? t("resendButtonLoading") : t("resendButton")}
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="signup-name">{t("nameLabel")}</FieldLabel>
              <Input
                id="signup-name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoComplete="name"
                className="bg-surface-alt"
              />
            </Field>
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor="signup-email">{t("emailLabel")}</FieldLabel>
              <Input
                id="signup-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="username"
                aria-invalid={!!error || undefined}
                className="bg-surface-alt"
              />
              {!!error && <FieldError>{error}</FieldError>}
            </Field>
            <Field>
              <FieldLabel htmlFor="signup-password">
                {t("passwordLabel")}
              </FieldLabel>
              <Input
                id="signup-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={MIN_PASSWORD_LENGTH}
                maxLength={MAX_PASSWORD_LENGTH}
                autoComplete="new-password"
                className="bg-surface-alt"
              />
            </Field>
            <Field data-invalid={mismatch || undefined}>
              <FieldLabel htmlFor="signup-confirm">
                {t("confirmLabel")}
              </FieldLabel>
              <Input
                id="signup-confirm"
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
                maxLength={MAX_PASSWORD_LENGTH}
                autoComplete="new-password"
                aria-invalid={mismatch || undefined}
                className="bg-surface-alt"
              />
              {mismatch && <FieldError>{t("mismatchError")}</FieldError>}
            </Field>
          </FieldGroup>
          <Button
            type="submit"
            disabled={!canSubmit || loading}
            className="mt-1"
          >
            {loading ? t("submitButtonLoading") : t("submitButton")}
          </Button>
        </form>
      )}
      {!sent && (
        <>
          <div className="my-1 flex items-center gap-3">
            <div className="bg-border h-px flex-1" />
            <span className="text-muted text-meta">{t("orDivider")}</span>
            <div className="bg-border h-px flex-1" />
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => signIn("google", { callbackUrl: "/" })}
            className="w-full gap-2"
          >
            <GoogleIcon className="size-4" />
            {t("continueWithGoogle")}
          </Button>
        </>
      )}
      <p className="text-muted text-meta mt-4">
        {t.rich("loginNote", {
          a: (chunks) => (
            <Link href="/login" className="text-olive-dark font-medium">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </>
  );
}
