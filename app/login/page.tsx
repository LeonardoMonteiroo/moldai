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
        <span className="font-display text-title tracking-wordmark font-bold">
          Mold<span className="text-olive">AI</span>
        </span>
        <h1 className="text-body mt-4 font-semibold">{t("heading")}</h1>
        <form onSubmit={onSubmit} className="mt-4 flex flex-col gap-3">
          <FieldGroup>
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor="login-email">{t("emailLabel")}</FieldLabel>
              <Input
                id="login-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                autoComplete="username"
                className="bg-surface-alt"
              />
            </Field>
            <Field data-invalid={!!error || undefined}>
              <FieldLabel htmlFor="login-password">
                {t("passwordLabel")}
              </FieldLabel>
              <Input
                id="login-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                autoComplete="current-password"
                aria-invalid={!!error || undefined}
                className="bg-surface-alt"
              />
              {error && <FieldError>{error}</FieldError>}
            </Field>
          </FieldGroup>
          {unverified && (
            <Button
              type="button"
              variant="outline"
              onClick={onResend}
              disabled={resending}
            >
              {resending ? t("resendButtonLoading") : t("resendButton")}
            </Button>
          )}
          {resent && (
            <p className="text-olive-dark text-ui">{t("resendDone")}</p>
          )}
          <Button type="submit" disabled={loading} className="mt-1">
            {loading ? t("submitButtonLoading") : t("submitButton")}
          </Button>
        </form>
        <p className="text-muted text-meta mt-4">
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
