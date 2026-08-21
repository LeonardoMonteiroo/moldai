"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { resendVerification } from "@/lib/api-client";

export default function LoginPage() {
  const t = useTranslations("Login");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setUnverified(false);
    setResent(false);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      // Auth.js surfaces a CredentialsSignin subclass's `code` here, so an
      // unverified account never reads as "senha inválida".
      if (res.code === "unverified_email") {
        setUnverified(true);
        setError(t("unverifiedEmail"));
      } else if (res.code === "rate_limited") {
        setError(t("rateLimited"));
      } else {
        setError(t("invalidCredentials"));
      }
      return;
    }
    router.push("/");
    router.refresh();
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
        <h1 className="mt-4 text-[15px] font-semibold">{t("heading")}</h1>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
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
              autoComplete="current-password"
              className="border-border rounded-btn bg-surface-alt text-ink focus:border-olive border px-3 py-2 text-[13px] focus:outline-none"
            />
          </label>
          {error && <p className="text-alert text-[12px]">{error}</p>}
          {unverified && (
            <button
              type="button"
              onClick={onResend}
              disabled={resending}
              className="border-border rounded-btn hover:bg-surface-alt border px-4 py-2 text-[12px] font-semibold transition-colors disabled:opacity-50"
            >
              {resending ? t("resendButtonLoading") : t("resendButton")}
            </button>
          )}
          {resent && (
            <p className="text-olive-dark text-[12px]">{t("resendDone")}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="rounded-btn bg-olive hover:bg-olive-dark mt-1 px-4 py-2 text-[13px] font-semibold text-white transition-colors disabled:opacity-50"
          >
            {loading ? t("submitButtonLoading") : t("submitButton")}
          </button>
        </form>
        <p className="text-muted mt-4 text-[11px]">
          {t.rich("signupNote", {
            a: (chunks) => (
              <Link href="/signup" className="text-olive-dark font-medium">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
    </div>
  );
}
