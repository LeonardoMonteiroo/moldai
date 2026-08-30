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
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";
import { resendVerification } from "@/lib/api-client";
import { GoogleIcon } from "@/components/auth/GoogleIcon";

// #235: Auth.js redirects a failed Google flow back to /login?error=<code>.
// AccessDenied (the user cancelled Google's consent screen) gets its own
// message; every other code -- including OAuthAccountNotLinked, which
// should never actually fire given auth.ts's allowDangerousEmailAccountLinking
// -- falls back to a generic one rather than asserting copy for a code this
// config shouldn't produce.
const KNOWN_OAUTH_ERROR_CODES = ["AccessDenied"] as const;

function resolveOAuthErrorKey(code: string | null): string | null {
  if (!code) return null;
  return (KNOWN_OAUTH_ERROR_CODES as readonly string[]).includes(code)
    ? code
    : "oauth_generic";
}

// #109: the page heading moved to app/login/page.tsx (a Server Component,
// so it can also export generateMetadata for the tab title) -- this keeps
// only the interactive form, mirroring VerifyCard's split.
export default function LoginCard() {
  const t = useTranslations("Login");
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthErrorKey = resolveOAuthErrorKey(searchParams.get("error"));
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
    try {
      const result = await resendVerification(email, password);
      if (result.status === "error") {
        setError(t(`errors.${result.error}`));
        return;
      }
      setResent(true);
    } catch {
      setError(t("errors.bad_body"));
    } finally {
      setResending(false);
    }
  }

  return (
    <>
      {oauthErrorKey && (
        <p className="text-alert text-ui mt-3">
          {t(`errors.${oauthErrorKey}`)}
        </p>
      )}
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
        <Link
          href="/password-reset"
          className="text-muted-2 text-meta self-end hover:underline"
        >
          {t("forgotPasswordLink")}
        </Link>
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
        {resent && <p className="text-olive-dark text-ui">{t("resendDone")}</p>}
        <Button type="submit" disabled={loading} className="mt-1">
          {loading ? t("submitButtonLoading") : t("submitButton")}
        </Button>
      </form>
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
      <p className="text-muted text-meta mt-4">
        {t.rich("signupNote", {
          a: (chunks) => (
            <Link href="/signup" className="text-olive-dark font-medium">
              {chunks}
            </Link>
          ),
        })}
      </p>
    </>
  );
}
