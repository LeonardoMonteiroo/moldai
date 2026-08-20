"use client";

import { useState } from "react";
import Link from "next/link";
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
            <h1 className="mt-4 text-[15px] font-semibold">{t("heading")}</h1>
            <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
              <label className="text-muted-2 flex flex-col gap-1 text-[12px]">
                {t("nameLabel")}
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoComplete="name"
                  className="border-border rounded-btn bg-surface-alt text-ink focus:border-olive border px-3 py-2 text-[13px] focus:outline-none"
                />
              </label>
              <label className="text-muted-2 flex flex-col gap-1 text-[12px]">
                {t("emailLabel")}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoComplete="username"
                  className="border-border rounded-btn bg-surface-alt text-ink focus:border-olive border px-3 py-2 text-[13px] focus:outline-none"
                />
              </label>
              <label className="text-muted-2 flex flex-col gap-1 text-[12px]">
                {t("passwordLabel")}
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  className="border-border rounded-btn bg-surface-alt text-ink focus:border-olive border px-3 py-2 text-[13px] focus:outline-none"
                />
              </label>
              <label className="text-muted-2 flex flex-col gap-1 text-[12px]">
                {t("confirmLabel")}
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  autoComplete="new-password"
                  className="border-border rounded-btn bg-surface-alt text-ink focus:border-olive border px-3 py-2 text-[13px] focus:outline-none"
                />
              </label>
              {mismatch && (
                <p className="text-alert text-[12px]">{t("mismatchError")}</p>
              )}
              {error && <p className="text-alert text-[12px]">{error}</p>}
              <button
                type="submit"
                disabled={!canSubmit || loading}
                className="rounded-btn bg-olive hover:bg-olive-dark mt-1 px-4 py-2 text-[13px] font-semibold text-white transition-colors disabled:opacity-50"
              >
                {loading ? t("submitButtonLoading") : t("submitButton")}
              </button>
            </form>
          </>
        )}
        <p className="text-muted mt-4 text-[11px]">
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
