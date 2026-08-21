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
import { signUp, resendVerification } from "@/lib/api-client";

const MIN_PASSWORD_LENGTH = 8;

export default function SignupPage() {
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

    const result = await signUp(name, email, password);
    setLoading(false);
    if (result.status === "error") {
      setError(t(`errors.${result.error}`));
      return;
    }
    // No auto-sign-in: the account starts unverified and cannot be signed in.
    // The card swaps in place -- no navigation, no new route. The component
    // keeps email and password in state so resend can satisfy the credential gate.
    setSent(true);
  }

  async function onResend() {
    setResending(true);
    setError("");
    setResent(false);
    const result = await resendVerification(email, password);
    setResending(false);
    if (result.status === "error") {
      setError(t(`errors.${result.error}`));
      return;
    }
    setResent(true);
  }

  return (
    <div className="bg-paper flex min-h-screen items-center justify-center px-4">
      <div className="bg-surface border-border rounded-card shadow-card w-full max-w-[380px] border p-7">
        <span className="font-display text-[22px] font-bold tracking-[-0.4px]">
          Mold<span className="text-olive">AI</span>
        </span>
        {sent ? (
          <div className="mt-3">
            <h1 className="text-[15px] font-semibold">{t("sentHeading")}</h1>
            <p className="text-muted-2 mt-2 text-[12px]">
              {t.rich("sentBody", {
                email,
                b: (chunks) => (
                  <span className="text-ink font-medium">{chunks}</span>
                ),
              })}
            </p>
            <p className="text-muted mt-3 text-[11px]">{t("sentHint")}</p>
            {error && <p className="text-alert mt-3 text-[12px]">{error}</p>}
            {resent && (
              <p className="text-olive-dark mt-3 text-[12px]">
                {t("resendDone")}
              </p>
            )}
            <button
              type="button"
              onClick={onResend}
              disabled={resending}
              className="border-border rounded-btn hover:bg-surface-alt mt-4 border px-4 py-2 text-[13px] font-semibold transition-colors disabled:opacity-50"
            >
              {resending ? t("resendButtonLoading") : t("resendButton")}
            </button>
          </div>
        ) : (
          <>
            <h1 className="text-body mt-4 font-semibold">{t("heading")}</h1>
            <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="signup-name">
                    {t("nameLabel")}
                  </FieldLabel>
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
                  <FieldLabel htmlFor="signup-email">
                    {t("emailLabel")}
                  </FieldLabel>
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
      </div>
    </div>
  );
}
